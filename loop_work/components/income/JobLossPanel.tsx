"use client";

import { useEffect, useMemo, useState } from "react";
import { quietly } from "@/components/feedback/quiet-action";
import { isLoopError } from "@/lib/actions/friendly";
import { loadJobLossContext } from "@/app/income/job-actions";
import { estimateRedundancy, type WorkRegion } from "@/lib/employment/redundancy";
import { jobLossScenario } from "@/lib/planning/job-loss";
import { enhancedFor, payForJob, type SafetyNetJob, type SafetyNetPay, type SafetyNetPerson } from "@/components/income/RedundancySafetyNet";

const gbp = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Math.round(value));
const monthName = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

function lastDayOf(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export type JobLossForecastMonth = { month: string; leftOver: number; payByPerson: Record<string, number> };

export function JobLossPanel({
  job,
  person,
  pays,
  today,
}: {
  job: SafetyNetJob;
  person: SafetyNetPerson | null;
  pays: SafetyNetPay[];
  today: string;
}) {
  const [context, setContext] = useState<{ forecast: JobLossForecastMonth[]; savingsNow: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [endMonth, setEndMonth] = useState(today.slice(0, 7));
  useEffect(() => {
    let live = true;
    quietly(() => loadJobLossContext()).then((result) => {
      if (!live) return;
      if (isLoopError(result)) setFailed(result.__loopError);
      else setContext(result as { forecast: JobLossForecastMonth[]; savingsNow: number });
    });
    return () => { live = false; };
  }, []);
  const forecast = useMemo(() => context?.forecast || [], [context]);
  const savingsNow = context?.savingsNow || 0;

  const result = useMemo(() => {
    if (!context || !job.start_date || !job.person_id) return null;
    const onDate = endMonth === today.slice(0, 7) ? today : lastDayOf(endMonth);
    const pay = payForJob(job, pays, onDate);
    const gross = Number(pay?.gross_annual_salary || 0);
    const employee = (job.employment_type || "employed") === "employed";
    const estimate = gross > 0
      ? estimateRedundancy({
          serviceStart: job.start_date,
          birthDate: person?.birth_date || null,
          onDate,
          grossAnnualPay: gross,
          region: (job.work_region as WorkRegion) || "gb",
          enhanced: enhancedFor(job),
          noticeWeeksContract: job.notice_weeks_override,
        })
      : null;
    // Notice pay and any redundancy over £30k are taxed like wages: use this person's own take-home rate.
    const takeHome = forecast.find((m) => m.month === endMonth)?.payByPerson[job.person_id] || 0;
    const netRate = gross > 0 && takeHome > 0 ? Math.min(0.95, Math.max(0.4, takeHome / (gross / 12))) : 0.7;
    const redundancy = estimate && employee ? estimate.taxFreePart + estimate.taxablePart * netRate : 0;
    const notice = estimate && employee ? estimate.noticePayGross * netRate : 0;
    const scenario = jobLossScenario({
      months: forecast.map((m) => ({ month: m.month, leftOver: m.leftOver, personPay: m.payByPerson[job.person_id as string] || 0 })),
      savingsNow,
      endMonth,
      lumpSum: redundancy + notice,
    });
    const payLost = forecast.find((m) => m.month > endMonth)?.payByPerson[job.person_id] || takeHome;
    return { estimate, redundancy, notice, scenario, payLost, employee };
  }, [context, job, person, pays, forecast, savingsNow, endMonth, today]);

  const field = "mt-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-950";

  if (failed) return <p className="mt-3 text-xs font-bold text-rose-700">{failed}</p>;
  if (!context) return <p className="mt-3 text-xs font-bold text-slate-500">Working it out…</p>;

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <label className="block text-xs font-black text-slate-600">If the last month of pay was
        <select value={endMonth} onChange={(event) => setEndMonth(event.target.value)} className={`${field} ml-2`}>
          {forecast.slice(0, 24).map((m) => <option key={m.month} value={m.month}>{monthName(m.month)}</option>)}
        </select>
      </label>
      {result ? (
        <div className="mt-3 space-y-3">
          <div className={`rounded-xl p-3 ${result.scenario.runsOutIn ? "bg-amber-50 ring-1 ring-amber-200" : "bg-emerald-50 ring-1 ring-emerald-200"}`}>
            {result.scenario.monthlyGap === 0 && !result.scenario.runsOutIn ? (
              <>
                <p className="text-lg font-black text-emerald-800">You&apos;d still cover your bills</p>
                <p className="text-xs font-semibold text-emerald-900">The rest of the household&apos;s income covers what goes out each month.</p>
              </>
            ) : result.scenario.runsOutIn ? (
              <>
                <p className="text-lg font-black text-amber-900">
                  {result.scenario.monthsCovered === 0 ? "Money would run short straight away" : `About ${result.scenario.monthsCovered} month${result.scenario.monthsCovered === 1 ? "" : "s"} covered`}
                </p>
                <p className="text-xs font-semibold text-amber-900">Savings plus the payout run out in <strong>{monthName(result.scenario.runsOutIn)}</strong> if nothing else changed.</p>
              </>
            ) : (
              <>
                <p className="text-lg font-black text-emerald-800">Covered for {result.scenario.forecastMonths}+ months</p>
                <p className="text-xs font-semibold text-emerald-900">Savings plus the payout cover the {gbp(result.scenario.monthlyGap)} a month gap for as far as Loop&apos;s plan goes.</p>
              </>
            )}
          </div>
          <dl className="grid gap-x-6 gap-y-1 text-xs font-semibold text-slate-600 sm:grid-cols-2">
            <div className="flex justify-between gap-3"><dt>Pay lost each month</dt><dd className="font-black text-slate-950">−{gbp(result.payLost)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Gap once pay stops</dt><dd className="font-black text-slate-950">{result.scenario.monthlyGap > 0 ? `−${gbp(result.scenario.monthlyGap)}/mo` : "None"}</dd></div>
            <div className="flex justify-between gap-3"><dt>Redundancy, after any tax</dt><dd className="font-black text-emerald-700">{result.employee ? `+${gbp(result.redundancy)}` : "None"}</dd></div>
            <div className="flex justify-between gap-3"><dt>Notice pay, after tax</dt><dd className="font-black text-emerald-700">{result.employee ? `+${gbp(result.notice)}` : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt>Savings now</dt><dd className="font-black text-slate-950">{gbp(savingsNow)}</dd></div>
          </dl>
        </div>
      ) : null}
      <p className="mt-3 text-[11px] font-semibold text-slate-400">Assumes spending stays the same and nothing else comes in — no new job, benefits or insurance.</p>
    </div>
  );
}
