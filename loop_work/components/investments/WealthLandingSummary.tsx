"use client";

import { ArrowRight, Landmark, LineChart, Target } from "lucide-react";
import { formatMoney } from "@/lib/format/money";
import type { RetirementPlanProjection } from "@/lib/calculations/retirement";

type SourceLine = {
  id: string;
  label: string;
  value: number;
};

type Props = {
  pensionTotal: number;
  pensionSources: SourceLine[];
  investmentTotal: number;
  investmentSources: SourceLine[];
  retirementProjection?: RetirementPlanProjection | null;
  retirementAge?: number | null;
  targetAnnualIncome?: number | null;
  onOpenPensions: () => void;
  onOpenInvestments: () => void;
  onOpenRetirement: () => void;
};

function TopSources({ items }: { items: SourceLine[] }) {
  if (!items.length) {
    return (
      <p className="mt-5 text-sm font-semibold text-slate-400">
        Add an account to build this summary.
      </p>
    );
  }

  return (
    <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
      {items.slice(0, 3).map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-4 text-sm">
          <span className="min-w-0 truncate font-semibold text-slate-500">{item.label}</span>
          <span className="shrink-0 font-black text-slate-700">{formatMoney(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

function CardShell({
  eyebrow,
  icon,
  children,
  onClick,
}: {
  eyebrow: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[350px] w-full flex-col rounded-[2rem] border border-slate-200/80 bg-white p-6 text-left shadow-[0_24px_70px_-48px_rgba(15,23,42,.45)] transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_28px_80px_-46px_rgba(15,23,42,.55)]"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white">
            {icon}
          </span>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
            {eyebrow}
          </p>
        </div>
        <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-slate-700" />
      </div>
      {children}
    </button>
  );
}

export function WealthLandingSummary({
  pensionTotal,
  pensionSources,
  investmentTotal,
  investmentSources,
  retirementProjection,
  retirementAge,
  targetAnnualIncome,
  onOpenPensions,
  onOpenInvestments,
  onOpenRetirement,
}: Props) {
  const retirementReady = Boolean(retirementProjection);
  const projectedPot =
    retirementProjection?.projectedRetirementAssetsTodayMoney ?? null;
  const sustainableIncome =
    retirementProjection?.projectedAnnualIncomeTodayMoney ?? null;
  const annualGap =
    retirementProjection?.annualIncomeGapTodayMoney ?? null;
  const isOnTrack = retirementProjection?.status === "on_track";

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
          Pensions & investments
        </p>
        <h1 className="text-3xl font-black tracking-tight text-slate-950">
          Your long-term money, at a glance
        </h1>
        <p className="max-w-3xl text-sm font-semibold leading-6 text-slate-500">
          Open any area for the full detail. Retirement planning uses your pension and
          investment values to show where your current path could take you.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <CardShell eyebrow="Pension" icon={<Landmark className="h-5 w-5" />} onClick={onOpenPensions}>
          <div className="flex flex-1 flex-col">
            <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
              <p className="text-sm font-bold text-slate-400">Current pension value</p>
              <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">
                {formatMoney(pensionTotal)}
              </p>
            </div>
            <TopSources items={pensionSources} />
          </div>
        </CardShell>

        <CardShell eyebrow="Investments" icon={<LineChart className="h-5 w-5" />} onClick={onOpenInvestments}>
          <div className="flex flex-1 flex-col">
            <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
              <p className="text-sm font-bold text-slate-400">Current investment value</p>
              <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">
                {formatMoney(investmentTotal)}
              </p>
            </div>
            <TopSources items={investmentSources} />
          </div>
        </CardShell>

        <CardShell eyebrow="Retirement planning" icon={<Target className="h-5 w-5" />} onClick={onOpenRetirement}>
          {retirementReady ? (
            <div className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
                <p className="text-sm font-bold text-slate-400">
                  Projected value at {retirementAge ?? retirementProjection?.retirementAge}
                </p>
                <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">
                  {formatMoney(projectedPot ?? 0)}
                </p>
                <p className="mt-2 text-xs font-bold text-slate-400">
                  In today&apos;s money
                </p>
              </div>

              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                    Estimated sustainable annual income
                  </p>
                  <p className="mt-1 text-xl font-black text-slate-800">
                    {formatMoney(sustainableIncome ?? 0)} / year
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">
                    Modelled using the selected withdrawal assumption; not guaranteed to
                    prevent the pot falling in adverse markets.
                  </p>
                </div>

                <div className={`rounded-2xl px-4 py-3 ${isOnTrack ? "bg-emerald-50" : "bg-amber-50"}`}>
                  <p className={`text-xs font-black uppercase tracking-wide ${isOnTrack ? "text-emerald-700" : "text-amber-700"}`}>
                    {isOnTrack ? "On track" : "Gap to target"}
                  </p>
                  <p className={`mt-1 text-lg font-black ${isOnTrack ? "text-emerald-800" : "text-amber-800"}`}>
                    {isOnTrack
                      ? `Target ${formatMoney(targetAnnualIncome ?? retirementProjection?.targetAnnualIncome ?? 0)} / year`
                      : `${formatMoney(annualGap ?? 0)} / year short`}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
              <p className="text-2xl font-black text-slate-950">Set your retirement goal</p>
              <p className="mt-3 max-w-xs text-sm font-semibold leading-6 text-slate-500">
                Choose the age you want to retire and the yearly income you want LOOP to
                work towards.
              </p>
              <span className="mt-6 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">
                Build my plan
              </span>
            </div>
          )}
        </CardShell>
      </div>
    </section>
  );
}
