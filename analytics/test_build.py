import unittest

import numpy as np
import pandas as pd

from build import clean_sales, feature_rows, weekly_panel


class PipelineTests(unittest.TestCase):
    def test_cleaning_excludes_non_sales_and_counts_each_reason_once(self):
        rows = pd.DataFrame(
            [
                ["1", "12345", "Valid", 2, "2011-01-03", 1.5, "United Kingdom"],
                ["C2", "12345", "Return", -2, "2011-01-03", 1.5, "United Kingdom"],
                ["3", "12345", "Return", -1, "2011-01-03", 1.5, "United Kingdom"],
                ["4", "12345", "Free", 1, "2011-01-03", 0, "United Kingdom"],
                ["5", "12345", "Other market", 1, "2011-01-03", 1.5, "France"],
                ["6", "POST", "Postage", 1, "2011-01-03", 1.5, "United Kingdom"],
                ["7", "12345", None, 1, "2011-01-03", 1.5, "United Kingdom"],
            ],
            columns=["Invoice", "StockCode", "Description", "Quantity", "InvoiceDate", "Price", "Country"],
        )
        clean, counts = clean_sales(rows)
        self.assertEqual(len(clean), 1)
        self.assertEqual(clean.iloc[0]["Description"], "Valid")
        self.assertEqual(counts["cancelled"], 1)
        self.assertEqual(counts["returnsOrNonpositiveQuantity"], 1)
        self.assertEqual(counts["nonpositivePrice"], 1)
        self.assertEqual(counts["outsideUK"], 1)
        self.assertEqual(counts["invalidProductCode"], 1)
        self.assertEqual(counts["missingDateOrDescription"], 1)

    def test_target_week_never_enters_its_own_features_and_zero_week_is_kept(self):
        weeks = pd.date_range("2010-01-04", periods=7, freq="W-MON")
        panel = pd.DataFrame({
            "StockCode": ["12345"] * 7,
            "week": weeks,
            "units": [2, 0, 5, 7, 11, 13, 17],
            "price": [1.0, np.nan, 1.0, 1.0, 1.0, 1.0, 1.0],
        })
        before = feature_rows(panel)
        self.assertEqual(before.loc[0, "week"], weeks[4])
        self.assertEqual(before.loc[0, "lag1"], 7)
        self.assertEqual(before.loc[0, "lag3"], 0)
        self.assertEqual(before.loc[0, "mean4"], (7 + 5 + 0 + 2) / 4)
        changed = panel.copy()
        changed.loc[4, "units"] = 1000
        after = feature_rows(changed)
        self.assertEqual(before.loc[0, ["lag1", "lag2", "lag3", "lag4", "mean4", "lastPrice"]].tolist(),
                         after.loc[0, ["lag1", "lag2", "lag3", "lag4", "mean4", "lastPrice"]].tolist())
        self.assertNotEqual(before.loc[1, "lag1"], after.loc[1, "lag1"])

    def test_weekly_panel_fills_missing_sales_weeks_with_zero(self):
        weeks = pd.date_range("2010-01-04", periods=34, freq="W-MON")
        records = []
        for product in range(50):
            for week in weeks[:22]:
                if product == 0 and week == weeks[5]:
                    continue
                records.append({"StockCode": f"{product:05d}", "week": week, "Quantity": 1,
                                "Price": 2.0, "Description": f"Product {product}"})
        panel, selected = weekly_panel(pd.DataFrame(records), weeks)
        self.assertEqual(len(selected), 50)
        missing = panel.loc[(panel["StockCode"] == "00000") & (panel["week"] == weeks[5])]
        self.assertEqual(missing.iloc[0]["units"], 0)
        self.assertTrue(np.isnan(missing.iloc[0]["price"]))


if __name__ == "__main__":
    unittest.main()
