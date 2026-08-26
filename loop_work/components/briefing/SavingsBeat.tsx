"use client";

import { PiggyBank } from "lucide-react";
import type { FinancialBriefing, BriefingSeriesPoint, BriefingPeriod } from "@/lib/briefing/build-financial-briefing";
import { formatMoney } from "@/lib/format/money";
import { StorySparkline } from "./StorySparkline";

export function SavingsBeat({ savings, series, period = "week" }: { savings: FinancialBriefing["savings"]; series: BriefingSeriesPoint[]; period?: BriefingPeriod }) {
  return (
    <article className="rounded-[2rem] border border-slate-200 bg-white p-6">
      <PiggyBank className="text-emerald-600" />
      <h2 className="mt-4 text-2xl font-black">Savings & goals</h2>
      <p className="mt-4 text-4xl font-black">{formatMoney(savings.balance)}</p>
      <p className="mt-2 text-sm font-semibold text-slate-500">{savings.blendedRate.toFixed(2)}% blended rate</p>
      <div className="mt-5">
        <StorySparkline series={series} dataKey="savings" period={period} color="#10b981" height={56} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-emerald-50 p-3">
          <p className="text-xs font-bold">In this month</p>
          <p className="font-black text-emerald-700">{formatMoney(savings.monthlyDeposits)}</p>
        </div>
        <div className="rounded-2xl bg-orange-50 p-3">
          <p className="text-xs font-bold">Taken out</p>
          <p className="font-black text-orange-700">{formatMoney(savings.monthlyWithdrawals)}</p>
        </div>
      </div>
    </article>
  );
}
