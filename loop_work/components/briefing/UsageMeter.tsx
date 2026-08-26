"use client";

import { Sparkles } from "lucide-react";

export type ChatBudget = { usedToday: number; dailyLimit: number | null; tierKey: string } | null;

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  plus: "Plus",
  premium: "Premium",
  pro: "Pro",
  staff: "Staff",
};

export function UsageMeter({ budget }: { budget: ChatBudget }) {
  if (!budget) {
    return (
      <div className="flex h-[38px] w-40 animate-pulse items-center rounded-full border border-slate-200 bg-slate-50" />
    );
  }

  const unlimited = budget.dailyLimit == null;
  const dailyLimit = budget.dailyLimit ?? 0;
  const percent = unlimited ? 100 : Math.min(100, Math.round((budget.usedToday / Math.max(1, dailyLimit)) * 100));
  const nearLimit = !unlimited && budget.usedToday >= dailyLimit;
  const tierLabel = TIER_LABELS[budget.tierKey] || budget.tierKey;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
        <Sparkles className={`h-3.5 w-3.5 ${nearLimit ? "text-rose-500" : "text-indigo-500"}`} />
        <span className="text-xs font-black text-slate-700">
          {budget.usedToday}
          {!unlimited && <span className="text-slate-400">/{budget.dailyLimit}</span>}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">today · {tierLabel}</span>
      </div>
      {!unlimited && (
        <div className="h-1 w-32 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full transition-all ${nearLimit ? "bg-rose-400" : "bg-indigo-400"}`} style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}
