"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import type { BriefingSeriesPoint } from "@/lib/briefing/build-financial-briefing";
import { formatMoney } from "@/lib/format/money";

type SeriesKey = keyof Omit<BriefingSeriesPoint, "date">;

const WINDOW_DAYS: Record<"day" | "week" | "month", number> = { day: 2, week: 7, month: 30 };

/**
 * Generic sparkline for any category column in the briefing series
 * (netWorth, investments, savings, pensions, propertyEquity). Adding a new
 * chartable category anywhere in the story is just passing a different
 * `dataKey` — this component doesn't need to change.
 */
export function StorySparkline({
  series,
  dataKey,
  period,
  color,
  height = 64,
}: {
  series: BriefingSeriesPoint[];
  dataKey: SeriesKey;
  period: "day" | "week" | "month";
  color: string;
  height?: number;
}) {
  const windowDays = WINDOW_DAYS[period];
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const points = series.filter((p) => p.date >= cutoffStr);
  const data = (points.length >= 2 ? points : series).map((p) => ({ date: p.date, value: p[dataKey] }));

  const gradientId = `spark-${dataKey}-${period}`;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as { date: string; value: number };
              return (
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-lg">
                  {formatMoney(point.value)}
                  <span className="ml-1.5 font-semibold text-slate-400">
                    {new Date(point.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill={`url(#${gradientId})`} isAnimationActive dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
