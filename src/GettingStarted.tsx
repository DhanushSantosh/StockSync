import { useState } from "react";
import { Check } from "lucide-react";
import { errorText } from "./display";
import { db } from "./firebase";
import { t } from "./i18n";
import { gettingStarted, removeSampleProducts, saveProfile } from "./shop";
import type { Movement, Product } from "./inventory";
import { Alert } from "./ui";

export function GettingStarted({
  shop,
  products,
  movements,
  hidden,
  onNotice,
  onStep,
}: {
  shop: string;
  products: Product[];
  movements: Movement[];
  hidden: boolean;
  onNotice: (message: string) => void;
  onStep: (step: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const steps = gettingStarted(products, movements);
  const done = steps.filter((step) => step.done).length;
  const samples = products.filter((product) => product.sample).length;
  if (hidden && !samples) return null;

  async function clearSamples() {
    if (!db) return;
    setBusy(true);
    setProblem("");
    try {
      await removeSampleProducts(db, shop, products);
      onNotice(t("Sample products removed."));
    } catch (cause) {
      setProblem(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel mb-gap">
      {!hidden && (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="heading">{t("Getting started")}</h2>
            <button
              className="btn-link"
              onClick={() =>
                db && saveProfile(db, shop, { checklistHidden: true })
              }
            >
              {t(done === steps.length ? "Done" : "Hide")}
            </button>
          </div>
          <p className="hint mt-0.5">
            {done} / {steps.length} {t("done")}
          </p>
          <div className="bar mt-2.5">
            <div
              className="bar-fill"
              style={{ width: `${(done / steps.length) * 100}%` }}
            />
          </div>
          <div className="-mx-pad mt-3">
            {steps.map((step, index) => (
              <button
                key={step.label}
                className="btn-row flex min-h-12 w-full items-center gap-3 border-t border-line px-pad py-2 text-left"
                onClick={() => onStep(index)}
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${step.done ? "border-gain bg-gain text-ink" : "border-outline"}`}
                >
                  {step.done && <Check size={14} strokeWidth={3} />}
                </span>
                <span className={step.done ? "text-muted" : ""}>
                  {t(step.label)}
                  <span className="sr-only">
                    {step.done ? `, ${t("done")}` : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      {samples > 0 && (
        <div className={hidden ? "" : "mt-3 border-t border-line pt-3"}>
          <p className="hint">
            {t(
              "You're exploring with sample products. Sales on them are practice.",
            )}
          </p>
          {problem && (
            <div className="mt-2">
              <Alert>{problem}</Alert>
            </div>
          )}
          <button
            className="btn-soft mt-2.5 w-full"
            disabled={busy}
            onClick={clearSamples}
          >
            {t("Remove sample products")}
          </button>
        </div>
      )}
    </section>
  );
}
