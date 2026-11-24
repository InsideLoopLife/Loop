"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BriefcaseBusiness, ChevronDown, ShieldCheck } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { ConfirmSubmit } from "@/components/ui/ConfirmButton";
import { isLoopError } from "@/lib/actions/friendly";
import { saveSafetyNetJob, removeSafetyNetJob } from "@/app/income/job-actions";
import { JobLossPanel } from "@/components/income/JobLossPanel";
import { estimateRedundancy, TAX_FREE_REDUNDANCY_LIMIT, type Enhanced, type WorkRegion } from "@/lib/employment/redundancy";

export type SafetyNetJob = {
  id: string;
  person_id: string | null;
  employer_name: string | null;
  employment_type: string | null;
  start_date: string | null;
  work_region: string | null;
  pay_event_id: string | null;
  enhanced_redundancy_mode: string | null;
  enhanced_weeks_per_year: number | null;
  enhanced_max_weeks: number | null;
  enhanced_fixed_amount: number | null;
  notice_weeks_override: number | null;
};
export type SafetyNetPay = {
  id: string;
  person_id: string | null;
  label: string;
  pay_kind: string | null;
  gross_annual_salary: number;
  effective_from: string;
  effective_until: string | null;
};
export type SafetyNetPerson = { id: string; name: string; relationship: string; birth_date?: string | null };

const gbp = (value: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: value % 1 ? 2 : 0 }).format(value);
const longDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export function enhancedFor(job: SafetyNetJob): Enhanced {
  if (job.enhanced_redundancy_mode === "weeks_per_year" && Number(job.enhanced_weeks_per_year) > 0)
    return { mode: "weeks_per_year", weeksPerYear: Number(job.enhanced_weeks_per_year), maxWeeks: job.enhanced_max_weeks ? Number(job.enhanced_max_weeks) : null };
  if (job.enhanced_redundancy_mode === "fixed" && job.enhanced_fixed_amount !== null)
    return { mode: "fixed", amount: Number(job.enhanced_fixed_amount) };
  return { mode: "none" };
}

/** The salary a job's redundancy is worked out from: the linked pay record, or that person's salary on the date. */
export function payForJob(job: SafetyNetJob, pays: SafetyNetPay[], onDate: string) {
  const linked = job.pay_event_id ? pays.find((pay) => pay.id === job.pay_event_id) : null;
  if (linked) return linked;
  const salaries = pays.filter((pay) => pay.person_id === job.person_id && (pay.pay_kind || "salary") === "salary");
  const active = salaries
    .filter((pay) => pay.effective_from <= onDate && (!pay.effective_until || pay.effective_until >= onDate))
    .sort((a, b) => Number(b.gross_annual_salary) - Number(a.gross_annual_salary))[0];
  return active || salaries.sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] || null;
}

