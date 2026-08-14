"use client";

import { useState } from "react";

export interface TrendPoint { label: string; value: number; kind?: "actual" | "today" | "forecast" }

export function WidgetTrendChart({ points, format, area = true }: { points: TrendPoint[]; format: (value: number) => string; area?: boolean }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (points.length < 2) return <div className="widget-chart-empty">History starts as snapshots are recorded</div>;
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const spread = Math.max(1, max - min);
  const xy = points.map((point, index) => ({ x: (index / (points.length - 1)) * 600, y: 150 - ((point.value - min) / spread) * 120 }));
  const todayIndex = Math.max(0, points.findIndex((point) => point.kind === "today"));
  const actual = xy.slice(0, todayIndex + 1).map((point) => `${point.x},${point.y}`).join(" ");
  const forecast = xy.slice(todayIndex).map((point) => `${point.x},${point.y}`).join(" ");
  const active = hovered === null ? null : { ...points[hovered], ...xy[hovered] };

  return <div className="widget-trend-chart" onPointerLeave={() => setHovered(null)} onPointerMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setHovered(Math.max(0, Math.min(points.length - 1, Math.round(((event.clientX - rect.left) / rect.width) * (points.length - 1))))); }}>
    <svg viewBox="0 0 600 170" preserveAspectRatio="none" aria-label="Value over time">
      <defs><linearGradient id="widgetTrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#19b990" stopOpacity=".28"/><stop offset="1" stopColor="#19b990" stopOpacity="0"/></linearGradient></defs>
      {area ? <polygon points={`0,160 ${xy.map((point) => `${point.x},${point.y}`).join(" ")} 600,160`} fill="url(#widgetTrendFill)" /> : null}
      <polyline points={actual} fill="none" stroke="#19b990" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {forecast.split(" ").length > 1 ? <polyline points={forecast} fill="none" stroke="#7657ff" strokeWidth="4" strokeDasharray="10 10" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {active ? <><line x1={active.x} y1="10" x2={active.x} y2="160" stroke="#64748b" strokeDasharray="3 6"/><circle cx={active.x} cy={active.y} r="7" fill="#fff" stroke="#07142d" strokeWidth="4"/></> : null}
    </svg>
    {active ? <div className="widget-trend-chart__tooltip" style={{ left: `${(active.x / 600) * 100}%` }}><strong>{format(active.value)}</strong><span>{active.label}{active.kind === "forecast" ? " · projected" : ""}</span></div> : null}
    <div className="widget-trend-chart__labels"><span>{points[0].label}</span><span>Today</span><span>{points.at(-1)?.label}</span></div>
  </div>;
}
