"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import {
  calculateRetirementPlan,
  type RetirementAsset,
  type RetirementContribution,
} from "@/lib/calculations/retirement";
import { formatMoney } from "@/lib/format/money";

type Props = {
  assets: RetirementAsset[];
  contributions?: RetirementContribution[];
  initialCurrentAge?: number;
  initialRetirementAge?: number;
  initialTargetAnnualIncome?: number;
  initialGrowthPercent?: number;
  initialInflationPercent?: number;
  initialWithdrawalPercent?: number;
  guaranteedAnnualIncome?: number;
  onBack: () => void;
};

export function RetirementPlannerPanel({
  assets,
  contributions = [],
  initialCurrentAge = 40,
  initialRetirementAge = 67,
  initialTargetAnnualIncome = 30000,
  initialGrowthPercent = 5,
  initialInflationPercent = 2.5,
  initialWithdrawalPercent = 3.5,
  guaranteedAnnualIncome = 0,
  onBack,
}: Props) {
  const [currentAge, setCurrentAge] = useState(initialCurrentAge);
  const [retirementAge, setRetirementAge] = useState(initialRetirementAge);
  const [targetAnnualIncome, setTargetAnnualIncome] = useState(initialTargetAnnualIncome);
  const [growth, setGrowth] = useState(initialGrowthPercent);
  const [inflation, setInflation] = useState(initialInflationPercent);
  const [withdrawal, setWithdrawal] = useState(initialWithdrawalPercent);

  const projection = useMemo(
    () =>
      calculateRetirementPlan({
        currentAge,
        retirementAge,
        targetAnnualIncome,
        assets,
        contributions,
        guaranteedAnnualIncome,
        annualGrowthRatePercent: growth,
        annualInflationPercent: inflation,
        sustainableWithdrawalRatePercent: withdrawal,
      }),
    [
      currentAge,
      retirementAge,
      targetAnnualIncome,
      assets,
      contributions,
      guaranteedAnnualIncome,
      growth,
      inflation,
      withdrawal,
    ],
  );

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-700"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            Retirement planning
          </p>
          <h1 className="text-3xl font-black text-slate-950">Shape the retirement you want</h1>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-6">
            <label className="block">
              <span className="text-sm font-black text-slate-700">Current age</span>
              <input
                type="number"
                min={18}
                max={90}
                value={currentAge}
                onChange={(e) => setCurrentAge(Number(e.target.value))}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold"
              />
            </label>

            <label className="block">
              <span className="flex items-center justify-between text-sm font-black text-slate-700">
                <span>I want to retire at</span>
                <span>{retirementAge}</span>
              </span>
              <input
                type="range"
                min={Math.max(currentAge, 40)}
                max={80}
                value={retirementAge}
                onChange={(e) => setRetirementAge(Number(e.target.value))}
                className="mt-3 w-full"
              />
            </label>

            <label className="block">
              <span className="text-sm font-black text-slate-700">
                Income I want in retirement
              </span>
              <div className="mt-2 flex items-center rounded-2xl border border-slate-200 px-4">
                <span className="font-black text-slate-400">£</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={targetAnnualIncome}
                  onChange={(e) => setTargetAnnualIncome(Number(e.target.value))}
                  className="w-full border-0 px-2 py-3 font-bold outline-none"
                />
                <span className="text-sm font-bold text-slate-400">/ year</span>
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-400">Shown in today&apos;s money.</p>
            </label>

            <details className="rounded-2xl bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-black text-slate-700">
                Advanced assumptions
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label>
                  <span className="text-xs font-black text-slate-500">Growth</span>
                  <input
                    type="number"
                    step={0.1}
                    value={growth}
                    onChange={(e) => setGrowth(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-bold"
                  />
                </label>
                <label>
                  <span className="text-xs font-black text-slate-500">Inflation</span>
                  <input
                    type="number"
                    step={0.1}
                    value={inflation}
                    onChange={(e) => setInflation(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-bold"
                  />
                </label>
                <label>
                  <span className="text-xs font-black text-slate-500">Withdrawal</span>
                  <input
                    type="number"
                    step={0.1}
                    value={withdrawal}
                    onChange={(e) => setWithdrawal(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-bold"
                  />
                </label>
              </div>
            </details>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-[2rem] bg-slate-950 p-7 text-white">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              Projected at age {retirementAge}
            </p>
            <p className="mt-3 text-5xl font-black tracking-tight">
              {formatMoney(projection.projectedRetirementAssetsTodayMoney)}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-400">In today&apos;s money</p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Estimated sustainable income
                </p>
                <p className="mt-2 text-2xl font-black">
                  {formatMoney(projection.projectedAnnualIncomeTodayMoney)} / year
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Target
                </p>
                <p className="mt-2 text-2xl font-black">{formatMoney(targetAnnualIncome)} / year</p>
              </div>
            </div>
          </div>

          <div className={`rounded-[2rem] p-6 ${projection.status === "on_track" ? "bg-emerald-50" : "bg-amber-50"}`}>
            <p className={`text-xs font-black uppercase tracking-[0.18em] ${projection.status === "on_track" ? "text-emerald-700" : "text-amber-700"}`}>
              {projection.status === "on_track" ? "You are on track" : "Your current gap"}
            </p>
            <p className={`mt-2 text-3xl font-black ${projection.status === "on_track" ? "text-emerald-900" : "text-amber-900"}`}>
              {projection.status === "on_track"
                ? "Target reached"
                : `${formatMoney(projection.annualIncomeGapTodayMoney)} / year`}
            </p>
            {projection.status !== "on_track" && Number.isFinite(projection.requiredAdditionalMonthlyContributionTodayMoney) ? (
              <p className="mt-3 text-sm font-bold leading-6 text-amber-800">
                The model estimates that about{" "}
                <strong>{formatMoney(projection.requiredAdditionalMonthlyContributionTodayMoney)} more per month</strong>{" "}
                could close the gap by age {retirementAge}.
              </p>
            ) : null}
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6">
            <p className="text-sm font-black text-slate-800">What LOOP is using</p>
            <div className="mt-4 space-y-3">
              {projection.assetProjections.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0">
                  <div>
                    <p className="font-black text-slate-700">{asset.label}</p>
                    <p className="text-xs font-semibold text-slate-400">
                      {asset.accessibleAtRetirement ? "Available by retirement" : `Not accessible at ${retirementAge}`}
                    </p>
                  </div>
                  <p className="font-black text-slate-800">
                    {formatMoney(asset.projectedValueAtRetirementTodayMoney)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs font-semibold leading-5 text-slate-400">
            These are planning estimates, not guarantees. Investment returns, inflation, fees,
            tax rules and pension access ages can change.
          </p>
        </div>
      </div>
    </section>
  );
}
