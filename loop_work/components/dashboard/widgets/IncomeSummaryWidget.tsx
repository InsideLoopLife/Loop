// components/dashboard/widgets/IncomeSummaryWidget.tsx
"use client";

// Tier behaviour:
// - compact  -> total only
// - default  -> total
// - expanded -> total + source breakdown (salary / dividends / other, etc.)
//
// TODO: swap the placeholder fetch for the real income summary query/hook.

import { useEffect, useState } from "react";
import type { WidgetProps } from "@/lib/dashboard/types";
import { WidgetTrendChart } from "./WidgetTrendChart";

interface IncomeSource {
  label: string;
  amount: number;
}

interface IncomeData {
  total: number;
  sources: IncomeSource[];
}

export function IncomeSummaryWidget({ config, householdId, dashboardContext, viewport }: WidgetProps) {
  const [data, setData] = useState<IncomeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (config.scope?.kind !== "member" && dashboardContext?.overview) {
      return;
    }
    let cancelled = false;
    const memberId = config.scope?.kind === "member" ? config.scope.memberId : undefined;

    fetch(`/api/income/summary?householdId=${householdId}${memberId ? `&memberId=${memberId}` : ""}`)
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
  const displayData = overview ? { total: overview.income, sources: [] } : data;

  if (loading && !overview) return <div className="widget-skeleton" />;
  if (!displayData) return <div className="widget-empty">No data yet</div>;

  const currency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

  return (
    <div className={`adaptive-value-widget adaptive-value-widget--${viewport.mode}`}>
      <div className="widget-metric__value">{currency.format(displayData.total)}</div>
      <div className="widget-metric__label">This month</div>

      {viewport.mode !== "summary" && displayData.sources.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {displayData.sources.map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>{s.label}</span>
              <span>{currency.format(s.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {viewport.mode === "immersive" && dashboardContext?.calendar ? <WidgetTrendChart points={dashboardContext.calendar.months.map((month) => ({ label: month.label.slice(0, 3), value: month.income, kind: month.month === dashboardContext.calendar?.selectedMonth ? "today" : "actual" }))} format={(value) => currency.format(value)} /> : null}
    </div>
  );
}
