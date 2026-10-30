import { useEffect, useRef, useState, type ReactNode } from "react";
import { signed, useNow, useTick } from "./display";
import {
  canUndo,
  groupByDay,
  movementLabels,
  statusOf,
  undoneIds,
  type Movement,
  type Product,
} from "./inventory";

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useCountUp(value: number, startFrom: number) {
  const [shown, setShown] = useState(startFrom);
  const current = useRef(startFrom);
  useEffect(() => {
    const start = current.current;
    if (start === value) return;
    const duration = prefersReducedMotion() ? 0 : 700;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = duration ? Math.min((now - startedAt) / duration, 1) : 1;
      const eased = 1 - (1 - progress) ** 3;
      current.current = Math.round(start + (value - start) * eased);
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

export function Ticker({
  value,
  countIn = false,
  className = "",
}: {
  value: number;
  countIn?: boolean;
  className?: string;
}) {
  const shown = useCountUp(value, countIn ? 0 : value);
  const tick = useTick(value);
  return (
    <span key={tick.id} className={`ticker ${tick.direction} ${className}`}>
      {shown.toLocaleString()}
    </span>
  );
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-control bg-loss/10 px-3.5 py-2.5 text-loss"
    >
      {children}
    </p>
  );
}

const statusText = {
  healthy: { label: "Enough", tone: "text-gain" },
  low: { label: "Running low", tone: "text-warn" },
  out: { label: "Sold out", tone: "text-loss" },
};

export function Status({ product }: { product: Product }) {
  const { label, tone } = statusText[statusOf(product)];
  return <span className={`text-caption ${tone}`}>{label}</span>;
}

function ChangeRow({
  movement,
  undone,
}: {
  movement: Movement;
  undone: boolean;
}) {
  const incoming = movement.change > 0;
  return (
    <>
      <span
        aria-hidden
        className={`row-span-2 flex size-9 items-center justify-center rounded-full font-bold ${incoming ? "bg-gain/12 text-gain" : movement.change < 0 ? "bg-loss/12 text-loss" : "bg-raised text-muted"}`}
      >
        {incoming ? "+" : movement.change < 0 ? "−" : "0"}
      </span>
      <span className="truncate font-medium">{movement.productName}</span>
      <span
        className={`tabular text-right text-title font-semibold ${incoming ? "text-gain" : ""}`}
      >
        {signed(movement.change)}
      </span>
      <span className="hint truncate">
        {movementLabels[movement.kind]}
        {movement.note ? `, ${movement.note}` : ""}
        {undone ? ", undone" : ""}
      </span>
      <span className="hint tabular text-right">
        {movement.quantityAfter} left
      </span>
    </>
  );
}

const rowLayout =
  "grid w-full grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 text-left";

export function Changes({
  movements,
  limit,
  onUndo,
}: {
  movements: Movement[];
  limit?: number;
  onUndo?: (movement: Movement) => void;
}) {
  const [seen] = useState(
    () => new Set(movements.map((movement) => movement.id)),
  );
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    for (const movement of movements) seen.add(movement.id);
  }, [movements, seen]);
  const now = useNow();
  const undone = undoneIds(movements);
  const groups = groupByDay(movements.slice(0, limit), now);
  return (
    <>
      {groups.map((group) => (
        <div key={group.label}>
          <div className="hint flex justify-between pt-3.5 pb-1">
            <span>{group.label}</span>
            <span className="tabular">
              {signed(group.net)} {Math.abs(group.net) === 1 ? "unit" : "units"}
            </span>
          </div>
          {group.movements.map((movement) => {
            const entered = seen.has(movement.id) ? "" : "row-in";
            const row = (
              <ChangeRow movement={movement} undone={undone.has(movement.id)} />
            );
            if (!onUndo || !canUndo(movement, undone))
              return (
                <div key={movement.id} className={`${rowLayout} ${entered}`}>
                  {row}
                </div>
              );
            const open = selected === movement.id;
            return (
              <div key={movement.id} className={entered}>
                <button
                  className={`${rowLayout} btn-row`}
                  aria-expanded={open}
                  onClick={() => setSelected(open ? null : movement.id)}
                >
                  {row}
                </button>
                {open && (
                  <div className="page flex gap-2 pb-2.5 pl-12">
                    <button
                      className="btn-soft flex-1"
                      onClick={() => {
                        setSelected(null);
                        onUndo(movement);
                      }}
                    >
                      Undo this change
                    </button>
                    <button
                      className="btn-soft"
                      onClick={() => setSelected(null)}
                    >
                      Keep
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
