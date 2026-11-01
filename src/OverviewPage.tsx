import { useMemo } from "react";
import { signed, useNow } from "./display";
import type { Customer } from "./credit";
import {
  categoryTotals,
  expiringSoon,
  formatMoney,
  formatQuantity,
  inventorySummary,
  salesSummary,
  statusOf,
  stockValue,
  suggestedReorder,
  unitSuffix,
  unitsByDay,
  type Movement,
  type Product,
} from "./inventory";
import { StockChart } from "./StockChart";
import { Alert, Changes, Ticker } from "./ui";
import { currentLanguage, t } from "./i18n";

const chartDays = 14;

function reorderNote(product: Product) {
  if (product.quantity === 0) return "Sold out";
  return `${product.quantity} left, alert at ${product.lowStockThreshold}`;
}

export function OverviewPage({
  products,
  movements,
  recentMovements,
  customers,
  activityError,
  canManage,
  onSelect,
  onAdd,
  onImport,
  onNavigate,
}: {
  products: Product[];
  movements: Movement[];
  recentMovements: Movement[];
  customers: Customer[];
  canManage: boolean;
  activityError: string;
  onSelect: (product: Product) => void;
  onAdd: () => void;
  onImport: () => void;
  onNavigate: (page: "Reorder" | "History" | "Insights") => void;
}) {
  const now = useNow();
  const summary = useMemo(() => inventorySummary(products), [products]);
  const days = useMemo(
    () => unitsByDay(recentMovements, summary.units, chartDays, now),
    [recentMovements, summary.units, now],
  );
  const categories = useMemo(() => categoryTotals(products), [products]);
  const value = useMemo(() => stockValue(products), [products]);
  const today = useMemo(
    () =>
      salesSummary(
        recentMovements,
        new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        now,
      ),
    [recentMovements, now],
  );
  const week = useMemo(
    () =>
      salesSummary(
        recentMovements,
        new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6),
        now,
      ),
    [recentMovements, now],
  );
  const expiring = useMemo(() => expiringSoon(products, now), [products, now]);
  const unpricedSales = products.filter((item) => !item.sellPrice).length;
  const owed = customers.reduce(
    (sum, customer) => sum + Math.max(customer.balance, 0),
    0,
  );
  const money = [
    ["Stock value at cost", value.value],
    ["Sales today", today.revenue],
    ["Profit today", today.profit],
    ["Sales, last 7 days", week.revenue],
    ...(owed > 0 ? ([["Customers owe", owed]] as const) : []),
  ] as const;
  const lowItems = products
    .filter((product) => statusOf(product) !== "healthy")
    .sort((a, b) => a.quantity - b.quantity);
  const ordering = lowItems.reduce(
    (sum, product) => sum + (suggestedReorder(product) ?? 0),
    0,
  );
  const healthy = summary.products - summary.low - summary.out;
  const recentProducts = [...products]
    .sort(
      (a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0),
    )
    .slice(0, 3);
  const weekChange = summary.units - days[chartDays - 8].units;

  if (products.length === 0)
    return (
      <section className="panel py-16 text-center">
        <h2 className="text-heading font-semibold">
          {t("Add your first product")}
        </h2>
        <p className="hint mt-1.5">
          Your stock, reorders and changes will appear here.
        </p>
        {canManage && (
          <div className="mt-5 flex justify-center gap-2">
            <button className="btn-accent" onClick={onAdd}>
              {t("Add product")}
            </button>
            <button className="btn-soft !rounded-full" onClick={onImport}>
              {t("Import CSV")}
            </button>
          </div>
        )}
        <button className="btn-link mt-5" onClick={() => onNavigate("Insights")}>
          {t("Explore retail insights")}
        </button>
      </section>
    );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-gap md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
      <section className="panel">
        <h1 className="text-body font-medium">{t("Stock on hand")}</h1>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5">
          <Ticker
            value={summary.units}
            countIn
            className="text-display font-medium tracking-tight"
          />
          <span className="text-title font-medium text-muted">
            {t("units")}
          </span>
        </p>
        <p className="tabular mt-3 inline-block rounded-full bg-accent/14 px-3 py-1 text-caption font-medium text-accent">
          {signed(weekChange)} {t("units in the last 7 days")}
        </p>
        <div className="hint mt-5 flex flex-wrap justify-between gap-x-3">
          <span>{t("Total units across all products")}</span>
          <span>{t("Last 14 days")}</span>
        </div>
        <StockChart days={days} />
      </section>

      <section className="panel flex flex-col">
        <h2 className="heading">{t("To reorder")}</h2>
        <p className="hint mt-0.5">
          {lowItems.length
            ? `${lowItems.length} ${t(lowItems.length === 1 ? "product is at or below its alert level" : "products are at or below their alert level")}`
            : t("Every product is above its alert level")}
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
                    {order ?? (product.onOrder || "–")}
                  </span>
                  <span
                    className={`text-caption ${product.quantity ? "text-warn" : "text-loss"}`}
                  >
                    {reorderNote(product)}
                  </span>
                  <span className="hint text-right">
                    {order !== null
                      ? t("to order")
                      : product.onOrder
                        ? t("on order")
                        : t("no target")}
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
            {ordering > 0
              ? `Review order of ${ordering.toLocaleString()} units`
              : "Review orders"}
          </button>
        )}
      </section>

      {expiring.length > 0 && (
        <section className="panel md:col-span-2">
          <h2 className="heading">{t("Expiring soon")}</h2>
          <p className="hint mt-0.5">Products with stock, next 30 days</p>
          <div className="-mx-pad mt-3">
            {expiring.slice(0, 5).map(({ product, days }) => (
              <button
                key={product.id}
                className="btn-row flex w-full items-center justify-between gap-3 border-t border-line px-pad py-3"
                onClick={() => onSelect(product)}
              >
                <span className="truncate font-medium">{product.name}</span>
                <span
                  className={`shrink-0 text-caption ${days < 0 ? "text-loss" : "text-warn"}`}
                >
                  {days < 0
                    ? `Expired ${0 - days} ${days === -1 ? "day" : "days"} ago`
                    : days === 0
                      ? "Expires today"
                      : `In ${days} ${days === 1 ? "day" : "days"}`}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="panel md:col-span-2">
        <h2 className="heading">{t("Money")}</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-10">
          {money.map(([label, amount]) => (
            <div key={label} className="flex min-w-0 flex-col">
              <dd className="tabular order-1 truncate text-heading font-semibold">
                {formatMoney(amount)}
              </dd>
              <dt className="hint order-2">{t(label)}</dt>
            </div>
          ))}
        </dl>
        {(value.unpriced > 0 || unpricedSales > 0) && (
          <p className="hint mt-3">
            {value.unpriced > 0
              ? `${value.unpriced} ${value.unpriced === 1 ? "product has" : "products have"} no cost price, so totals are low. `
              : ""}
            {unpricedSales > 0
              ? `${unpricedSales} ${unpricedSales === 1 ? "product has" : "products have"} no selling price, so their sales aren't counted.`
              : ""}
          </p>
        )}
      </section>

      <section className="panel">
        <h2 className="heading">{t("Is the shop stocked?")}</h2>
        <p className="hint mt-0.5">
          {summary.products}{" "}
          {t(summary.products === 1 ? "product" : "products")},{" "}
          {t("grouped by how much is left")}
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
                {t(label)}
              </dt>
            </div>
          ))}
        </dl>
        <h2 className="heading mt-6">{t("Stock by category")}</h2>
        <div className="hint mt-3 mb-1.5 flex gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-accent" />
            {t("On hand")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-[#30333a]" />
            {t("Room to target")}
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
        <h2 className="heading">{t("Recently updated products")}</h2>
        <div className="-mx-pad mt-3">
          {recentProducts.map((product) => (
            <button
              key={product.id}
              className="btn-row flex w-full items-center justify-between gap-3 border-t border-line px-pad py-2.5"
              onClick={() => onSelect(product)}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {product.name}
                </span>
                <span className="hint block">
                  {product.updatedAt
                    ? `${t("Updated")} ${product.updatedAt.toDate().toLocaleDateString(currentLanguage() === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short" })}`
                    : t("Syncing update…")}
                </span>
              </span>
              <span className="tabular shrink-0 font-semibold">
                {formatQuantity(product.quantity)}
                {unitSuffix(product)}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="flex items-baseline justify-between">
          <h2 className="heading">{t("Stock changes")}</h2>
          <button className="btn-link" onClick={() => onNavigate("History")}>
            {t("See all")}
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

      <section className="panel md:col-span-2">
        <p className="text-caption font-medium uppercase tracking-wide text-accent">{t("SDA dataset demonstration")}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="heading">{t("Retail demand insights")}</h2>
            <p className="hint mt-1">{t("Explore historical UK retail sales and measured demand predictions.")}</p>
          </div>
          <button className="btn-soft" onClick={() => onNavigate("Insights")}>{t("Explore retail insights")}</button>
        </div>
      </section>
    </div>
  );
}
