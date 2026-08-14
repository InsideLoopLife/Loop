// components/dashboard/widgets/PensionSummaryWidget.tsx
"use client";

// Same pattern as NetWorthWidget.tsx — fetch scoped by config.scope, render.
// TODO: replace the placeholder fetch below with the existing pensions
// summary logic/hook used on the current overview page.

import { useEffect, useState } from "react";
import type { WidgetProps } from "@/lib/dashboard/types";
import { WidgetTrendChart } from "./WidgetTrendChart";
import { historicalPoints, projectedPoints, projectionHorizon } from "./widget-series";

export function PensionSummaryWidget({ config, householdId, dashboardContext, viewport }: WidgetProps) {
  const [data, setData] = useState<{ total: number; label: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (config.scope?.kind !== "member" && dashboardContext?.overview) {
      return;
    }
    let cancelled = false;

    const memberId = config.scope?.kind === "member" ? config.scope.memberId : undefined;

    fetch(`/api/pensions/summary?householdId=${householdId}${memberId ? `&memberId=${memberId}` : ""}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [householdId, config.scope, dashboardContext?.overview]);

  const overview = config.scope?.kind !== "member" ? dashboardContext?.overview : undefined;
  const displayData = overview ? { total: overview.pensionValue, label: `${overview.pensionChange >= 0 ? "+" : ""}${new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(overview.pensionChange)} this month` } : data;

  if (loading && !overview) return <div className="widget-skeleton" />;
  if (!displayData) return <div className="widget-empty">No data yet</div>;

  const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
  const immersive = viewport.mode === "immersive";
  const detailed = immersive || viewport.mode === "detailed";
  const horizon = projectionHorizon(config.preferences?.projectionMonths, viewport);
  const annualGrowth = config.preferences?.assumedAnnualGrowth ?? 5;
  const monthlyGrowth = Math.pow(1 + annualGrowth / 100, 1 / 12) - 1;
  const points = [...historicalPoints(dashboardContext?.positionHistory ?? [], "pensionValue", viewport.historyMonths), { label: "Today", value: displayData.total, kind: "today" as const }];
  if (config.preferences?.showProjection !== false) points.push(...projectedPoints(displayData.total, horizon, (_index, value) => value * (1 + monthlyGrowth) + (overview?.pensionMonthlyContribution ?? 0)));

  return (
    <div className={`adaptive-value-widget adaptive-value-widget--${viewport.mode}`}>
      <div className="widget-metric__value">
        {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(displayData.total)}
      </div>
      <div className="widget-metric__label">{displayData.label}</div>
      {detailed && overview ? <div className="adaptive-value-widget__breakdown"><span><small>Monthly contribution</small><strong>{money.format(overview.pensionMonthlyContribution)}</strong></span><span><small>Projection assumption</small><strong>{annualGrowth}% p.a.</strong></span></div> : null}
      {immersive ? <WidgetTrendChart points={points} format={(value) => money.format(value)} area={config.preferences?.chartStyle !== "line"} /> : null}
    </div>
  );
}
