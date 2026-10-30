import { describe, expect, it } from "vitest";
import { parseProductsCsv } from "./importCsv";

const header = "Name,Category,Quantity,SKU,Alert at,Target,Supplier";

describe("parseProductsCsv", () => {
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
});
