"use client";

import { useMemo, useState } from "react";
import { addAffordabilityScenario } from "@/app/affordability/actions";
import { formatMoney } from "@/lib/format/money";
import type { HouseAffordabilityScore } from "@/lib/wealth/house-snapshot";

type TemporaryIncomeContext = {
  label: string;
  endDate: string | null;
};

type Props = {
  currentScore: HouseAffordabilityScore;
  normalScore: HouseAffordabilityScore;
  hasTemporaryIncome: boolean;
  temporaryIncomeContext: TemporaryIncomeContext | null;
  currentMonthlyNetIncome: number;
  normalMonthlyNetIncome: number;
  currentGrossHouseholdIncome: number;
  normalGrossHouseholdIncome: number;
  propertyValue: number;
  mortgageBalance: number;
  fixedExMortgage: number;
  childMonthly: number;
  interestRate: number;
  termYears: number;
};

function readableDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function AffordabilityPlanningPanel({
  currentScore,
  normalScore,
  hasTemporaryIncome,
  temporaryIncomeContext,
  currentMonthlyNetIncome,
  normalMonthlyNetIncome,
  currentGrossHouseholdIncome,
  normalGrossHouseholdIncome,
  propertyValue,
  mortgageBalance,
  fixedExMortgage,
  childMonthly,
  interestRate,
  termYears,
}: Props) {
  const [incomeBasis, setIncomeBasis] = useState<"current" | "normal">(
    hasTemporaryIncome ? "current" : "normal",
  );
  const [scenarioGrossIncome, setScenarioGrossIncome] = useState(
    hasTemporaryIncome
      ? currentGrossHouseholdIncome
      : normalGrossHouseholdIncome || currentGrossHouseholdIncome,
  );

  const endLabel = readableDate(temporaryIncomeContext?.endDate ?? null);

  const criteria = useMemo(
    () =>
      currentScore.criteria.map((current) => ({
        current,
        normal:
          normalScore.criteria.find((item) => item.label === current.label) ?? current,
      })),
    [currentScore.criteria, normalScore.criteria],
  );

  function chooseIncomeBasis(next: "current" | "normal") {
    setIncomeBasis(next);
    setScenarioGrossIncome(
      next === "current"
        ? currentGrossHouseholdIncome
        : normalGrossHouseholdIncome,
    );
  }

  return (
    <div className="space-y-5">
      {hasTemporaryIncome ? (
        <section className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-700">
            Temporary income change detected
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            {temporaryIncomeContext?.label || "Temporary household income change"}
            {endLabel ? ` · expected until ${endLabel}` : ""}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            LOOP shows the household as it is now and the underlying position after
            the temporary pay change ends. The second figure is not used when the
            income change has no known end date.
          </p>
        </section>
      ) : null}

      <section className={`grid gap-4 ${hasTemporaryIncome ? "md:grid-cols-2" : ""}`}>
        <div className={`rounded-2xl p-5 ring-1 ${currentScore.tone}`}>
          <p className="text-xs font-bold uppercase">
            {hasTemporaryIncome ? "Right now" : "Current affordability"}
          </p>
          <p className="mt-2 text-5xl font-bold">{currentScore.score}/100</p>
          <p className="mt-1 font-bold">{currentScore.label}</p>
          <p className="mt-2 text-xs opacity-75">
            {formatMoney(currentMonthlyNetIncome)} tracked net household income / month.
          </p>
        </div>

        {hasTemporaryIncome ? (
          <div className={`rounded-2xl p-5 ring-1 ${normalScore.tone}`}>
            <p className="text-xs font-bold uppercase">After temporary change</p>
            <p className="mt-2 text-5xl font-bold">{normalScore.score}/100</p>
            <p className="mt-1 font-bold">{normalScore.label}</p>
            <p className="mt-2 text-xs opacity-75">
              {formatMoney(normalMonthlyNetIncome)} normal tracked net household income / month.
            </p>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-950">What makes up the score?</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Open any measure to see what it means, how LOOP scores it, and what would
            strengthen the household position.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          {criteria.map(({ current, normal }) => (
            <details
              key={current.label}
              className="group rounded-xl border border-slate-100 bg-slate-50/70 open:bg-white"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800">{current.label}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span>
                      {hasTemporaryIncome ? "Now: " : ""}
                      {current.reason}
                    </span>
                    {hasTemporaryIncome && normal.reason !== current.reason ? (
                      <span className="font-semibold text-violet-700">
                        Normal: {normal.reason}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    {current.points}/{current.max}
                  </span>
                  {hasTemporaryIncome && normal.points !== current.points ? (
                    <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700">
                      normal {normal.points}/{normal.max}
                    </span>
                  ) : null}
                  <span className="text-slate-400 transition group-open:rotate-180">⌄</span>
                </div>
              </summary>
              <div className="grid gap-3 border-t border-slate-100 p-3 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">
                    What this means
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {current.explanation}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">
                    How LOOP scores it
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {current.scoring}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">
                    What improves it
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {current.improve}
                  </p>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <form
        action={addAffordabilityScenario}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-lg font-bold">Build a move scenario</h2>
        <p className="mt-1 text-xs text-slate-500">
          Change any prefilled value without changing the original House record.
        </p>

        {hasTemporaryIncome ? (
          <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/40 p-4">
            <p className="text-xs font-bold text-slate-700">Household income basis</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Both positions remain visible. Choose which income position this saved
              scenario should use.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => chooseIncomeBasis("current")}
                className={`rounded-xl border p-3 text-left ${
                  incomeBasis === "current"
                    ? "border-violet-300 bg-white ring-2 ring-violet-100"
                    : "border-slate-200 bg-white/70"
                }`}
              >
                <p className="text-[10px] font-bold uppercase text-slate-400">Right now</p>
                <p className="mt-1 text-lg font-bold text-slate-950">
                  {formatMoney(currentMonthlyNetIncome)}/mo net
                </p>
                <p className="text-[11px] text-slate-500">
                  {formatMoney(currentGrossHouseholdIncome)}/yr tracked gross
                </p>
              </button>
              <button
                type="button"
                onClick={() => chooseIncomeBasis("normal")}
                className={`rounded-xl border p-3 text-left ${
                  incomeBasis === "normal"
                    ? "border-violet-300 bg-white ring-2 ring-violet-100"
                    : "border-slate-200 bg-white/70"
                }`}
              >
                <p className="text-[10px] font-bold uppercase text-slate-400">
                  After temporary change
                </p>
                <p className="mt-1 text-lg font-bold text-slate-950">
                  {formatMoney(normalMonthlyNetIncome)}/mo net
                </p>
                <p className="text-[11px] text-slate-500">
                  {formatMoney(normalGrossHouseholdIncome)}/yr tracked gross
                </p>
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Scenario name</span>
            <input
              name="label"
              type="text"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Target house price</span>
            <input
              name="purchase_price"
              type="number"
              step="0.01"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Additional deposit cash</span>
            <input
              name="deposit_cash"
              type="number"
              step="0.01"
              defaultValue={0}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Current property sale price</span>
            <input
              name="current_property_sale_price"
              type="number"
              step="0.01"
              defaultValue={propertyValue}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Current mortgage balance</span>
            <input
              name="current_mortgage_balance"
              type="number"
              step="0.01"
              defaultValue={mortgageBalance}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">
              Gross household income used in scenario
            </span>
            <input
              name="gross_household_income"
              type="number"
              step="0.01"
              value={scenarioGrossIncome}
              onChange={(event) => setScenarioGrossIncome(Number(event.target.value || 0))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">
              Fixed/debt costs (mortgage excluded)
            </span>
            <input
              name="monthly_fixed_costs"
              type="number"
              step="0.01"
              defaultValue={fixedExMortgage}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Monthly child costs</span>
            <input
              name="monthly_childcare"
              type="number"
              step="0.01"
              defaultValue={childMonthly}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Interest rate %</span>
            <input
              name="interest_rate"
              type="number"
              step="0.01"
              defaultValue={interestRate}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Stress rate %</span>
            <input
              name="stress_rate"
              type="number"
              step="0.01"
              defaultValue={6.5}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Term years</span>
            <input
              name="term_years"
              type="number"
              step="0.01"
              defaultValue={termYears}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Fees / moving costs</span>
            <input
              name="arrangement_and_moving_costs"
              type="number"
              step="0.01"
              defaultValue={3500}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
          </label>
        </div>

        <button className="mt-4 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">
          Save scenario
        </button>
      </form>
    </div>
  );
}
