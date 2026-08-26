"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { FinancialBriefing, BriefingPeriod } from "@/lib/briefing/build-financial-briefing";
import { formatMoney } from "@/lib/format/money";
import { useCountUp } from "./useCountUp";
import { StorySparkline } from "./StorySparkline";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${formatMoney(Math.abs(v))}`;

export function NetWorthCard({ briefing, period = "week" }: { briefing: FinancialBriefing; period?: BriefingPeriod }) {
  const animated = useCountUp(briefing.currentNetWorth);
  const delta = briefing.deltas.find((d) => d.period === period) ?? briefing.deltas[1];
  const up = delta.netWorth >= 0;

  return (
    <div className="rounded-[1.5rem] bg-slate-950 p-5 text-white">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-slate-400">Household net worth</p>
          <p className="mt-1 text-3xl font-black tabular-nums">{formatMoney(animated)}</p>
        </div>
        <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${up ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
          {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {signed(delta.netWorth)}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-right">
        <div className="text-left">
          <p className="text-xs font-bold text-slate-400">Assets</p>
          <p className="text-lg font-black">{formatMoney(briefing.assets)}</p>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-400">Liabilities</p>
          <p className="text-lg font-black">{formatMoney(briefing.liabilities)}</p>
        </div>
      </div>
      <div className="mt-4">
        <StorySparkline series={briefing.series} dataKey="netWorth" period={period} color="#6ee7b7" height={56} />
      </div>
    </div>
  );
}
