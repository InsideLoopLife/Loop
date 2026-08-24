"use client";

import type { LucideIcon } from "lucide-react";
import type { BriefingSeriesPoint, BriefingPeriod } from "@/lib/briefing/build-financial-briefing";
import { formatMoney } from "@/lib/format/money";
import { StorySparkline } from "./StorySparkline";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${formatMoney(Math.abs(v))}`;

export type CategoryConfig = {
  key: keyof Omit<BriefingSeriesPoint, "date">;
  label: string;
  icon: LucideIcon;
  color: string;
  value: number;
  delta: number;
  note?: string;
  href: string;
};

/**
 * One category's story: its current value, how it's moved over the selected
 * period, and a live sparkline. New categories (e.g. a future "crypto" or
 * "business equity" line) plug in by adding a CategoryConfig — this card
 * doesn't change.
 */
export function CategoryStoryCard({ config, series, period }: { config: CategoryConfig; series: BriefingSeriesPoint[]; period: BriefingPeriod }) {
  const Icon = config.icon;
  const up = config.delta >= 0;
  return (
    <a href={config.href} className="group block rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-2xl" style={{ backgroundColor: `${config.color}1a`, color: config.color }}>
          <Icon className="h-5 w-5" />
        </span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{signed(config.delta)}</span>
      </div>
      <p className="mt-4 text-xs font-black uppercase tracking-[.18em] text-slate-400">{config.label}</p>
      <p className="mt-1 text-3xl font-black tabular-nums text-slate-950">{formatMoney(config.value)}</p>
      {config.note && <p className="mt-1 text-xs font-semibold text-slate-500">{config.note}</p>}
      <div className="mt-4">
        <StorySparkline series={series} dataKey={config.key} period={period} color={config.color} height={52} />
      </div>
    </a>
  );
}
