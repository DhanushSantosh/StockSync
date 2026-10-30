import { useMemo, useState } from "react";
import { ClipboardCopy, Download } from "lucide-react";
import { errorText, savedMessage } from "./display";
import { auth, db } from "./firebase";
import {
  cancelOrder,
  formatMoney,
  markOrdered,
  packsNeeded,
  receiveOrder,
  shopId,
  statusOf,
  suggestedReorder,
  type Product,
  type SaveResult,
} from "./inventory";
import { Alert, Status, Ticker } from "./ui";
import { t } from "./i18n";

const csvCell = (value: string | number) =>
  `"${String(value).replaceAll('"', '""')}"`;

export function ReorderPage({
  products,
  onSelect,
  onNotice,
}: {
  products: Product[];
  onSelect: (product: Product) => void;
  onNotice: (message: string) => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const items = useMemo(
    () =>
      products
        .filter((product) => statusOf(product) !== "healthy" || product.onOrder)
        .sort((a, b) => a.quantity - b.quantity),
    [products],
  );
  const ready = items.filter((product) => suggestedReorder(product) !== null);
  const total = ready.reduce(
    (sum, product) => sum + (suggestedReorder(product) ?? 0),
    0,
  );
  const estimate = ready.reduce(
    (sum, product) =>
      sum + (suggestedReorder(product) ?? 0) * (product.costPrice ?? 0),
    0,
  );
  const allPriced = ready.every((product) => product.costPrice);
  const comingUnits = items.reduce(
    (sum, product) => sum + (product.onOrder ?? 0),
    0,
  );

  async function run(
    save: (
      database: NonNullable<typeof db>,
      uid: string,
    ) => Promise<SaveResult>,
    done: string,
  ) {
    if (!db || !auth?.currentUser) return;
    setBusy(true);
    setProblem("");
    try {
      onNotice(savedMessage(await save(db, shopId()), done));
    } catch (cause) {
      setProblem(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

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

  if (items.length === 0)
    return (
      <section className="panel py-14 text-center">
        <p className="heading">{t("Nothing to reorder")}</p>
        <p className="hint mt-1">
          {t("Every product is above its alert level.")}
        </p>
      </section>
    );

  return (
    <div className="space-y-gap">
      <section className="panel flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="mr-auto max-sm:w-full">
          <h2 className="heading">
            {total > 0 ? (
              <>
                Order <Ticker value={total} /> units
              </>
            ) : comingUnits > 0 ? (
              <>
                <Ticker value={comingUnits} /> units on order
              </>
            ) : (
              "No order to place"
            )}
          </h2>
          <p className="hint mt-0.5">
            {message ||
              (estimate > 0
                ? `About ${formatMoney(estimate)} at cost${allPriced ? "" : ", some products have no cost price"}`
                : total > 0
                  ? "Add cost prices to see what this order costs"
                  : comingUnits > 0
                    ? "Mark it as received when it arrives"
                    : "Set a restock target to get a suggested order")}
          </p>
        </div>
        <button
          className="btn-soft max-sm:flex-1"
          onClick={copyList}
          disabled={!ready.length}
        >
          <ClipboardCopy size={16} />
          {t("Copy list")}
        </button>
        <button
          className="btn-soft max-sm:flex-1"
          onClick={exportCsv}
          disabled={!items.length}
        >
          <Download size={16} />
          {t("Download CSV")}
        </button>
      </section>
      {problem && <Alert>{problem}</Alert>}
      {bySupplier.map(([supplier, group]) => {
        const toPlace = group.filter((item) => suggestedReorder(item) !== null);
        const coming = group.filter((item) => item.onOrder);
        return (
          <section key={supplier} className="panel !px-0 !pb-1">
            <h2 className="heading px-pad pb-3">{supplier}</h2>
            {group.map((product) => {
              const order = suggestedReorder(product);
              return (
                <button
                  key={product.id}
                  className="btn-row grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-t border-line px-pad py-3"
                  onClick={() => onSelect(product)}
                >
                  <span className="truncate font-medium">{product.name}</span>
                  <span className="tabular text-right text-title font-semibold">
                    {order ?? (product.onOrder || "–")}
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
                    {order !== null
                      ? product.onOrder
                        ? `to order, ${product.onOrder} coming`
                        : (product.packSize ?? 1) > 1
                          ? `to order, ${packsNeeded(order, product.packSize ?? 1)} cartons`
                          : t("to order")
                      : product.onOrder
                        ? t("on order")
                        : "set a target"}
                  </span>
                </button>
              );
            })}
            <div className="flex flex-wrap items-center gap-2 border-t border-line p-pad">
              {toPlace.length > 0 && (
                <button
                  className="btn-soft flex-1"
                  disabled={busy}
                  onClick={() =>
                    run(
                      (database, uid) =>
                        markOrdered(
                          database,
                          uid,
                          toPlace.map((item) => ({
                            id: item.id,
                            units:
                              (item.onOrder ?? 0) +
                              (suggestedReorder(item) ?? 0),
                          })),
                        ),
                      `Marked as ordered from ${supplier}.`,
                    )
                  }
                >
                  {t("Mark as ordered")}
                </button>
              )}
              {coming.length > 0 && (
                <button
                  className="btn-soft flex-1"
                  disabled={busy}
                  onClick={() =>
                    run(
                      (database, uid) => receiveOrder(database, uid, coming),
                      `Order from ${supplier} received.`,
                    )
                  }
                >
                  {t("Mark as received")}
                </button>
              )}
              {coming.length > 0 && (
                <button
                  className="btn-link px-2"
                  disabled={busy}
                  onClick={() =>
                    run(
                      (database, uid) =>
                        cancelOrder(
                          database,
                          uid,
                          coming.map((item) => item.id),
                        ),
                      `Order from ${supplier} cancelled.`,
                    )
                  }
                >
                  {t("Cancel order")}
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
