"use client";

import { CarFront, Flag, Gift, GraduationCap, House, PiggyBank, Plane, ShieldCheck, Wrench } from "lucide-react";
import { PiggyPotVisual } from "@/components/savings/PiggyPotVisual";

const icons = {
  holiday: Plane,
  emergency: ShieldCheck,
  house: House,
  car: CarFront,
  education: GraduationCap,
  christmas: Gift,
  repairs: Wrench,
  other: PiggyBank,
} as const;

export function SavingsGoalVisual({
  goalType,
  referenceImageUrl,
  progress,
  thisMonthProgress,
  score,
  compact = false,
}: {
  goalType?: string | null;
  referenceImageUrl?: string | null;
  progress: number;
  thisMonthProgress?: number;
  score?: number | null;
  compact?: boolean;
}) {
  const key = String(goalType || "other").toLowerCase() as keyof typeof icons;
  const Icon = icons[key] || PiggyBank;
  if (!referenceImageUrl && key === "other") return <PiggyPotVisual progress={progress} thisMonthProgress={thisMonthProgress} score={score} compact={compact} />;

  const total = Math.max(0, Math.min(100, progress));
  const month = Math.max(0, Math.min(total, Number(thisMonthProgress || 0)));
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-slate-100 bg-gradient-to-br from-white via-slate-50 to-emerald-50 p-4">
      <div className={compact ? "h-28" : "h-44"}>
        {referenceImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={referenceImageUrl} alt="Savings goal inspiration" className="h-full w-full rounded-3xl object-cover opacity-80" />
        ) : (
          <div className="grid h-full place-items-center text-slate-300"><Icon className={compact ? "h-20 w-20" : "h-32 w-32"} strokeWidth={1.35} /></div>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-full overflow-hidden rounded-[2rem]" aria-hidden="true">
        <div className="absolute inset-x-0 bottom-0 bg-emerald-300/35 backdrop-saturate-150" style={{ height: `${total}%` }} />
        {month > 0 ? <div className="absolute inset-x-0 bg-orange-300/70" style={{ bottom: `${Math.max(0, total - month)}%`, height: `${month}%` }} /> : null}
      </div>
      <div className="pointer-events-none absolute inset-0 grid place-items-center"><span className="rounded-full bg-white/90 px-4 py-2 text-lg font-black text-slate-950 shadow-sm">{Math.round(total)}%</span></div>
      {key === "holiday" && !referenceImageUrl ? <Flag className="absolute right-5 top-5 h-6 w-6 text-orange-500" /> : null}
      {score != null ? <span className={`absolute left-5 top-5 rounded-full px-3 py-1 text-xs font-black ${score >= 80 ? "bg-emerald-100 text-emerald-800" : score >= 55 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"}`} title="On-track score: red is behind plan, amber needs review, green is on track.">{Math.round(score)}/100</span> : null}
    </div>
  );
}
