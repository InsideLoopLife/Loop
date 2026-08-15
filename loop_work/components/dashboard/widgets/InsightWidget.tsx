import Link from "next/link";
import { ArrowRight, DatabaseZap } from "lucide-react";
import type { WidgetInsightData, WidgetProps } from "@/lib/dashboard/types";
import { WidgetTrendChart } from "./WidgetTrendChart";

function clamp(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function InsightContent({ data, viewport }: { data: WidgetInsightData; viewport: WidgetProps["viewport"] }) {
  const detailed = viewport.mode === "detailed" || viewport.mode === "immersive";
  const standard = viewport.mode !== "summary";
  const trend = data.trend?.map((point, index, points) => ({ ...point, kind: index === points.length - 1 ? "today" as const : "actual" as const })) ?? [];
  const maximumSegment = Math.max(1, ...(data.segments?.map((segment) => Math.max(0, segment.value)) ?? [1]));

  return (
    <div className={`insight-widget insight-widget--${viewport.mode}`}>
      <div className="insight-widget__metric-row">
        <strong className="widget-metric__value">{data.value}</strong>
        {data.status && data.status !== "neutral" ? <span className={`insight-widget__status insight-widget__status--${data.status}`} /> : null}
      </div>
      <p className="widget-metric__label">{data.delta}</p>

      {data.empty ? (
        <div className="insight-widget__empty"><DatabaseZap aria-hidden="true" /><span>{data.emptyMessage || "Add more information to unlock this view."}</span></div>
      ) : null}

      {!data.empty && typeof data.progress === "number" ? (
        <div className="insight-widget__progress" aria-label={`${Math.round(clamp(data.progress))}%`}><span style={{ width: `${clamp(data.progress)}%` }} /></div>
      ) : null}

      {!data.empty && standard && trend.length > 1 ? (
        <WidgetTrendChart points={trend} format={(value) => new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(value)} area />
      ) : null}

      {!data.empty && standard && data.segments?.length ? (
        <div className="insight-widget__segments" aria-label="Breakdown">
          {data.segments.map((segment, index) => <span key={`${segment.label}-${index}`} title={`${segment.label}: ${segment.value}`} style={{ width: `${(Math.max(0, segment.value) / maximumSegment) * 100}%` }} />)}
        </div>
      ) : null}

      {!data.empty && standard && data.attention ? (
        <div className="insight-widget__attention"><strong>{data.attention.title}</strong><span>{data.attention.body}</span></div>
      ) : null}

      {!data.empty && detailed && data.rows?.length ? (
        <div className="insight-widget__rows">
          {data.rows.slice(0, viewport.mode === "immersive" ? 5 : 3).map((row, index) => <div key={`${row.label}-${index}`}><span>{row.label}</span><strong>{row.value}</strong></div>)}
        </div>
      ) : null}

      <div className="insight-widget__foot">
        <span title={data.source}>{data.source}</span>
        {data.href ? <Link href={data.href}>Open <ArrowRight aria-hidden="true" /></Link> : null}
      </div>
    </div>
  );
}

export function createInsightWidget(type: string) {
  function InsightWidget({ dashboardContext, viewport }: WidgetProps) {
    const data = dashboardContext?.insights?.[type];
    if (!data) return <div className="widget-empty">This view needs more LOOP data.</div>;
    return <InsightContent data={data} viewport={viewport} />;
  }
  InsightWidget.displayName = `InsightWidget(${type})`;
  return InsightWidget;
}
