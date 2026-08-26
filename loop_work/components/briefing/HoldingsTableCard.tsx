"use client";

import { LineChart } from "lucide-react";
import type { BriefingHoldingRow } from "@/lib/briefing/build-financial-briefing";
import { formatMoney } from "@/lib/format/money";

const signedPercent = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export function HoldingsTableCard({ holdings }: { holdings: BriefingHoldingRow[] }) {
  return (
    <article className="rounded-[2rem] border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-3">
        <LineChart className="text-indigo-600" />
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-slate-400">Your holdings</p>
          <h2 className="text-2xl font-black">{holdings.length} priced position{holdings.length === 1 ? "" : "s"}</h2>
        </div>
      </div>
      {holdings.length ? (
        <div className="mt-4 -mx-2 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-400">
                <th className="px-2 pb-2">Holding</th>
                <th className="px-2 pb-2 text-right">Value</th>
                <th className="px-2 pb-2 text-right">Today</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => (
                <tr key={`${h.name}-${i}`} className="border-t border-slate-100">
                  <td className="px-2 py-2.5">
                    <p className="font-bold text-slate-800">{h.name}</p>
                    <p className="text-xs font-semibold text-slate-400">{h.group}</p>
                  </td>
                  <td className="px-2 py-2.5 text-right font-black tabular-nums text-slate-900">{formatMoney(h.value)}</td>
                  <td className={`px-2 py-2.5 text-right font-bold tabular-nums ${h.dayChangeGbp >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{signedPercent(h.dayChangePercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm font-semibold text-slate-500">No priced holdings are linked yet — connect or add investment accounts to see them here.</p>
      )}
    </article>
  );
}
