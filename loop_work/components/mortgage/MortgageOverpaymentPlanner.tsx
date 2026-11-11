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
  const extraPerMonth = Math.max(0, targetPayment - currentPayment);

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

    // The overpayment is an amount on top of whatever the lender asks for.
    // When the deal ends the lender resets the contractual payment (lower,
    // because the balance is lower), and the extra carries on. Before, the
    // target was a fixed total, so once the new rate pushed the contractual
    // payment above it the overpayment silently stopped (£200/month showed
    // just £1,143 saved and "0m earlier").
    const payment = contractual + extraPerMonth;
    const actual = Math.min(balance + monthInterest, payment);

    balance = Math.max(0, balance + monthInterest - actual);
    paid += actual;
    month += 1;

    if (payment <= monthInterest) break;
  }

  return { months: month, interest, paid };
}

/** The lender's payment each month on the normal schedule (it resets when the deal ends). */
function baselinePayments(balance0: number, currentRate: number, futureRate: number, switchMonth: number | null, currentPayment: number, termMonths: number) {
  const payments: number[] = [];
  let balance = Math.max(0, balance0);
  let contractual = currentPayment;
  for (let month = 0; balance > 0.01 && month < termMonths + 120; month++) {
    if (switchMonth !== null && month === switchMonth) {
      contractual = calculateMonthlyMortgagePayment({ balance, annualInterestRate: futureRate, termYears: Math.max(1, termMonths - month) / 12 });
    }
    const rate = ((switchMonth !== null && month >= switchMonth ? futureRate : currentRate) / 100) / 12;
    const interest = balance * rate;
    const pay = Math.min(balance + interest, contractual);
    balance = Math.max(0, balance + interest - pay);
    payments.push(pay);
    if (contractual <= interest) break;
  }
  return payments;
}

/**
 * Two ways to use the same extra each month, compared on the date the
 * mortgage would normally end. Both plans pay out exactly the same each month.
 * Overpay: the extra goes on the mortgage; once it's cleared, the whole
 * monthly amount is invested. Invest: the mortgage runs as normal and the
 * extra is invested from now.
 */
function compare(balance0: number, currentRate: number, futureRate: number, switchMonth: number | null, currentPayment: number, extra: number, termMonths: number, investReturn: number) {
  const schedule = baselinePayments(balance0, currentRate, futureRate, switchMonth, currentPayment, termMonths);
  const horizon = schedule.length;
  const growth = investReturn / 100 / 12;
  let balance = Math.max(0, balance0);
  let interestOverpay = 0;
  let clearedAt = horizon;
  let potOverpay = 0;
  let potInvest = 0;
  let interestBaseline = 0;
  let baseBalance = Math.max(0, balance0);
  for (let month = 0; month < horizon; month++) {
    const rate = ((switchMonth !== null && month >= switchMonth ? futureRate : currentRate) / 100) / 12;
    const outgoing = schedule[month] + extra;
    // Overpay plan
    potOverpay *= 1 + growth;
    if (balance > 0.01) {
      const interest = balance * rate;
      interestOverpay += interest;
      const pay = Math.min(balance + interest, outgoing);
      balance = Math.max(0, balance + interest - pay);
      potOverpay += outgoing - pay;
      if (balance <= 0.01 && clearedAt === horizon) clearedAt = month + 1;
    } else {
      potOverpay += outgoing;
    }
    // Invest plan
    const baseInterest = baseBalance * rate;
    interestBaseline += baseInterest;
    baseBalance = Math.max(0, baseBalance + baseInterest - schedule[month]);
    potInvest = potInvest * (1 + growth) + extra;
  }
  return { horizon, clearedAt, interestBaseline, interestOverpay, potOverpay, potInvest };
}

