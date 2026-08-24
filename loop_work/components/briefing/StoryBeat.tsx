"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A single "beat" in the briefing story. Beats stay invisible until `open`
 * is true, then fade/rise into view. The story feed controls `open` via a
 * simple index counter, so adding a new beat is just adding another entry
 * to the beats array — nothing about the reveal mechanics needs to change.
 */
export function StoryBeat({
  open,
  delayMs = 0,
  children,
  className = "",
}: {
  open: boolean;
  delayMs?: number;
  children: ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setMounted(true), delayMs);
    return () => clearTimeout(t);
  }, [open, delayMs]);

  return (
    <div
      aria-hidden={!open}
      className={`transition-all duration-700 ease-out ${mounted ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Drives a sequence of beats open one after another. Returns how many beats
 * are currently revealed — `isOpen(i)` tells beat `i` whether to show itself.
 * Purely time-based and index-based, so it scales to any number of beats
 * without the orchestrator needing to know what each beat renders.
 */
export function useStorySequence(beatCount: number, stepMs = 550) {
  const [revealed, setRevealed] = useState(1);

  useEffect(() => {
    if (revealed >= beatCount) return;
    const t = setTimeout(() => setRevealed((r) => Math.min(beatCount, r + 1)), stepMs);
    return () => clearTimeout(t);
  }, [revealed, beatCount, stepMs]);

  return {
    isOpen: (index: number) => index < revealed,
    revealedCount: revealed,
    done: revealed >= beatCount,
    skip: () => setRevealed(beatCount),
  };
}
