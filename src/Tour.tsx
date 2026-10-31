import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFocusTrap } from "./display";
import { t } from "./i18n";

const tips = [
  [
    "Record",
    "Record a sale",
    "Tap Record, then tap what the customer bought. Scan a barcode if the product has one.",
  ],
  [
    "Record",
    "Count at closing",
    "Short on time? Under Record, use Count to enter what's on the shelf. Missing units count as sold.",
  ],
  [
    "Reorder",
    "See what to buy",
    "Reorder lists what's running low by supplier, with how much to order.",
  ],
  [
    "History",
    "Fix a mistake",
    "Every change is in History. Tap one to undo it.",
  ],
] as const;

// The phone and desktop menus both carry the mark; only one is on screen.
function spotlight(target: string) {
  const items = document.querySelectorAll<HTMLElement>(
    `[data-tour="${target}"]`,
  );
  const item = [...items].find((node) => node.offsetParent !== null);
  return item?.getBoundingClientRect() ?? null;
}

export function Tour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [area, setArea] = useState<DOMRect | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const [target, title, text] = tips[step];
  const last = step === tips.length - 1;
  useFocusTrap(dialog, true);

  useLayoutEffect(() => {
    const measure = () => setArea(spotlight(target));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [target]);

  useEffect(() => {
    next.current?.focus();
  }, [step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const below = !area || area.top < innerHeight / 2;
  return (
    <div
      ref={dialog}
      className="fixed inset-0 z-[65]"
      role="dialog"
      aria-modal="true"
      aria-label={t("Tour")}
    >
      {area ? (
        <div
          className="tour-spot"
          style={{
            left: area.left - 4,
            top: area.top - 4,
            width: area.width + 8,
            height: area.height + 8,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/70" />
      )}
      <div
        key={step}
        className="page absolute inset-x-gutter mx-auto max-w-sm rounded-panel bg-raised p-pad"
        style={
          below
            ? { top: (area?.bottom ?? 64) + 16 }
            : { bottom: innerHeight - (area?.top ?? 0) + 16 }
        }
      >
        <h2 className="text-title font-semibold">{t(title)}</h2>
        <p className="hint mt-1">{t(text)}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="hint tabular">
            {step + 1} / {tips.length}
          </span>
          <span className="flex items-center gap-3">
            {!last && (
              <button className="btn-link" onClick={onClose}>
                {t("Skip the tour")}
              </button>
            )}
            <button
              ref={next}
              className="btn-accent"
              onClick={() => (last ? onClose() : setStep(step + 1))}
            >
              {last ? t("Done") : t("Next")}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
