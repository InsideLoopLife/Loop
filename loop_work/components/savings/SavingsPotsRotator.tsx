"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/format/money";

type PotGoal = {
  id: string;
  label: string;
  balance: number;
  target: number;
  remaining: number;
  progress: number;
  monthlyGap: number;
  timeLabel: string;
  href?: string;
};

export function SavingsPotsRotator({ goals }: { goals: PotGoal[] }) {
  const rows = useMemo(() => goals.filter((goal) => goal.target > 0), [goals]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (rows.length <= 1) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % rows.length), 5_000);
    return () => window.clearInterval(timer);
  }, [rows.length]);

  if (!rows.length) {
    return (
      <Link href="/accounts?tab=pots" className="block rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Pots</p>
        <p className="mt-2 text-3xl font-black text-slate-950">Set one</p>
        <p className="mt-1 text-sm font-bold text-slate-500">Create holiday, emergency or house pots</p>
      </Link>
    );
  }

  const active = rows[index % rows.length];
  const totalTarget = rows.reduce((sum, goal) => sum + goal.target, 0);
  const totalBalance = rows.reduce((sum, goal) => sum + Math.min(goal.balance, goal.target), 0);
  const overall = totalTarget > 0 ? Math.round((totalBalance / totalTarget) * 100) : 0;

  return (
    <Link href="/accounts?tab=pots" className="block rounded-[1.75rem] border border-white/70 bg-white/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">{rows.length} saving pot{rows.length === 1 ? "" : "s"}</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{overall}%</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">rotates</span>
      </div>
      <div className="mt-4 rounded-2xl bg-slate-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-black text-slate-950">{active.label}</p>
          <p className="text-sm font-black text-slate-950">{Math.round(active.progress)}%</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-orange-400" style={{ width: `${Math.max(3, Math.min(100, Math.round(active.progress)))}%` }} />
        </div>
        <p className="mt-2 text-xs font-bold text-slate-500">{formatMoney(active.remaining)} left · {active.timeLabel}{active.monthlyGap > 0 ? ` · ${formatMoney(active.monthlyGap)}/mo gap` : ""}</p>
      </div>
    </Link>
  );
}
