import { useMemo, useState } from "react";
import { ClipboardCopy, Download } from "lucide-react";
import { statusOf, suggestedReorder, type Product } from "./inventory";
import { Status, Ticker } from "./ui";

const csvCell = (value: string | number) =>
  `"${String(value).replaceAll('"', '""')}"`;

export function ReorderPage({
  products,
  onSelect,
}: {
  products: Product[];
  onSelect: (product: Product) => void;
}) {
  const [message, setMessage] = useState("");
  const items = useMemo(
    () =>
      products
        .filter((product) => statusOf(product) !== "healthy")
        .sort((a, b) => a.quantity - b.quantity),
    [products],
  );
  const ready = items.filter((product) => suggestedReorder(product) !== null);
  const total = ready.reduce(
    (sum, product) => sum + (suggestedReorder(product) ?? 0),
    0,
  );
  const bySupplier = useMemo(() => {
    const groups = new Map<string, Product[]>();
    for (const product of items) {
      const supplier = product.supplier || "No supplier";
      groups.set(supplier, [...(groups.get(supplier) ?? []), product]);
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

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
    <div className="space-y-4">
      <section className="panel flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="mr-auto">
          <h2 className="heading">
            Order <Ticker value={total} /> units
          </h2>
          <p className="hint mt-0.5">
            {message ||
              `${ready.length} of ${items.length} products have a restock target`}
          </p>
        </div>
        <button
          className="btn-soft"
          onClick={copyList}
          disabled={!ready.length}
        >
          <ClipboardCopy size={16} />
          Copy list
        </button>
        <button
          className="btn-soft"
          onClick={exportCsv}
          disabled={!items.length}
        >
          <Download size={16} />
          Download CSV
        </button>
      </section>
      {items.length === 0 ? (
        <section className="panel hint py-14 text-center">
          Every product is above its alert level.
        </section>
      ) : (
        bySupplier.map(([supplier, group]) => (
          <section key={supplier} className="panel !px-0 !pb-1">
            <h2 className="heading px-5 pb-3">{supplier}</h2>
            {group.map((product) => {
              const order = suggestedReorder(product);
              return (
                <button
                  key={product.id}
                  className="btn-row grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-t border-line px-5 py-3"
                  onClick={() => onSelect(product)}
                >
                  <span className="truncate font-medium">{product.name}</span>
                  <span className="tabular text-right text-base font-semibold">
                    {order ?? "–"}
                  </span>
                  <span>
                    <Status product={product} />
                    <span className="hint tabular">
                      , <Ticker value={product.quantity} />
                      {product.targetStock
                        ? ` of ${product.targetStock}`
                        : " on hand, no target"}
                    </span>
                  </span>
                  <span className="hint text-right">
                    {order === null ? "set a target" : "to order"}
                  </span>
                </button>
              );
            })}
          </section>
        ))
      )}
    </div>
  );
}
