import { describe, expect, it } from "vitest";
import {
  categoryTotals,
  chartAxis,
  groupByDay,
  inventorySummary,
  shelfCapacity,
  statusOf,
  suggestedReorder,
  unitsByDay,
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

const moved = (change: number, date: string) => ({
  id: date + change,
  change,
  createdAt: { toDate: () => new Date(date) },
});
const now = new Date("2026-10-30T18:00:00");

describe("unitsByDay", () => {
  it("rebuilds each day's closing total, oldest first", () => {
    const movements = [
      moved(-2, "2026-10-30T09:00:00"),
      moved(5, "2026-10-29T09:00:00"),
    ];
    const days = unitsByDay(movements as never, 13, 3, now);
    expect(days.map((day) => day.units)).toEqual([10, 15, 13]);
    expect(days[2].date.getDate()).toBe(30);
  });

  it("treats an unsaved movement's missing time as today", () => {
    const days = unitsByDay([{ change: 4 }] as never, 10, 2, now);
    expect(days.map((day) => day.units)).toEqual([6, 10]);
  });

  it("stays flat when nothing moved", () => {
    expect(unitsByDay([], 7, 3, now).map((day) => day.units)).toEqual([
      7, 7, 7,
    ]);
  });
});

describe("groupByDay", () => {
  it("labels recent days and totals each one", () => {
    const groups = groupByDay(
      [
        moved(-3, "2026-10-30T09:00:00"),
        moved(-4, "2026-10-30T08:00:00"),
        moved(18, "2026-10-29T09:00:00"),
        moved(1, "2026-10-20T09:00:00"),
      ] as never,
      now,
    );
    expect(groups.map((group) => [group.label, group.net])).toEqual([
      ["Today, Oct 30", -7],
      ["Yesterday, Oct 29", 18],
      ["Oct 20", 1],
    ]);
  });
});

describe("categoryTotals", () => {
  it("adds up units and capacity, largest first", () => {
    const totals = categoryTotals([
      { ...product(3), category: "Snacks" },
      { ...product(8), category: "Stationery" },
      { ...product(9), category: "Stationery" },
    ]);
    expect(totals).toEqual([
      { category: "Stationery", units: 17, capacity: 40 },
      { category: "Snacks", units: 3, capacity: 20 },
    ]);
  });
});

describe("chartAxis", () => {
  it("rounds outward to even steps", () => {
    expect(chartAxis([246, 262, 280])).toEqual({
      min: 240,
      max: 280,
      ticks: [240, 250, 260, 270, 280],
    });
  });

  it("gives a flat line some range without going below zero", () => {
    expect(chartAxis([0, 0])).toEqual({
      min: 0,
      max: 4,
      ticks: [0, 1, 2, 3, 4],
    });
  });
});

describe("shelfCapacity", () => {
  it("uses the restock target when there is one", () => {
    expect(shelfCapacity(product(8))).toBe(20);
  });

  it("grows to fit stock above the target", () => {
    expect(shelfCapacity(product(35))).toBe(35);
  });

  it("falls back to twice the alert level without a target", () => {
    expect(shelfCapacity({ ...product(3), targetStock: 0 })).toBe(10);
  });

  it("is never zero", () => {
    expect(shelfCapacity({ ...product(0, 0), targetStock: 0 })).toBe(1);
  });
});
