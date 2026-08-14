// components/dashboard/widgets/PensionSummaryWidget.tsx
"use client";

// Same pattern as NetWorthWidget.tsx — fetch scoped by config.scope, render.
// TODO: replace the placeholder fetch below with the existing pensions
// summary logic/hook used on the current overview page.

import { useEffect, useState } from "react";
import type { WidgetProps } from "@/lib/dashboard/types";

export function PensionSummaryWidget({ config, householdId }: WidgetProps) {
  const [data, setData] = useState<{ total: number; label: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

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
  }, [householdId, config.scope]);

  if (loading) return <div className="widget-skeleton" />;
  if (!data) return <div className="widget-empty">No data yet</div>;

  return (
    <div>
      <div className="widget-metric__value">
        {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(data.total)}
      </div>
      <div className="widget-metric__label">{data.label}</div>
    </div>
  );
}
