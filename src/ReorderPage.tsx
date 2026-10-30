import { useState } from "react";
import {
  ClipboardCopy,
  Download,
  PackageCheck,
  Pencil,
  Plus,
} from "lucide-react";
import { statusOf, suggestedReorder, type Product } from "./inventory";
import { StatusBadge } from "./ui";

const csvCell = (value: string | number) =>
  `"${String(value).replaceAll('"', '""')}"`;

export function ReorderPage({
  products,
  onEdit,
  onRestock,
}: {
  products: Product[];
  onEdit: (product: Product) => void;
  onRestock: (product: Product) => void;
}) {
  const [message, setMessage] = useState("");
  const items = products
    .filter((product) => statusOf(product) !== "healthy")
    .sort((a, b) => a.quantity - b.quantity);
  const ready = items.filter((product) => suggestedReorder(product) !== null);

  async function copyList() {
    const lines = ready.map(
      (product) =>
        `${product.name}${product.sku ? ` (${product.sku})` : ""}: order ${suggestedReorder(product)} units${product.supplier ? ` from ${product.supplier}` : ""}`,
    );
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setMessage("Reorder list copied.");
    } catch {
      setMessage("Copy failed. Use Download CSV instead.");
    }
  }
  function exportCsv() {
    const rows = [
      [
        "Product",
        "SKU",
        "Supplier",
        "Current units",
        "Restock target",
        "Units to order",
      ],
      ...items.map((product) => [
        product.name,
        product.sku,
        product.supplier ?? "",
        product.quantity,
        product.targetStock ?? "",
        suggestedReorder(product) ?? "",
      ]),
    ];
    const blob = new Blob(
      [rows.map((row) => row.map(csvCell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "stocksync-reorder.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card !p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
        <div>
          <h2 className="section-title">Reorder list</h2>
          <p className="section-subtitle">
            Items at or below their alert level. Quantities use your restock
            targets.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="secondary-button flex items-center gap-2"
            onClick={copyList}
            disabled={!ready.length}
          >
            <ClipboardCopy size={16} />
            Copy list
          </button>
          <button
            className="secondary-button flex items-center gap-2"
            onClick={exportCsv}
            disabled={!items.length}
          >
            <Download size={16} />
            Download CSV
          </button>
        </div>
      </div>
      {message && (
        <p role="status" className="px-6 pt-4 text-sm text-indigo-700">
          {message}
        </p>
      )}
      {items.length ? (
        <div className="divide-y divide-slate-100">
          {items.map((product) => (
            <div
              key={product.id}
              className="flex flex-wrap items-center gap-4 px-5 py-5 sm:px-6"
            >
              <div className="min-w-44 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{product.name}</p>
                  <StatusBadge product={product} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {product.supplier || "No supplier saved"}
                  {product.sku ? ` · ${product.sku}` : ""}
                </p>
              </div>
              <div className="min-w-28">
                <p className="text-xs text-slate-500">Current / target</p>
                <p className="mt-1 text-sm font-semibold">
                  {product.quantity} / {product.targetStock || "Not set"}
                </p>
              </div>
              <div className="min-w-24">
                <p className="text-xs text-slate-500">Order</p>
                <p className="mt-1 text-sm font-bold text-indigo-700">
                  {suggestedReorder(product) ?? "Set target"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="secondary-button flex items-center gap-1 !px-3"
                  onClick={() => onEdit(product)}
                >
                  <Pencil size={15} />
                  Edit
                </button>
                <button
                  className="primary-button !px-3"
                  onClick={() => onRestock(product)}
                >
                  <Plus size={15} />
                  Restock
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-16 text-center">
          <PackageCheck size={30} className="mx-auto text-emerald-600" />
          <p className="mt-3 font-semibold">Nothing to reorder</p>
          <p className="mt-1 text-sm text-slate-500">
            Products will appear here when stock reaches their alert level.
          </p>
        </div>
      )}
    </section>
  );
}
