import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { auth, db } from "./firebase";
import {
  adjustStock,
  createProduct,
  duplicateProblem,
  editProduct,
  formatMoney,
  formatQuantity,
  matchCategory,
  parseMoney,
  removeProduct,
  shopId,
  similarCategory,
  unitSuffix,
  units,
  validQuantity,
  suggestedReorder,
  type Product,
  type ProductInput,
  type StockAction,
  type Unit,
} from "./inventory";
import { errorText, savedMessage, useFocusTrap } from "./display";
import { BarcodeButton as ScanButton } from "./BarcodeButton";
import { ImportProducts } from "./ImportProducts";
import { SettingsPanel } from "./SettingsPanel";
import { Alert, Status, Ticker } from "./ui";
import { t } from "./i18n";

export type Panel =
  | { kind: "create" | "import" | "settings" }
  | { kind: "stock" | "edit" | "delete"; id: string };

const emptyInput: ProductInput = {
  name: "",
  sku: "",
  category: "",
  quantity: 0,
  lowStockThreshold: 5,
  targetStock: 20,
  supplier: "",
  unit: "pcs",
  packSize: 1,
  expiryDate: "",
};

type Mode = StockAction["kind"];
const modes: { kind: Mode; label: string; noun: string; amount: string }[] = [
  { kind: "sale", label: t("Sold"), noun: "sale", amount: t("Units sold") },
  {
    kind: "return",
    label: t("Returned"),
    noun: "return",
    amount: t("Units returned"),
  },
  {
    kind: "restock",
    label: t("Restock"),
    noun: "restock",
    amount: t("Units received"),
  },
  {
    kind: "damage",
    label: t("Damaged"),
    noun: "damage",
    amount: t("Units damaged or lost"),
  },
  {
    kind: "correction",
    label: t("Count"),
    noun: "count",
    amount: t("Units counted"),
  },
];

