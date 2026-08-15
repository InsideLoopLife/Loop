// components/dashboard/widgets/SpendingSummaryWidget.tsx
"use client";

// Same pattern as NetWorthWidget.tsx — fetch scoped by config.scope, render.
// TODO: replace the placeholder fetch below with the existing spending
// summary logic/hook used on the current overview page.

import { useEffect, useState } from "react";
import type { WidgetProps } from "@/lib/dashboard/types";
import { WidgetTrendChart } from "./WidgetTrendChart";

export function SpendingSummaryWidget({ config, householdId, dashboardContext, viewport }: WidgetProps) {
  const [data, setData] = useState<{ total: number; label: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (config.scope?.kind !== "member" && dashboardContext?.overview) {
      return;
    }
    let cancelled = false;

    const memberId = config.scope?.kind === "member" ? config.scope.memberId : undefined;

    fetch(`/api/spending/summary?householdId=${householdId}${memberId ? `&memberId=${memberId}` : ""}`)
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
  const displayData = overview ? { total: overview.outgoings, label: "Committed this month" } : data;

  if (loading && !overview) return <div className="widget-skeleton" />;
  if (!displayData) return <div className="widget-empty">No data yet</div>;

  return (
    <div className={`adaptive-value-widget adaptive-value-widget--${viewport.mode}`}>
      <div className="widget-metric__value">
        {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(displayData.total)}
      </div>
      <div className="widget-metric__label">{displayData.label}</div>
      {(viewport.mode === "detailed" || viewport.mode === "immersive") && overview ? <div className="adaptive-value-widget__breakdown"><span><small>Share of income</small><strong>{overview.income > 0 ? Math.round((overview.outgoings / overview.income) * 100) : 0}%</strong></span><span><small>After spending</small><strong>{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(overview.income - overview.outgoings)}</strong></span></div> : null}
      {(viewport.mode === "detailed" || viewport.mode === "immersive") && dashboardContext?.calendar ? <WidgetTrendChart points={dashboardContext.calendar.months.map((month) => ({ label: month.label.slice(0, 3), value: month.outgoings, kind: month.month === dashboardContext.calendar?.selectedMonth ? "today" : "actual" }))} format={(value) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value)} area={false} /> : null}
    </div>
  );
}
