"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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

export function JobLossScenario({
  jobs,
  people,
  pays,
  forecast,
  savingsNow,
  today,
  initialJobId,
}: {
  jobs: SafetyNetJob[];
  people: SafetyNetPerson[];
  pays: SafetyNetPay[];
  forecast: JobLossForecastMonth[];
  savingsNow: number;
  today: string;
  initialJobId: string | null;
}) {
  const [jobId, setJobId] = useState(jobs.find((job) => job.id === initialJobId)?.id || jobs[0]?.id || "");
  const [endMonth, setEndMonth] = useState(forecast[0]?.month || today.slice(0, 7));
  const job = jobs.find((item) => item.id === jobId) || null;
  const person = job ? people.find((p) => p.id === job.person_id) || null : null;

  const result = useMemo(() => {
    if (!job || !job.start_date || !job.person_id) return null;
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
  }, [job, person, pays, forecast, savingsNow, endMonth, today]);

  const field = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-950";

  return (
    <section id="job-loss" className="mt-6 rounded-[18px] border border-slate-200 bg-white p-5 md:p-7">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">What if</p>
      <h2 className="mt-1 text-2xl font-black text-slate-950">What if one of us lost our job?</h2>
      <p className="mt-1 text-sm font-semibold text-slate-600">Takes that pay out of your plan, adds the redundancy and notice pay, and shows how long your savings would last.</p>

      {!jobs.length ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
          <p className="text-sm font-bold text-slate-700">Add your job and start date first — Loop needs them to work out redundancy pay.</p>
          <Link href="/income#redundancy" className="mt-3 inline-block rounded-full bg-slate-950 px-5 py-2.5 text-sm font-black text-white hover:bg-slate-800">Go to Income → Redundancy safety net</Link>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-black text-slate-600">Whose job
              <select value={jobId} onChange={(event) => setJobId(event.target.value)} className={field}>
                {jobs.map((item) => (
                  <option key={item.id} value={item.id}>{people.find((p) => p.id === item.person_id)?.name || "Someone"} · {item.employer_name || "Job"}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-black text-slate-600">Last month of pay
              <select value={endMonth} onChange={(event) => setEndMonth(event.target.value)} className={field}>
                {forecast.slice(0, 24).map((m) => <option key={m.month} value={m.month}>{monthName(m.month)}</option>)}
              </select>
            </label>
          </div>

          {result ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
              <div className={`rounded-2xl p-5 ${result.scenario.runsOutIn ? "bg-amber-50 ring-1 ring-amber-200" : "bg-emerald-50 ring-1 ring-emerald-200"}`}>
                {result.scenario.monthlyGap === 0 && !result.scenario.runsOutIn ? (
                  <>
                    <p className="text-2xl font-black text-emerald-800">You&apos;d still cover your bills</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-900">The rest of the household&apos;s income covers what goes out each month, so savings aren&apos;t touched.</p>
                  </>
                ) : result.scenario.runsOutIn ? (
                  <>
                    <p className="text-2xl font-black text-amber-900">
                      {result.scenario.monthsCovered === 0 ? "Money would run short straight away" : `About ${result.scenario.monthsCovered} month${result.scenario.monthsCovered === 1 ? "" : "s"} covered`}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-amber-900">
                      Savings plus the payout would run out in <strong>{monthName(result.scenario.runsOutIn)}</strong> if nothing else changed.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-black text-emerald-800">Covered for {result.scenario.forecastMonths}+ months</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-900">Savings plus the payout cover the {gbp(result.scenario.monthlyGap)} a month gap for as far as Loop&apos;s plan goes.</p>
                  </>
                )}
              </div>
              <dl className="space-y-2 text-sm font-semibold text-slate-600">
                <div className="flex justify-between gap-3"><dt>Pay lost each month</dt><dd className="font-black text-slate-950">−{gbp(result.payLost)}</dd></div>
                <div className="flex justify-between gap-3"><dt>Monthly gap once pay stops</dt><dd className="font-black text-slate-950">{result.scenario.monthlyGap > 0 ? `−${gbp(result.scenario.monthlyGap)}` : "None"}</dd></div>
                <div className="flex justify-between gap-3"><dt>Redundancy pay, after any tax</dt><dd className="font-black text-emerald-700">{result.employee ? `+${gbp(result.redundancy)}` : "None (not an employee)"}</dd></div>
                <div className="flex justify-between gap-3"><dt>Notice pay, after tax</dt><dd className="font-black text-emerald-700">{result.employee ? `+${gbp(result.notice)}` : "—"}</dd></div>
                <div className="flex justify-between gap-3"><dt>Savings now</dt><dd className="font-black text-slate-950">{gbp(savingsNow)}</dd></div>
                {result.estimate && !result.estimate.qualifies && result.estimate.basis === "none" ? (
                  <p className="text-xs font-bold text-amber-700">No statutory redundancy pay before 2 years&apos; service — that&apos;s {monthName(result.estimate.qualifiesOn.slice(0, 7))} for this job.</p>
                ) : null}
              </dl>
            </div>
          ) : (
            <p className="mt-4 text-sm font-bold text-slate-600">This job needs a start date. <Link href="/income#redundancy" className="text-emerald-700 underline">Add it on Income</Link>.</p>
          )}
          <p className="mt-4 text-xs font-semibold text-slate-400">
            Assumes your spending stays the same, the rest of the plan carries on, and nothing else comes in — no new job, benefits or insurance. Notice pay is the same money whether you work it or it&apos;s paid as a lump sum.
          </p>
        </>
      )}
    </section>
  );
}
