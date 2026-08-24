"use client";

import { ArrowDownRight, ArrowUpRight, BrainCircuit, Radio } from "lucide-react";
import type { FinancialBriefing, BriefingPeriod } from "@/lib/briefing/build-financial-briefing";
import { formatMoney } from "@/lib/format/money";
import { useCountUp } from "./useCountUp";
import { PeriodToggle } from "./PeriodToggle";
import { StorySparkline } from "./StorySparkline";
import { TypedText } from "./TypedText";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${formatMoney(Math.abs(v))}`;

export function NetWorthHero({
  briefing,
  narrativeActive,
  isLive,
  period,
  onPeriodChange,
}: {
  briefing: FinancialBriefing;
  narrativeActive: boolean;
  isLive: boolean;
  period: BriefingPeriod;
  onPeriodChange: (p: BriefingPeriod) => void;
}) {
  const animatedNetWorth = useCountUp(briefing.currentNetWorth);
  const delta = briefing.deltas.find((d) => d.period === period) ?? briefing.deltas[1];
  const up = delta.netWorth >= 0;
  const periodLabel = period === "day" ? "today" : period === "week" ? "this week" : "this month";

  return (
    <section className="overflow-hidden rounded-[2.2rem] border border-white/80 bg-[radial-gradient(circle_at_85%_15%,rgba(110,231,183,.24),transparent_26%),radial-gradient(circle_at_58%_10%,rgba(129,140,248,.20),transparent_30%),linear-gradient(135deg,#fff,#f8fbff)] p-7 shadow-[0_30px_80px_-52px_rgba(15,23,42,.6)]">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.22em] text-indigo-500">
            Your LOOP
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-600">
              <Radio className={`h-3 w-3 ${isLive ? "animate-pulse" : ""}`} /> {isLive ? "Live" : "Refreshing…"}
            </span>
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Welcome back, {briefing.firstName}</h1>
          <p className="mt-3 max-w-3xl text-base font-semibold text-slate-600 min-h-[1.5em]">
            <TypedText text={briefing.narrative[0]} active={narrativeActive} />
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <PeriodToggle value={period} onChange={onPeriodChange} />
          <div className={`rounded-3xl border px-5 py-4 ${up ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
            <p className="text-xs font-black uppercase tracking-wider">{periodLabel}</p>
            <p className="mt-1 flex items-center gap-2 text-3xl font-black">
              {up ? <ArrowUpRight /> : <ArrowDownRight />}
              {signed(delta.netWorth)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-[2rem] bg-slate-950 p-6 text-white">
          <p className="text-xs font-black uppercase tracking-[.2em] text-emerald-300">Current position</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-sm font-bold text-slate-300">Household net worth</p>
              <p className="mt-1 text-5xl font-black tabular-nums">{formatMoney(animatedNetWorth)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-right">
              <div>
                <p className="text-xs font-bold text-slate-400">Assets</p>
                <p className="text-xl font-black">{formatMoney(briefing.assets)}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400">Liabilities</p>
                <p className="text-xl font-black">{formatMoney(briefing.liabilities)}</p>
              </div>
            </div>
          </div>
          <div className="mt-5">
            <StorySparkline series={briefing.series} dataKey="netWorth" period={period} color="#6ee7b7" height={72} />
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {briefing.contributors.map((c) => (
              <a key={c.key} href={c.href} className="rounded-2xl bg-white/8 p-4 transition hover:bg-white/12">
                <p className="text-xs font-bold text-slate-400">{c.label}</p>
                <p className={`mt-1 text-xl font-black ${c.amount >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{signed(c.amount)}</p>
              </a>
            ))}
          </div>
        </div>
        <div className="rounded-[2rem] border border-indigo-100 bg-indigo-50/70 p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-indigo-600 shadow-sm">
              <BrainCircuit />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-indigo-500">AI financial briefing</p>
              <h2 className="text-2xl font-black text-slate-950">What changed and why</h2>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {briefing.narrative.slice(1).map((x, i) => (
              <p key={i} className="rounded-2xl bg-white/80 p-4 text-sm font-semibold leading-6 text-slate-700">
                <TypedText text={x} active={narrativeActive} speedMs={8} />
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
