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

export function NetWorthWidget({ config, householdId }: WidgetProps) {
  const [data, setData] = useState<NetWorthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

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
  }, [householdId, config.scope]);

  if (loading) {
    return <div className="widget-skeleton" />;
  }

  if (!data) {
    return <div className="widget-empty">No data yet</div>;
  }

  const isPositive = data.changePercent >= 0;

  return (
    <div>
      <div className="widget-metric__value">
        {new Intl.NumberFormat("en-GB", { style: "currency", currency: data.currency }).format(
          data.total
        )}
      </div>
      <div className={`widget-metric__change ${isPositive ? "positive" : "negative"}`}>
        {isPositive ? "+" : ""}
        {data.changePercent.toFixed(1)}% this month
      </div>
    </div>
  );
}
