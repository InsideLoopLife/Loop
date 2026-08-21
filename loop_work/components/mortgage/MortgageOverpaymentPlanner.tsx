"use client";

import { useMemo, useState } from "react";
import { calculateMonthlyMortgagePayment } from "@/lib/calculations/mortgage";
import { getMortgageTermPosition } from "@/lib/calculations/mortgage-term";
import { formatMoney } from "@/lib/format/money";
import type { HomeMortgageDeal } from "@/components/mortgage/MortgagePlannerClient";

type Props = {
  deal?: HomeMortgageDeal | null;
  currentBalance: number;
  currentPayment: number;
  benchmarkRate?: number | null;
};

function monthsTo(date?: string | null) {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  const now = new Date();

  if (Number.isNaN(target.getTime()) || target <= now) return 0;

  let months =
    (target.getFullYear() - now.getFullYear()) * 12 +
    target.getMonth() -
    now.getMonth();

  if (target.getDate() < now.getDate()) months -= 1;
  return Math.max(0, months);
}

function simulate(
  balance0: number,
  currentRate: number,
  futureRate: number,
  switchMonth: number | null,
  currentPayment: number,
  targetPayment: number,
  termMonths: number,
) {
  let balance = Math.max(0, balance0);
  let interest = 0;
  let paid = 0;
  let month = 0;
  let contractual = currentPayment;

  while (balance > 0.01 && month < termMonths + 120) {
    const switched = switchMonth !== null && month >= switchMonth;

    if (switchMonth !== null && month === switchMonth) {
      contractual = calculateMonthlyMortgagePayment({
        balance,
        annualInterestRate: futureRate,
        termYears: Math.max(1, termMonths - month) / 12,
      });
    }

    const rate = (switched ? futureRate : currentRate) / 100 / 12;
    const monthInterest = balance * Math.max(0, rate);
    interest += monthInterest;

    const payment = Math.max(contractual, targetPayment);
    const actual = Math.min(balance + monthInterest, payment);

    balance = Math.max(0, balance + monthInterest - actual);
    paid += actual;
    month += 1;

    if (payment <= monthInterest) break;
  }

  return { months: month, interest, paid };
}

function futureValue(monthly: number, annual: number, months: number) {
  if (monthly <= 0 || months <= 0) return 0;
  const rate = annual / 100 / 12;
  return rate === 0
    ? monthly * months
    : monthly * ((Math.pow(1 + rate, months) - 1) / rate);
}

function duration(months: number) {
  const years = Math.floor(months / 12);
  const remainder = months % 12;

  if (!years) return `${remainder}m`;
  return `${years}y${remainder ? ` ${remainder}m` : ""}`;
}