function dayBefore(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The job a person's pay records already describe: their current run of pay records with no
 * gap between them (a pay rise or a return from maternity is the same job). Named after the
 * first salary record in that run, e.g. "Gear4music" rather than the later "October Uplift".
 */
export function jobFromPay(personId: string, pays: SafetyNetPay[], today: string) {
  const own = pays
    .filter((pay) => pay.person_id === personId && ["salary", "maternity"].includes(pay.pay_kind || "salary"))
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  if (!own.some((pay) => (pay.pay_kind || "salary") === "salary")) return null;
  let end = own.length - 1;
  const current = own.findIndex((pay) => pay.effective_from <= today && (!pay.effective_until || pay.effective_until >= today));
  if (current >= 0) end = current;
  // Later records continue the same job too (e.g. a pay rise already entered for next year).
  let start = end;
  while (start > 0) {
    const previous = own[start - 1];
    const next = own[start];
    if (previous.effective_until && previous.effective_until < dayBefore(next.effective_from)) break;
    start -= 1;
  }
  const chain = own.slice(start);
  const named = chain.find((pay) => (pay.pay_kind || "salary") === "salary") || chain[0];
  return {
    employer: named.label,
    payFrom: chain[0].effective_from,
    region: "gb" as WorkRegion,
  };
}

const TYPE_LABEL: Record<string, string> = {
  employed: "Employee",
  self_employed: "Self-employed",
  director: "Company director",
  contractor: "Contractor",
};

export function RedundancySafetyNet({
  people,
  jobs,
  pays,
  today,
}: {
  people: SafetyNetPerson[];
  jobs: SafetyNetJob[];
  pays: SafetyNetPay[];
  today: string;
}) {
  const [onDate, setOnDate] = useState(today);
  const [editing, setEditing] = useState<Partial<SafetyNetJob> | null>(null);
  const [openDetail, setOpenDetail] = useState<string | null>(null);
  const [whatIf, setWhatIf] = useState<string | null>(null);
  useEffect(() => {
    // Links from elsewhere (e.g. the old Can I afford it page) open a job's what-if directly.
    const wanted = new URLSearchParams(window.location.search).get("whatif");
    if (!wanted) return;
    const timer = window.setTimeout(() => setWhatIf(wanted), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const adults = people.filter((person) => person.relationship !== "child");
  const rows = adults
    .map((person) => ({
      person,
      jobs: jobs.filter((job) => job.person_id === person.id),
      hasSalary: pays.some((pay) => pay.person_id === person.id && (pay.pay_kind || "salary") === "salary"),
    }))
    .filter((row) => row.jobs.length || row.hasSalary);

  const totals = useMemo(() => {
    let payout = 0;
    for (const job of jobs) {
      if (!job.start_date || (job.employment_type || "employed") !== "employed") continue;
      const person = people.find((p) => p.id === job.person_id);
      const pay = payForJob(job, pays, onDate);
      if (!pay) continue;
      payout += estimateRedundancy({
        serviceStart: job.start_date,
        birthDate: person?.birth_date || null,
        onDate,
        grossAnnualPay: Number(pay.gross_annual_salary) || 0,
        region: (job.work_region as WorkRegion) || "gb",
        enhanced: enhancedFor(job),
        noticeWeeksContract: job.notice_weeks_override,
      }).payout;
    }
    return { payout };
  }, [jobs, people, pays, onDate]);

  if (!rows.length) return null;

  return (
    <SectionCard
      id="redundancy"
      title="Redundancy safety net"
      description="What each of you would get if your job ended — worked out from your start date, age and pay."
      headerAction={
        <label className="flex items-center gap-2 text-xs font-black text-slate-500">
          If it happened on
          <input
            type="date"
            value={onDate}
            min={today}
            onChange={(event) => setOnDate(event.target.value || today)}
            className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-900"
          />
        </label>
      }
    >
      {totals.payout > 0 && rows.length > 1 ? (
        <p className="mb-4 text-sm font-bold text-slate-600">
          Between you: <span className="text-slate-950">{gbp(totals.payout)}</span> in redundancy pay {onDate === today ? "today" : `on ${longDate(onDate)}`}, on top of notice pay.
        </p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.flatMap(({ person, jobs: personJobs }) => {
          if (!personJobs.length) {
            const known = jobFromPay(person.id, pays, today);
            if (known) {
              return [<StartDateCard key={person.id} person={person} known={known} today={today} onMore={() => setEditing({ person_id: person.id, employer_name: known.employer, employment_type: "employed", work_region: known.region, enhanced_redundancy_mode: "none" })} />];
            }
            return [
              <article key={person.id} className="flex flex-col justify-between gap-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">{person.name}</p>
                  <p className="mt-1 text-lg font-black text-slate-950">Add a job to see this</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">There&apos;s no salary for {person.name} in Income yet.</p>
                </div>
                <button type="button" onClick={() => setEditing({ person_id: person.id, employment_type: "employed", work_region: "gb", enhanced_redundancy_mode: "none" })} className="self-start rounded-full bg-slate-950 px-5 py-2.5 text-sm font-black text-white hover:bg-slate-800">
                  Add job
                </button>
              </article>,
            ];
          }
          return personJobs.map((job) => {
            const pay = payForJob(job, pays, onDate);
            const type = job.employment_type || "employed";
            const estimate = job.start_date && pay
              ? estimateRedundancy({
                  serviceStart: job.start_date,
                  birthDate: person.birth_date || null,
                  onDate,
                  grossAnnualPay: Number(pay.gross_annual_salary) || 0,
                  region: (job.work_region as WorkRegion) || "gb",
                  enhanced: enhancedFor(job),
                  noticeWeeksContract: job.notice_weeks_override,
                })
              : null;
            const detailOpen = openDetail === job.id;
            return (
              <article key={job.id} className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                      {person.name} · {job.employer_name || "Job"}
                    </p>
                    {type !== "employed" ? (
                      <>
                        <p className="mt-1 text-lg font-black text-slate-950">No statutory redundancy pay</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">
                          It only applies to employees. As {TYPE_LABEL[type]?.toLowerCase() || "this"}, plan on savings covering any gap.
                        </p>
                      </>
                    ) : !pay ? (
                      <>
                        <p className="mt-1 text-lg font-black text-slate-950">Add pay to work this out</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">There&apos;s no salary for {person.name} in Income yet.</p>
                      </>
                    ) : estimate && !estimate.qualifies && estimate.basis === "none" ? (
                      <>
                        <p className="mt-1 text-2xl font-black text-slate-950">Not yet</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">
                          Statutory redundancy pay starts after 2 years. {person.name} qualifies from <strong className="text-slate-900">{longDate(estimate.qualifiesOn)}</strong>.
                        </p>
                      </>
                    ) : estimate ? (
                      <>
                        <p className="mt-1 text-3xl font-black tracking-tight text-emerald-700">{gbp(estimate.payout)}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">
                          {estimate.basis === "enhanced" ? "From your employer's scheme" : "Statutory minimum"} · {estimate.fullYears} full year{estimate.fullYears === 1 ? "" : "s"}
                          {estimate.taxablePart > 0 ? ` · ${gbp(estimate.taxFreePart)} tax-free, ${gbp(estimate.taxablePart)} taxed` : " · tax-free"}
                        </p>
                      </>
                    ) : null}
                  </div>
                  <BriefcaseBusiness className="h-5 w-5 shrink-0 text-slate-300" aria-hidden />
                </div>

                {estimate && type === "employed" && pay ? (
                  <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                    Plus <strong className="text-slate-950">{estimate.noticeWeeks} week{estimate.noticeWeeks === 1 ? "" : "s"}&apos; notice</strong>
                    {estimate.noticeIsContract ? " (your contract)" : " (legal minimum)"} ≈ {gbp(estimate.noticePayGross)} before tax, paid as normal wages.
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setEditing(job)} className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">Change details</button>
                  {estimate && type === "employed" && pay ? (
                    <button type="button" onClick={() => setOpenDetail(detailOpen ? null : job.id)} aria-expanded={detailOpen} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-100">
                      How it&apos;s worked out <ChevronDown className={`h-3.5 w-3.5 transition ${detailOpen ? "rotate-180" : ""}`} />
                    </button>
                  ) : null}
                  {job.start_date ? (
                    <button type="button" onClick={() => setWhatIf(whatIf === job.id ? null : job.id)} aria-expanded={whatIf === job.id} className="rounded-full px-3 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50">
                      What if this job ended?
                    </button>
                  ) : null}
                </div>

                {whatIf === job.id && job.start_date ? <JobLossPanel job={job} person={person} pays={pays} today={today} /> : null}

                {detailOpen && estimate && pay ? (
                  <dl className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-600">
                    <div className="flex justify-between gap-3"><dt>Continuous service from</dt><dd className="text-slate-900">{longDate(job.start_date as string)}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Weekly pay ({pay.label})</dt><dd className="text-slate-900">{gbp(estimate.weeklyPay)}{estimate.weeklyPay > estimate.weeklyCap ? `, capped at ${gbp(estimate.weeklyCap)}` : ""}</dd></div>
                    <div className="flex justify-between gap-3"><dt>Years counted (max 20)</dt><dd className="text-slate-900">{estimate.countedYears}</dd></div>
                    {estimate.qualifies ? (
                      <div className="flex justify-between gap-3">
                        <dt>Weeks&apos; pay for those years</dt>
                        <dd className="text-right text-slate-900">
                          {estimate.statutoryWeeks}
                          <span className="block font-semibold text-slate-500">
                            {[
                              [0.5, "½ week a year under 22"],
                              [1, "1 week a year at 22–40"],
                              [1.5, "1½ weeks a year at 41+"],
                            ]
                              .map(([weeks, label]) => ({ count: estimate.years.filter((y) => y.weeks === weeks).length, label }))
                              .filter((band) => band.count)
                              .map((band) => `${band.count} × ${band.label}`)
                              .join(" · ")}
                          </span>
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-3"><dt>Statutory amount</dt><dd className="text-slate-900">{estimate.qualifies ? gbp(estimate.statutory) : `None until ${longDate(estimate.qualifiesOn)}`}</dd></div>
                    {estimate.enhancedAmount !== null ? <div className="flex justify-between gap-3"><dt>Employer&apos;s scheme</dt><dd className="text-slate-900">{gbp(estimate.enhancedAmount)}</dd></div> : null}
                    {estimate.ageAssumed ? <p className="pt-1 text-amber-700">No date of birth for {person.name}, so every year is counted at 1 week. Add it in Household to make this exact.</p> : null}
                    <p className="pt-1 text-slate-400">
                      Caps from {estimate.capSource}. Redundancy pay up to {gbp(TAX_FREE_REDUNDANCY_LIMIT)} is tax-free; notice and holiday pay are taxed. This is the legal minimum unless you&apos;ve added your employer&apos;s scheme.
                    </p>
                  </dl>
                ) : null}
              </article>
            );
          });
        })}
      </div>
      <p className="mt-4 flex items-start gap-2 text-xs font-semibold text-slate-500">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
        Use the date your continuous service started. Moves between related employers (for example NHS trusts) can carry it over, so it may be earlier than when you joined.
      </p>

      {editing ? createPortal(
        <ModalFrame title={editing.id ? "Change job details" : "Add a job"} description="Used for the redundancy safety net. Nothing else in your plan changes." eyebrow="Income" maxWidth="max-w-xl" onClose={() => setEditing(null)}>
          <JobForm
            initial={editing}
            people={rows.map((row) => row.person)}
            pays={pays}
            today={today}
            onSubmit={async (formData) => {
              const result = (await saveSafetyNetJob(formData)) as unknown;
              if (!isLoopError(result)) setEditing(null);
            }}
            onRemove={editing.id ? async (formData) => {
              const result = (await removeSafetyNetJob(formData)) as unknown;
              if (!isLoopError(result)) setEditing(null);
            } : null}
          />
        </ModalFrame>,
        document.body,
      ) : null}
    </SectionCard>
  );
}

function StartDateCard({
  person,
  known,
  today,
  onMore,
}: {
  person: SafetyNetPerson;
  known: { employer: string; payFrom: string; region: WorkRegion };
  today: string;
  onMore: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <article className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{person.name} · {known.employer}</p>
      <p className="mt-1 text-lg font-black text-slate-950">When did {person.name} start at {known.employer}?</p>
      <p className="mt-1 text-sm font-semibold text-slate-600">
        The only thing missing — pay and age are already in Loop. Pay records here start {longDate(known.payFrom)}, so it&apos;s probably on or before that.
      </p>
      <form
        action={async (formData) => {
          setError(null);
          const result = (await saveSafetyNetJob(formData)) as unknown;
          if (isLoopError(result)) setError(result.__loopError);
        }}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="person_id" value={person.id} />
        <input type="hidden" name="employer_name" value={known.employer} />
        <input type="hidden" name="employment_type" value="employed" />
        <input type="hidden" name="work_region" value={known.region} />
        <input type="hidden" name="enhanced_redundancy_mode" value="none" />
        <input type="date" name="start_date" required max={today} aria-label={`${person.name}'s start date`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-950" />
        <ConfirmSubmit
          question="Save this start date?"
          detail="Loop uses it for the redundancy figures here and in Can I afford it. Your monthly plan stays the same."
          confirmLabel="Yes, save"
          className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-black text-white hover:bg-slate-800"
        >
          Save
        </ConfirmSubmit>
        <button type="button" onClick={onMore} className="rounded-full px-3 py-2 text-xs font-black text-slate-500 hover:bg-white">More options</button>
      </form>
      {error ? <p className="mt-2 text-xs font-bold text-rose-700">{error}</p> : null}
    </article>
  );
}

function JobForm({
  initial,
  people,
  pays,
  today,
  onSubmit,
  onRemove,
}: {
  initial: Partial<SafetyNetJob>;
  people: SafetyNetPerson[];
  pays: SafetyNetPay[];
  today: string;
  onSubmit: (formData: FormData) => Promise<void>;
  onRemove: ((formData: FormData) => Promise<void>) | null;
}) {
  const [personId, setPersonId] = useState(initial.person_id || people[0]?.id || "");
  const [type, setType] = useState(initial.employment_type || "employed");
  const [mode, setMode] = useState(initial.enhanced_redundancy_mode || "none");
  const personPays = pays.filter((pay) => pay.person_id === personId && (pay.pay_kind || "salary") === "salary");
  const field = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-950";
  const label = "block text-xs font-black text-slate-600";
  const hint = "mt-1 block text-[11px] font-semibold text-slate-400";

  return (
    <div className="space-y-4">
      <form action={onSubmit} className="space-y-4">
        {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Whose job
            <select name="person_id" value={personId} onChange={(event) => setPersonId(event.target.value)} className={field}>
              {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
          <label className={label}>Employer
            <input name="employer_name" defaultValue={initial.employer_name || ""} required maxLength={120} placeholder="e.g. Ford" className={field} />
          </label>
        </div>
        <label className={label}>Continuous service started
          <input type="date" name="start_date" defaultValue={initial.start_date || ""} max={today} required className={field} />
          <span className={hint}>Usually your start date. If you moved between related employers without a break, use the earlier date.</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>How you&apos;re employed
            <select name="employment_type" value={type} onChange={(event) => setType(event.target.value)} className={field}>
              {Object.entries(TYPE_LABEL).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
            </select>
          </label>
          <label className={label}>Where you work
            <select name="work_region" defaultValue={initial.work_region || "gb"} className={field}>
              <option value="gb">England, Scotland or Wales</option>
              <option value="ni">Northern Ireland</option>
            </select>
          </label>
        </div>
        {type !== "employed" ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">Statutory redundancy pay only applies to employees, so Loop will show £0 for this job.</p>
        ) : null}
        <label className={label}>Pay to use
          <select name="pay_event_id" defaultValue={initial.pay_event_id || ""} className={field}>
            <option value="">Their current salary (follows pay rises)</option>
            {personPays.map((pay) => <option key={pay.id} value={pay.id}>{pay.label} · {gbp(Number(pay.gross_annual_salary))} a year</option>)}
          </select>
        </label>

        <fieldset className="rounded-2xl border border-slate-200 p-3">
          <legend className="px-1 text-xs font-black text-slate-600">Employer&apos;s redundancy scheme</legend>
          <div className="flex flex-wrap gap-2">
            {[["none", "Don't know / legal minimum"], ["weeks_per_year", "Weeks' pay per year"], ["fixed", "A set amount"]].map(([value, text]) => (
              <label key={value} className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-black ring-1 ${mode === value ? "bg-slate-950 text-white ring-slate-950" : "bg-white text-slate-700 ring-slate-200"}`}>
                <input type="radio" name="enhanced_redundancy_mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
                {text}
              </label>
            ))}
          </div>
          {mode === "weeks_per_year" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={label}>Weeks per full year
                <input type="number" name="enhanced_weeks_per_year" step="0.5" min="0.5" max="12" defaultValue={initial.enhanced_weeks_per_year ?? ""} required className={field} />
              </label>
              <label className={label}>Most weeks it pays (optional)
                <input type="number" name="enhanced_max_weeks" step="1" min="1" max="260" defaultValue={initial.enhanced_max_weeks ?? ""} className={field} />
              </label>
              <span className={`${hint} sm:col-span-2`}>Worked out on your actual weekly pay, without the statutory cap. Check your contract or HR policy.</span>
            </div>
          ) : null}
          {mode === "fixed" ? (
            <label className={`${label} mt-3`}>Amount (£)
              <input type="number" name="enhanced_fixed_amount" step="0.01" min="0" defaultValue={initial.enhanced_fixed_amount ?? ""} required className={field} />
            </label>
          ) : null}
          <p className={hint}>Loop uses whichever is higher — the scheme or the legal minimum.</p>
        </fieldset>

        <label className={label}>Notice period in your contract (weeks, optional)
          <input type="number" name="notice_weeks_override" step="1" min="0" max="52" defaultValue={initial.notice_weeks_override ?? ""} className={field} />
          <span className={hint}>Leave blank to use the legal minimum: 1 week per full year, up to 12.</span>
        </label>

        <div className="flex justify-end">
          <ConfirmSubmit
            question={initial.id ? "Save these job details?" : "Add this job?"}
            detail="This changes the redundancy figures on Income and in Can I afford it. Your monthly plan stays the same."
            confirmLabel="Yes, save"
            className="rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white hover:bg-slate-800"
          >
            {initial.id ? "Save" : "Add job"}
          </ConfirmSubmit>
        </div>
      </form>
      {onRemove && initial.id ? (
        <form action={onRemove} className="border-t border-slate-100 pt-3">
          <input type="hidden" name="id" value={initial.id} />
          <ConfirmSubmit question="Remove this job?" detail="Its redundancy figure disappears. Your pay stays in Income." confirmLabel="Yes, remove" danger className="rounded-full px-3 py-1.5 text-xs font-black text-rose-600 hover:bg-rose-50">
            Remove job
          </ConfirmSubmit>
        </form>
      ) : null}
    </div>
  );
}
