"""Evaluate the shared synthetic shop dataset and export app-ready JSON."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

from build import MODEL, feature_rows, matrix, metrics
from generate_demo import WEEKS, generate

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src/data/demo-insights.json"
HOLDOUT = 8


def build() -> dict:
    products_file, sales_file = generate()
    source_hash = hashlib.sha256(products_file.read_bytes() + sales_file.read_bytes()).hexdigest()
    catalog = pd.read_csv(products_file, dtype={"SKU": str}).set_index("SKU")
    sales = pd.read_csv(sales_file, parse_dates=["week_start"], dtype={"sku": str})
    if len(sales) != WEEKS * len(catalog) or sales.duplicated(["sku", "week_start"]).any():
        raise ValueError("Expected one sale row per product and week")
    if not ((sales.opening_stock + sales.restocked - sales.units_sold) == sales.closing_stock).all():
        raise ValueError("Stock ledger does not balance")
    latest_stock = sales.sort_values("week_start").groupby("sku").closing_stock.last()
    if not (catalog["Quantity"].sort_index() == latest_stock.sort_index()).all():
        raise ValueError("Importable product quantities must match the final sales week")
    rows = pd.DataFrame({
        "StockCode": sales.sku,
        "week": sales.week_start,
        "units": sales.units_sold,
        "price": sales.unit_price_inr,
    })
    featured = feature_rows(rows)
    cutoff = sorted(sales.week_start.unique())[-HOLDOUT]
    train = featured.loc[featured.week < cutoff]
    test = featured.loc[featured.week >= cutoff]
    x_train = matrix(train)
    model = RandomForestRegressor(**MODEL).fit(x_train, train.units)
    predictions = np.maximum(0, model.predict(matrix(test, x_train.columns.tolist())))
    actual = test.units.to_numpy()
    baseline = test.lag1.to_numpy()
    evaluated = test[["StockCode", "week", "units", "lag1"]].copy()
    evaluated["predicted"] = predictions
    # Retrain on all completed weeks to produce a dated illustrative estimate.
    all_x = matrix(featured)
    final_model = RandomForestRegressor(**MODEL).fit(all_x, featured.units)
    future_week = sales.week_start.max() + pd.Timedelta(days=7)
    future = pd.concat([rows, pd.DataFrame({
        "StockCode": catalog.index,
        "week": future_week,
        "units": 0,
        "price": np.nan,
    })], ignore_index=True)
    future_rows = feature_rows(future).loc[lambda frame: frame.week == future_week]
    future_values = dict(zip(future_rows.StockCode, np.maximum(0, final_model.predict(matrix(future_rows, all_x.columns.tolist())))))
    result = []
    for sku, item in catalog.iterrows():
        series = evaluated.loc[evaluated.StockCode == sku].sort_values("week")
        result.append({
            "code": sku,
            "name": item["Name"],
            "trainingUnits": int(train.loc[train.StockCode == sku, "units"].sum()),
            "nextWeekEstimate": round(float(future_values[sku]), 1),
            "weeks": [{
                "week": week.strftime("%Y-%m-%d"),
                "actual": int(units),
                "predicted": round(float(prediction), 1),
                "baseline": int(previous),
            } for week, units, previous, prediction in series[["week", "units", "lag1", "predicted"]].itertuples(index=False, name=None)],
        })
    return {
        "version": 1,
        "synthetic": True,
        "source": {"name": "StockSync generated grocery demo", "sha256": source_hash, "currency": "INR"},
        "period": {
            "firstWeek": sales.week_start.min().strftime("%Y-%m-%d"),
            "lastWeek": sales.week_start.max().strftime("%Y-%m-%d"),
            "lastObservedDate": (sales.week_start.max() + pd.Timedelta(days=6)).strftime("%Y-%m-%d"),
            "trainingEnd": (cutoff - pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
            "holdoutStart": cutoff.strftime("%Y-%m-%d"),
            "holdoutWeeks": HOLDOUT,
            "illustrativeNextWeek": future_week.strftime("%Y-%m-%d"),
        },
        "cleaning": {"rawRows": len(sales), "completeWeekRows": len(sales)},
        "model": {"name": "Random Forest Regression", "settings": {key: value for key, value in MODEL.items() if key != "n_jobs"}, "features": ["previous four weeks", "four-week mean", "last price", "calendar week", "product identity"], "trainRows": len(train), "testRows": len(test), "productCount": len(result)},
        "metrics": {"model": metrics(actual, predictions), "baseline": metrics(actual, baseline)},
        "products": result,
    }


if __name__ == "__main__":
    data = build()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {OUTPUT}; synthetic demo model MAE {data['metrics']['model']['mae']}, baseline MAE {data['metrics']['baseline']['mae']}")
