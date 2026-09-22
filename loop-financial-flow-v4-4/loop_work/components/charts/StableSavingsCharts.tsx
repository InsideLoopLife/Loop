"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format/money";

type TrendPoint = {
  label: string;
  recorded?: number | null;
  projected?: number | null;
};

type MovementPoint = {
  month: string;
  saved: number;
  interest: number;
  withdrawn: number;
  estimatedInterest?: number;
};

function n(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function pointsFor(values: Array<number | null>, width: number, height: number, min: number, max: number) {
  const px = 36;
  const py = 26;
  const range = Math.max(1, max - min);
  return values.map((value, index) => {
    if (value == null || !Number.isFinite(value)) return null;
    const x = values.length <= 1 ? width / 2 : px + (index / (values.length - 1)) * (width - px * 2);
    const y = height - py - ((value - min) / range) * (height - py * 2);
    return { x, y, value, index };
  });
}

function pathFor(points: Array<{ x: number; y: number; index: number } | null>) {
  let last = -2;
  let path = "";
  for (const point of points) {
    if (!point) {
      last = -2;
      continue;
    }
    path += `${point.index === last + 1 ? " L" : " M"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    last = point.index;
  }
  return path.trim();
}

function LegendChip({
  label,
  kind,
}: {
  label: string;
  kind: "recorded" | "projected" | "estimated" | "gap";
}) {
  const appearance = {
    recorded: "border-slate-200 bg-white text-slate-700",
    projected: "border-emerald-200 bg-emerald-50 text-emerald-700",
    estimated: "border-sky-200 bg-sky-50 text-sky-700",
    gap: "border-dashed border-slate-300 bg-slate-50 text-slate-500",
  }[kind];
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${appearance}`}>{label}</span>;
}

export function SavingsAllocationDonut({
  earmarked,
  unassigned,
  total,
}: {
  earmarked: number;
  unassigned: number;
  total: number;
}) {
  const a = Math.max(0, n(earmarked));
  const u = Math.max(0, n(unassigned));
  const sum = a + u;
  const pct = sum > 0 ? (a / sum) * 100 : 0;

  return (
    <div className="flex min-h-56 flex-col items-center justify-center">
      <div
        className="grid h-44 w-44 place-items-center rounded-full"
        style={{ background: sum ? `conic-gradient(#8b5cf6 0 ${pct}%, #10b981 ${pct}% 100%)` : "#e2e8f0" }}
        role="img"
        aria-label={`${formatMoney(a)} earmarked to pots and ${formatMoney(u)} unassigned`}
      >
        <div className="grid h-28 w-28 place-items-center rounded-full bg-white text-center shadow-inner">
          <div>
            <p className="text-xl font-black text-slate-950">{formatMoney(total)}</p>
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Tracked savings</p>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-3 text-xs font-bold text-slate-600">
        {a > 0 ? <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" />Pots {formatMoney(a)}</span> : null}
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Unassigned {formatMoney(u)}</span>
      </div>
    </div>
  );
}

export function SavingsTrendSvg({ data }: { data: TrendPoint[] }) {
  const width = 760;
  const height = 260;
  const [hover, setHover] = useState<number | null>(null);

  const values = data.flatMap((point) =>
    [point.recorded, point.projected].filter((value): value is number => value != null && Number.isFinite(value)),
  );

  const firstProjected = data.findIndex((point) => point.projected != null && point.recorded == null);
  const hasGap = data.some((point) => point.recorded == null && point.projected == null);

  if (!values.length) {
    return (
      <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-slate-200 text-center text-sm font-bold text-slate-400">
        No recorded savings balance history yet.<br />LOOP will not invent a line between missing months.
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const recorded = pointsFor(data.map((point) => point.recorded ?? null), width, height, min, max);
  const projected = pointsFor(data.map((point) => point.projected ?? null), width, height, min, max);
  const active = hover == null ? null : data[hover];

  const projectionBoundaryX = firstProjected > 0 && data.length > 1
    ? 36 + (firstProjected / (data.length - 1)) * (width - 72)
    : null;

  const markerPoints = useMemo(
    () => pointsFor(data.map((row) => row.recorded ?? row.projected ?? null), width, height, min, max),
    [data, min, max],
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <LegendChip kind="recorded" label="Recorded ledger balance" />
        <LegendChip kind="projected" label="Projected from current plan" />
        {hasGap ? <LegendChip kind="gap" label="Gap = no recorded evidence" /> : null}
      </div>
      <div className="relative h-64 w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none" onMouseLeave={() => setHover(null)} role="img" aria-label="Recorded and projected savings balance">
          {projectionBoundaryX != null ? (
            <rect x={projectionBoundaryX} y="0" width={width - projectionBoundaryX} height={height} fill="rgba(16,185,129,.045)" />
          ) : null}
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line key={ratio} x1="36" x2={width - 36} y1={26 + (height - 52) * ratio} y2={26 + (height - 52) * ratio} stroke="#e2e8f0" strokeDasharray="4 7" />
          ))}
          {projectionBoundaryX != null ? (
            <line x1={projectionBoundaryX} x2={projectionBoundaryX} y1="18" y2={height - 18} stroke="#10b981" strokeDasharray="3 6" opacity=".7" />
          ) : null}
          <path d={pathFor(recorded)} fill="none" stroke="#0f172a" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          <path d={pathFor(projected)} fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray="8 6" vectorEffect="non-scaling-stroke" />
          {data.map((point, index) => {
            const marker = markerPoints[index];
            if (!marker) return null;
            const isRecorded = point.recorded != null;
            return (
              <circle
                key={`${point.label}-${index}`}
                cx={marker.x}
                cy={marker.y}
                r={hover === index ? 6 : isRecorded ? 4 : 3}
                fill={isRecorded ? "#0f172a" : "white"}
                stroke={isRecorded ? "#0f172a" : "#10b981"}
                strokeWidth={isRecorded ? 1 : 2.5}
                onMouseEnter={() => setHover(index)}
              >
                <title>{`${point.label} · ${isRecorded ? "Recorded" : "Projected"} · ${formatMoney(Number(point.recorded ?? point.projected ?? 0))}`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="absolute inset-x-2 bottom-0 flex justify-between text-[10px] font-bold text-slate-400">
          <span>{data[0]?.label}</span><span>{data[data.length - 1]?.label}</span>
        </div>
        {active ? (
          <div className="absolute right-3 top-3 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-bold shadow-lg">
            <p className="font-black text-slate-950">{active.label}</p>
            {active.recorded != null ? <p>Recorded ledger balance {formatMoney(active.recorded)}</p> : null}
            {active.projected != null && active.recorded == null ? <p className="text-emerald-700">Projection {formatMoney(active.projected)}</p> : null}
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-[10px] font-bold text-slate-400">
        Solid points are observed ledger balances. Outlined/dashed values are projections; missing evidence remains a visible break.
      </p>
    </div>
  );
}

export function SavingsMovementSvg({ data }: { data: MovementPoint[] }) {
  const width = 920;
  const height = 285;
  const series = [
    { key: "saved" as const, label: "Saved · recorded", colour: "#10b981", dashed: false },
    { key: "interest" as const, label: "Interest · recorded", colour: "#3b82f6", dashed: false },
    { key: "estimatedInterest" as const, label: "Interest · estimated", colour: "#38bdf8", dashed: true },
    { key: "withdrawn" as const, label: "Withdrawn · recorded", colour: "#f97316", dashed: false },
  ];
  const max = Math.max(
    1,
    ...data.flatMap((point) => [
      n(point.saved),
      n(point.interest),
      n(point.estimatedInterest),
      n(point.withdrawn),
    ]),
  );

  if (!data.some((point) => point.saved || point.interest || point.estimatedInterest || point.withdrawn)) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm font-semibold text-slate-500">
        No recorded account movements yet. LOOP will keep this empty rather than backfilling an invented activity line.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        <LegendChip kind="recorded" label="Deposits / withdrawals / paid interest = recorded" />
        {data.some((point) => n(point.estimatedInterest) > 0) ? <LegendChip kind="estimated" label="Dashed interest = estimate" /> : null}
      </div>
      <div className="h-72 w-full">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Savings movement history">
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line key={ratio} x1="36" x2={width - 36} y1={26 + (height - 52) * ratio} y2={26 + (height - 52) * ratio} stroke="#e2e8f0" strokeDasharray="4 7" />
          ))}
          {series.map((item) => {
            const pts = pointsFor(data.map((point) => n(point[item.key])), width, height, 0, max);
            return (
              <g key={item.key}>
                <path d={pathFor(pts)} fill="none" stroke={item.colour} strokeWidth={item.key === "saved" ? "3" : "2.5"} strokeDasharray={item.dashed ? "7 6" : undefined} vectorEffect="non-scaling-stroke" />
                {pts.map((point, index) => point && point.value > 0 ? (
                  <circle key={index} cx={point.x} cy={point.y} r="3" fill={item.dashed ? "white" : item.colour} stroke={item.colour} strokeWidth={item.dashed ? "2" : "1"}>
                    <title>{`${data[index]?.month} · ${item.label} · ${formatMoney(point.value)}`}</title>
                  </circle>
                ) : null)}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
