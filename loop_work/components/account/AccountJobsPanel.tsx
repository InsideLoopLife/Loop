"use client";

import { useState } from "react";
import { BriefcaseBusiness, CalendarDays, FileText, ShieldCheck, Trash2, UploadCloud } from "lucide-react";
import { SubmitButton } from "@/components/SubmitButton";
import { saveEmploymentJob, deleteEmploymentJob } from "@/app/account/actions";

type Person = { id: string; name: string; relationship: string | null };
type EmploymentJob = {
  id: string;
  person_id: string | null;
  employer_name: string | null;
  role_title: string | null;
  employment_type: string | null;
  start_date: string | null;
  end_date: string | null;
  annual_leave_days: number | null;
  carried_over_leave_days: number | null;
  bank_holidays_included: boolean | null;
  contracted_hours_per_week: number | null;
  contracted_days_per_week: number | null;
  work_pattern: string | null;
  salary_link_mode: string | null;
  document_storage_preference: string | null;
  extracted_summary: string | null;
  source_document_name: string | null;
  notes: string | null;
};

const inputClass = "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 transition focus:border-orange-400 focus:ring-2";

function fmt(value: unknown, fallback = "Not set") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}
function personName(people: Person[], personId: string | null | undefined) {
  if (!personId) return "Signed-in user";
  return people.find((person) => person.id === personId)?.name || "Person";
}
function dateLabel(value: string | null | undefined) {
  if (!value) return "ongoing";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function estimateStorageLabel(job: EmploymentJob) {
  if (job.document_storage_preference === "store_original") return "Original retained";
  if (job.source_document_name) return "Digest saved · original can be discarded";
  return "No document uploaded";
}

type StepId = "identity" | "employment-type" | "leave-pattern" | "document" | "notes";
const STEPS: { id: StepId; label: string }[] = [
  { id: "identity", label: "Who & where" },
  { id: "employment-type", label: "Employment type" },
  { id: "leave-pattern", label: "Leave & pattern" },
  { id: "document", label: "Document" },
  { id: "notes", label: "Notes" },
];

function AddJobWizard({ adults }: { adults: Person[] }) {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStepId = STEPS[stepIndex].id;
  const isLastStep = stepIndex === STEPS.length - 1;

  return (
    <form action={saveEmploymentJob} className="mt-6 space-y-5">
      <div className="rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-100">
        <div className="mb-2 flex items-center gap-1.5">
          {STEPS.map((step, i) => (
            <div key={step.id} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-emerald-400" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
          {STEPS[stepIndex].label} · Step {stepIndex + 1} of {STEPS.length}
        </p>
      </div>

      <div style={{ display: currentStepId === "identity" ? "block" : "none" }} className="grid gap-4">
        <label>
          <span className="text-sm font-black text-slate-700">Person</span>
          <select name="person_id" className={inputClass}>
            <option value="">Signed-in user / self</option>
            {adults.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name} · {person.relationship || "person"}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-black text-slate-700">Employer</span>
          <input name="employer_name" className={inputClass} placeholder="NHS, Gear4music, etc" required />
        </label>
        <label>
          <span className="text-sm font-black text-slate-700">Role title</span>
          <input name="role_title" className={inputClass} placeholder="Band 7, Ecommerce Director, etc" />
        </label>
      </div>

      <div style={{ display: currentStepId === "employment-type" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <label>
          <span className="text-sm font-black text-slate-700">Start date</span>
          <input name="start_date" type="date" className={inputClass} />
        </label>
        <label>
          <span className="text-sm font-black text-slate-700">End date</span>
          <input name="end_date" type="date" className={inputClass} />
        </label>
        <label>
          <span className="text-sm font-black text-slate-700">Employment type</span>
          <select name="employment_type" className={inputClass}>
            <option value="employed">Employed</option>
            <option value="self_employed">Self-employed</option>
            <option value="contractor">Contractor</option>
            <option value="maternity_paternity">Maternity/paternity leave</option>
            <option value="career_break">Career break</option>
          </select>
        </label>
        <label>
          <span className="text-sm font-black text-slate-700">Salary link mode</span>
          <select name="salary_link_mode" className={inputClass}>
            <option value="separate_income_record">Use income page record</option>
            <option value="job_is_source_of_truth">Job is source of truth</option>
            <option value="do_not_link_salary">Do not link salary</option>
          </select>
        </label>
      </div>

      <div style={{ display: currentStepId === "leave-pattern" ? "block" : "none" }} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-slate-950">
          <CalendarDays className="h-4 w-4" />
          <p className="font-black">Annual leave and work pattern</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-sm font-black text-slate-700">Annual leave allowance</span>
            <input name="annual_leave_days" type="number" step="0.5" className={inputClass} placeholder="25" />
          </label>
          <label>
            <span className="text-sm font-black text-slate-700">Carried-over days</span>
            <input name="carried_over_leave_days" type="number" step="0.5" className={inputClass} placeholder="0" />
          </label>
          <label>
            <span className="text-sm font-black text-slate-700">Contracted hours/week</span>
            <input name="contracted_hours_per_week" type="number" step="0.25" className={inputClass} placeholder="37.5" />
          </label>
          <label>
            <span className="text-sm font-black text-slate-700">Contracted days/week</span>
            <input name="contracted_days_per_week" type="number" step="0.5" className={inputClass} placeholder="5" />
          </label>
          <label className="md:col-span-2">
            <span className="text-sm font-black text-slate-700">Work pattern</span>
            <input name="work_pattern" className={inputClass} placeholder="Mon-Fri, NHS 3.5 days, Tue/Wed/Fri, term-time only..." />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 md:col-span-2">
            <input name="bank_holidays_included" type="checkbox" className="h-4 w-4" /> Bank holidays are included in the stated allowance
          </label>
        </div>
      </div>

      <div style={{ display: currentStepId === "document" ? "block" : "none" }} className="rounded-3xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex items-center gap-2 text-blue-950">
          <FileText className="h-4 w-4" />
          <p className="font-black">Optional contract / offer letter digest</p>
        </div>
        <p className="mt-1 text-xs font-bold text-blue-800">Cheapest default: upload, extract/review the useful fields, save the digest, then discard the original unless you explicitly choose to retain it.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label>
            <span className="text-sm font-black text-slate-700">Document</span>
            <input name="job_document" type="file" accept=".pdf,.txt,.doc,.docx,image/*" className={inputClass} />
          </label>
          <label>
            <span className="text-sm font-black text-slate-700">Storage preference</span>
            <select name="document_storage_preference" className={inputClass}>
              <option value="digest_only">Digest only · discard original after review</option>
              <option value="store_original">Store original document</option>
              <option value="no_document">No document</option>
            </select>
          </label>
        </div>
      </div>

      <div style={{ display: currentStepId === "notes" ? "block" : "none" }}>
        <label>
          <span className="text-sm font-black text-slate-700">Notes / extracted summary</span>
          <textarea name="notes" className={`${inputClass} min-h-24`} placeholder="Notice period, flexible working, school holiday constraints, leave rules..." />
        </label>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button type="button" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0} className="text-sm font-black text-slate-500 hover:text-slate-900 disabled:opacity-30">
          ← Back
        </button>
        {isLastStep ? (
          <SubmitButton>Save job details</SubmitButton>
        ) : (
          <button type="button" onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))} className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-600">
            Next →
          </button>
        )}
      </div>
    </form>
  );
}

export function AccountJobsPanel({ people, jobs }: { people: Person[]; jobs: EmploymentJob[] }) {
  const adults = people.filter((person) => String(person.relationship || "").toLowerCase() !== "child");

  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
            <BriefcaseBusiness className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-2xl font-black text-slate-950">Add job / contract details</h2>
            <p className="mt-1 text-sm font-bold text-slate-500">Save the structured facts LOOP needs for income, family leave planning and future return-to-work logic. Document upload is optional.</p>
          </div>
        </div>
        <AddJobWizard adults={adults} />
      </section>

      <section className="space-y-4">
        <div className="rounded-[2rem] border border-emerald-100 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-5 w-5 text-emerald-700" />
            <div>
              <p className="font-black text-emerald-950">Storage and cost guidance</p>
              <p className="mt-1 text-sm font-bold text-emerald-800">A normal text PDF is often 100–500KB. Scanned contracts or phone photos can be 2–15MB each. LOOP therefore stores structured fields and a short digest by default; original document storage is opt-in.</p>
            </div>
          </div>
        </div>

        {jobs.map((job) => (
          <article key={job.id} className="rounded-[2rem] border border-slate-200 bg-white/90 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
                  {personName(people, job.person_id)} · {fmt(job.employment_type, "job")}
                </p>
                <h3 className="mt-1 text-2xl font-black text-slate-950">{fmt(job.employer_name, "Employer")}</h3>
                <p className="text-sm font-bold text-slate-500">
                  {fmt(job.role_title, "Role not set")} · {dateLabel(job.start_date)} → {dateLabel(job.end_date)}
                </p>
              </div>
              <form action={deleteEmploymentJob}>
                <input type="hidden" name="id" value={job.id} />
                <button className="rounded-full bg-red-50 p-3 text-red-600" title="Delete job">
                  <Trash2 className="h-4 w-4" />
                </button>
              </form>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-500">Annual leave</p>
                <p className="text-lg font-black text-slate-950">{Number(job.annual_leave_days || 0) + Number(job.carried_over_leave_days || 0)} days</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-500">Pattern</p>
                <p className="text-lg font-black text-slate-950">{fmt(job.work_pattern, "Not set")}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-500">Hours</p>
                <p className="text-lg font-black text-slate-950">{fmt(job.contracted_hours_per_week, "—")}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-500">Document</p>
                <p className="text-sm font-black text-slate-950">{estimateStorageLabel(job)}</p>
              </div>
            </div>
            {job.notes || job.extracted_summary ? <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-600">{job.extracted_summary || job.notes}</p> : null}
          </article>
        ))}
        {jobs.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-8 text-center">
            <UploadCloud className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 font-black text-slate-950">No job details saved yet.</p>
            <p className="mt-1 text-sm font-bold text-slate-500">Add your role/leave rules once and the family planner can use them.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
