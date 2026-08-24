"use client";

import { WalletCards } from "lucide-react";
import type { FinancialBriefing } from "@/lib/briefing/build-financial-briefing";
import { formatMoney } from "@/lib/format/money";

export function FlowBeat({ flow }: { flow: FinancialBriefing["flow"] }) {
  const totalFlow = Math.max(1, flow.income);
  const bars: [number, string][] = [
    [flow.spending, "bg-orange-400"],
    [flow.savings, "bg-emerald-400"],
    [flow.pensions, "bg-indigo-400"],
    [Math.max(0, flow.unassigned), "bg-sky-300"],
  ];
  return (
    <article className="rounded-[2rem] border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-3">
        <WalletCards className="text-indigo-600" />
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-slate-400">Financial Flow</p>
          <h2 className="text-2xl font-black">Where this month is going</h2>
        </div>
      </div>
      <div className="mt-6 h-7 overflow-hidden rounded-full bg-slate-100">
        <div className="flex h-full">
          {bars.map(([v, c], i) => (
            <div key={i} className={`${c} transition-all duration-1000 ease-out`} style={{ width: `${(Math.max(0, v) / totalFlow) * 100}%` }} />
          ))}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([
          ["Income", flow.income],
          ["Spending", flow.spending],
          ["Savings", flow.savings],
          ["Unassigned", flow.unassigned],
        ] as [string, number][]).map(([l, v]) => (
          <div key={l} className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-bold text-slate-500">{l}</p>
            <p className="mt-1 text-xl font-black">{formatMoney(v)}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
