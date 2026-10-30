import { validateProduct, type Product, type ProductInput } from "./inventory";

export const templateCsv = `Name,Category,Quantity,SKU,Alert at,Target,Supplier
Parle-G 250g,Snacks,24,BIS-250,12,48,Sri Balaji Agencies
`;

const columns: Record<string, string[]> = {
  name: ["name", "product", "product name", "item"],
  category: ["category", "group", "type"],
  quantity: ["quantity", "qty", "stock", "on hand", "opening stock"],
  sku: ["sku", "code", "barcode"],
  alert: ["alert at", "alert", "low stock", "low stock alert"],
  target: ["target", "restock target"],
  supplier: ["supplier", "vendor"],
};

function readRows(text: string) {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    cells.push(cell);
    if (cells.some((value) => value.trim()))
      rows.push({ line: rowLine, cells });
    cells = [];
    cell = "";
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "\n") line++;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else if (char === "\n") {
      endRow();
      rowLine = line;
    } else if (char !== "\r") cell += char;
  }
  endRow();
  return rows;
}

export type ImportProblem = { line: number; message: string };

export function parseProductsCsv(
  text: string,
  existing: Pick<Product, "name" | "sku">[],
) {
  const [head, ...body] = readRows(text.replace(/^﻿/, ""));
  const titles = (head?.cells ?? []).map((title) => title.trim().toLowerCase());
  const position = (field: string) =>
    titles.findIndex((title) => columns[field].includes(title));
  if (position("name") < 0 || position("category") < 0)
    return {
      rows: [] as ProductInput[],
      problems: [
        { line: 1, message: "The file needs Name and Category columns." },
      ] as ImportProblem[],
    };

  const names = new Set(existing.map(({ name }) => name.trim().toLowerCase()));
  const skus = new Set(
    existing.map(({ sku }) => sku.trim().toLowerCase()).filter(Boolean),
  );
  const rows: ProductInput[] = [];
  const problems: ImportProblem[] = [];
  for (const { line, cells } of body) {
    const value = (field: string) => (cells[position(field)] ?? "").trim();
    const number = (field: string, fallback: number) =>
      value(field) === "" ? fallback : Number(value(field));
    const row: ProductInput = {
      name: value("name"),
      category: value("category"),
      quantity: number("quantity", 0),
      sku: value("sku"),
      lowStockThreshold: number("alert", 5),
      targetStock: number("target", 0),
      supplier: value("supplier"),
    };
    const name = row.name.toLowerCase();
    const sku = row.sku.toLowerCase();
    const message =
      validateProduct(row, true) ??
      (names.has(name) || (sku && skus.has(sku))
        ? "Skipped: this product already exists or repeats in the file."
        : null);
    if (message) {
      problems.push({ line, message });
      continue;
    }
    names.add(name);
    if (sku) skus.add(sku);
    rows.push(row);
  }
  return { rows, problems };
}
