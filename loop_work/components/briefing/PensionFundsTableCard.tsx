"use client";

import { Landmark } from "lucide-react";
import type { BriefingPensionFundRow } from "@/lib/briefing/build-financial-briefing";
import { formatMoney } from "@/lib/format/money";

const signedPercent = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export function PensionFundsTableCard({ funds }: { funds: BriefingPensionFundRow[] }) {
  return (
    <article className="rounded-[2rem] border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-3">
        <Landmark className="text-orange-600" />
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-slate-400">Pension funds</p>
          <h2 className="text-2xl font-black">{funds.length} fund{funds.length === 1 ? "" : "s"} logged</h2>
        </div>
      </div>
      {funds.length ? (
        <div className="mt-4 -mx-2 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-400">
                <th className="px-2 pb-2">Fund</th>
                <th className="px-2 pb-2 text-right">Value</th>
                <th className="px-2 pb-2 text-right">5yr ann.</th>
                <th className="px-2 pb-2 text-right">Fee</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((f, i) => (
                <tr key={`${f.name}-${i}`} className="border-t border-slate-100">
                  <td className="px-2 py-2.5">
                    <p className="font-bold text-slate-800">{f.name}</p>
                    <p className="text-xs font-semibold text-slate-400">{f.group}</p>
                  </td>
                  <td className="px-2 py-2.5 text-right font-black tabular-nums text-slate-900">{formatMoney(f.value)}</td>
                  <td className={`px-2 py-2.5 text-right font-bold tabular-nums ${f.annualised5y == null ? "text-slate-300" : f.annualised5y >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {f.annualised5y != null ? signedPercent(f.annualised5y) : "—"}
                  </td>
                  <td className="px-2 py-2.5 text-right font-bold tabular-nums text-slate-500">{f.feePercent != null ? `${f.feePercent.toFixed(2)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 px-2 text-xs font-semibold text-slate-400">5-year annualised return, where available. Past performance isn&apos;t a guide to future returns.</p>
        </div>
      ) : (
        <p className="mt-4 text-sm font-semibold text-slate-500">No individual fund breakdown is logged yet — add fund detail on a pension account to see it here.</p>
      )}
    </article>
  );
}
