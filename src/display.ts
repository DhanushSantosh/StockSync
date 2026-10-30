import { useEffect, useRef, useState } from "react";
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
