import { useEffect, useRef, useState, type ReactNode } from "react";
import { signed, useNow, useTick } from "./display";
import {
  groupByDay,
  movementLabels,
  statusOf,
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
    <p role="alert" className="rounded-xl bg-loss/10 px-3.5 py-2.5 text-loss">
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
  return <span className={`text-[13px] ${tone}`}>{label}</span>;
}

export function Changes({
  movements,
  limit,
}: {
  movements: Movement[];
  limit?: number;
}) {
  const [seen] = useState(
    () => new Set(movements.map((movement) => movement.id)),
  );
  useEffect(() => {
    for (const movement of movements) seen.add(movement.id);
  }, [movements, seen]);
  const now = useNow();
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
            const incoming = movement.change > 0;
            return (
              <div
                key={movement.id}
                className={`grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 ${seen.has(movement.id) ? "" : "row-in"}`}
              >
                <span
                  aria-hidden
                  className={`row-span-2 flex size-9 items-center justify-center rounded-full text-base font-bold ${incoming ? "bg-gain/12 text-gain" : movement.change < 0 ? "bg-loss/12 text-loss" : "bg-raised text-muted"}`}
                >
                  {incoming ? "+" : movement.change < 0 ? "−" : "0"}
                </span>
                <p className="truncate font-medium">{movement.productName}</p>
                <span
                  className={`tabular text-right text-base font-semibold ${incoming ? "text-gain" : ""}`}
                >
                  {signed(movement.change)}
                </span>
                <span className="hint truncate">
                  {movementLabels[movement.kind]}
                  {movement.note ? `, ${movement.note}` : ""}
                </span>
                <span className="hint tabular text-right">
                  {movement.quantityAfter} left
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
