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

export function CashflowWidget({ size }: WidgetProps) {
  if (size.tier === "compact") {
    return <CashflowPie />;
  }
  if (size.tier === "expanded") {
    return (
      <div className="widget-cashflow widget-cashflow--expanded">
        {/* <CashflowSankey householdId={householdId} /> */}
        <div className="widget-empty">Wire up full CashflowSankey here</div>
      </div>
    );
  }
  return <CashflowBars />;
}

function CashflowBars() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 44 }}>
      {SEGMENTS.map((s) => (
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

function CashflowPie() {
  let cumulative = 0;
  const stops = SEGMENTS.map((s) => {
    const start = cumulative;
    cumulative += s.value;
    return `${s.color} ${start}% ${cumulative}%`;
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
