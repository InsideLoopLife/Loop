"use client";

// Shown when something on a page fails, including a save that didn't go
// through. Keeps people on the page with a clear way back, instead of a blank
// "application error" screen.
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  // In production the real message is hidden unless it's one written for people.
  const generic = !error.message || /server components render|digest|omitted in production/i.test(error.message);
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-2xl border border-[var(--line)] bg-white p-6 shadow-sm">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-red-50 text-red-600"><AlertTriangle className="h-5 w-5" /></span>
        <h1 className="mt-4 text-xl font-bold text-[var(--ink)]">That didn&apos;t go through</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {generic ? "Nothing was changed. Please try again – if it keeps happening, let us know what you were doing." : error.message}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => reset()} className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white">Try again</button>
          <button type="button" onClick={() => history.back()} className="rounded-xl border border-[var(--line)] px-4 py-2 text-sm font-semibold text-[var(--ink)]">Go back</button>
          <Link href="/dashboard" className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--muted)] hover:text-[var(--ink)]">Summary</Link>
        </div>
        {error.digest ? <p className="mt-4 text-[11px] text-slate-400">Reference: {error.digest}</p> : null}
      </div>
    </main>
  );
}
