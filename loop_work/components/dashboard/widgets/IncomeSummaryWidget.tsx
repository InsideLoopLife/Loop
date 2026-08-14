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

interface IncomeSource {
  label: string;
  amount: number;
}

interface IncomeData {
  total: number;
  sources: IncomeSource[];
}

export function IncomeSummaryWidget({ config, householdId, size }: WidgetProps) {
  const [data, setData] = useState<IncomeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
  }, [householdId, config.scope]);

  if (loading) return <div className="widget-skeleton" />;
  if (!data) return <div className="widget-empty">No data yet</div>;

  const currency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

  return (
    <div>
      <div className="widget-metric__value">{currency.format(data.total)}</div>
      <div className="widget-metric__label">This month</div>

      {size.tier === "expanded" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {data.sources.map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>{s.label}</span>
              <span>{currency.format(s.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
