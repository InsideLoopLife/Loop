"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";

// A form's save button: shows "Saving…" while it saves and "Saved" for a
// moment afterwards, so it's clear something happened.
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  savedLabel = "Saved",
  className = "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-slate-800",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  savedLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const was = useRef(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (was.current && !pending) {
      setSaved(true);
      const t = window.setTimeout(() => setSaved(false), 2500);
      was.current = pending;
      return () => window.clearTimeout(t);
    }
    was.current = pending;
  }, [pending]);
  return (
    <button type="submit" disabled={pending} className={`${className} gap-1.5 disabled:cursor-wait disabled:opacity-60`}>
      {pending ? pendingLabel : saved ? <><Check className="h-4 w-4" /> {savedLabel}</> : children}
    </button>
  );
}
