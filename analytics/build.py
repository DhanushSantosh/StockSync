"""Rebuild the static StockSync Insights data from UCI Online Retail II."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

SOURCE = "https://archive.ics.uci.edu/dataset/502/online+retail+ii"
SHA256 = "bcbe73b35f5b7babf197fb0cb983a11f5d9ff929078d4aa53d171b1f2df2e980"
DEFAULT_INPUT = Path(__file__).resolve().parent / "data/online_retail_II.xlsx"
HOLDOUT_WEEKS = 12
PRODUCT_COUNT = 50
FEATURES = ["lag1", "lag2", "lag3", "lag4", "mean4", "lastPrice", "weekOfYear"]
MODEL = {"n_estimators": 100, "max_depth": 12, "min_samples_leaf": 3, "random_state": 42, "n_jobs": 1}


def sha256(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read_workbook(path: Path) -> pd.DataFrame:
    sheets = pd.read_excel(path, sheet_name=None, dtype={"StockCode": "string", "Invoice": "string"})
    if len(sheets) != 2:
        raise ValueError("Expected both yearly sheets in UCI Online Retail II")
    required = {"Invoice", "StockCode", "Description", "Quantity", "InvoiceDate", "Price", "Country"}
    for name, sheet in sheets.items():
        if not required.issubset(sheet.columns):
            raise ValueError(f"Missing columns in {name}: {required - set(sheet.columns)}")
    return pd.concat((sheet[list(required)] for sheet in sheets.values()), ignore_index=True)


def clean_sales(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    """Keep actual UK merchandise sales; each removal reason is counted once."""
    data = raw.copy()
    counts = {"rawRows": len(data)}
    checks = [
        ("missingInvoice", data["Invoice"].isna()),
        ("cancelled", data["Invoice"].astype("string").str.upper().str.startswith("C").fillna(False)),
        ("returnsOrNonpositiveQuantity", pd.to_numeric(data["Quantity"], errors="coerce").le(0) | pd.to_numeric(data["Quantity"], errors="coerce").isna()),
        ("nonpositivePrice", pd.to_numeric(data["Price"], errors="coerce").le(0) | pd.to_numeric(data["Price"], errors="coerce").isna()),
        ("outsideUK", data["Country"].ne("United Kingdom").fillna(True)),
        ("invalidProductCode", ~data["StockCode"].astype("string").str.fullmatch(r"\d{5}[A-Za-z]?").fillna(False)),
        ("missingDateOrDescription", pd.to_datetime(data["InvoiceDate"], errors="coerce").isna() | data["Description"].isna() | data["Description"].astype("string").str.strip().eq("").fillna(True)),
    ]
    for label, bad in checks:
        active = bad.reindex(data.index).fillna(False)
        counts[label] = int(active.sum())
        data = data.loc[~active]
    data = data.copy()
    data["InvoiceDate"] = pd.to_datetime(data["InvoiceDate"])
    data["StockCode"] = data["StockCode"].astype(str).str.upper()
    data["Description"] = data["Description"].astype(str).str.strip()
    counts["retainedRows"] = len(data)
    return data, counts


def complete_weeks(data: pd.DataFrame) -> tuple[pd.DataFrame, pd.DatetimeIndex, int]:
    first = data["InvoiceDate"].min().normalize()
    last = data["InvoiceDate"].max().normalize()
    first_monday = first + pd.Timedelta(days=(7 - first.weekday()) % 7)
    last_monday = last - pd.Timedelta(days=last.weekday())
    if last.weekday() != 6:
        last_monday -= pd.Timedelta(days=7)
    weeks = pd.date_range(first_monday, last_monday, freq="W-MON")
    if len(weeks) <= HOLDOUT_WEEKS + 4:
        raise ValueError("Not enough complete weeks for lag features and holdout")
    week = data["InvoiceDate"].dt.normalize() - pd.to_timedelta(data["InvoiceDate"].dt.day_of_week, unit="D")
    retained = data.assign(week=week).loc[week.isin(weeks)].copy()
    return retained, weeks, len(data) - len(retained)


def weekly_panel(data: pd.DataFrame, weeks: pd.DatetimeIndex) -> tuple[pd.DataFrame, pd.Series]:
    cutoff = weeks[-HOLDOUT_WEEKS]
    training = data.loc[data["week"] < cutoff]
    active = training.groupby("StockCode")["week"].nunique()
    volume = training.groupby("StockCode")["Quantity"].sum()
    selected = volume.loc[active[active >= 20].index].sort_values(ascending=False, kind="stable").head(PRODUCT_COUNT)
    if len(selected) != PRODUCT_COUNT:
        raise ValueError(f"Expected {PRODUCT_COUNT} eligible products; found {len(selected)}")
    products = data.loc[data["StockCode"].isin(selected.index)].copy()
    products["priceTimesUnits"] = products["Price"] * products["Quantity"]
    grouped = products.groupby(["StockCode", "week"], sort=True).agg(units=("Quantity", "sum"), priceTotal=("priceTimesUnits", "sum"))
    grid = pd.MultiIndex.from_product([selected.index.sort_values(), weeks], names=["StockCode", "week"])
    panel = grouped.reindex(grid, fill_value=0).reset_index()
    panel["price"] = panel["priceTotal"].div(panel["units"].replace(0, np.nan))
    return panel, selected


def feature_rows(panel: pd.DataFrame) -> pd.DataFrame:
    """Every feature for week t depends only on weeks before t."""
    rows = panel.sort_values(["StockCode", "week"]).copy()
    by_product = rows.groupby("StockCode", sort=False)
    for lag in range(1, 5):
        rows[f"lag{lag}"] = by_product["units"].shift(lag)
    rows["mean4"] = rows[[f"lag{lag}" for lag in range(1, 5)]].mean(axis=1)
    rows["lastPrice"] = rows.groupby("StockCode", sort=False)["price"].transform(lambda prices: prices.ffill().shift(1))
    rows["weekOfYear"] = rows["week"].dt.isocalendar().week.astype(int)
    return rows.dropna(subset=FEATURES).reset_index(drop=True)


def matrix(rows: pd.DataFrame, columns: list[str] | None = None) -> pd.DataFrame:
    result = pd.get_dummies(rows[FEATURES + ["StockCode"]], columns=["StockCode"], dtype=np.uint8)
    return result if columns is None else result.reindex(columns=columns, fill_value=0)


def metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    return {
        "mae": round(float(mean_absolute_error(actual, predicted)), 3),
        "rmse": round(float(np.sqrt(mean_squared_error(actual, predicted))), 3),
        "r2": round(float(r2_score(actual, predicted)), 3),
    }


def build(path: Path) -> dict:
    digest = sha256(path)
    if digest != SHA256:
        raise ValueError(f"Dataset checksum differs from the documented UCI workbook: {digest}")
    raw = read_workbook(path)
    clean, counts = clean_sales(raw)
    complete, weeks, boundary_rows = complete_weeks(clean)
    counts["incompleteBoundaryWeekRows"] = boundary_rows
    counts["completeWeekRows"] = len(complete)
    panel, selected = weekly_panel(complete, weeks)
    rows = feature_rows(panel)
    cutoff = weeks[-HOLDOUT_WEEKS]
    train = rows.loc[rows["week"] < cutoff]
    test = rows.loc[rows["week"] >= cutoff]
    x_train = matrix(train)
    x_test = matrix(test, x_train.columns.tolist())
    model = RandomForestRegressor(**MODEL).fit(x_train, train["units"])
    predicted = np.maximum(0, model.predict(x_test))
    actual = test["units"].to_numpy()
    baseline = test["lag1"].to_numpy()
    evaluated = test[["StockCode", "week", "units", "lag1"]].copy()
    evaluated["predicted"] = predicted
    names = (complete.loc[complete["week"] < cutoff].groupby("StockCode")["Description"]
             .agg(lambda values: values.value_counts().index[0]))

    # Train again on all known weeks for a dated, illustrative next-week estimate.
    all_x = matrix(rows)
    final_model = RandomForestRegressor(**MODEL).fit(all_x, rows["units"])
    future_week = weeks[-1] + pd.Timedelta(days=7)
    future = pd.concat([panel, pd.DataFrame({"StockCode": selected.index, "week": future_week, "units": 0, "priceTotal": 0, "price": np.nan})], ignore_index=True)
    next_rows = feature_rows(future).loc[lambda frame: frame["week"] == future_week]
    future_prediction = dict(zip(next_rows["StockCode"], np.maximum(0, final_model.predict(matrix(next_rows, all_x.columns.tolist())))))

    products = []
    for code in selected.index:
        series = evaluated.loc[evaluated["StockCode"] == code].sort_values("week")
        products.append({
            "code": code,
            "name": names[code],
            "trainingUnits": int(selected[code]),
            "nextWeekEstimate": round(float(future_prediction[code]), 1),
            "weeks": [{"week": date.strftime("%Y-%m-%d"), "actual": int(actual_units), "predicted": round(float(estimate), 1), "baseline": int(previous)}
                      for date, actual_units, estimate, previous in series[["week", "units", "predicted", "lag1"]].itertuples(index=False, name=None)],
        })
    return {
        "version": 1,
        "source": {"name": "UCI Online Retail II", "url": SOURCE, "sha256": digest, "license": "CC BY 4.0", "country": "United Kingdom", "currency": "GBP"},
        "period": {"firstWeek": weeks[0].strftime("%Y-%m-%d"), "lastWeek": weeks[-1].strftime("%Y-%m-%d"), "lastObservedDate": (weeks[-1] + pd.Timedelta(days=6)).strftime("%Y-%m-%d"), "trainingEnd": (cutoff - pd.Timedelta(days=1)).strftime("%Y-%m-%d"), "holdoutStart": cutoff.strftime("%Y-%m-%d"), "holdoutWeeks": HOLDOUT_WEEKS, "illustrativeNextWeek": future_week.strftime("%Y-%m-%d")},
        "cleaning": counts,
        "model": {"name": "Random Forest Regression", "settings": {key: value for key, value in MODEL.items() if key != "n_jobs"}, "features": FEATURES + ["one-hot StockCode"], "trainRows": len(train), "testRows": len(test), "productCount": len(products)},
        "metrics": {"model": metrics(actual, predicted), "baseline": metrics(actual, baseline)},
        "products": products,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="UCI workbook (default: analytics/data/online_retail_II.xlsx)")
    parser.add_argument("--output", type=Path, default=Path("src/data/retail-insights.json"))
    args = parser.parse_args()
    if not args.input.is_file():
        parser.error(f"Dataset missing: {args.input}. Download UCI Online Retail II into analytics/data/ first.")
    result = build(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {args.output}; model MAE {result['metrics']['model']['mae']}, baseline MAE {result['metrics']['baseline']['mae']}")


if __name__ == "__main__":
    main()
