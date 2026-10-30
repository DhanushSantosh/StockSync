import { useEffect, useRef, useState, type RefObject } from "react";
import type { SaveResult } from "./inventory";

// Restarts a CSS tick each time a value moves; key an element on `id`.
export function useTick(value: number) {
  const previous = useRef(value);
  const [tick, setTick] = useState({ id: 0, direction: "" });
  useEffect(() => {
    if (value === previous.current) return;
    const direction = value > previous.current ? "tick-up" : "tick-down";
    previous.current = value;
    setTick(({ id }) => ({ id: id + 1, direction }));
  }, [value]);
  return tick;
}

// The current time, refreshed each minute so day boundaries roll over.
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const focusable =
  "button:not(:disabled), input:not(:disabled), select, textarea, a[href]";

// Keeps Tab inside an open sheet and returns focus to what opened it.
export function useFocusTrap(
  panel: RefObject<HTMLElement | null>,
  active: boolean,
) {
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    if (!active) return;
    const element = panel.current;
    if (!element) return;
    const previous = element.contains(document.activeElement)
      ? opener
      : (document.activeElement as HTMLElement | null);
    if (!element.contains(document.activeElement))
      element.querySelector<HTMLElement>(focusable)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = [...element.querySelectorAll<HTMLElement>(focusable)];
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    element.addEventListener("keydown", onKey);
    return () => {
      element.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [panel, active, opener]);
}

export const savedMessage = (result: SaveResult, message: string) =>
  result === "queued"
    ? `${message} It will sync when you're back online.`
    : message;

export function errorText(cause: unknown) {
  if ((cause as { code?: string }).code === "permission-denied")
    return "This change was rejected. Check the stock on hand and try again.";
  return cause instanceof Error ? cause.message : "Saving failed. Try again.";
}

export const signed = (change: number) =>
  `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change)}`;
