// components/dashboard/widgets/CashflowWidget.tsx
"use client";

// Tier behaviour:
// - compact  -> pie (a row of bars is illegible at 1x1)
// - default  -> bar chart (matches the current overview Sankey-lite view)
// - expanded -> full Sankey (swap in the real component)
//
// TODO: import the real Sankey component for the expanded tier, e.g.:
// import { CashflowSankey } from "@/components/investments/CashflowSankey";

import type { WidgetProps } from "@/lib/dashboard/types";

const SEGMENTS = [
  { label: "Spending", value: 45, color: "var(--c-coral-400, #D85A30)" },
  { label: "Savings", value: 30, color: "var(--c-teal-400, #1D9E75)" },
  { label: "Investments", value: 20, color: "var(--c-purple-400, #7F77DD)" },
  { label: "Other", value: 5, color: "var(--c-blue-400, #378ADD)" },
];

export function CashflowWidget({ size, dashboardContext }: WidgetProps) {
  const overview = dashboardContext?.overview;
  const segments = overview && overview.income > 0 ? [
    { label: "Spending", value: Math.max(0, (overview.outgoings / overview.income) * 100), color: "var(--c-coral-400, #D85A30)" },
    { label: "Savings", value: Math.max(0, (overview.savings / overview.income) * 100), color: "var(--c-teal-400, #1D9E75)" },
    { label: "Left over", value: Math.max(0, (overview.leftOver / overview.income) * 100), color: "var(--c-purple-400, #7F77DD)" },
  ] : SEGMENTS;
  if (size.tier === "compact") {
    return <CashflowPie segments={segments} />;
  }
  if (size.tier === "expanded") {
    return (
      <div className="widget-cashflow widget-cashflow--expanded">
        <CashflowBars segments={segments} />
        <div className="widget-cashflow__legend">
          {segments.map((segment) => (
            <span key={segment.label}><i style={{ background: segment.color }} />{segment.label}<strong>{Math.round(segment.value)}%</strong></span>
          ))}
        </div>
      </div>
    );
  }
  return <CashflowBars segments={segments} />;
}

function CashflowBars({ segments }: { segments: typeof SEGMENTS }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 44 }}>
      {segments.map((s) => (
        <div
          key={s.label}
          title={`${s.label}: ${s.value}%`}
          style={{
            flex: 1,
            background: s.color,
            height: `${s.value * 1.8}%`,
            borderRadius: "4px 4px 0 0",
          }}
        />
      ))}
    </div>
  );
}

function CashflowPie({ segments }: { segments: typeof SEGMENTS }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const stops = segments.map((segment, index) => {
    const start = segments.slice(0, index).reduce((sum, item) => sum + (item.value / total) * 100, 0);
    const end = start + (segment.value / total) * 100;
    return `${segment.color} ${start}% ${end}%`;
  }).join(", ");

  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: "50%",
        background: `conic-gradient(${stops})`,
        margin: "0 auto",
      }}
      role="img"
      aria-label="Cashflow split by category"
    />
  );
}
