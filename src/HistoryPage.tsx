import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { movementLabels, type Movement } from "./inventory";
import { Alert, Changes } from "./ui";

const csvCell = (value: string | number) =>
  `"${String(value).replaceAll('"', '""')}"`;

export function HistoryPage({
  movements,
  error,
}: {
  movements: Movement[];
  error: string;
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
    link.download = "stocksync-history.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="panel mx-auto max-w-3xl max-sm:!p-4">
      <div className="flex flex-wrap gap-2 sm:gap-3">
        <label className="relative min-w-full flex-1 sm:min-w-44">
          <Search
            size={16}
            className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
          />
          <input
            className="field !mt-0 !pl-10"
            aria-label="Search history"
            placeholder="Search product or note"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          className="field !mt-0 !w-auto min-w-0 max-sm:flex-1"
          aria-label="Filter by type of change"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="all">All changes</option>
          {Object.entries(movementLabels).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          className="btn-soft max-sm:flex-1"
          onClick={exportCsv}
          disabled={!visible.length}
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {visible.length ? (
        <>
          <Changes movements={visible} />
          <p className="hint mt-3">
            Showing the latest {movements.length} of up to 50 changes.
          </p>
        </>
      ) : (
        <p className="hint py-14 text-center">
          {movements.length
            ? "No changes match this search."
            : "Changes you record will appear here."}
        </p>
      )}
    </section>
  );
}
