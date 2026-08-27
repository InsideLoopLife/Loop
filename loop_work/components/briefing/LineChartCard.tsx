"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import type { BriefingLineChart } from "@/lib/briefing/projections";
import { formatMoney } from "@/lib/format/money";

export function LineChartCard({ chart }: { chart: BriefingLineChart }) {
  return (
    <article className="rounded-[2rem] border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-3">
        <TrendingUp className="text-indigo-600" />
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-slate-400">Projection</p>
          <h2 className="text-xl font-black leading-tight">{chart.title}</h2>
        </div>
      </div>
      <p className="mt-2 text-sm font-bold text-slate-600">{chart.subtitle}</p>
      <div className="mt-4 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart.points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="x" tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }} tickFormatter={(v) => `Yr ${v}`} />
            <YAxis tick={{ fontSize: 11, fontWeight: 700, fill: "#94a3b8" }} tickFormatter={(v) => formatMoney(v)} width={72} />
            <Tooltip
              formatter={(value) => [formatMoney(Number(value) || 0), chart.yLabel]}
              labelFormatter={(v) => `Year ${v}`}
              contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, fontWeight: 700 }}
            />
            <Line type="monotone" dataKey="y" stroke="#6366f1" strokeWidth={3} dot={{ r: 3, fill: "#6366f1" }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-400">{chart.note}</p>
    </article>
  );
}
