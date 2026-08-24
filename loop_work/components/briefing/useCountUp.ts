"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animates a numeric value toward `target` whenever it changes, so figures feel
 * like they're arriving live rather than just replacing themselves instantly.
 * Respects prefers-reduced-motion by snapping straight to the target.
 */
export function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      const t = setTimeout(() => setValue(target), 0);
      return () => clearTimeout(t);
    }

    fromRef.current = value;
    startRef.current = null;

    const from = fromRef.current;
    const delta = target - from;
    if (Math.abs(delta) < 0.5) {
      setValue(target);
      return;
    }

    function tick(timestamp: number) {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(1, elapsed / durationMs);
      // ease-out cubic — fast start, gentle settle, feels alive without overshooting
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + delta * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return value;
}
