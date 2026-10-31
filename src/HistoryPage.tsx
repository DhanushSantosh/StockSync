import { useCallback, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { downloadCsv } from "./csv";
import { errorText, savedMessage } from "./display";
import { auth, db } from "./firebase";
import {
  fetchAllMovements,
  movementLabels,
  undoMovement,
  type Movement,
} from "./inventory";
import { Alert, Changes } from "./ui";
import { t } from "./i18n";

export function HistoryPage({
  shop,
  actor,
  movements,
  error,
  hasMore,
  onLoadMore,
  onNotice,
}: {
  shop: string;
  actor: string;
  movements: Movement[];
  error: string;
  hasMore: boolean;
  onLoadMore: () => void;
  onNotice: (message: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [problem, setProblem] = useState("");
  const [exporting, setExporting] = useState(false);
  const matching = useCallback(
    (list: Movement[]) =>
      list.filter(
        (movement) =>
          (kind === "all" || movement.kind === kind) &&
          `${movement.productName} ${movement.note}`
            .toLowerCase()
            .includes(search.toLowerCase().trim()),
      ),
    [kind, search],
  );
  const visible = useMemo(() => matching(movements), [matching, movements]);

  async function undo(movement: Movement) {
    if (!db || !auth?.currentUser) return;
    setProblem("");
    try {
      const result = await undoMovement(db, shop, movement, actor);
      onNotice(savedMessage(result, t("Change undone.")));
    } catch (cause) {
      setProblem(errorText(cause));
    }
  }

  async function exportCsv() {
    if (!db || !auth?.currentUser) return;
    setExporting(true);
    setProblem("");
    let all: Movement[];
    try {
      all = matching(await fetchAllMovements(db, shop));
    } catch (cause) {
      setProblem(errorText(cause));
      return;
    } finally {
      setExporting(false);
    }
    const rows = [
      [
        "Date",
        "Product",
        "Action",
        "Change",
        "Before",
        "After",
        "Sales (₹)",
        "Profit (₹)",
        "Note",
      ],
      ...all.map((movement) => [
        movement.createdAt?.toDate().toISOString() ?? "",
        movement.productName,
        movementLabels[movement.kind],
        movement.change,
        movement.quantityBefore,
        movement.quantityAfter,
        movement.revenue === undefined ? "" : movement.revenue / 100,
        movement.profit === undefined ? "" : movement.profit / 100,
        movement.note,
      ]),
    ];
    downloadCsv("stocksync-history.csv", rows);
  }

  return (
    <section className="panel mx-auto max-w-3xl">
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-full flex-1 sm:min-w-44">
          <Search
            size={16}
            className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
          />
          <input
            className="field !mt-0 !pl-10"
            aria-label="Search history"
            placeholder={t("Search product or note")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          className="field !mt-0 !w-auto min-w-40 max-sm:flex-1"
          aria-label="Filter by type of change"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="all">{t("All changes")}</option>
          {Object.entries(movementLabels).map(([value, label]) => (
            <option value={value} key={value}>
              {t(label)}
            </option>
          ))}
        </select>
        <button
          className="btn-soft max-sm:flex-1"
          onClick={exportCsv}
          disabled={exporting || !movements.length}
        >
          <Download size={16} />
          {exporting ? "Exporting…" : t("Export CSV")}
        </button>
      </div>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {problem && (
        <div className="mt-3">
          <Alert>{problem}</Alert>
        </div>
      )}
      {visible.length ? (
        <>
          <Changes movements={visible} onUndo={undo} />
          <p className="hint mt-3">
            Showing the latest {movements.length} changes. Tap a change to undo
            it. Export includes your full history.
          </p>
          {hasMore && (
            <button className="btn-soft mt-3 w-full" onClick={onLoadMore}>
              {t("Load older changes")}
            </button>
          )}
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
