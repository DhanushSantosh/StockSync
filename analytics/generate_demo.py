"""Create a reproducible, clearly synthetic grocery shop dataset."""

from __future__ import annotations

import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).resolve().parent / "demo"
PRODUCTS = [
    ("BIS-250", "Parle-G 250g", "Biscuits", 48, 25, 22.5, 42),
    ("STA-1KG", "Tata Salt 1kg", "Staples", 30, 28, 24, 27),
    ("DAI-100", "Amul Butter 100g", "Dairy", 20, 56, 49, 22),
    ("HOU-500", "Surf Excel 500g", "Household", 24, 75, 66, 18),
    ("SNK-70", "Maggi Noodles 70g", "Snacks", 36, 14, 12, 38),
    ("BIS-200", "Britannia Good Day 200g", "Biscuits", 28, 35, 30, 26),
    ("STA-5KG", "Aashirvaad Atta 5kg", "Staples", 22, 300, 270, 15),
    ("OIL-1L", "Fortune Sunflower Oil 1L", "Cooking Oil", 26, 170, 155, 20),
    ("PER-100", "Colgate Toothpaste 100g", "Personal Care", 24, 65, 58, 17),
    ("RIC-1KG", "India Gate Basmati Rice 1kg", "Rice", 20, 145, 130, 19),
]
DETAILS = {
    "BIS-250": ("Demo Biscuit Supplier", 24, "2027-04-30"),
    "STA-1KG": ("Demo Staples Supplier", 20, "2027-09-30"),
    "DAI-100": ("Demo Dairy Supplier", 20, "2027-01-31"),
    "HOU-500": ("Demo Household Supplier", 12, "2027-08-31"),
    "SNK-70": ("Demo Snacks Supplier", 48, "2027-05-31"),
    "BIS-200": ("Demo Biscuit Supplier", 24, "2027-06-30"),
    "STA-5KG": ("Demo Staples Supplier", 10, "2027-09-30"),
    "OIL-1L": ("Demo Cooking Oil Supplier", 12, "2027-08-31"),
    "PER-100": ("Demo Personal Care Supplier", 24, "2028-03-31"),
    "RIC-1KG": ("Demo Rice Supplier", 10, "2027-10-31"),
}
START = date(2025, 10, 27)  # Monday; 52 complete weeks ending 25 October 2026.
WEEKS = 52


def generate() -> tuple[Path, Path]:
    OUT.mkdir(parents=True, exist_ok=True)
    products_path = OUT / "products.csv"
    sales_path = OUT / "sales.csv"
    rng = random.Random(42)
    with sales_path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(["week_start", "sku", "product_name", "units_sold", "unit_price_inr", "opening_stock", "restocked", "closing_stock"])
        stock = {row[0]: row[3] for row in PRODUCTS}
        for index in range(WEEKS):
            week = START + timedelta(weeks=index)
            for sku, name, _, _, price, _, base in PRODUCTS:
                seasonal = 1 + 0.16 * math.sin(2 * math.pi * index / 13)
                trend = 1 + 0.10 * index / (WEEKS - 1)
                units = max(0, round(base * seasonal * trend + rng.gauss(0, base * 0.14)))
                opening = stock[sku]
                restocked = max(0, units + 20 - opening)
                closing = opening + restocked - units
                stock[sku] = closing
                writer.writerow([week.isoformat(), sku, name, units, price, opening, restocked, closing])
    # The importable catalog should represent stock at the end of the dataset,
    # not the opening balance from 52 weeks earlier.
    with products_path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(["Name", "Category", "Quantity", "SKU", "Alert at", "Target", "Supplier", "Cost", "Price", "Unit", "Pack size", "Expiry"])
        for sku, name, category, _, price, cost, _ in PRODUCTS:
            supplier, pack_size, expiry = DETAILS[sku]
            writer.writerow([name, category, stock[sku], sku, 5, 60, supplier, cost, price, "pcs", pack_size, expiry])
    return products_path, sales_path


if __name__ == "__main__":
    products, sales = generate()
    print(f"Wrote {products} and {sales}; synthetic demo data, not observed sales")
