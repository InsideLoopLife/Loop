"use client";

import { BarChart3 } from "lucide-react";
import type { FinancialBriefing, BriefingPeriod } from "@/lib/briefing/build-financial-briefing";
import { formatMoney } from "@/lib/format/money";
import { StorySparkline } from "./StorySparkline";

export function PortfolioBeat({ investments, series, period }: { investments: FinancialBriefing["investments"]; series: FinancialBriefing["series"]; period: BriefingPeriod }) {
  return (
    <article className="rounded-[2rem] border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="text-emerald-600" />
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-slate-400">Portfolio & markets</p>
          <h2 className="text-2xl font-black">Your visible exposure</h2>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div className="rounded-2xl bg-slate-950 p-5 text-white">
          <p className="text-xs font-bold text-slate-400">Priced investments</p>
          <p className="mt-1 text-3xl font-black">{formatMoney(investments.value)}</p>
          <p className="mt-2 text-xs text-slate-400">{investments.evidence}</p>
          <div className="mt-3">
            <StorySparkline series={series} dataKey="investments" period={period} color="#a5b4fc" height={44} />
          </div>
        </div>
        <div className="rounded-2xl bg-emerald-50 p-5">
          <p className="text-xs font-bold text-emerald-700">Largest exposure</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{investments.topExposure || "Not enough data"}</p>
          <p className="mt-2 text-sm font-bold text-emerald-700">{investments.topExposure ? `${investments.topExposurePercent.toFixed(0)}% of priced holdings` : "Refresh holdings to analyse"}</p>
        </div>
      </div>
    </article>
  );
}
