// components/dashboard/widgets/PensionSummaryWidget.tsx
"use client";

// Same pattern as NetWorthWidget.tsx — fetch scoped by config.scope, render.
// TODO: replace the placeholder fetch below with the existing pensions
// summary logic/hook used on the current overview page.

import { useEffect, useState } from "react";
import type { WidgetProps } from "@/lib/dashboard/types";

export function PensionSummaryWidget({ config, householdId, dashboardContext }: WidgetProps) {
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

  return (
    <div>
      <div className="widget-metric__value">
        {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(displayData.total)}
      </div>
      <div className="widget-metric__label">{displayData.label}</div>
    </div>
  );
}
