"use client";

// "Keep LOOP accurate": figures that are estimates or haven't been checked for
// six months, each with a Check button.
import { useState } from "react";
import type { AccuracyCheck } from "@/lib/accuracy/checks";
import { CheckModal, type CheckTarget } from "@/components/accuracy/CheckModal";

const pounds = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

function toTarget(check: AccuracyCheck): CheckTarget {
  return {
    kind: check.kind,
    recordId: check.recordId,
    title: check.title,
    reason: check.reason,
    current: check.current,
    currentLabel: check.currentLabel,
    link: check.link,
    emailSearch: check.emailSearch,
    amountLabel: check.form.amountLabel,
    askLastPayment: check.form.askLastPayment,
    askEffective: check.form.askEffective,
    effectiveDefault: check.form.effectiveDefault,
    watchKey: check.meta?.watchKey ?? null,
    confirmQuestion: check.kind === "price_confirm" ? `Have you had confirmation of the new ${check.title.toLowerCase()} amount?` : undefined,
  };
}

export function AccuracyChecksCard({ checks }: { checks: AccuracyCheck[] }) {
  const [open, setOpen] = useState<AccuracyCheck | null>(null);
  if (!checks.length) return null;
  return (
    <section className="rounded-[18px] border border-[var(--line,#e2e8f0)] bg-white p-5 md:p-6">
      <h2 className="text-base font-semibold text-[var(--ink,#0f172a)]">Keep LOOP accurate</h2>
      <p className="mt-0.5 text-sm text-slate-500">
        {checks.length === 1 ? "One figure is" : `${checks.length} figures are`} an estimate or {checks.length === 1 ? "hasn't" : "haven't"} been checked for six months. A quick check makes everything else more accurate.
      </p>
      <ul className="mt-4 divide-y divide-slate-100">
        {checks.map((check) => (
          <li key={check.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                {check.title}
                {check.current != null ? <span className="ml-2 font-normal text-slate-500">{pounds(check.current)}</span> : null}
                {check.isEstimate ? <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Estimate</span> : null}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{check.reason}</p>
            </div>
            <button type="button" onClick={() => setOpen(check)} className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white">Check</button>
          </li>
        ))}
      </ul>
      {open ? <CheckModal target={toTarget(open)} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}
