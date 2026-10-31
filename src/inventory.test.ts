import { describe, expect, it } from "vitest";
import {
  categoryTotals,
  canUndo,
  chartAxis,
  formatMoney,
  duplicateProblem,
  expiringSoon,
  findByCode,
  gettingStarted,
  formatQuantity,
  groupByDay,
  sampleProducts,
  shopKinds,
  inventorySummary,
  matchCategory,
  moneyForChange,
  packsNeeded,
  parseMoney,
  salesSummary,
  similarCategory,
  shelfCapacity,
  stockValue,
  statusOf,
  suggestedReorder,
  unitsByDay,
  validQuantity,
  validateProduct,
  type Movement,
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

describe("duplicateProblem", () => {
  const stock = [
    { ...product(1), id: "a", name: "Rice 1kg", sku: "RC-1" },
    { ...product(2), id: "b", name: "Soap", sku: "" },
  ];

  it("spots a repeated SKU regardless of case", () => {
    expect(duplicateProblem({ name: "New", sku: " rc-1 " }, stock)).toMatch(
      /RC-1.*Rice 1kg/,
    );
  });

  it("spots a repeated name regardless of case and spacing", () => {
    expect(duplicateProblem({ name: "  rice   1KG", sku: "" }, stock)).toMatch(
      /Rice 1kg/,
    );
  });

  it("ignores blank SKUs and the product being edited", () => {
    expect(duplicateProblem({ name: "New", sku: "" }, stock)).toBeNull();
    expect(duplicateProblem({ name: "Soap", sku: "" }, stock, "b")).toBeNull();
  });
});

describe("category matching", () => {
  const categories = ["Snacks", "Stationery"];

  it("reuses the existing spelling for a different case", () => {
    expect(matchCategory(" snacks ", categories)).toBe("Snacks");
  });

  it("keeps a genuinely new category", () => {
    expect(matchCategory("Dairy", categories)).toBe("Dairy");
  });

  it("suggests a close category for a likely typo", () => {
    expect(similarCategory("Snack", categories)).toBe("Snacks");
    expect(similarCategory("Stationary", categories)).toBe("Stationery");
  });

  it("stays quiet for exact and unrelated names", () => {
    expect(similarCategory("snacks", categories)).toBeNull();
    expect(similarCategory("Dairy", categories)).toBeNull();
  });
});

describe("canUndo", () => {
  const entry = (kind: string, change = -1) =>
    ({ id: "m1", kind, change }) as Movement;

  it("allows ordinary stock changes", () => {
    for (const kind of ["sale", "restock", "return", "damage", "correction"])
      expect(canUndo(entry(kind), new Set())).toBe(true);
  });

  it("refuses opening stock, deletions, undos and repeat undos", () => {
    expect(canUndo(entry("opening"), new Set())).toBe(false);
    expect(canUndo(entry("deleted"), new Set())).toBe(false);
    expect(canUndo(entry("undo"), new Set())).toBe(false);
    expect(canUndo(entry("sale"), new Set(["m1"]))).toBe(false);
  });

  it("has nothing to undo when stock did not change", () => {
    expect(canUndo(entry("sale", 0), new Set())).toBe(false);
  });
});

describe("money", () => {
  it("reads rupee amounts into whole paise", () => {
    expect(parseMoney("12.50")).toBe(1250);
    expect(parseMoney(" 1,200 ")).toBe(120000);
    expect(parseMoney("₹5")).toBe(500);
    expect(parseMoney("0.1")).toBe(10);
    expect(parseMoney("")).toBe(0);
  });

  it("refuses text, negatives and fractions of a paisa", () => {
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney("1.234")).toBeNull();
  });

  it("formats with Indian grouping and hides empty paise", () => {
    expect(formatMoney(12345600)).toBe("₹1,23,456");
    expect(formatMoney(1250)).toBe("₹12.50");
    expect(formatMoney(0)).toBe("₹0");
    expect(formatMoney(-500)).toBe("−₹5");
  });
});

describe("stockValue", () => {
  it("adds up cost and counts products with no cost", () => {
    const priced = { ...product(10), costPrice: 250 };
    const unpriced = { ...product(3), costPrice: 0 };
    const empty = { ...product(0), costPrice: 0 };
    expect(stockValue([priced, unpriced, empty])).toEqual({
      value: 2500,
      unpriced: 1,
    });
  });
});

describe("moneyForChange", () => {
  const priced = { costPrice: 800, sellPrice: 1000 };

  it("records revenue and profit for a sale", () => {
    expect(moneyForChange(priced, "sale", 3)).toEqual({
      revenue: 3000,
      profit: 600,
    });
  });

  it("takes both back for a return", () => {
    expect(moneyForChange(priced, "return", 1)).toEqual({
      revenue: -1000,
      profit: -200,
    });
  });

  it("leaves out what it cannot work out", () => {
    expect(moneyForChange({ sellPrice: 1000 }, "sale", 2)).toEqual({
      revenue: 2000,
    });
    expect(moneyForChange({ costPrice: 800 }, "sale", 2)).toEqual({});
    expect(moneyForChange(priced, "restock", 2)).toEqual({});
  });
});

