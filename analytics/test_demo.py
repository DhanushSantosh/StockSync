import csv
import unittest

from build_demo import build
from generate_demo import WEEKS, generate


class DemoDatasetTests(unittest.TestCase):
    def test_generated_sales_balance_and_are_reproducible(self):
        products_file, sales_file = generate()
        first = sales_file.read_bytes()
        first_products = products_file.read_bytes()
        products_file, sales_file = generate()
        self.assertEqual(first, sales_file.read_bytes())
        self.assertEqual(first_products, products_file.read_bytes())
        with sales_file.open(newline="", encoding="utf-8") as stream:
            rows = list(csv.DictReader(stream))
        with products_file.open(newline="", encoding="utf-8") as stream:
            products = list(csv.DictReader(stream))
        self.assertEqual(len(rows), WEEKS * 10)
        self.assertEqual(len(products), 10)
        self.assertEqual(len({row["SKU"] for row in products}), 10)
        final_stock = {row["sku"]: int(row["closing_stock"]) for row in rows}
        for product in products:
            self.assertEqual(int(product["Quantity"]), final_stock[product["SKU"]])
            self.assertTrue(all(product[field] for field in ["Name", "Category", "SKU", "Supplier", "Cost", "Price", "Unit", "Pack size", "Expiry"]))
        for row in rows:
            self.assertEqual(
                int(row["opening_stock"]) + int(row["restocked"]) - int(row["units_sold"]),
                int(row["closing_stock"]),
            )

    def test_holdout_is_chronological_and_only_generated_data(self):
        result = build()
        self.assertTrue(result["synthetic"])
        self.assertEqual(result["model"]["testRows"], 8 * 10)
        self.assertEqual(result["model"]["trainRows"], (WEEKS - 8 - 4) * 10)
        self.assertLess(result["period"]["trainingEnd"], result["period"]["holdoutStart"])
        for product in result["products"]:
            self.assertEqual(len(product["weeks"]), 8)


if __name__ == "__main__":
    unittest.main()
