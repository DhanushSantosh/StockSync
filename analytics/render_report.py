"""Render report figures and a compact SDA PDF from the generated JSON."""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image, PageBreak, Paragraph, SimpleDocTemplate, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src/data/retail-insights.json"
FIGURES = ROOT / "docs/sda/figures"
PDF = ROOT / "output/pdf/StockSync-SDA-Report.pdf"


def figures(data: dict) -> None:
    FIGURES.mkdir(parents=True, exist_ok=True)
    by_week = defaultdict(lambda: [0.0, 0.0])
    for product in data["products"]:
        for week in product["weeks"]:
            by_week[week["week"]][0] += week["actual"]
            by_week[week["week"]][1] += week["predicted"]
    dates = sorted(by_week)
    fig, ax = plt.subplots(figsize=(9, 3.4), layout="constrained")
    ax.plot(dates, [by_week[date][0] for date in dates], marker="o", label="Actual units", color="#2367a5")
    ax.plot(dates, [by_week[date][1] for date in dates], marker="o", label="Model prediction", color="#cf762d")
    ax.set(title="Weekly demand across 50 selected products", xlabel="Week starting", ylabel="Units sold")
    ax.tick_params(axis="x", rotation=45, labelsize=8)
    ax.grid(alpha=0.2)
    ax.legend(frameon=False)
    fig.savefig(FIGURES / "weekly-demand.png", dpi=180)
    plt.close(fig)

    model = data["metrics"]["model"]
    baseline = data["metrics"]["baseline"]
    fig, ax = plt.subplots(figsize=(6.4, 3), layout="constrained")
    x = [0, 1]
    ax.bar([i - 0.18 for i in x], [model["mae"], model["rmse"]], width=0.36, label="Random Forest", color="#2367a5")
    ax.bar([i + 0.18 for i in x], [baseline["mae"], baseline["rmse"]], width=0.36, label="Previous-week baseline", color="#cf762d")
    ax.set_xticks(x, ["MAE", "RMSE"])
    ax.set(ylabel="Error in units per product-week", title="Held-out prediction error; lower is better")
    ax.legend(frameon=False, fontsize=8)
    ax.spines[["top", "right"]].set_visible(False)
    fig.savefig(FIGURES / "model-comparison.png", dpi=180)
    plt.close(fig)