/** The investment return at which both plans come out level. */
function breakEvenReturn(args: Parameters<typeof compare>) {
  let lo = 0;
  let hi = 20;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const r = compare(...(args.slice(0, 7) as [number, number, number, number | null, number, number, number]), mid);
    if (r.potInvest > r.potOverpay) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

function monthLabel(monthsFromNow: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsFromNow);
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
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

    const versus = compare(currentBalance, currentRate, futureRate, switchMonth, currentPayment, extra, termMonths, alternativeReturn);
    const breakEven = extra > 0 ? breakEvenReturn([currentBalance, currentRate, futureRate, switchMonth, currentPayment, extra, termMonths, alternativeReturn]) : null;
    return {
      baseline,
      overpay,
      extra,
      versus,
      breakEven,
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

  const v = result.versus;
  const interestSaved = Math.max(0, v.interestBaseline - v.interestOverpay);
  const monthsSaved = Math.max(0, v.horizon - v.clearedAt);
  const gap = v.potOverpay - v.potInvest;
  const overpayWins = gap >= 0;
  const endDate = monthLabel(v.horizon);
  const freeDate = monthLabel(v.clearedAt);
  const pct = (n: number) => `${Number(n.toFixed(2))}%`;
  const noSpin = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

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
          ["You pay now", `${formatMoney(currentPayment)}/mo`, `At ${pct(currentRate)} on your current deal`],
          ["Mortgage-free on today's plan", endDate, `${duration(v.horizon)} to go`],
          ["Interest on today's plan", formatMoney(v.interestBaseline), `If rates are ${pct(futureRate)} after your deal`],
          ["Overpaying saves", formatMoney(interestSaved), result.extra > 0 ? `and you're mortgage-free ${duration(monthsSaved)} sooner` : "Add an extra amount to see"],
        ].map(([label, value, help], index) => (
          <article key={label} className={`rounded-2xl border p-5 shadow-sm ${index === 3 ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-white"}`}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{help}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Your plan</h2>
          <div className="mt-5 space-y-5">
            <label className="block">
              <span className="text-xs font-bold text-slate-600">What would you like to pay each month?</span>
              <div className="mt-1 flex items-center rounded-xl border border-slate-200 px-3">
                <span className="font-bold text-slate-400">£</span>
                <input type="number" min={Math.ceil(currentPayment)} step="10" value={monthly} onChange={(event) => setMonthly(Number(event.target.value || 0))} className={`w-full px-1.5 py-3 text-lg font-bold outline-none ${noSpin}`} />
                <span className="shrink-0 text-sm font-semibold text-slate-400">a month</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {result.extra > 0 ? <>That&apos;s <strong className="text-slate-800">{formatMoney(result.extra)} a month</strong> on top of your {formatMoney(currentPayment)} payment.</> : <>Enter more than your {formatMoney(currentPayment)} payment to see the difference.</>}
              </p>
              {switchMonth && switchMonth > 0 && result.extra > 0 ? (
                result.extra * 12 > currentBalance * 0.1 ? (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    That&apos;s {formatMoney(result.extra * 12)} a year, over the usual 10% allowance ({formatMoney(currentBalance * 0.1)}) while your fixed deal runs. Going over it can mean an early repayment charge, so check with your lender.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">Within the 10% a year ({formatMoney(currentBalance * 0.1)}) most fixed deals let you overpay without a charge.</p>
                )
              ) : null}
            </label>

            <label className="block">
              <span className="text-xs font-bold text-slate-600">Mortgage rate after your deal ends</span>
              <div className="mt-1 flex items-center rounded-xl border border-slate-200 px-3">
                <input type="number" step="0.05" value={futureRate} onChange={(event) => setFutureRate(Number(event.target.value || 0))} className={`w-20 py-3 text-lg font-bold outline-none ${noSpin}`} />
                <span className="text-lg font-bold text-slate-500">%</span>
                <span className="ml-auto text-xs text-slate-400">from this week&apos;s best deal</span>
              </div>
            </label>

            <label className="block">
              <span className="text-xs font-bold text-slate-600">If you invested instead, what would it earn a year?</span>
              <div className="mt-1 flex items-center rounded-xl border border-slate-200 px-3">
                <input type="number" step="0.25" value={alternativeReturn} onChange={(event) => setAlternativeReturn(Number(event.target.value || 0))} className={`w-20 py-3 text-lg font-bold outline-none ${noSpin}`} />
                <span className="text-lg font-bold text-slate-500">%</span>
                <span className="ml-auto text-xs text-slate-400">after fees, in an ISA</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[[3.5, "Cash savings"], [5, "Balanced fund"], [7, "Global shares"]].map(([value, label]) => (
                  <button key={label} type="button" onClick={() => setAlternativeReturn(Number(value))} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${alternativeReturn === value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {label} {value}%
                  </button>
                ))}
              </div>
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-violet-700">Overpay or invest?</p>
          <h2 className="mt-1 text-xl font-bold">What to do with {result.extra > 0 ? `the extra ${formatMoney(result.extra)} a month` : "spare money each month"}</h2>
          <p className="mt-1 text-sm text-slate-500">Both options cost you the same each month. They&apos;re compared in {endDate}, when your mortgage would normally end.</p>

          {result.extra > 0 ? (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className={`rounded-xl border p-4 ${overpayWins ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                  <p className="text-sm font-bold text-slate-900">Overpay the mortgage</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                    <li>Mortgage-free in <strong className="text-slate-900">{freeDate}</strong>, {duration(monthsSaved)} sooner</li>
                    <li>Saves <strong className="text-slate-900">{formatMoney(interestSaved)}</strong> in interest</li>
                    <li>Then invest the whole {formatMoney(currentPayment + result.extra)} a month</li>
                  </ul>
                  <p className="mt-3 text-[11px] font-bold uppercase text-slate-400">Worth by {endDate}</p>
                  <p className="text-2xl font-bold text-slate-950">{formatMoney(v.potOverpay)}</p>
                </div>
                <div className={`rounded-xl border p-4 ${!overpayWins ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                  <p className="text-sm font-bold text-slate-900">Invest it at {pct(alternativeReturn)}</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                    <li>Mortgage-free in <strong className="text-slate-900">{endDate}</strong>, as now</li>
                    <li>Pay <strong className="text-slate-900">{formatMoney(v.interestBaseline)}</strong> in interest</li>
                    <li>Invest {formatMoney(result.extra)} a month from now</li>
                  </ul>
                  <p className="mt-3 text-[11px] font-bold uppercase text-slate-400">Worth by {endDate}</p>
                  <p className="text-2xl font-bold text-slate-950">{formatMoney(v.potInvest)}</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-slate-950 p-4 text-white">
                <p className="text-lg font-bold">
                  {Math.abs(gap) < 500 ? "It's roughly even." : overpayWins ? `Overpaying leaves you ${formatMoney(gap)} better off.` : `Investing leaves you ${formatMoney(-gap)} better off.`}
                </p>
                {result.breakEven != null ? (
                  <p className="mt-1 text-sm text-slate-300">
                    Investing only comes out ahead if it earns more than <strong className="text-white">{pct(Math.round(result.breakEven * 10) / 10)}</strong> a year after fees and tax. Your mortgage costs {pct(currentRate)} now and {pct(futureRate)} after your deal{alternativeReturn > result.breakEven ? ", and investments can fall as well as rise" : ""}.
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Set a monthly amount above your current payment to compare the two.</p>
          )}

          <p className="mt-3 text-[11px] leading-5 text-slate-400">
            An illustration, not advice. It assumes steady returns; real investments go up and down, money in the mortgage is hard to get back, and keep an emergency fund first. Check your lender&apos;s overpayment limits and early repayment charges.
          </p>
        </div>
      </section>
    </div>
  );
}
