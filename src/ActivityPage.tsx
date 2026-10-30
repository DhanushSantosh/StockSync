import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ClipboardList,
  Download,
  Search,
} from "lucide-react";
import { movementLabels, type Movement } from "./inventory";
const csvCell = (value: string | number) =>
  `"${String(value).replaceAll('"', '""')}"`;

export function ActivityPage({
  movements,
  error,
  loading,
}: {
  movements: Movement[];
  error: string;
  loading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const visible = useMemo(
    () =>
      movements.filter(
        (movement) =>
          (kind === "all" || movement.kind === kind) &&
          `${movement.productName} ${movement.note}`
            .toLowerCase()
            .includes(search.toLowerCase().trim()),
      ),
    [movements, kind, search],
  );

  function exportCsv() {
    const rows = [
      ["Date", "Product", "Action", "Change", "Before", "After", "Note"],
      ...visible.map((movement) => [
        movement.createdAt?.toDate().toISOString() ?? "",
        movement.productName,
        movementLabels[movement.kind],
        movement.change,
        movement.quantityBefore,
        movement.quantityAfter,
        movement.note,
      ]),
    ];
    const blob = new Blob(
      [rows.map((row) => row.map(csvCell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "stocksync-activity.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card !p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
        <div>
          <h2 className="section-title">Stock movement history</h2>
          <p className="section-subtitle">
            Recent changes saved in Firestore, newest first. Showing up to 50.
          </p>
        </div>
        <button
          className="secondary-button flex items-center gap-2"
          onClick={exportCsv}
          disabled={!visible.length}
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>
      <div className="flex flex-wrap gap-3 border-b border-slate-100 p-5 sm:p-6">
        <div className="relative min-w-48 flex-1">
          <Search
            size={17}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            className="field !pl-10"
            aria-label="Search activity"
            placeholder="Search product or note"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <select
          className="field max-w-52"
          aria-label="Filter activity type"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="all">All actions</option>
          {Object.entries(movementLabels).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p role="alert" className="px-6 py-4 text-sm text-rose-700">
          {error}
        </p>
      )}
      {loading ? (
        <p className="px-6 py-16 text-center text-sm text-slate-500">
          Loading stock history…
        </p>
      ) : visible.length ? (
        <div className="divide-y divide-slate-100">
          {visible.map((movement) => (
            <div
              key={movement.id}
              className="flex flex-wrap items-center gap-4 px-5 py-4 sm:px-6"
            >
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${movement.change < 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}
              >
                {movement.change < 0 ? (
                  <ArrowDownRight size={19} />
                ) : (
                  <ArrowUpRight size={19} />
                )}
              </span>
              <div className="min-w-40 flex-1">
                <p className="text-sm font-semibold">{movement.productName}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {movementLabels[movement.kind]}
                  {movement.note ? ` · ${movement.note}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`text-sm font-bold ${movement.change < 0 ? "text-rose-600" : "text-emerald-600"}`}
                >
                  {movement.change > 0 ? "+" : ""}
                  {movement.change} units
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {movement.quantityBefore} → {movement.quantityAfter} ·{" "}
                  {movement.createdAt?.toDate().toLocaleString() ?? "Just now"}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-16 text-center">
          <ClipboardList size={28} className="mx-auto text-slate-400" />
          <p className="mt-3 font-semibold">
            {movements.length
              ? "No matching movements"
              : "No stock changes recorded yet"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {movements.length
              ? "Try another search or action filter."
              : "New stock changes will appear here. Earlier changes cannot be reconstructed."}
          </p>
        </div>
      )}
    </section>
  );
}