describe("salesSummary", () => {
  const today = new Date("2026-10-31T18:00:00");

  it("adds up sales since a date, including undos", () => {
    const entries = [
      { ...moved(0, "2026-10-31T09:00:00"), revenue: 3000, profit: 600 },
      { ...moved(0, "2026-10-31T10:00:00"), revenue: -1000, profit: -200 },
      { ...moved(0, "2026-10-30T09:00:00"), revenue: 9000, profit: 900 },
    ];
    expect(
      salesSummary(entries as never, new Date("2026-10-31T00:00:00"), today),
    ).toEqual({ revenue: 2000, profit: 400 });
  });
});

describe("on-order stock", () => {
  it("reduces the suggested order by what is already coming", () => {
    expect(suggestedReorder({ ...product(2), onOrder: 8 })).toBe(10);
  });

  it("suggests nothing once the full amount is on the way", () => {
    expect(suggestedReorder({ ...product(2), onOrder: 18 })).toBeNull();
  });
});

describe("loose goods", () => {
  it("allows up to three decimals for kg and litres only", () => {
    expect(validQuantity(1.25, { unit: "kg" })).toBe(true);
    expect(validQuantity(1.2345, { unit: "kg" })).toBe(false);
    expect(validQuantity(0.5, { unit: "L" })).toBe(true);
    expect(validQuantity(1.5, { unit: "pcs" })).toBe(false);
    expect(validQuantity(1.5, {})).toBe(false);
    expect(validQuantity(-1, { unit: "kg" })).toBe(false);
  });

  it("shows amounts without floating-point noise", () => {
    expect(formatQuantity(0.1 + 0.2)).toBe("0.3");
    expect(formatQuantity(1500)).toBe("1,500");
  });

  it("validates a loose product's opening stock", () => {
    expect(
      validateProduct({ ...input, unit: "kg", quantity: 2.5 }, true),
    ).toBeNull();
    expect(validateProduct({ ...input, quantity: 2.5 }, true)).toMatch(
      /whole number/,
    );
  });

  it("rounds sale money to whole paise", () => {
    expect(
      moneyForChange({ costPrice: 3333, sellPrice: 4567 }, "sale", 1.5),
    ).toEqual({ revenue: 6851, profit: 1851 });
  });
});

describe("packsNeeded", () => {
  it("rounds an order up to full packs", () => {
    expect(packsNeeded(25, 12)).toBe(3);
    expect(packsNeeded(24, 12)).toBe(2);
  });
});

describe("expiringSoon", () => {
  const today = new Date("2026-10-31T10:00:00");
  const dated = (name: string, expiryDate: string, quantity = 5) => ({
    ...product(quantity),
    name,
    expiryDate,
  });

  it("lists stock near or past expiry, soonest first", () => {
    const found = expiringSoon(
      [
        dated("Later", "2026-11-20"),
        dated("Past", "2026-10-29"),
        dated("Far", "2027-03-01"),
        dated("Gone", "2026-11-01", 0),
      ],
      today,
    );
    expect(found.map((item) => [item.product.name, item.days])).toEqual([
      ["Past", -2],
      ["Later", 20],
    ]);
  });
});

describe("findByCode", () => {
  it("matches a scanned code to a SKU exactly", () => {
    const stock = [{ ...product(1), sku: "8901234567890" }];
    expect(findByCode(stock, " 8901234567890 ")?.sku).toBe("8901234567890");
    expect(findByCode(stock, "890123")).toBeUndefined();
    expect(findByCode([{ ...product(1), sku: "" }], "")).toBeUndefined();
  });
});

describe("gettingStarted", () => {
  const done = (
    stock: Parameters<typeof gettingStarted>[0],
    moves: Parameters<typeof gettingStarted>[1],
  ) => gettingStarted(stock, moves).map((step) => step.done);

  it("starts with nothing done", () => {
    expect(done([], [])).toEqual([false, false, false, false]);
  });

  it("does not count sample products as the shop's own", () => {
    const stock = [{ ...product(1), sample: true, lowStockThreshold: 9 }];
    expect(done(stock, [])).toEqual([false, false, false, false]);
  });

  it("ticks off real work", () => {
    const stock = [{ ...product(1), lowStockThreshold: 9 }];
    const moves = [
      { kind: "sale" as const, note: "" },
      { kind: "correction" as const, note: "End-of-day count" },
    ];
    expect(done(stock, moves)).toEqual([true, true, true, true]);
  });

  it("counts a count that recorded missing units as sold", () => {
    const moves = [{ kind: "sale" as const, note: "End-of-day count" }];
    expect(done([], moves)).toEqual([false, true, false, true]);
  });

  it("leaves alert levels open at the default", () => {
    const stock = [{ ...product(1), lowStockThreshold: 5, targetStock: 0 }];
    expect(done(stock, [])[2]).toBe(false);
  });
});

describe("sampleProducts", () => {
  it("gives every kind of shop valid products marked as samples", () => {
    for (const kind of shopKinds) {
      const items = sampleProducts(kind);
      expect(items.length).toBeGreaterThan(3);
      for (const item of items) {
        expect(item.sample).toBe(true);
        expect(validateProduct(item, true)).toBeNull();
      }
    }
  });

  it("includes something low, so Reorder has work to show", () => {
    expect(
      sampleProducts("Groceries").some(
        (item) => (item.quantity ?? 0) <= item.lowStockThreshold,
      ),
    ).toBe(true);
  });
});
