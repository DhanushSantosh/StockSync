import { useState, type PointerEvent } from "react";
import { chartAxis } from "./inventory";

const shortDate = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function StockChart({
  days,
}: {
  days: { date: Date; units: number }[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const { min, max, ticks } = chartAxis(days.map((day) => day.units));
  const x = (index: number) => (index / (days.length - 1)) * 100;
  const y = (units: number) => 100 - ((units - min) / (max - min)) * 100;
  const line = days
    .map((day, index) => `${index ? "L" : "M"}${x(index)} ${y(day.units)}`)
    .join(" ");
  const active = hovered ?? days.length - 1;
  const labelled = [0, 3, 6, 9, days.length - 1];

  function hover(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const share = (event.clientX - box.left) / box.width;
    const index = Math.round(share * (days.length - 1));
    setHovered(Math.min(Math.max(index, 0), days.length - 1));
  }

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 pt-1.5">
      <div className="tabular relative w-7 text-right text-muted" aria-hidden>
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute right-0 -translate-y-1/2 text-xs"
            style={{ top: `${y(tick)}%` }}
          >
            {tick}
          </span>
        ))}
      </div>
      <div
        className="relative h-44 touch-none"
        role="img"
        aria-label={`Line chart of total units per day from ${days[0].units} on ${shortDate(days[0].date)} to ${days[days.length - 1].units} today`}
        onPointerMove={hover}
        onPointerLeave={() => setHovered(null)}
      >
        <svg
          className="absolute inset-0 size-full overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {ticks.map((tick) => (
            <line
              key={tick}
              x1="0"
              x2="100"
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-line"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path
            className="chart-area fill-accent/10"
            d={`${line} L100 100 L0 100 Z`}
          />
          <path
            className="chart-line fill-none stroke-accent"
            d={line}
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
          style={{
            left: `${x(active)}%`,
            top: `${y(days[active].units)}%`,
          }}
        />
        {hovered !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-raised px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg shadow-black/40"
            style={{ left: `${Math.min(Math.max(x(hovered), 12), 88)}%` }}
          >
            <b className="tabular block text-sm font-semibold">
              {days[hovered].units.toLocaleString()} units
            </b>
            <span className="text-muted">{shortDate(days[hovered].date)}</span>
          </div>
        )}
      </div>
      <div className="col-start-2 relative mt-1.5 h-4" aria-hidden>
        {labelled.map((index) => (
          <span
            key={index}
            className={`absolute text-xs whitespace-nowrap text-muted ${index === 0 ? "" : index === days.length - 1 ? "-translate-x-full" : "-translate-x-1/2"} ${index === 3 || index === 9 ? "max-sm:hidden" : ""}`}
            style={{ left: `${x(index)}%` }}
          >
            {shortDate(days[index].date)}
          </span>
        ))}
      </div>
    </div>
  );
}
