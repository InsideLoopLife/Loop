"use client";

import { useEffect, useState } from "react";

/**
 * Reveals `text` character by character once `active` becomes true — the
 * "written live" feel for narrative sentences. Falls back to an instant
 * render for prefers-reduced-motion users.
 */
export function TypedText({ text, active, speedMs = 14, className = "" }: { text: string; active: boolean; speedMs?: number; className?: string }) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (!active) return;
    const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      const t = setTimeout(() => setShown(text), 0);
      return () => clearTimeout(t);
    }
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, speedMs);
    return () => clearInterval(interval);
  }, [active, text, speedMs]);

  return (
    <span className={className}>
      {active ? shown : ""}
      {active && shown.length < text.length && <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-current align-middle" />}
    </span>
  );
}
