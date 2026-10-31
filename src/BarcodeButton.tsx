import { useEffect, useRef, useState } from "react";
import { ScanBarcode, X } from "lucide-react";
import { useFocusTrap } from "./display";
import { t } from "./i18n";

// The decoder is large, so it only loads when someone opens the camera.
function Scanner({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState("");
  useFocusTrap(panel, true);

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const controls =
          await new BrowserMultiFormatReader().decodeFromConstraints(
            { video: { facingMode: "environment" } },
            video.current ?? undefined,
            (result, _error, scanControls) => {
              if (!result) return;
              scanControls.stop();
              onCode(result.getText());
              onClose();
            },
          );
        if (cancelled) controls.stop();
        stop = () => controls.stop();
      } catch {
        setProblem(
          "The camera didn't open. Allow camera access, or type the code instead.",
        );
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [onCode, onClose]);

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label={t("Scan barcode")}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="scrim fixed inset-0 z-[70] flex flex-col bg-black"
    >
      <div className="flex items-center justify-between p-gutter pt-[max(var(--spacing-gutter),env(safe-area-inset-top))]">
        <p className="text-title font-semibold">{t("Scan barcode")}</p>
        <button
          type="button"
          className="flex size-11 items-center justify-center rounded-full text-fg"
          aria-label="Close scanner"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {problem ? (
        <p role="alert" className="p-gutter text-loss">
          {problem}
        </p>
      ) : (
        <video
          ref={video}
          className="min-h-0 flex-1 object-cover"
          muted
          playsInline
        />
      )}
    </div>
  );
}

export function BarcodeButton({
  label,
  onCode,
}: {
  label: string;
  onCode: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn-soft max-sm:flex-1"
        onClick={() => setOpen(true)}
      >
        <ScanBarcode size={16} />
        {label}
      </button>
      {open && <Scanner onCode={onCode} onClose={() => setOpen(false)} />}
    </>
  );
}
