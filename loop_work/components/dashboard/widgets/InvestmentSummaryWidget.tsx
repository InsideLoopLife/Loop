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
import { WidgetTrendChart } from "./WidgetTrendChart";
import { historicalPoints, projectedPoints, projectionHorizon } from "./widget-series";

interface Holding {
  name: string;
  changePercent: number;
}

interface InvestmentData {
  total: number;
  holdings: Holding[];
}

export function InvestmentSummaryWidget({ config, householdId, size, dashboardContext, viewport }: WidgetProps) {
  const [data, setData] = useState<InvestmentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (config.scope?.kind !== "member" && dashboardContext?.overview) {
      return;
    }
    let cancelled = false;
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
  }, [householdId, config.scope, dashboardContext?.overview]);

  const overview = config.scope?.kind !== "member" ? dashboardContext?.overview : undefined;
  const displayData = overview ? { total: overview.investmentValue, holdings: [] } : data;

  if (loading && !overview) return <div className="widget-skeleton" />;
  if (!displayData) return <div className="widget-empty">No data yet</div>;

  const currency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
  const compactCurrency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
  const chartVisible = viewport.mode === "detailed" || viewport.mode === "immersive";
  const horizon = projectionHorizon(config.preferences?.projectionMonths, viewport);
  const points = [...historicalPoints(dashboardContext?.positionHistory ?? [], "investmentValue", viewport.historyMonths), { label: "Today", value: displayData.total, kind: "today" as const }];
  if (config.preferences?.showProjection === true && overview) points.push(...projectedPoints(displayData.total, horizon, (_index, value) => value + overview.investmentChange));

  return (
    <div className={`adaptive-value-widget adaptive-value-widget--${viewport.mode}`}>
      <div className="widget-metric__value">{currency.format(displayData.total)}</div>

      {overview ? <div className="widget-metric__label">{overview.investmentChange >= 0 ? "+" : ""}{currency.format(overview.investmentChange)} this month</div> : null}

      {viewport.mode === "summary" ? null : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {displayData.holdings.slice(0, size.tier === "expanded" ? 6 : 3).map((h) => (
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

      {chartVisible ? <WidgetTrendChart points={points} format={(value) => compactCurrency.format(value)} area={config.preferences?.chartStyle !== "line"} /> : null}

      {size.tier === "expanded" && !overview && !chartVisible && (
        <div style={{ marginTop: 12, height: 80 }}>
          {/* TODO: real per-unit price chart, e.g. <AssetPriceChart ... /> */}
          <div className="widget-empty">Price chart goes here</div>
        </div>
      )}
    </div>
  );
}
