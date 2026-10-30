import { useMemo } from "react";
import { signed, useNow } from "./display";
import {
  categoryTotals,
  inventorySummary,
  statusOf,
  suggestedReorder,
  unitsByDay,
  type Movement,
  type Product,
} from "./inventory";
import { StockChart } from "./StockChart";
import { Alert, Changes, Ticker } from "./ui";

const chartDays = 14;

function reorderNote(product: Product) {
  if (product.quantity === 0) return "Sold out";
  return `${product.quantity} left, alert at ${product.lowStockThreshold}`;
}

export function OverviewPage({
  products,
  movements,
  recentMovements,
  activityError,
  onSelect,
  onAdd,
  onImport,
  onNavigate,
}: {
  products: Product[];
  movements: Movement[];
  recentMovements: Movement[];
  activityError: string;
  onSelect: (product: Product) => void;
  onAdd: () => void;
  onImport: () => void;
  onNavigate: (page: "Reorder" | "History") => void;
}) {
  const now = useNow();
  const summary = useMemo(() => inventorySummary(products), [products]);
  const days = useMemo(
    () => unitsByDay(recentMovements, summary.units, chartDays, now),
    [recentMovements, summary.units, now],
  );
  const categories = useMemo(() => categoryTotals(products), [products]);
  const lowItems = products
    .filter((product) => statusOf(product) !== "healthy")
    .sort((a, b) => a.quantity - b.quantity);
  const ordering = lowItems.reduce(
    (sum, product) => sum + (suggestedReorder(product) ?? 0),
    0,
  );
  const healthy = summary.products - summary.low - summary.out;
  const weekChange = summary.units - days[chartDays - 8].units;

  if (products.length === 0)
    return (
      <section className="panel py-16 text-center">
        <h2 className="text-heading font-semibold">Add your first product</h2>
        <p className="hint mt-1.5">
          Your stock, reorders and changes will appear here.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button className="btn-accent" onClick={onAdd}>
            Add product
          </button>
          <button className="btn-soft !rounded-full" onClick={onImport}>
            Import CSV
          </button>
        </div>
      </section>
    );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-gap md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
      <section className="panel">
        <h1 className="text-body font-medium">Stock on hand</h1>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5">
          <Ticker
            value={summary.units}
            countIn
            className="text-display font-medium tracking-tight"
          />
          <span className="text-title font-medium text-muted">units</span>
        </p>
        <p className="tabular mt-3 inline-block rounded-full bg-accent/14 px-3 py-1 text-caption font-medium text-accent">
          {signed(weekChange)} units in the last 7 days
        </p>
        <div className="hint mt-5 flex flex-wrap justify-between gap-x-3">
          <span>Total units across all products</span>
          <span>Last {chartDays} days</span>
        </div>
        <StockChart days={days} />
      </section>

      <section className="panel flex flex-col">
        <h2 className="heading">To reorder</h2>
        <p className="hint mt-0.5">
          {lowItems.length
            ? `${lowItems.length} ${lowItems.length === 1 ? "product" : "products"} at or below their alert level`
            : "Every product is above its alert level"}
        </p>
        {lowItems.length > 0 && (
          <div className="-mx-pad mt-3.5 flex-1 max-md:[&>button:nth-child(n+4)]:hidden">
            {lowItems.slice(0, 5).map((product) => {
              const order = suggestedReorder(product);
              return (
                <button
                  key={product.id}
                  className="btn-row grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-line px-pad py-3"
                  onClick={() => onSelect(product)}
                >
                  <span className="truncate font-medium">{product.name}</span>
                  <span className="tabular text-right text-title font-semibold">
                    {order ?? "–"}
                  </span>
                  <span
                    className={`text-caption ${product.quantity ? "text-warn" : "text-loss"}`}
                  >
                    {reorderNote(product)}
                  </span>
                  <span className="hint text-right">
                    {order === null ? "no target" : "to order"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {lowItems.length > 0 && (
          <button
            className="btn-soft mt-3 w-full"
            onClick={() => onNavigate("Reorder")}
          >
            Review order of {ordering.toLocaleString()} units
          </button>
        )}
      </section>

      <section className="panel">
        <h2 className="heading">Is the shop stocked?</h2>
        <p className="hint mt-0.5">
          {summary.products} {summary.products === 1 ? "product" : "products"},
          grouped by how much is left
        </p>
        <div className="health mt-3.5" aria-hidden>
          <span className="bg-gain" style={{ flexGrow: healthy }} />
          <span className="bg-warn" style={{ flexGrow: summary.low }} />
          <span className="bg-loss" style={{ flexGrow: summary.out }} />
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 sm:grid sm:grid-cols-3">
          {(
            [
              ["Enough", healthy, "bg-gain"],
              ["Running low", summary.low, "bg-warn"],
              ["Sold out", summary.out, "bg-loss"],
            ] as const
          ).map(([label, count, tone]) => (
            <div key={label} className="flex flex-col">
              <dd className="order-1 text-heading font-semibold">
                <Ticker value={count} />
              </dd>
              <dt className="hint order-2 flex items-center gap-1.5">
                <span className={`size-2 rounded-[3px] ${tone}`} />
                {label}
              </dt>
            </div>
          ))}
        </dl>
        <h2 className="heading mt-6">Stock by category</h2>
        <div className="hint mt-3 mb-1.5 flex gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-accent" />
            On hand
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-[#30333a]" />
            Room to target
          </span>
        </div>
        {categories.map(({ category, units, capacity }) => (
          <div
            key={category}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2 md:grid-cols-[6rem_minmax(0,1fr)_5.5rem]"
          >
            <span className="truncate">{category}</span>
            <div className="bar max-md:col-span-2 max-md:row-start-2">
              <div
                className="bar-fill"
                style={{ width: `${(units / capacity) * 100}%` }}
              />
            </div>
            <span className="hint tabular text-right">
              <Ticker value={units} className="font-semibold text-fg" /> of{" "}
              {capacity}
            </span>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="flex items-baseline justify-between">
          <h2 className="heading">Stock changes</h2>
          <button className="btn-link" onClick={() => onNavigate("History")}>
            See all
          </button>
        </div>
        {activityError ? (
          <div className="mt-3">
            <Alert>{activityError}</Alert>
          </div>
        ) : movements.length ? (
          <Changes movements={movements} limit={5} />
        ) : (
          <p className="hint mt-3">Changes you record will appear here.</p>
        )}
      </section>
    </div>
  );
}
