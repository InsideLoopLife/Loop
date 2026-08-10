"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/format/money";

export type SavingsMovementPoint = { month: string; saved: number; interest: number; withdrawn: number };

function monthLabel(value: string) {
  const date = new Date(`${value}-01T12:00:00`);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" }).format(date) : value;
}

const labels: Record<string, string> = { saved: "Saved", interest: "Interest", withdrawn: "Withdrawn" };

export function SavingsMovementChart({ data }: { data: SavingsMovementPoint[] }) {
  if (!data.some((point) => point.saved || point.interest || point.withdrawn)) {
    return <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm font-semibold text-slate-500">Your saved, withdrawn and interest lines will appear after the first account movement.</div>;
  }
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 5" />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={monthLabel} minTickGap={28} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(value) => `£${Math.round(Number(value) / 100) * 100}`} width={58} />
          <Tooltip cursor={{ stroke: "#cbd5e1", strokeDasharray: "4 4" }} contentStyle={{ border: "1px solid #e2e8f0", borderRadius: 16, boxShadow: "0 16px 40px rgba(15,23,42,.12)" }} formatter={(value, name) => [formatMoney(Number(value)), labels[String(name)] || String(name)]} labelFormatter={(label) => monthLabel(String(label))} />
          <Line type="monotone" dataKey="withdrawn" stroke="#f97316" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="interest" stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="saved" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