def pdf(data: dict) -> None:
    PDF.parent.mkdir(parents=True, exist_ok=True)
    fonts = Path(matplotlib.get_data_path()) / "fonts/ttf"
    pdfmetrics.registerFont(TTFont("DejaVu", str(fonts / "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVu-Bold", str(fonts / "DejaVuSans-Bold.ttf")))
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="TitleCustom", fontName="DejaVu-Bold", fontSize=19, leading=25, textColor=colors.HexColor("#153e68"), spaceAfter=12))
    styles.add(ParagraphStyle(name="SubCustom", fontName="DejaVu-Bold", fontSize=10, leading=15, textColor=colors.HexColor("#2367a5"), spaceAfter=8))
    styles.add(ParagraphStyle(name="HeadCustom", fontName="DejaVu-Bold", fontSize=11, leading=16, spaceBefore=12, spaceAfter=6))
    styles.add(ParagraphStyle(name="BodyCustom", fontName="DejaVu", fontSize=8.5, leading=13, spaceAfter=7))
    styles.add(ParagraphStyle(name="SmallCustom", fontName="DejaVu", fontSize=7.5, leading=11, spaceAfter=5))
    p = lambda text, style="BodyCustom": Paragraph(text, styles[style])
    story = []
    def add(text: str, style: str = "BodyCustom") -> None:
        story.append(p(text, style))
    def table(rows: list[list[str]], widths: list[int]) -> None:
        item = Table([[p(str(value), "SmallCustom") for value in row] for row in rows], colWidths=widths, hAlign="LEFT")
        item.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eaf2f9")), ("LINEBELOW", (0, 0), (-1, 0), 0.5, colors.HexColor("#9db7cc")), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f9fb")]), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
        story.append(item)

    add("StockSync Insights", "TitleCustom")
    add("Retail Product Demand Prediction and Inventory Analytics", "SubCustom")
    add("Statistics and Data Analytics - Activity 2 mini project | 1 November 2026", "SmallCustom")
    add("Abstract", "HeadCustom")
    add(f"A reproducible Python pipeline analyzed {data['cleaning']['rawRows']:,} real retail transaction rows and predicted weekly units sold for 50 products. The last 12 complete weeks were held out. Random Forest achieved MAE {data['metrics']['model']['mae']:.3f}, RMSE {data['metrics']['model']['rmse']:.3f}, and R² {data['metrics']['model']['r2']:.3f}; a previous-week baseline achieved MAE {data['metrics']['baseline']['mae']:.3f}. The improvement is modest and does not justify automatic purchasing decisions.")
    add("Problem and dataset", "HeadCustom")
    add("The goal is to predict product demand from sales already observed. The source is UCI Online Retail II: two years of invoices from a UK non-store giftware retailer. It records sales, prices, dates and product codes, but not stock-on-hand or product images. These products are unrelated to StockSync's live grocery inventory. The dataset is CC BY 4.0 and is credited below.")
    add(f"Workbook SHA-256: {data['source']['sha256']}", "SmallCustom")
    add("Cleaning and weekly aggregation", "HeadCustom")
    add("Both Excel sheets were loaded. Cancelled invoices, returns, nonpositive prices, non-UK rows, invalid product codes, missing values, and incomplete boundary weeks were excluded in that order. Valid transaction quantities were grouped into Monday-Sunday product-weeks; absent sales weeks were filled with zero.")
    c = data["cleaning"]
    table([["Stage", "Rows"], ["Source", f"{c['rawRows']:,}"], ["Cancelled", f"{c['cancelled']:,}"], ["Returns / nonpositive quantity", f"{c['returnsOrNonpositiveQuantity']:,}"], ["Nonpositive price", f"{c['nonpositivePrice']:,}"], ["Outside UK", f"{c['outsideUK']:,}"], ["Invalid product code", f"{c['invalidProductCode']:,}"], ["Complete-week retained sales", f"{c['completeWeekRows']:,}"]], [310, 125])

    story.append(PageBreak())
    add("Method and chronological evaluation", "HeadCustom")
    add("The top 50 eligible products were selected using only pretest sales, with at least 20 active sales weeks. A global Random Forest regressor predicts a product-week's units from sales lags 1-4, their mean, last observed unit price, calendar week, and one-hot product identity. All predictors precede their target week. Settings: 100 trees, maximum depth 12, minimum leaf size 3, random seed 42.")
    add(f"Training: {data['model']['trainRows']:,} product-weeks before 12 September 2011. Holdout: {data['model']['testRows']:,} product-weeks from 12 September to 4 December 2011. Baseline: predict the prior week's units. This time-ordered split avoids training on later sales when predicting earlier weeks.")
    story.append(Image(str(FIGURES / "weekly-demand.png"), width=465, height=176))
    add("Figure 1. Aggregated actual and predicted units across the 50 test products. Weekly spikes remain difficult to predict.", "SmallCustom")
    add("Measured results", "HeadCustom")
    m, b = data["metrics"]["model"], data["metrics"]["baseline"]
    table([["Method", "MAE", "RMSE", "R²"], ["Random Forest", f"{m['mae']:.3f}", f"{m['rmse']:.3f}", f"{m['r2']:.3f}"], ["Previous week", f"{b['mae']:.3f}", f"{b['rmse']:.3f}", f"{b['r2']:.3f}"]], [205, 78, 78, 74])
    add("MAE and RMSE are errors in units per product-week (lower is better). R² can be negative; higher is better. The model improves MAE by 7.189 units (2.8%) and RMSE by 81.357 units (16.0%) against the baseline. Large residual errors remain.")

    story.append(PageBreak())
    add("Interpretation and application", "HeadCustom")
    story.append(Image(str(FIGURES / "model-comparison.png"), width=390, height=184))
    add("Figure 2. Error comparison on the same 600 held-out product-weeks.", "SmallCustom")
    add("The StockSync Retail Insights page bundles a small, versioned JSON file with the measured metrics and product series. The raw workbook is never uploaded to Firestore. The displayed estimate for the week starting 5 December 2011 is a dated illustration from a model retrained on all complete weeks; it is not an evaluated current forecast or stock recommendation.")
    add("Limitations", "HeadCustom")
    add("This UK retailer and its historical giftware and wholesale demand differ from a current Indian grocery store. Prices are GBP, while StockSync uses INR. Transactions show observed sales, not unmet demand or inventory levels. Promotions, stockouts, holidays, and supplier delays are not represented. One 12-week test period is not evidence of stable performance across stores or seasons.")
    add("Reproduction", "HeadCustom")
    add("Download UCI Online Retail II, verify the workbook SHA-256 on page 1, install analytics/requirements.txt, and run: python analytics/build.py --input /path/to/online_retail_II.xlsx. Run python -m unittest discover -s analytics -p 'test_*.py', then python analytics/render_report.py. The generated JSON records source, cleaning, model settings, holdout, metrics, and per-product predictions.")
    add("Sources", "HeadCustom")
    add('<link href="https://doi.org/10.24432/C5CG6D" color="#2367a5">Chen, D. (2012). Online Retail II. UCI Machine Learning Repository. DOI: 10.24432/C5CG6D.</link>', "SmallCustom")
    add('<link href="https://scikit-learn.org/stable/auto_examples/applications/plot_time_series_lagged_features.html" color="#2367a5">Scikit-learn: Lagged features for time series forecasting and time-ordered evaluation.</link>', "SmallCustom")

    def footer(canvas, doc):
        canvas.setFont("DejaVu", 7)
        canvas.setFillColor(colors.HexColor("#667788"))
        canvas.drawString(38, 28, "StockSync Insights | SDA Activity 2")
        canvas.drawRightString(557, 28, f"Page {doc.page}")

    document = SimpleDocTemplate(str(PDF), pagesize=(595, 842), rightMargin=40, leftMargin=40, topMargin=38, bottomMargin=45, title="StockSync Insights - SDA Report", author="StockSync")
    document.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    content = json.loads(DATA.read_text())
    figures(content)
    pdf(content)
    print(f"Wrote {PDF}")
