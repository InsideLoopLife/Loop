// components/dashboard/widgets/NetWorthWidget.tsx
"use client";

// This is the reference widget — every other widget follows this exact shape:
// 1. Read `scope` out of config to know who to query for.
// 2. Fetch/derive data (ideally from a shared query cache so a Pension widget
//    scoped to "Dan" and one scoped to "Partner" aren't duplicating instrument
//    or provider lookups).
// 3. Render. No knowledge of the grid, drag state, or other widgets.

import { useEffect, useState } from "react";
import type { WidgetProps } from "@/lib/dashboard/types";
// TODO: point this at whatever net-worth calculation already backs the
// current overview page — this is almost certainly a straight extraction,
// not new logic.
// import { getNetWorthSummary } from "@/lib/investments/net-worth";

interface NetWorthData {
  total: number;
  changePercent: number;
  currency: string;
}

export function NetWorthWidget({ config, householdId, dashboardContext }: WidgetProps) {
  const [data, setData] = useState<NetWorthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (config.scope?.kind !== "member" && dashboardContext?.overview) {
      return;
    }
    let cancelled = false;

    const memberId = config.scope?.kind === "member" ? config.scope.memberId : undefined;

    // Placeholder fetch — swap for the real net worth query/hook.
    fetch(
      `/api/investments/net-worth?householdId=${householdId}${memberId ? `&memberId=${memberId}` : ""}`
    )
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
  const displayData = overview
    ? { total: overview.netWorth, changePercent: 0, currency: "GBP" }
    : data;

  if (loading && !overview) {
    return <div className="widget-skeleton" />;
  }

  if (!displayData) {
    return <div className="widget-empty">No data yet</div>;
  }

  const isPositive = displayData.changePercent >= 0;

  return (
    <div>
      <div className="widget-metric__value">
        {new Intl.NumberFormat("en-GB", { style: "currency", currency: displayData.currency }).format(
          displayData.total
        )}
      </div>
      {overview ? (
        <div className="widget-metric__label">Assets {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(overview.assets)} · liabilities {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(overview.liabilities)}</div>
      ) : (
        <div className={`widget-metric__change ${isPositive ? "positive" : "negative"}`}>
          {isPositive ? "+" : ""}{displayData.changePercent.toFixed(1)}% this month
        </div>
      )}
    </div>
  );
}
