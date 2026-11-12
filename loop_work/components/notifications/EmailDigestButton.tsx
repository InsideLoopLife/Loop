"use client";

import { useState, useTransition } from "react";
import { Mail } from "lucide-react";
import { emailMyDigest } from "@/app/notifications/actions";

// Sends this week's Monday email to yourself now, so you can see it.
export function EmailDigestButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending} onClick={() => start(async () => setResult(await emailMyDigest().catch(() => ({ ok: false, message: "Couldn't send it." }))))}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-slate-50 disabled:opacity-50">
        <Mail className="h-4 w-4" /> {pending ? "Sending…" : "Email me this week's summary"}
      </button>
      {result ? <span className={`text-sm ${result.ok ? "text-[var(--pine-strong)]" : "text-rose-600"}`}>{result.message}</span> : null}
    </div>
  );
}
