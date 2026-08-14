// components/dashboard/widgets/InvestmentSummaryWidget.tsx
"use client";

// Tier behaviour:
// - compact  -> total value only
// - default  -> total + top movers list (current implementation from the last batch)
// - expanded -> adds a per-unit price chart alongside the list
//
// TODO: swap the placeholder fetch and chart for the real holdings query and
// the existing asset-detail chart component (per-unit price, not portfolio
// value — you already fixed that jump-on-new-lot issue, keep using that logic).

import { useEffect, useState } from "react";
import type { WidgetProps } from "@/lib/dashboard/types";

interface Holding {
  name: string;
  changePercent: number;
}

interface InvestmentData {
  total: number;
  holdings: Holding[];
}

export function InvestmentSummaryWidget({ config, householdId, size }: WidgetProps) {
  const [data, setData] = useState<InvestmentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const memberId = config.scope?.kind === "member" ? config.scope.memberId : undefined;

    fetch(
      `/api/investments/summary?householdId=${householdId}${memberId ? `&memberId=${memberId}` : ""}`
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

  if (loading) return <div className="widget-skeleton" />;
  if (!data) return <div className="widget-empty">No data yet</div>;

  const currency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

  return (
    <div>
      <div className="widget-metric__value">{currency.format(data.total)}</div>

      {size.tier === "compact" ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {data.holdings.slice(0, size.tier === "expanded" ? 6 : 3).map((h) => (
            <div key={h.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>{h.name}</span>
              <span style={{ color: h.changePercent >= 0 ? "var(--text-success)" : "var(--text-danger)" }}>
                {h.changePercent >= 0 ? "+" : ""}
                {h.changePercent.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {size.tier === "expanded" && (
        <div style={{ marginTop: 12, height: 80 }}>
          {/* TODO: real per-unit price chart, e.g. <AssetPriceChart ... /> */}
          <div className="widget-empty">Price chart goes here</div>
        </div>
      )}
    </div>
  );
}
