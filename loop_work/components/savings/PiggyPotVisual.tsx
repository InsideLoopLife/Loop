"use client";

import { useId } from "react";

function clamp(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function scoreColour(score: number) {
  const clean = clamp(score);
  // 0 = red, 50 = amber, 100 = green.
  const hue = Math.round((clean / 100) * 128);
  return `hsl(${hue} 72% 40%)`;
}

export function PiggyPotVisual({
  progress,
  thisMonthProgress = 0,
  score,
  compact = false,
}: {
  progress: number;
  thisMonthProgress?: number;
  score?: number | null;
  compact?: boolean;
}) {
  const id = useId().replaceAll(":", "");
  const total = clamp(progress);
  const monthLayer = Math.min(total, clamp(thisMonthProgress));
  const previous = Math.max(0, total - monthLayer);
  const height = 188;
  const totalY = height * (1 - total / 100);
  const previousY = height * (1 - previous / 100);
  const scoreValue = score == null ? null : Math.round(clamp(score));

  return (
    <div className="relative">
      <svg viewBox="0 0 340 220" role="img" aria-label={`Savings pot ${Math.round(total)}% full`} className={compact ? "h-36 w-full" : "h-52 w-full"}>
        <defs>
          <clipPath id={`pig-${id}`}>
            <ellipse cx="155" cy="120" rx="104" ry="66" />
            <circle cx="248" cy="112" r="48" />
            <ellipse cx="296" cy="126" rx="28" ry="22" />
            <path d="M219 72 L229 35 L253 72 Z" />
            <rect x="92" y="166" width="30" height="34" rx="10" />
            <rect x="190" y="166" width="30" height="34" rx="10" />
          </clipPath>
          <linearGradient id={`previous-${id}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.82" />
            <stop offset="100%" stopColor="#bbf7d0" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id={`month-${id}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#fb923c" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#fed7aa" stopOpacity="0.98" />
          </linearGradient>
        </defs>

        <g clipPath={`url(#pig-${id})`}>
          <rect x="35" y={previousY + 16} width="295" height={220 - previousY} fill={`url(#previous-${id})`} />
          {monthLayer > 0 ? <rect x="35" y={totalY + 16} width="295" height={Math.max(4, previousY - totalY)} fill={`url(#month-${id})`} /> : null}
          {total > 0 ? <line x1="40" x2="325" y1={totalY + 16} y2={totalY + 16} stroke="#f97316" strokeWidth="3" opacity="0.8" /> : null}
        </g>

        <g fill="none" stroke="#94a3b8" strokeWidth="2.5" opacity="0.55">
          <ellipse cx="155" cy="120" rx="104" ry="66" />
          <circle cx="248" cy="112" r="48" />
          <ellipse cx="296" cy="126" rx="28" ry="22" />
          <path d="M219 72 L229 35 L253 72 Z" />
          <rect x="92" y="166" width="30" height="34" rx="10" />
          <rect x="190" y="166" width="30" height="34" rx="10" />
          <path d="M50 108 C23 92 24 69 47 68 C62 67 67 80 58 90" />
        </g>
        <circle cx="261" cy="103" r="4.5" fill="#334155" />
        <ellipse cx="298" cy="126" rx="10" ry="7" fill="none" stroke="#64748b" strokeWidth="2" />
        <rect x="118" y="53" width="72" height="10" rx="5" fill="#94a3b8" opacity="0.6" />
        <text x="158" y="132" textAnchor="middle" className="fill-slate-950 text-[24px] font-black">{Math.round(total)}%</text>
      </svg>
      {scoreValue != null ? (
        <div
          title={`On-track score ${scoreValue}/100. Red means materially behind target, amber means close/review, and green means on track.`}
          className="absolute right-2 top-2 grid h-14 w-14 place-items-center rounded-full border-4 bg-white text-sm font-black shadow-sm"
          style={{ borderColor: scoreColour(scoreValue), color: scoreColour(scoreValue) }}
        >
          {scoreValue}
        </div>
      ) : null}
    </div>
  );
}
