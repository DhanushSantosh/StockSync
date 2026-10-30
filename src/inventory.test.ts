import { describe, expect, it } from "vitest";
import {
  inventorySummary,
  statusOf,
  validateProduct,
  type Product,
} from "./inventory";

const product = (quantity: number, lowStockThreshold = 5): Product => ({
  id: String(quantity),
  name: "Notebook",
  sku: "",
  category: "Stationery",
  quantity,
  lowStockThreshold,
});

describe("inventory calculations", () => {
  it("keeps low and out of stock mutually exclusive", () => {
    expect(statusOf(product(0))).toBe("out");
    expect(statusOf(product(5))).toBe("low");
    expect(statusOf(product(6))).toBe("healthy");
    expect(inventorySummary([product(0), product(5), product(6)])).toEqual({
      products: 3,
      units: 11,
      low: 1,
      out: 1,
    });
  });

  it("rejects invalid product quantities and names", () => {
    expect(
      validateProduct(
        {
          name: "Notebook",
          sku: "",
          category: "Stationery",
          quantity: -1,
          lowStockThreshold: 5,
        },
        true,
      ),
    ).toMatch(/Quantity/);
    expect(
      validateProduct(
        {
          name: " ",
          sku: "",
          category: "Stationery",
          quantity: 2,
          lowStockThreshold: 5,
        },
        true,
      ),
    ).toMatch(/Name/);
    expect(
      validateProduct(
        {
          name: "Notebook",
          sku: "",
          category: "Stationery",
          quantity: 2.5,
          lowStockThreshold: 5,
        },
        true,
      ),
    ).toMatch(/Quantity/);
  });
});
