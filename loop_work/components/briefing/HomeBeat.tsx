"use client";

import { Building2 } from "lucide-react";
import type { FinancialBriefing, BriefingSeriesPoint, BriefingPeriod } from "@/lib/briefing/build-financial-briefing";
import { formatMoney } from "@/lib/format/money";
import { StorySparkline } from "./StorySparkline";

export function HomeBeat({ home, series, period = "week" }: { home: FinancialBriefing["home"]; series: BriefingSeriesPoint[]; period?: BriefingPeriod }) {
  return (
    <article className="rounded-[2rem] border border-slate-200 bg-white p-6">
      <Building2 className="text-indigo-600" />
      <h2 className="mt-4 text-2xl font-black">Home & mortgage</h2>
      {home ? (
        <>
          <p className="mt-4 text-sm font-bold text-slate-500">Estimated equity</p>
          <p className="text-4xl font-black">{formatMoney(home.equity)}</p>
          <p className="mt-3 text-sm font-semibold text-slate-600">
            LTV approximately {home.ltv.toFixed(0)}% · Mortgage {formatMoney(home.mortgage)}
          </p>
          <div className="mt-5">
            <StorySparkline series={series} dataKey="propertyEquity" period={period} color="#0ea5e9" height={56} />
          </div>
        </>
      ) : (
        <p className="mt-5 text-sm font-semibold text-slate-600">Add your home and mortgage to bring property equity into this briefing.</p>
      )}
    </article>
  );
}
