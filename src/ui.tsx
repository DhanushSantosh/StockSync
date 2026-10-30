import type { ReactNode } from "react";
import { AlertCircle, Boxes, Check, PackagePlus, Plus } from "lucide-react";
import { statusOf, type Product } from "./inventory";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
        <Boxes size={21} strokeWidth={2.2} />
      </span>
      <span
        className={
          small
            ? "text-lg font-bold tracking-tight"
            : "text-xl font-bold tracking-tight"
        }
      >
        Stock<span className="text-indigo-600">Sync</span>
      </span>
    </div>
  );
}

export function Banner({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${tone === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
    >
      <span className="mt-0.5 shrink-0">
        {tone === "error" ? <AlertCircle size={16} /> : <Check size={16} />}
      </span>
      {children}
    </div>
  );
}

export function StatusBadge({ product }: { product: Product }) {
  const status = statusOf(product);
  const labels = { healthy: "In stock", low: "Low stock", out: "Out of stock" };
  return (
    <span className={`status-badge status-${status}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {labels[status]}
    </span>
  );
}

export function Metric({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  color: string;
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <span className={`metric-icon metric-${color}`}>{icon}</span>
        <span className="text-xs font-medium text-slate-400">Live</span>
      </div>
      <p className="mt-6 text-3xl font-bold tracking-tight">
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="px-5 py-16 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
        <PackagePlus size={26} />
      </span>
      <h3 className="mt-4 font-semibold">Your inventory starts here</h3>
      <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">
        Add your first product to start tracking stock and see your dashboard
        come to life.
      </p>
      <button className="primary-button mx-auto mt-5" onClick={onAdd}>
        <Plus size={17} />
        Add first product
      </button>
    </div>
  );
}
