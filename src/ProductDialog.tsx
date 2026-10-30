import { useState, type FormEvent } from "react";
import {
  ArrowDownRight,
  ClipboardCheck,
  PackagePlus,
  Plus,
  X,
} from "lucide-react";
import { auth, db } from "./firebase";
import {
  adjustStock,
  createProduct,
  editProduct,
  removeProduct,
  type Product,
  type ProductInput,
  type StockAction,
} from "./inventory";
import { Banner } from "./ui";

const emptyInput: ProductInput = {
  name: "",
  sku: "",
  category: "",
  quantity: 0,
  lowStockThreshold: 5,
  targetStock: 20,
  supplier: "",
};
export type Dialog =
  { kind: "create" } | { kind: "edit" | "adjust" | "delete"; product: Product };

type AdjustKind = StockAction["kind"];
const modes: { kind: AdjustKind; label: string; icon: typeof Plus }[] = [
  { kind: "restock", label: "Restock", icon: PackagePlus },
  { kind: "sale", label: "Sold", icon: ArrowDownRight },
  { kind: "damage", label: "Damaged / lost", icon: X },
  { kind: "correction", label: "Stock count", icon: ClipboardCheck },
];

export function ProductDialog({
  dialog,
  onClose,
  onSuccess,
}: {
  dialog: Dialog;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const product = "product" in dialog ? dialog.product : null;
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
  const [mode, setMode] = useState<AdjustKind>("restock");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title =
    dialog.kind === "create"
      ? "Add a product"
      : dialog.kind === "edit"
        ? "Edit product"
        : dialog.kind === "adjust"
          ? "Record stock change"
          : "Delete product";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!db || !auth?.currentUser) return;
    setBusy(true);
    setError("");
    try {
      const uid = auth.currentUser.uid;
      if (dialog.kind === "create") await createProduct(db, uid, input);
      if (dialog.kind === "edit" && product)
        await editProduct(db, uid, product.id, input);
      if (dialog.kind === "delete" && product)
        await removeProduct(db, uid, product.id);
      if (dialog.kind === "adjust" && product) {
        const value = Number(amount);
        if (
          amount === "" ||
          !Number.isSafeInteger(value) ||
          value < 0 ||
          (mode !== "correction" && value === 0)
        )
          throw new Error("Enter a valid whole-number quantity.");
        await adjustStock(db, uid, product.id, {
          kind: mode,
          amount: value,
          note,
        });
      }
      onSuccess(
        dialog.kind === "create"
          ? "Product added with an opening stock record."
          : dialog.kind === "edit"
            ? "Product updated."
            : dialog.kind === "delete"
              ? "Product deleted; its history is retained."
              : "Stock change recorded.",
      );
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function field(
    key: keyof ProductInput,
    label: string,
    placeholder: string,
    numeric = false,
  ) {
    return (
      <label className="field-label">
        {label}
        <input
          className="field mt-2"
          type={numeric ? "number" : "text"}
          min={numeric ? 0 : undefined}
          step={numeric ? 1 : undefined}
          maxLength={key === "name" || key === "supplier" ? 100 : 60}
          placeholder={placeholder}
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
          required={key !== "sku" && key !== "supplier"}
        />
      </label>
    );
  }

  const amountLabel =
    mode === "restock"
      ? "Units received"
      : mode === "sale"
        ? "Units sold"
        : mode === "damage"
          ? "Units damaged or lost"
          : "Actual units counted";
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[95dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl sm:p-8"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {dialog.kind === "create"
                ? "Start tracking this product across devices."
                : dialog.kind === "edit"
                  ? "Keep product and reorder details current."
                  : dialog.kind === "adjust"
                    ? `Current stock: ${product?.quantity ?? 0} units`
                    : "The product will be removed. Its stock history remains."}
            </p>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={busy}
          >
            <X size={19} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {error && <Banner>{error}</Banner>}
          {(dialog.kind === "create" || dialog.kind === "edit") && (
            <>
              {field("name", "Product name", "e.g. Classmate Notebook")}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field("sku", "SKU (optional)", "e.g. NOTE-001")}
                {field("category", "Category", "e.g. Stationery")}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {dialog.kind === "create" &&
                  field("quantity", "Initial quantity", "0", true)}
                {field("lowStockThreshold", "Low stock alert at", "5", true)}
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-sm font-bold">Reorder planning</p>
                <p className="mt-1 text-xs text-slate-500">
                  Set a target stock level to calculate how much to buy when
                  supplies run low.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field("targetStock", "Restock target (0 to skip)", "20", true)}
                {field(
                  "supplier",
                  "Supplier (optional)",
                  "e.g. Local wholesaler",
                )}
              </div>
            </>
          )}
          {dialog.kind === "adjust" && (
            <>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                {modes.map(({ kind, label, icon: Icon }) => (
                  <button
                    key={kind}
                    type="button"
                    className={`segment ${mode === kind ? "segment-active" : ""}`}
                    onClick={() => {
                      setMode(kind);
                      setAmount("");
                    }}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
              <label className="field-label">
                {amountLabel}
                <input
                  className="field mt-2"
                  type="number"
                  min={mode === "correction" ? 0 : 1}
                  step="1"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="Enter quantity"
                  required
                />
              </label>
              <label className="field-label">
                Note (optional)
                <textarea
                  className="field mt-2 min-h-20 resize-y"
                  maxLength={200}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={
                    mode === "correction"
                      ? "Why does the counted stock differ?"
                      : "e.g. Invoice, customer sale, or reason"
                  }
                />
              </label>
              <p className="text-xs text-slate-500">
                This change will appear in Activity with its before and after
                quantities.
              </p>
            </>
          )}
          {dialog.kind === "delete" && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-slate-700">
              Delete <strong>{product?.name}</strong> permanently? Its past
              movements remain in Activity for reference.
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className={`primary-button ${dialog.kind === "delete" ? "!bg-rose-600 hover:!bg-rose-700" : ""}`}
              disabled={busy}
            >
              {busy
                ? "Saving…"
                : dialog.kind === "create"
                  ? "Add product"
                  : dialog.kind === "edit"
                    ? "Save changes"
                    : dialog.kind === "adjust"
                      ? "Record change"
                      : "Delete product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
