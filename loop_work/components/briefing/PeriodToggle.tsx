"use client";

import type { BriefingPeriod } from "@/lib/briefing/build-financial-briefing";

const OPTIONS: { key: BriefingPeriod; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

export function PeriodToggle({ value, onChange }: { value: BriefingPeriod; onChange: (p: BriefingPeriod) => void }) {
  return (
    <div className="inline-flex rounded-full border border-white/15 bg-white/5 p-1">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-black uppercase tracking-wide transition ${
            value === opt.key ? "bg-white text-slate-950 shadow" : "text-slate-300 hover:text-white"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
