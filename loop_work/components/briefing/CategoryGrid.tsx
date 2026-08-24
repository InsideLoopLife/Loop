"use client";

import { BarChart3, Building2, Landmark, PiggyBank } from "lucide-react";
import type { FinancialBriefing, BriefingPeriod } from "@/lib/briefing/build-financial-briefing";
import { CategoryStoryCard, type CategoryConfig } from "./CategoryStoryCard";

/**
 * Everything shown here is derived from a single config list. To chart a new
 * category, add one entry — the grid, the sparkline wiring, and the delta
 * badge all follow automatically.
 */
export function CategoryGrid({ briefing, period }: { briefing: FinancialBriefing; period: BriefingPeriod }) {
  const delta = briefing.deltas.find((d) => d.period === period) ?? briefing.deltas[1];
  const latestPoint = briefing.series.at(-1);

  const configs: CategoryConfig[] = [
    { key: "investments", label: "Investments", icon: BarChart3, color: "#6366f1", value: briefing.investments.value, delta: delta.investments, note: briefing.investments.evidence, href: "/investments" },
    { key: "savings", label: "Savings", icon: PiggyBank, color: "#10b981", value: briefing.savings.balance, delta: delta.savings, note: `${briefing.savings.blendedRate.toFixed(2)}% blended rate`, href: "/accounts?tab=savings" },
    { key: "pensions", label: "Pensions", icon: Landmark, color: "#f97316", value: latestPoint?.pensions ?? 0, delta: delta.pensions, note: "Estimated pot value", href: "/retirement" },
    { key: "propertyEquity", label: "Property equity", icon: Building2, color: "#0ea5e9", value: briefing.home?.equity ?? 0, delta: delta.propertyEquity, note: briefing.home ? `LTV ~${briefing.home.ltv.toFixed(0)}%` : "No property linked", href: "/mortgage" },
  ];

  return (
    <section>
      <div className="mb-4">
        <p className="text-xs font-black uppercase tracking-[.2em] text-emerald-500">Live picture</p>
        <h2 className="text-3xl font-black text-slate-950">How each part of LOOP is moving</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {configs.map((c) => (
          <CategoryStoryCard key={c.key} config={c} series={briefing.series} period={period} />
        ))}
      </div>
    </section>
  );
}
