import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { auth, db } from "./firebase";
import {
  adjustStock,
  createProduct,
  editProduct,
  removeProduct,
  suggestedReorder,
  type Product,
  type ProductInput,
  type StockAction,
} from "./inventory";
import { Alert, Status, Ticker } from "./ui";

export type Panel =
  { kind: "create" } | { kind: "stock" | "edit" | "delete"; id: string };

const emptyInput: ProductInput = {
  name: "",
  sku: "",
  category: "",
  quantity: 0,
  lowStockThreshold: 5,
  targetStock: 20,
  supplier: "",
};

type Mode = StockAction["kind"];
const modes: { kind: Mode; label: string; noun: string; amount: string }[] = [
  { kind: "sale", label: "Sold", noun: "sale", amount: "Units sold" },
  {
    kind: "restock",
    label: "Restock",
    noun: "restock",
    amount: "Units received",
  },
  {
    kind: "damage",
    label: "Damaged",
    noun: "damage",
    amount: "Units damaged or lost",
  },
  {
    kind: "correction",
    label: "Count",
    noun: "count",
    amount: "Units counted",
  },
];

const errorText = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Saving failed. Try again.";

function StockForm({
  product,
  onEdit,
  onDelete,
  onDone,
  onNotice,
}: {
  product: Product;
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
  const entered = amount === "" ? null : Number(amount);
  const after =
    entered === null
      ? current
      : mode === "correction"
        ? entered
        : mode === "restock"
          ? current + entered
          : current - entered;
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
        !Number.isSafeInteger(entered) ||
        entered < 0 ||
        (mode !== "correction" && entered === 0)
      )
        throw new Error("Enter a whole number of units.");
      await adjustStock(db, auth.currentUser.uid, product.id, {
        kind: mode,
        amount: entered,
        note,
      });
      onNotice("Stock change recorded.");
      onDone();
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  }

  return (
    <>
      <h2 className="pr-10 text-xl font-semibold">{product.name}</h2>
      <p className="hint mt-0.5">
        {product.category}
        {product.supplier ? `, ${product.supplier}` : ""}
      </p>
      <div className="mt-5 flex items-end justify-between">
        <div>
          <p className="hint">
            {after === current ? "On hand" : "After this change"}
          </p>
          <Ticker
            value={after}
            className={`text-[56px] leading-none font-medium tracking-tight ${after < 0 ? "text-loss" : ""}`}
          />
        </div>
        <p className="pb-1 text-right">
          <Status product={product} />
          {after !== current && (
            <span className="hint tabular block">Now {current}</span>
          )}
        </p>
      </div>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="choice">
          <span
            className="choice-pill"
            style={{ transform: `translateX(${modeIndex * 100}%)` }}
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
              {label}
            </button>
          ))}
        </div>
        <label className="field-label">
          {modes[modeIndex].amount}
          <input
            className="field tabular"
            type="number"
            inputMode="numeric"
            min={mode === "correction" ? 0 : 1}
            step="1"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            autoFocus
            required
          />
        </label>
        <label className="field-label">
          Note (optional)
          <input
            className="field"
            maxLength={200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <button className="btn-accent w-full !py-3" disabled={busy}>
          {busy ? "Recording…" : `Record ${modes[modeIndex].noun}`}
        </button>
      </form>
      <dl className="tabular mt-6 grid grid-cols-[1fr_auto] gap-y-2 border-t border-line pt-4 text-muted">
        <dt>To reach target</dt>
        <dd className="text-right text-fg">
          {order === null ? "Nothing to order" : `${order} units`}
        </dd>
        <dt>Target</dt>
        <dd className="text-right text-fg">{product.targetStock || "None"}</dd>
        <dt>Alert at</dt>
        <dd className="text-right text-fg">{product.lowStockThreshold}</dd>
        <dt>SKU</dt>
        <dd className="truncate text-right text-fg">{product.sku || "None"}</dd>
      </dl>
      <div className="mt-4 flex gap-4">
        <button className="btn-link" onClick={onEdit}>
          Edit details
        </button>
        <button className="btn-link" onClick={onDelete}>
          Delete
        </button>
      </div>
    </>
  );
}

function ProductForm({
  product,
  onCancel,
  onDone,
  onNotice,
}: {
  product: Product | null;
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
        }
      : emptyInput,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!db || !auth?.currentUser) return;
    setBusy(true);
    setError("");
    try {
      const uid = auth.currentUser.uid;
      if (product) await editProduct(db, uid, product.id, input);
      else await createProduct(db, uid, input);
      onNotice(product ? "Product updated." : "Product added.");
      onDone();
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  }

  function field(
    key: keyof ProductInput,
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
          step={numeric ? 1 : undefined}
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
        />
      </label>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <h2 className="pr-10 text-xl font-semibold">
        {product ? "Edit details" : "Add product"}
      </h2>
      {error && <Alert>{error}</Alert>}
      {field("name", "Name")}
      <div className="grid grid-cols-2 gap-4">
        {field("category", "Category")}
        {field("sku", "SKU (optional)", false, false)}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {!product && field("quantity", "Opening stock", true)}
        {field("lowStockThreshold", "Alert at", true)}
        {field("targetStock", "Target (0 for none)", true)}
      </div>
      {field("supplier", "Supplier (optional)", false, false)}
      <div className="flex gap-2 pt-1">
        <button className="btn-accent flex-1" disabled={busy}>
          {busy ? "Saving…" : product ? "Save details" : "Add product"}
        </button>
        <button
          type="button"
          className="btn-soft !rounded-full"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
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
      await removeProduct(db, auth.currentUser.uid, product.id);
      onNotice("Product deleted.");
      onDone();
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <h2 className="pr-10 text-xl font-semibold">Delete {product.name}?</h2>
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
          {busy ? "Deleting…" : "Delete product"}
        </button>
        <button
          className="btn-soft !rounded-full"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function Sheet({
  panel,
  products,
  onPanel,
  onClose,
  onNotice,
}: {
  panel: Panel;
  products: Product[];
  onPanel: (panel: Panel) => void;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const [closing, setClosing] = useState(false);
  const timer = useRef(0);
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
        role="dialog"
        aria-modal="true"
        aria-label={
          panel.kind === "create" ? "Add product" : (product?.name ?? "Product")
        }
        className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[20px] bg-panel p-5 sm:my-2 sm:mr-2 sm:max-h-none sm:max-w-md sm:rounded-[20px] sm:p-6 ${closing ? "sheet-closing" : "sheet"}`}
      >
        <button
          className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-raised hover:text-fg"
          aria-label="Close"
          onClick={close}
        >
          <X size={18} />
        </button>
        <div key={panel.kind} className="page">
          {panel.kind === "create" ? (
            <ProductForm
              product={null}
              onCancel={close}
              onDone={close}
              onNotice={onNotice}
            />
          ) : !product ? (
            <p className="hint">This product no longer exists.</p>
          ) : panel.kind === "edit" ? (
            <ProductForm
              product={product}
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
