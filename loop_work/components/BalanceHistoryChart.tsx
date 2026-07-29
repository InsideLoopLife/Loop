"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/format/money";

type Point = {
  date: string;
  balance: number;
  kind?: "actual" | "projected";
};

function dateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" }).format(date);
}

export function BalanceHistoryChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        No balance history yet. Add an opening balance or log the first movement.
      </div>
    );
  }

  const hasKinds = data.some((point) => point.kind);
  const lastActualIndex = hasKinds ? data.reduce((last, point, index) => point.kind !== "projected" ? index : last, -1) : data.length - 1;
  const rows = data.map((point, index) => ({
    ...point,
    actualBalance: !hasKinds || point.kind !== "projected" ? point.balance : null,
    projectedBalance: hasKinds && (point.kind === "projected" || index === lastActualIndex) ? point.balance : null,
  }));
  const today = rows[lastActualIndex]?.date;

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={dateLabel} minTickGap={30} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `£${Math.round(Number(value) / 1000)}k`} width={60} />
          <Tooltip
            formatter={(value, name) => [formatMoney(Number(value)), name === "actualBalance" ? "Recorded balance" : "Projection"]}
            labelFormatter={(label) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${label}T12:00:00`))}
          />
          {hasKinds ? <Legend formatter={(value) => value === "actualBalance" ? "Recorded" : "Projected"} /> : null}
          {today && hasKinds ? <ReferenceLine x={today} strokeDasharray="4 4" label={{ value: "Today", position: "insideTopRight", fontSize: 11 }} /> : null}
          <Line type="monotone" dataKey="actualBalance" connectNulls={false} stroke="#0f172a" strokeWidth={3} dot={false} />
          {hasKinds ? <Line type="monotone" dataKey="projectedBalance" connectNulls={false} stroke="#10b981" strokeWidth={3} strokeDasharray="7 5" dot={false} /> : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