export function MortgageOverpaymentPlanner({
  deal,
  currentBalance,
  currentPayment,
  benchmarkRate,
}: Props) {
  const termPosition = getMortgageTermPosition(deal);
  const termMonths = termPosition.remainingMonths;
  const currentRate = Number(deal?.interest_rate || 0);
  const switchMonth = monthsTo(deal?.initial_period_end);

  const [monthly, setMonthly] = useState(
    Math.max(Math.round(currentPayment + 200), Math.round(currentPayment)),
  );
  const [futureRate, setFutureRate] = useState(
    Number(benchmarkRate || 0) || Math.max(currentRate, 4.5),
  );
  const [alternativeReturn, setAlternativeReturn] = useState(5);

  const result = useMemo(() => {
    const baseline = simulate(
      currentBalance,
      currentRate,
      futureRate,
      switchMonth,
      currentPayment,
      currentPayment,
      termMonths,
    );
    const overpay = simulate(
      currentBalance,
      currentRate,
      futureRate,
      switchMonth,
      currentPayment,
      monthly,
      termMonths,
    );
    const extra = Math.max(0, monthly - currentPayment);

    return {
      baseline,
      overpay,
      extra,
      interestSaved: Math.max(0, baseline.interest - overpay.interest),
      monthsSaved: Math.max(0, baseline.months - overpay.months),
      alternativeValue: futureValue(extra, alternativeReturn, baseline.months),
    };
  }, [
    alternativeReturn,
    currentBalance,
    currentPayment,
    currentRate,
    futureRate,
    monthly,
    switchMonth,
    termMonths,
  ]);

  return (
    <div className="space-y-5">
      {termPosition.estimated ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          <strong>Mortgage term estimated.</strong> {termPosition.note} You can
          correct the mortgage start date from Edit mortgage if needed.
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            "Current payment",
            `${formatMoney(currentPayment)}/mo`,
            `${currentRate.toFixed(2)}% today`,
          ],
          [
            "Remaining mortgage",
            duration(termMonths),
            termPosition.estimated
              ? "Estimated from the most reliable deal dates"
              : "Counts down from mortgage start",
          ],
          [
            "Baseline interest",
            formatMoney(result.baseline.interest),
            `Assumes ${futureRate.toFixed(2)}% after current deal`,
          ],
          [
            "Potential interest saved",
            formatMoney(result.interestSaved),
            `${duration(result.monthsSaved)} earlier mortgage-free`,
          ],
        ].map(([label, value, help], index) => (
          <article
            key={label}
            className={`rounded-2xl border p-5 shadow-sm ${
              index === 3
                ? "border-emerald-200 bg-emerald-50/70"
                : "border-slate-200 bg-white"
            }`}
          >
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{help}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Build your monthly plan</h2>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-bold text-slate-600">
                What would you like to pay monthly?
              </span>
              <div className="mt-1 flex rounded-xl border border-slate-200 px-3">
                <span className="py-3 font-bold text-slate-400">£</span>
                <input
                  type="number"
                  min={Math.ceil(currentPayment)}
                  step="10"
                  value={monthly}
                  onChange={(event) =>
                    setMonthly(Number(event.target.value || 0))
                  }
                  className="w-full px-2 py-3 text-lg font-bold outline-none"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Extra: {formatMoney(result.extra)}/month
              </p>
            </label>

            <label className="block">
              <span className="text-xs font-bold text-slate-600">
                Assumed rate after current deal
              </span>
              <div className="mt-1 flex rounded-xl border border-slate-200 px-3">
                <input
                  type="number"
                  step="0.05"
                  value={futureRate}
                  onChange={(event) =>
                    setFutureRate(Number(event.target.value || 0))
                  }
                  className="w-full py-3 text-lg font-bold outline-none"
                />
                <span className="py-3 font-bold text-slate-400">%</span>
              </div>
            </label>

            <label className="block">
              <span className="text-xs font-bold text-slate-600">
                Alternative investment return assumption
              </span>
              <div className="mt-1 flex rounded-xl border border-slate-200 px-3">
                <input
                  type="number"
                  step="0.25"
                  value={alternativeReturn}
                  onChange={(event) =>
                    setAlternativeReturn(Number(event.target.value || 0))
                  }
                  className="w-full py-3 text-lg font-bold outline-none"
                />
                <span className="py-3 font-bold text-slate-400">%</span>
              </div>
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-violet-700">
            Opportunity cost
          </p>
          <h2 className="mt-2 text-2xl font-bold">
            Overpaying is a return — but not the only use of the cash.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            An overpayment gives a comparatively predictable benefit through
            mortgage interest avoided. Savings and investments may produce a
            higher return, but returns, tax, fees, access to the money and risk
            all matter.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-white p-4">
              <p className="text-[10px] font-bold uppercase text-slate-400">
                Interest avoided
              </p>
              <p className="mt-1 text-2xl font-bold">
                {formatMoney(result.interestSaved)}
              </p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <p className="text-[10px] font-bold uppercase text-slate-400">
                Invest monthly difference
              </p>
              <p className="mt-1 text-2xl font-bold">
                {formatMoney(result.alternativeValue)}
              </p>
              <p className="text-[11px] text-slate-500">
                Illustrative value by baseline mortgage end
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-200">
            Start with the mortgage rate as the hurdle rate, then compare
            alternatives after tax/fees and account for liquidity, emergency
            cash, ISA/pension allowances and investment risk.
          </div>

          <p className="mt-4 text-[11px] leading-5 text-slate-400">
            Illustration only, not a recommendation. Check lender overpayment
            limits and early-repayment charges before acting.
          </p>
        </div>
      </section>
    </div>
  );
}