function StockForm({
  product,
  canManage,
  onEdit,
  onDelete,
  onDone,
  onNotice,
}: {
  product: Product;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDone: () => void;
  onNotice: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("sale");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = product.quantity;
  const pack = product.packSize ?? 1;
  const [inPacks, setInPacks] = useState(false);
  const [expiry, setExpiry] = useState("");
  const multiplier = mode === "restock" && inPacks ? pack : 1;
  const entered = amount === "" ? null : Number(amount) * multiplier;
  const after =
    entered === null
      ? current
      : mode === "correction"
        ? entered
        : mode === "restock" || mode === "return"
          ? current + entered
          : current - entered;
  const short = after < 0 && (mode === "sale" || mode === "damage");
  const modeIndex = modes.findIndex((item) => item.kind === mode);
  const order = suggestedReorder(product);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!db || !auth?.currentUser) return;
    setBusy(true);
    setError("");
    try {
      if (
        entered === null ||
        !validQuantity(entered, product) ||
        (mode !== "correction" && entered === 0)
      )
        throw new Error(
          product.unit === "kg" || product.unit === "L"
            ? "Enter an amount with up to 3 decimals."
            : "Enter a whole number of units.",
        );
      const result = await adjustStock(db, shopId(), product.id, {
        kind: mode,
        amount: entered,
        note,
        clampAtZero: short,
        expiryDate: mode === "restock" ? expiry : undefined,
      });
      onNotice(savedMessage(result, t("Stock change recorded.")));
      onDone();
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="pr-10 text-heading font-semibold">{product.name}</h2>
      <p className="hint mt-0.5">
        {product.category}
        {product.supplier ? `, ${product.supplier}` : ""}
      </p>
      <div className="mt-5 flex items-end justify-between">
        <div>
          <p className="hint">
            {after === current ? t("On hand") : t("After this change")}
          </p>
          <Ticker
            value={Math.max(after, 0)}
            className="text-display font-medium tracking-tight"
          />
        </div>
        <p className="pb-1 text-right">
          <Status product={product} />
          {after !== current && (
            <span className="hint tabular block">
              Now {formatQuantity(current)}
              {unitSuffix(product)}
            </span>
          )}
        </p>
      </div>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="choice !grid-cols-3">
          <span
            className="choice-pill !bottom-auto h-control !w-[calc((100%-0.5rem)/3)]"
            style={{
              transform: `translate(${(modeIndex % 3) * 100}%, ${Math.floor(modeIndex / 3) * 100}%)`,
            }}
          />
          {modes.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              className="choice-item"
              aria-pressed={mode === kind}
              onClick={() => {
                setMode(kind);
                setAmount("");
              }}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <label className="field-label">
          {t(modes[modeIndex].amount)}
          <input
            className="field tabular"
            type="number"
            inputMode={unitSuffix(product) ? "decimal" : "numeric"}
            min={0}
            step="any"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            autoFocus
            required
          />
        </label>
        {mode === "restock" && pack > 1 && (
          <label className="flex min-h-11 items-center gap-2.5 md:min-h-0">
            <input
              type="checkbox"
              className="size-6 accent-accent"
              checked={inPacks}
              onChange={(event) => setInPacks(event.target.checked)}
            />
            Count in cartons of {pack}
          </label>
        )}
        {mode === "restock" && (
          <label className="field-label">
            Expiry of this delivery (optional)
            <input
              className="field"
              type="date"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
            />
          </label>
        )}
        {short && (
          <p className="text-caption text-warn">
            Only {current} on hand. Stock will go to 0 and the note will show
            the real amount.
          </p>
        )}
        <label className="field-label">
          Note (optional)
          <input
            className="field"
            maxLength={200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <button className="btn-accent w-full" disabled={busy}>
          {busy
            ? t("Recording…")
            : `${t(`Record ${modes[modeIndex].noun}`)}${short ? ", stock goes to 0" : ""}`}
        </button>
      </form>
      <dl className="tabular mt-6 grid grid-cols-[1fr_auto] gap-y-2 border-t border-line pt-4 text-muted">
        {product.onOrder ? (
          <>
            <dt>On order</dt>
            <dd className="text-right text-fg">{product.onOrder} units</dd>
          </>
        ) : null}
        <dt>To reach target</dt>
        <dd className="text-right text-fg">
          {order === null ? "Nothing to order" : `${order} units`}
        </dd>
        <dt>Target</dt>
        <dd className="text-right text-fg">{product.targetStock || "None"}</dd>
        <dt>{t("Alert at")}</dt>
        <dd className="text-right text-fg">{product.lowStockThreshold}</dd>
        <dt>Cost / selling price</dt>
        <dd className="text-right text-fg">
          {product.costPrice ? formatMoney(product.costPrice) : "None"} /{" "}
          {product.sellPrice ? formatMoney(product.sellPrice) : "None"}
        </dd>
        {product.packSize && product.packSize > 1 ? (
          <>
            <dt>Carton</dt>
            <dd className="text-right text-fg">{product.packSize} units</dd>
          </>
        ) : null}
        {product.expiryDate ? (
          <>
            <dt>Expiry</dt>
            <dd className="text-right text-fg">{product.expiryDate}</dd>
          </>
        ) : null}
        <dt>SKU</dt>
        <dd className="truncate text-right text-fg">{product.sku || "None"}</dd>
      </dl>
      {canManage && (
        <div className="mt-4 flex gap-4">
          <button className="btn-link" onClick={onEdit}>
            {t("Edit details")}
          </button>
          <button className="btn-link" onClick={onDelete}>
            {t("Delete")}
          </button>
        </div>
      )}
    </>
  );
}

function ProductForm({
  product,
  products,
  onCancel,
  onDone,
  onNotice,
}: {
  product: Product | null;
  products: Product[];
  onCancel: () => void;
  onDone: () => void;
  onNotice: (message: string) => void;
}) {
  const [input, setInput] = useState<ProductInput>(
    product
      ? {
          name: product.name,
          sku: product.sku,
          category: product.category,
          lowStockThreshold: product.lowStockThreshold,
          targetStock: product.targetStock ?? 0,
          supplier: product.supplier ?? "",
          unit: product.unit ?? "pcs",
          packSize: product.packSize ?? 1,
          expiryDate: product.expiryDate ?? "",
        }
      : emptyInput,
  );
  const asRupees = (paise?: number) => (paise ? String(paise / 100) : "");
  const [cost, setCost] = useState(asRupees(product?.costPrice));
  const [price, setPrice] = useState(asRupees(product?.sellPrice));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const categories = useMemo(
    () => [...new Set(products.map((item) => item.category))].sort(),
    [products],
  );
  const suppliers = useMemo(
    () => [...new Set(products.flatMap((item) => item.supplier || []))].sort(),
    [products],
  );
  const suggestion = similarCategory(input.category, categories);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!db || !auth?.currentUser) return;
    setBusy(true);
    setError("");
    try {
      const duplicate = duplicateProblem(input, products, product?.id);
      if (duplicate) throw new Error(duplicate);
      const uid = shopId();
      const costPrice = parseMoney(cost);
      const sellPrice = parseMoney(price);
      if (costPrice === null || sellPrice === null)
        throw new Error("Prices must be amounts like 25 or 22.50.");
      const saved = {
        ...input,
        category: matchCategory(input.category, categories),
        costPrice,
        sellPrice,
      };
      const result = product
        ? await editProduct(db, uid, product.id, saved)
        : await createProduct(db, uid, saved);
      onNotice(
        savedMessage(
          result,
          product ? t("Product updated.") : t("Product added."),
        ),
      );
      onDone();
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  }

  function field(
    key: Exclude<keyof ProductInput, "sample">,
    label: string,
    numeric = false,
    required = true,
  ) {
    return (
      <label className="field-label">
        {label}
        <input
          className="field"
          type={numeric ? "number" : "text"}
          min={numeric ? 0 : undefined}
          step={numeric ? "any" : undefined}
          maxLength={key === "name" || key === "supplier" ? 100 : 60}
          value={input[key] ?? ""}
          onChange={(event) =>
            setInput({
              ...input,
              [key]: numeric
                ? event.target.value === ""
                  ? NaN
                  : Number(event.target.value)
                : event.target.value,
            })
          }
          required={required}
          autoFocus={key === "name"}
          list={
            key === "category"
              ? "category-options"
              : key === "supplier"
                ? "supplier-options"
                : undefined
          }
        />
      </label>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="pr-10 text-heading font-semibold">
        {product ? t("Edit details") : t("Add product")}
      </h2>
      {error && <Alert>{error}</Alert>}
      {field("name", t("Name"))}
      <div className="grid grid-cols-2 gap-4">
        {field("category", t("Category"))}
        {field("sku", t("SKU or barcode (optional)"), false, false)}
      </div>
      <ScanButton
        label={t("Scan barcode")}
        onCode={(code) => setInput({ ...input, sku: code })}
      />
      <datalist id="category-options">
        {categories.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <datalist id="supplier-options">
        {suppliers.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      {suggestion && (
        <button
          type="button"
          className="btn-link !text-warn"
          onClick={() => setInput({ ...input, category: suggestion })}
        >
          Did you mean {suggestion}? Use it
        </button>
      )}
      <div className="grid grid-cols-2 gap-4">
        {!product && field("quantity", t("Opening stock"), true)}
        {field("lowStockThreshold", t("Alert at"), true)}
        {field("targetStock", t("Target (0 for none)"), true)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="field-label">
          Cost price, ₹ (optional)
          <input
            className="field tabular"
            inputMode="decimal"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
        </label>
        <label className="field-label">
          Selling price, ₹ (optional)
          <input
            className="field tabular"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="field-label">
          Sold by
          <select
            className="field"
            value={input.unit}
            onChange={(event) =>
              setInput({ ...input, unit: event.target.value as Unit })
            }
          >
            {units.map((item) => (
              <option key={item} value={item}>
                {item === "pcs"
                  ? t("Pieces")
                  : item === "kg"
                    ? t("Kilograms")
                    : t("Litres")}
              </option>
            ))}
          </select>
        </label>
        {field("packSize", t("Units in a carton"), true)}
      </div>
      <label className="field-label">
        Expiry date (optional)
        <input
          className="field"
          type="date"
          value={input.expiryDate ?? ""}
          onChange={(event) =>
            setInput({ ...input, expiryDate: event.target.value })
          }
        />
      </label>
      {field("supplier", t("Supplier (optional)"), false, false)}
      <div className="flex gap-2 pt-1">
        <button className="btn-accent flex-1" disabled={busy}>
          {busy ? t("Saving…") : product ? t("Save details") : t("Add product")}
        </button>
        <button
          type="button"
          className="btn-soft !rounded-full"
          onClick={onCancel}
          disabled={busy}
        >
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}

function DeleteConfirm({
  product,
  onCancel,
  onDone,
  onNotice,
}: {
  product: Product;
  onCancel: () => void;
  onDone: () => void;
  onNotice: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    if (!db || !auth?.currentUser) return;
    setBusy(true);
    setError("");
    try {
      const result = await removeProduct(db, shopId(), product.id);
      onNotice(savedMessage(result, t("Product deleted.")));
      onDone();
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <h2 className="pr-10 text-heading font-semibold">
        Delete {product.name}?
      </h2>
      {error && <Alert>{error}</Alert>}
      <p className="text-muted">
        Its {product.quantity} units leave your stock total. Its past changes
        stay in History.
      </p>
      <div className="flex gap-2 pt-1">
        <button
          className="btn-accent flex-1 !bg-loss"
          onClick={confirm}
          disabled={busy}
        >
          {busy ? "Deleting…" : t("Delete product")}
        </button>
        <button
          className="btn-soft !rounded-full"
          onClick={onCancel}
          disabled={busy}
        >
          {t("Cancel")}
        </button>
      </div>
    </div>
  );
}

export function Sheet({
  panel,
  products,
  canManage,
  shopName,
  onTour,
  onPanel,
  onClose,
  onNotice,
}: {
  panel: Panel;
  products: Product[];
  canManage: boolean;
  shopName: string;
  onTour: () => void;
  onPanel: (panel: Panel) => void;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const [closing, setClosing] = useState(false);
  const timer = useRef(0);
  const dialog = useRef<HTMLDivElement>(null);
  useFocusTrap(dialog, true);
  const close = () => {
    setClosing(true);
    timer.current = window.setTimeout(onClose, 180);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const product =
    "id" in panel
      ? (products.find((item) => item.id === panel.id) ?? null)
      : null;
  const back = () =>
    product ? onPanel({ kind: "stock", id: product.id }) : close();

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-end bg-black/60 sm:items-stretch ${closing ? "scrim-closing" : "scrim"}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={
          panel.kind === "create"
            ? t("Add product")
            : panel.kind === "import"
              ? "Import products"
              : panel.kind === "settings"
                ? t("Settings")
                : (product?.name ?? "Product")
        }
        className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[20px] bg-panel p-pad pb-[max(var(--size-pad),env(safe-area-inset-bottom))] sm:my-2 sm:mr-2 sm:max-h-none sm:max-w-md sm:rounded-panel sm:p-pad ${closing ? "sheet-closing" : "sheet"}`}
      >
        <button
          className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-raised hover:text-fg"
          aria-label="Close"
          onClick={close}
        >
          <X size={18} />
        </button>
        <div key={panel.kind} className="page">
          {panel.kind === "create" ? (
            <ProductForm
              product={null}
              products={products}
              onCancel={close}
              onDone={close}
              onNotice={onNotice}
            />
          ) : panel.kind === "import" ? (
            <ImportProducts
              products={products}
              onDone={close}
              onNotice={onNotice}
            />
          ) : panel.kind === "settings" ? (
            <SettingsPanel
              shopName={shopName}
              onTour={onTour}
              onDone={close}
              onNotice={onNotice}
            />
          ) : !product ? (
            <p className="hint">This product no longer exists.</p>
          ) : panel.kind === "edit" ? (
            <ProductForm
              product={product}
              products={products}
              onCancel={back}
              onDone={back}
              onNotice={onNotice}
            />
          ) : panel.kind === "delete" ? (
            <DeleteConfirm
              product={product}
              onCancel={back}
              onDone={close}
              onNotice={onNotice}
            />
          ) : (
            <StockForm
              product={product}
              canManage={canManage}
              onEdit={() => onPanel({ kind: "edit", id: product.id })}
              onDelete={() => onPanel({ kind: "delete", id: product.id })}
              onDone={close}
              onNotice={onNotice}
            />
          )}
        </div>
      </div>
    </div>
  );
}
