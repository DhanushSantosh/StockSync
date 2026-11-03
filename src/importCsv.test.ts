import { describe, expect, it } from "vitest";
import demoProductsCsv from "../analytics/demo/products.csv?raw";
import { parseProductsCsv } from "./importCsv";

const header = "Name,Category,Quantity,SKU,Alert at,Target,Supplier";

describe("parseProductsCsv", () => {
  it("imports all generated grocery products with their current stock and details", () => {
    const { rows, problems } = parseProductsCsv(demoProductsCsv, []);
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(10);
    expect(rows.map((product) => product.quantity)).toEqual(Array(10).fill(20));
    expect(rows.every((product) => product.supplier && product.packSize && product.expiryDate)).toBe(true);
    expect(rows.find((product) => product.sku === "DAI-100")).toMatchObject({
      name: "Amul Butter 100g",
      category: "Dairy",
      sellPrice: 5600,
      costPrice: 4900,
      unit: "pcs",
    });
  });

  it("reads products from the template columns", () => {
    const { rows, problems } = parseProductsCsv(
      `${header}\nParle-G 250g,Snacks,24,BIS-250,12,48,Sri Balaji`,
      [],
    );
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      {
        name: "Parle-G 250g",
        category: "Snacks",
        quantity: 24,
        sku: "BIS-250",
        lowStockThreshold: 12,
        targetStock: 48,
        supplier: "Sri Balaji",
        costPrice: 0,
        sellPrice: 0,
        unit: "pcs",
        packSize: 1,
        expiryDate: "",
      },
    ]);
  });

  it("handles quotes, a byte order mark and Windows line endings", () => {
    const { rows } = parseProductsCsv(
      `﻿${header}\r\n"Rice, Basmati ""Gold""",Grocery,5,,2,10,\r\n`,
      [],
    );
    expect(rows[0].name).toBe('Rice, Basmati "Gold"');
  });

  it("accepts columns in any order with friendly names", () => {
    const { rows } = parseProductsCsv(
      "Product,Stock,Group\nSoap,3,Household",
      [],
    );
    expect(rows[0]).toMatchObject({
      name: "Soap",
      quantity: 3,
      category: "Household",
      lowStockThreshold: 5,
      targetStock: 0,
    });
  });

  it("reports the line number of each bad row and keeps the good ones", () => {
    const { rows, problems } = parseProductsCsv(
      `${header}\nGood,Snacks,1,,,,\n,Snacks,1,,,,\nBad,Snacks,1.5,,,,`,
      [],
    );
    expect(rows.map((row) => row.name)).toEqual(["Good"]);
    expect(problems).toEqual([
      { line: 3, message: "Name must be 1–100 characters." },
      { line: 4, message: "Quantity must be a nonnegative whole number." },
    ]);
  });

  it("skips products that exist already or repeat in the file", () => {
    const { rows, problems } = parseProductsCsv(
      `${header}\nsoap,Home,1,,,,\nPen,Office,1,P-1,,,\nPen 2,Office,1,p-1,,,`,
      [{ name: "Soap", sku: "", category: "Home" }],
    );
    expect(rows.map((row) => row.name)).toEqual(["Pen"]);
    expect(problems.map((problem) => problem.line)).toEqual([2, 4]);
  });

  it("explains when required columns are missing", () => {
    const { rows, problems } = parseProductsCsv("Colour\nRed", []);
    expect(rows).toEqual([]);
    expect(problems[0].message).toMatch(/Name.*Category/);
  });

  it("reuses an existing category's spelling", () => {
    const { rows } = parseProductsCsv(
      `${header}\nA,snacks,1,,,,\nB,SNACKS,1,,,,`,
      [{ name: "Pen", sku: "", category: "Snacks" }],
    );
    expect(rows.map((row) => row.category)).toEqual(["Snacks", "Snacks"]);
  });

  it("reads cost and selling prices", () => {
    const { rows } = parseProductsCsv(
      "Name,Category,Cost,Price\nPen,Office,8.50,12",
      [],
    );
    expect(rows[0]).toMatchObject({ costPrice: 850, sellPrice: 1200 });
  });

  it("reports a price it cannot read", () => {
    const { rows, problems } = parseProductsCsv(
      "Name,Category,Price\nPen,Office,free",
      [],
    );
    expect(rows).toEqual([]);
    expect(problems[0].message).toMatch(/price/i);
  });
});
