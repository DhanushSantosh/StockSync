import { useState, type ChangeEvent } from "react";
import { Upload } from "lucide-react";
import { errorText, savedMessage } from "./display";
import { auth, db } from "./firebase";
import { parseProductsCsv, templateCsv } from "./importCsv";
import { createProducts, type Product } from "./inventory";
import { Alert } from "./ui";

function downloadTemplate() {
  const blob = new Blob([templateCsv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "stocksync-products-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function ImportProducts({
  products,
  onDone,
  onNotice,
}: {
  products: Product[];
  onDone: () => void;
  onNotice: (message: string) => void;
}) {
  const [file, setFile] = useState("");
  const [parsed, setParsed] = useState<ReturnType<
    typeof parseProductsCsv
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    setError("");
    setFile(chosen.name);
    setParsed(parseProductsCsv(await chosen.text(), products));
  }

  async function submit() {
    if (!db || !auth?.currentUser || !parsed) return;
    setBusy(true);
    setError("");
    try {
      const count = parsed.rows.length;
      const result = await createProducts(
        db,
        auth.currentUser.uid,
        parsed.rows,
      );
      onNotice(
        savedMessage(
          result,
          `${count} ${count === 1 ? "product" : "products"} imported.`,
        ),
      );
      onDone();
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="pr-10 text-heading font-semibold">Import products</h2>
        <p className="hint mt-0.5">
          Upload a CSV with Name and Category columns. Quantity, SKU, Alert at,
          Target and Supplier are optional.
        </p>
      </div>
      <label className="btn-soft w-full cursor-pointer">
        <Upload size={16} />
        {file ? `Replace ${file}` : "Choose CSV file"}
        <input
          className="sr-only"
          type="file"
          accept=".csv,text/csv"
          onChange={choose}
        />
      </label>
      <button className="btn-link" onClick={downloadTemplate}>
        Download template
      </button>
      {error && <Alert>{error}</Alert>}
      {parsed && (
        <div className="page space-y-3">
          <p>
            <span className="text-heading font-semibold">
              {parsed.rows.length}
            </span>{" "}
            <span className="text-muted">
              {parsed.rows.length === 1 ? "product" : "products"} ready to
              import
            </span>
          </p>
          {parsed.problems.length > 0 && (
            <div>
              <p className="text-warn">
                {parsed.problems.length}{" "}
                {parsed.problems.length === 1 ? "line" : "lines"} will be
                skipped
              </p>
              <ul className="hint mt-1.5 max-h-40 space-y-1 overflow-y-auto">
                {parsed.problems.map(({ line, message }) => (
                  <li key={line}>
                    Line {line}: {message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            className="btn-accent w-full"
            disabled={busy || parsed.rows.length === 0}
            onClick={submit}
          >
            {busy
              ? "Importing…"
              : `Import ${parsed.rows.length} ${parsed.rows.length === 1 ? "product" : "products"}`}
          </button>
        </div>
      )}
    </div>
  );
}
