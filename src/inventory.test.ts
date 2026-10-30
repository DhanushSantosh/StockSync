import { describe, expect, it } from "vitest";
import {
  inventorySummary,
  statusOf,
  suggestedReorder,
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
  targetStock: 20,
});

const input = {
  name: "Notebook",
  sku: "",
  category: "Stationery",
  quantity: 2,
  lowStockThreshold: 5,
  targetStock: 20,
  supplier: "",
};

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
    expect(validateProduct({ ...input, quantity: -1 }, true)).toMatch(
      /Quantity/,
    );
    expect(validateProduct({ ...input, name: " " }, true)).toMatch(/Name/);
    expect(validateProduct({ ...input, quantity: 2.5 }, true)).toMatch(
      /Quantity/,
    );
    expect(validateProduct({ ...input, targetStock: 4 }, true)).toMatch(
      /Restock target/,
    );
  });

  it("calculates a reorder quantity only for products below their alert level", () => {
    expect(suggestedReorder(product(0))).toBe(20);
    expect(suggestedReorder(product(5))).toBe(15);
    expect(suggestedReorder(product(6))).toBeNull();
    expect(suggestedReorder({ ...product(2), targetStock: 0 })).toBeNull();
  });
});
