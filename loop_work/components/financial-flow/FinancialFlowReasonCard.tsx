"use client";

import Link from "next/link";
import { ArrowRight, Lightbulb } from "lucide-react";

export type FinancialFlowReasonLine = {
  label: string;
  value: string;
  explanation: string;
};

export function FinancialFlowReasonCard({
  title,
  summary,
  lines,
  actionHref,
  actionLabel,
}: {
  title: string;
  summary: string;
  lines: FinancialFlowReasonLine[];
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <section className="rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">
            <Lightbulb className="h-3.5 w-3.5" /> Why am I seeing this?
          </p>
          <h2 className="mt-1 text-lg font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">{summary}</p>
        </div>
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
          >
            {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {lines.map((line) => (
          <article key={`${line.label}-${line.value}`} className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{line.label}</p>
            <p className="mt-1 text-base font-black text-slate-950">{line.value}</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{line.explanation}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
