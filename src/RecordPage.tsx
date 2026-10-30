import { useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronUp, Minus, Plus, Search, X } from "lucide-react";
import { BarcodeButton } from "./BarcodeButton";
import { CreditForm } from "./CreditForm";
import { errorText, savedMessage, useFocusTrap } from "./display";
import { auth, db } from "./firebase";
import {
  findByCode,
  formatMoney,
  formatQuantity,
  recordCredit,
  recordStockChanges,
  roundQuantity,
  shopId,
  unitSuffix,
  validQuantity,
  type Customer,
  type Product,
  type StockChange,
} from "./inventory";
import { Alert, Ticker } from "./ui";
import { t } from "./i18n";

function matches(product: Product, search: string) {
  return `${product.name} ${product.sku}`
    .toLowerCase()
    .includes(search.toLowerCase().trim());
}

function SearchBox({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
}) {
  return (
    <label className="relative block">
      <Search
        size={16}
        className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
      />
      <input
        className="field !mt-0 !pl-10"
        aria-label={t("Find a product")}
        placeholder={t("Find a product")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onEnter) {
            event.preventDefault();
            onEnter();
          }
        }}
      />
    </label>
  );
}

function SaleForm({
  products,
  customers,
  onNotice,
}: {
  products: Product[];
  customers: Customer[];
  onNotice: (message: string) => void;
}) {
  const [creditTo, setCreditTo] = useState("");
  const [scanMiss, setScanMiss] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const results = products.filter((product) => matches(product, search));
  const lines = products
    .filter((product) => cart[product.id] !== undefined)
    .map((product) => ({ product, amount: cart[product.id] }));
  const units = roundQuantity(
    lines.reduce((sum, line) => sum + line.amount, 0),
  );
  const open = reviewing && lines.length > 0;
  const total = lines.reduce(
    (sum, { product, amount }) => sum + amount * (product.sellPrice ?? 0),
    0,
  );
  const review = useRef<HTMLDivElement>(null);
  useFocusTrap(review, open);

  function setAmount(product: Product, amount: number) {
    const next = { ...cart };
    if (amount > 0) next[product.id] = amount;
    else delete next[product.id];
    setCart(next);
  }
  // Stays at 0 while someone is still typing 0.5.
  const typeAmount = (product: Product, amount: number) =>
    setCart({ ...cart, [product.id]: amount });
  function add(product?: Product) {
    if (!product) return;
    setAmount(product, (cart[product.id] ?? 0) + 1);
    setSearch("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!db || !auth?.currentUser || lines.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const changes: StockChange[] = lines
        .filter(({ amount }) => amount > 0)
        .map(({ product, amount }) => ({
          product,
          action: { kind: "sale", amount, note, clampAtZero: true },
        }));
      const result = await recordStockChanges(db, shopId(), changes);
      onNotice(
        savedMessage(
          result,
          `Sale of ${units} ${units === 1 ? "unit" : "units"} recorded.`,
        ),
      );
      const customer = customers.find((item) => item.id === creditTo);
      if (customer && total > 0)
        await recordCredit(db, shopId(), customer, Math.round(total), "Sale");
      setCart({});
      setNote("");
      setCreditTo("");
      setReviewing(false);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-gap max-md:pb-16 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="panel !px-0 !pb-1">
        <div className="px-pad pb-3">
          <SearchBox
            value={search}
            onChange={setSearch}
            onEnter={() => add(findByCode(products, search) ?? results[0])}
          />
          <div className="mt-2 flex items-center gap-3">
            <BarcodeButton
              label={t("Scan barcode")}
              onCode={(code) => {
                const found = findByCode(products, code);
                setScanMiss(found ? "" : `No product has the code ${code}.`);
                add(found);
              }}
            />
            {scanMiss && <p className="hint">{scanMiss}</p>}
          </div>
        </div>
        <div className="md:max-h-[28rem] md:overflow-y-auto">
          {results.map((product) => (
            <button
              key={product.id}
              className="btn-row flex w-full items-center justify-between gap-3 border-t border-line px-pad py-3"
              onClick={() => add(product)}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {product.name}
                </span>
                <span className="hint tabular block">
                  {product.quantity === 0
                    ? t("Sold out")
                    : `${formatQuantity(product.quantity)}${unitSuffix(product)} on hand`}
                </span>
              </span>
              {cart[product.id] ? (
                <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-ink">
                  {cart[product.id]}
                </span>
              ) : (
                <Plus size={18} className="shrink-0 text-accent" />
              )}
            </button>
          ))}
          {results.length === 0 && (
            <p className="hint border-t border-line px-pad py-8 text-center">
              No products match this search.
            </p>
          )}
        </div>
      </section>
      {open && (
        <div
          className="scrim fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setReviewing(false)}
        />
      )}
      {lines.length > 0 && !open && (
        <button
          type="button"
          className="btn-accent row-in fixed inset-x-3 bottom-[calc(var(--tabbar)+0.5rem)] z-30 !justify-between !rounded-control md:hidden"
          onClick={() => setReviewing(true)}
        >
          {units} {units === 1 ? "unit" : "units"}
          {total > 0 ? `, ${formatMoney(total)}` : " in this sale"}
          <span className="flex items-center gap-1">
            Review
            <ChevronUp size={17} />
          </span>
        </button>
      )}
      <div
        ref={review}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? t("This sale") : undefined}
        onKeyDown={(event) => {
          if (event.key === "Escape") setReviewing(false);
        }}
        className={`panel flex flex-col self-start max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50 max-md:max-h-[85dvh] max-md:overflow-y-auto max-md:rounded-b-none max-md:pb-[max(var(--size-pad),env(safe-area-inset-bottom))] ${open ? "sheet" : "max-md:hidden"}`}
      >
        <form onSubmit={submit} className="flex flex-col">
          <div className="flex items-center justify-between">
            <h2 className="heading">{t("This sale")}</h2>
            <button
              type="button"
              className="-mr-2 flex size-11 items-center justify-center text-muted md:hidden"
              aria-label="Close sale review"
              onClick={() => setReviewing(false)}
            >
              <X size={18} />
            </button>
          </div>
          {lines.length === 0 ? (
            <p className="hint mt-1">{t("Tap products to add them.")}</p>
          ) : (
            <div className="mt-2">
              {lines.map(({ product, amount }) => (
                <div
                  key={product.id}
                  className="row-in flex items-center gap-2 border-b border-line py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {product.name}
                    </span>
                    {amount > product.quantity && (
                      <span className="block text-caption text-warn">
                        {formatQuantity(product.quantity)}
                        {unitSuffix(product)} on hand, stock goes to 0
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="step"
                    aria-label={`One less ${product.name}`}
                    onClick={() => setAmount(product, amount - 1)}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    className="tabular h-11 w-12 shrink-0 rounded-control bg-ink text-center text-[max(1rem,var(--size-body))] ring-1 ring-outline outline-none focus:ring-2 focus:ring-accent md:h-9"
                    aria-label={`Units of ${product.name}`}
                    type="number"
                    step="any"
                    min={0}
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) =>
                      typeAmount(product, Number(event.target.value) || 0)
                    }
                  />
                  <button
                    type="button"
                    className="step"
                    aria-label={`One more ${product.name}`}
                    onClick={() => setAmount(product, amount + 1)}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-fg md:size-9"
                    aria-label={`Remove ${product.name}`}
                    onClick={() => setAmount(product, 0)}
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {total > 0 && (
            <div className="mt-3 flex justify-between text-title font-semibold">
              <span>{t("Total")}</span>
              <span className="tabular">{formatMoney(total)}</span>
            </div>
          )}
          {customers.length > 0 && total > 0 && (
            <label className="field-label mt-4">
              Payment
              <select
                className="field"
                value={creditTo}
                onChange={(event) => setCreditTo(event.target.value)}
              >
                <option value="">{t("Paid now")}</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    On credit: {customer.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field-label mt-4">
            Note (optional)
            <input
              className="field"
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {error && (
            <div className="mt-3">
              <Alert>{error}</Alert>
            </div>
          )}
          <button
            className="btn-accent mt-4 w-full"
            disabled={busy || lines.length === 0}
          >
            {busy
              ? t("Recording…")
              : lines.length
                ? `Record sale of ${units} ${units === 1 ? "unit" : "units"}`
                : t("Record sale")}
          </button>
        </form>
      </div>
    </div>
  );
}

function CountForm({
  products,
  onNotice,
}: {
  products: Product[];
  onNotice: (message: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [missingSold, setMissingSold] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const visible = products.filter((product) => matches(product, search));
  const changed = useMemo(
    () =>
      products.filter(
        (product) =>
          (counts[product.id] ?? "") !== "" &&
          Number(counts[product.id]) !== product.quantity,
      ),
    [products, counts],
  );
  const invalid = changed.some(
    (product) => !validQuantity(Number(counts[product.id]), product),
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!db || !auth?.currentUser || changed.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const changes: StockChange[] = changed.map((product) => {
        const counted = Number(counts[product.id]);
        const note = "End-of-day count";
        return {
          product,
          action:
            missingSold && counted < product.quantity
              ? { kind: "sale", amount: product.quantity - counted, note }
              : { kind: "correction", amount: counted, note },
        };
      });
      const result = await recordStockChanges(db, shopId(), changes);
      onNotice(
        savedMessage(
          result,
          `Count saved for ${changes.length} ${changes.length === 1 ? "product" : "products"}.`,
        ),
      );
      setCounts({});
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel !px-0 !pb-0">
      <div className="px-pad pb-3">
        <SearchBox value={search} onChange={setSearch} />
        <p className="hint mt-2.5">
          {t(
            "Enter what is on the shelf. Leave a product blank to keep its stock.",
          )}
        </p>
      </div>
      {visible.map((product) => {
        const value = counts[product.id] ?? "";
        const difference = value === "" ? 0 : Number(value) - product.quantity;
        return (
          <label
            key={product.id}
            className="grid cursor-text grid-cols-[minmax(0,1fr)_3.5rem_5rem] items-center gap-3 border-t border-line px-pad py-2.5"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{product.name}</span>
              <span className="hint tabular block">
                <Ticker value={product.quantity} />
                {unitSuffix(product)} expected
              </span>
            </span>
            <span
              className={`tabular text-right font-semibold ${difference > 0 ? "text-gain" : difference < 0 ? "text-loss" : "text-muted"}`}
            >
              {difference
                ? `${difference > 0 ? "+" : "−"}${Math.abs(difference)}`
                : ""}
            </span>
            <input
              className="tabular h-control w-full rounded-control bg-ink px-3 text-right text-[max(1rem,var(--size-body))] ring-1 ring-outline outline-none focus:ring-2 focus:ring-accent"
              aria-label={`Counted units of ${product.name}`}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={value}
              onChange={(event) =>
                setCounts({ ...counts, [product.id]: event.target.value })
              }
            />
          </label>
        );
      })}
      <div className="rounded-b-panel border-t border-line bg-panel p-pad [@media(min-height:36rem)]:sticky [@media(min-height:36rem)]:bottom-[var(--tabbar)] md:[@media(min-height:36rem)]:bottom-0">
        {error && (
          <div className="mb-3">
            <Alert>{error}</Alert>
          </div>
        )}
        <label className="flex min-h-11 items-center gap-2.5 md:min-h-0">
          <input
            type="checkbox"
            className="size-6 accent-accent"
            checked={missingSold}
            onChange={(event) => setMissingSold(event.target.checked)}
          />
          {t("Record missing units as sold")}
        </label>
        <button
          className="btn-accent mt-3 w-full"
          disabled={busy || invalid || changed.length === 0}
        >
          {busy
            ? t("Saving…")
            : changed.length
              ? `Save count for ${changed.length} ${changed.length === 1 ? "product" : "products"}`
              : t("Save count")}
        </button>
      </div>
    </form>
  );
}

const modes = ["Sale", "Count", "Credit"] as const;

export function RecordPage({
  products,
  customers,
  onNotice,
}: {
  products: Product[];
  customers: Customer[];
  onNotice: (message: string) => void;
}) {
  const [mode, setMode] = useState<(typeof modes)[number]>("Sale");
  const index = modes.indexOf(mode);
  return (
    <div className="mx-auto max-w-5xl space-y-gap">
      <div className="choice mx-auto w-full max-w-sm !grid-cols-3">
        <span
          className="choice-pill !w-[calc((100%-0.5rem)/3)]"
          style={{ transform: `translateX(${index * 100}%)` }}
        />
        {modes.map((item) => (
          <button
            key={item}
            className="choice-item"
            aria-pressed={mode === item}
            onClick={() => setMode(item)}
          >
            {t(item)}
          </button>
        ))}
      </div>
      {mode === "Credit" ? (
        <CreditForm customers={customers} onNotice={onNotice} />
      ) : products.length === 0 ? (
        <section className="panel hint py-14 text-center">
          Add products before recording stock.
        </section>
      ) : mode === "Sale" ? (
        <SaleForm
          products={products}
          customers={customers}
          onNotice={onNotice}
        />
      ) : (
        <CountForm products={products} onNotice={onNotice} />
      )}
    </div>
  );
}
