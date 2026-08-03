"use client";

import { Eye, EyeOff } from "lucide-react";
import { usePrivacyMode } from "./PrivacyModeProvider";

/**
 * Small eye-icon toggle for briefly revealing real numbers. Only renders
 * anything when privacy mode is actually on (off mode has nothing to
 * reveal, so this stays invisible rather than showing a useless button).
 */
export function PrivacyRevealToggle({ className }: { className?: string }) {
  const { mode, revealed, toggleRevealed } = usePrivacyMode();
  if (mode === "off") return null;
  return (
    <button
      type="button"
      onClick={toggleRevealed}
      className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 ${className || ""}`}
      title={revealed ? "Hide real numbers again" : "Briefly show real numbers"}
    >
      {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {revealed ? "Hide numbers" : "Reveal numbers"}
    </button>
  );
}
