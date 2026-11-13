// components/dashboard/widgets/PensionSummaryWidget.tsx
"use client";

// Same pattern as NetWorthWidget.tsx — fetch scoped by config.scope, render.

import type { WidgetProps } from "@/lib/dashboard/types";
import { WidgetTrendChart } from "./WidgetTrendChart";
import { pensionHistoryPoints, projectedPoints, projectionHorizon } from "./widget-series";

export function PensionSummaryWidget({ config, householdId, dashboardContext, viewport }: WidgetProps) {
  // Figures come from the dashboard's own month plan, so they match the Summary.
  const data = null as { total: number; label: string } | null;
  const loading = false;


  const overview = dashboardContext?.overview;
  const displayData = overview ? { total: overview.pensionValue, label: `${overview.pensionChange >= 0 ? "+" : ""}${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(overview.pensionChange)} this month` } : data;

  if (loading && !overview) return <div className="widget-skeleton" />;
  if (!displayData) return <div className="widget-empty">No data yet</div>;

  const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
  const chartVisible = viewport.mode === "detailed" || viewport.mode === "immersive";
  const detailed = chartVisible;
  const horizon = projectionHorizon(config.preferences?.projectionMonths, viewport);
  const projection = dashboardContext?.pensionProjection;
  const annualGrowth = projection && !projection.growthIsFallback ? projection.annualGrowthRate : 0;
  const monthlyGrowth = Math.pow(1 + annualGrowth / 100, 1 / 12) - 1;
  const points = [...pensionHistoryPoints(dashboardContext?.pensionHistory ?? [], viewport.historyMonths), { label: "Today", value: displayData.total, kind: "today" as const }];
  if (config.preferences?.showProjection !== false && projection) points.push(...projectedPoints(displayData.total, horizon, (_index, value) => value * (1 + monthlyGrowth) + projection.monthlyContribution));

  return (
    <div className={`adaptive-value-widget adaptive-value-widget--${viewport.mode}`}>
      <div className="widget-metric__value">
        {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(displayData.total)}
      </div>
      <div className="widget-metric__label">{displayData.label}</div>
      {detailed && overview ? <div className="adaptive-value-widget__breakdown"><span><small>Monthly contribution</small><strong>{money.format(projection?.monthlyContribution ?? overview.pensionMonthlyContribution)}</strong></span><span><small>LOOP growth rate</small><strong>{projection && !projection.growthIsFallback ? `${annualGrowth.toFixed(1)}% p.a.` : "Building history"}</strong></span></div> : null}
      {chartVisible ? <WidgetTrendChart points={points} format={(value) => money.format(value)} area={config.preferences?.chartStyle !== "line"} /> : null}
      {detailed && projection ? <p className="widget-data-source" title={projection.growthSource}>{projection.growthIsFallback ? "Building pension history" : "From pension fund performance"}{projection.growthAsOfDate ? ` · ${projection.growthAsOfDate}` : ""}</p> : null}
    </div>
  );
}
