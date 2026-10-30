import { useState, type FormEvent } from "react";
import { ArrowDownRight, Plus, X } from "lucide-react";
import { auth, db } from "./firebase";
import {
  adjustStock,
  createProduct,
  editProduct,
  removeProduct,
  type Product,
  type ProductInput,
} from "./inventory";
import { Banner } from "./ui";

const emptyInput: ProductInput = {
  name: "",
  sku: "",
  category: "",
  quantity: 0,
  lowStockThreshold: 5,
};
export type Dialog =
  { kind: "create" } | { kind: "edit" | "adjust" | "delete"; product: Product };

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
        }
      : emptyInput,
  );
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title =
    dialog.kind === "create"
      ? "Add a product"
      : dialog.kind === "edit"
        ? "Edit product"
        : dialog.kind === "adjust"
          ? "Adjust stock"
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
        if (!Number.isSafeInteger(value) || value <= 0)
          throw new Error("Enter a whole number greater than zero.");
        await adjustStock(
          db,
          uid,
          product.id,
          direction === "add" ? value : -value,
        );
      }
      onSuccess(
        dialog.kind === "create"
          ? "Product added."
          : dialog.kind === "edit"
            ? "Product updated."
            : dialog.kind === "delete"
              ? "Product deleted."
              : "Stock updated.",
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
          maxLength={key === "name" ? 100 : 60}
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
          required={key !== "sku"}
        />
      </label>
    );
  }

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
        className="w-full max-w-lg rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl sm:p-8"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {dialog.kind === "create"
                ? "Add an item to your inventory."
                : dialog.kind === "edit"
                  ? "Update the product details below."
                  : dialog.kind === "adjust"
                    ? `Current stock: ${product?.quantity ?? 0} units`
                    : "This action cannot be undone."}
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
              <div className="grid grid-cols-2 gap-4">
                {field("sku", "SKU (optional)", "e.g. NOTE-001")}
                {field("category", "Category", "e.g. Stationery")}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {dialog.kind === "create" &&
                  field("quantity", "Initial quantity", "0", true)}
                {field("lowStockThreshold", "Low stock alert at", "5", true)}
              </div>
            </>
          )}
          {dialog.kind === "adjust" && (
            <>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  className={`segment ${direction === "add" ? "segment-active" : ""}`}
                  onClick={() => setDirection("add")}
                >
                  <Plus size={16} /> Restock
                </button>
                <button
                  type="button"
                  className={`segment ${direction === "remove" ? "segment-active" : ""}`}
                  onClick={() => setDirection("remove")}
                >
                  <ArrowDownRight size={16} /> Reduce
                </button>
              </div>
              <label className="field-label">
                Units to {direction === "add" ? "add" : "remove"}
                <input
                  className="field mt-2"
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="Enter quantity"
                  required
                />
              </label>
            </>
          )}
          {dialog.kind === "delete" && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-slate-700">
              Delete <strong>{product?.name}</strong> and its stock record
              permanently?
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
                      ? "Update stock"
                      : "Delete product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
