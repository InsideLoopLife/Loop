"use client";

import { useState } from "react";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { addFamilyCalendarPeriod, addFamilyCalendarSource, addFamilyCoverAssignment, saveFamilyLeaveAllowance, importSchoolCalendarSource } from "@/app/lifestyle/family-planning/actions";

type Person = { id: string; name: string; relationship: string | null };

const inputClass = "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-orange-500 transition focus:ring-2";

function ChildOptions({ children }: { children: Person[] }) {
  return (
    <>
      {children.map((child) => (
        <option key={child.id} value={child.id}>
          {child.name}
        </option>
      ))}
    </>
  );
}
function AdultOptions({ adults }: { adults: Person[] }) {
  return (
    <>
      {adults.map((adult) => (
        <option key={adult.id} value={adult.id}>
          {adult.name}
        </option>
      ))}
    </>
  );
}

function StepShell({ steps, stepIndex, setStepIndex, submitLabel, barColor = "bg-orange-400", buttonColor = "bg-orange-500 hover:bg-orange-600", children }: { steps: string[]; stepIndex: number; setStepIndex: (updater: (i: number) => number) => void; submitLabel: string; barColor?: string; buttonColor?: string; children: React.ReactNode }) {
  const isLastStep = stepIndex === steps.length - 1;
  return (
    <>
      <div className="rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-100">
        <div className="mb-2 flex items-center gap-1.5">
          {steps.map((label, i) => (
            <div key={label} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? barColor : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
          {steps[stepIndex]} · Step {stepIndex + 1} of {steps.length}
        </p>
      </div>
      {children}
      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button type="button" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0} className="text-sm font-black text-slate-500 hover:text-slate-900 disabled:opacity-30">
          ← Back
        </button>
        {isLastStep ? (
          <SubmitButton>{submitLabel}</SubmitButton>
        ) : (
          <button type="button" onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))} className={`rounded-full px-5 py-2.5 text-sm font-black text-white ${buttonColor}`}>
            Next →
          </button>
        )}
      </div>
    </>
  );
}

// --- Add holiday / closure period ---
const PERIOD_STEPS = ["Who & type", "Dates & cost", "Notes"];
export function CalendarPeriodWizard({ children, sources }: { children: Person[]; sources: { id: string; label: string }[] }) {
  const [stepIndex, setStepIndex] = useState(0);
  return (
    <form action={addFamilyCalendarPeriod} className="space-y-5">
      <StepShell steps={PERIOD_STEPS} stepIndex={stepIndex} setStepIndex={setStepIndex} submitLabel="Add period">
        <div style={{ display: stepIndex === 0 ? "block" : "none" }} className="grid gap-4">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Child</span>
            <select name="child_person_id" className={inputClass} required>
              <ChildOptions children={children} />
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Source</span>
            <select name="source_id" className={inputClass}>
              <option value="">Manual / not linked</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Type</span>
            <select name="period_type" className={inputClass}>
              <option value="school_holiday">School holiday</option>
              <option value="nursery_closed">Nursery closed</option>
              <option value="inset_day">Inset day</option>
              <option value="bank_holiday">Bank holiday</option>
              <option value="holiday_club">Holiday club</option>
              <option value="other">Other</option>
            </select>
          </label>
          <FormInput label="Label" name="label" placeholder="Summer holiday, Easter break, nursery closure" required />
        </div>
        <div style={{ display: stepIndex === 1 ? "block" : "none" }} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput label="Starts" name="start_date" type="date" required />
            <FormInput label="Ends" name="end_date" type="date" required />
          </div>
          <FormInput label="Expected cost" name="expected_cost" type="number" step="0.01" />
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
            <input name="requires_cover" value="on" type="checkbox" defaultChecked className="h-4 w-4" /> Requires cover on weekdays
          </label>
        </div>
        <div style={{ display: stepIndex === 2 ? "block" : "none" }}>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Notes</span>
            <textarea name="notes" className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-orange-500 transition focus:ring-2" />
          </label>
        </div>
      </StepShell>
    </form>
  );
}

// --- Add annual leave allowance ---
const LEAVE_STEPS = ["Adult & year", "Allowance", "Notes"];
export function LeaveAllowanceWizard({ adults, currentYear }: { adults: Person[]; currentYear: number }) {
  const [stepIndex, setStepIndex] = useState(0);
  return (
    <form action={saveFamilyLeaveAllowance} className="space-y-5">
      <StepShell steps={LEAVE_STEPS} stepIndex={stepIndex} setStepIndex={setStepIndex} submitLabel="Save allowance">
        <div style={{ display: stepIndex === 0 ? "block" : "none" }} className="grid gap-4">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Adult</span>
            <select name="person_id" className={inputClass} required>
              <AdultOptions adults={adults} />
            </select>
          </label>
          <FormInput label="Year" name="leave_year" type="number" step="1" defaultValue={currentYear} />
        </div>
        <div style={{ display: stepIndex === 1 ? "block" : "none" }} className="grid gap-4">
          <FormInput label="Allowance days" name="allowance_days" type="number" step="0.5" defaultValue={25} />
          <FormInput label="Carried over days" name="carried_over_days" type="number" step="0.5" defaultValue={0} />
          <FormInput label="Work pattern" name="work_pattern" placeholder="Mon-Fri, NHS 3.5 days, term-time etc" defaultValue="Mon-Fri" />
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
            <input name="bank_holidays_included" type="checkbox" className="h-4 w-4" /> Bank holidays included in allowance
          </label>
        </div>
        <div style={{ display: stepIndex === 2 ? "block" : "none" }}>
          <FormInput label="Notes" name="notes" placeholder="Any rules or restrictions" />
        </div>
      </StepShell>
    </form>
  );
}

// --- Assign cover ---
const COVER_STEPS = ["Who & when", "Cover type", "Notes"];
export function CoverAssignmentWizard({ children, adults }: { children: Person[]; adults: Person[] }) {
  const [stepIndex, setStepIndex] = useState(0);
  return (
    <form action={addFamilyCoverAssignment} className="space-y-5">
      <StepShell steps={COVER_STEPS} stepIndex={stepIndex} setStepIndex={setStepIndex} submitLabel="Add cover">
        <div style={{ display: stepIndex === 0 ? "block" : "none" }} className="grid gap-4">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Child</span>
            <select name="child_person_id" className={inputClass} required>
              <ChildOptions children={children} />
            </select>
          </label>
          <FormInput label="Date" name="cover_date" type="date" required />
        </div>
        <div style={{ display: stepIndex === 1 ? "block" : "none" }} className="grid gap-4">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Cover type</span>
            <select name="cover_type" className={inputClass}>
              <option value="parent_leave">Parent annual leave</option>
              <option value="working_from_home">Working from home</option>
              <option value="holiday_club">Holiday club</option>
              <option value="nursery">Nursery</option>
              <option value="grandparent">Grandparent</option>
              <option value="family_cover">Family cover</option>
              <option value="unpaid_leave">Unpaid leave</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Covering person</span>
            <select name="person_id" className={inputClass}>
              <option value="">Not a parent leave day / external cover</option>
              <AdultOptions adults={adults} />
            </select>
          </label>
          <FormInput label="Leave days used" name="uses_leave_days" type="number" step="0.5" defaultValue={1} />
        </div>
        <div style={{ display: stepIndex === 2 ? "block" : "none" }} className="grid gap-4">
          <FormInput label="Cost estimate" name="cost_estimate" type="number" step="0.01" />
          <FormInput label="Notes" name="notes" placeholder="Holiday club name, grandparent, half-day etc" />
        </div>
      </StepShell>
    </form>
  );
}

// --- Add school/nursery source ---
const SOURCE_STEPS = ["Label & type", "Details"];
export function CalendarSourceWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  return (
    <form action={addFamilyCalendarSource} className="space-y-5">
      <p className="text-sm font-semibold text-slate-500">This is a cached reference only. LOOP will not repeatedly scrape or call AI.</p>
      <StepShell steps={SOURCE_STEPS} stepIndex={stepIndex} setStepIndex={setStepIndex} submitLabel="Add source">
        <div style={{ display: stepIndex === 0 ? "block" : "none" }} className="grid gap-4">
          <FormInput label="Label" name="label" placeholder="Oakley school calendar, nursery closures" required />
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Source type</span>
            <select name="source_type" className={inputClass}>
              <option value="manual">Manual</option>
              <option value="local_authority">Local authority</option>
              <option value="school_website">School website</option>
              <option value="nursery">Nursery</option>
              <option value="ics">ICS/calendar file</option>
              <option value="csv">CSV/import</option>
            </select>
          </label>
        </div>
        <div style={{ display: stepIndex === 1 ? "block" : "none" }} className="grid gap-4">
          <FormInput label="School/nursery name" name="school_name" />
          <FormInput label="Local authority" name="local_authority" />
          <FormInput label="Academic year" name="academic_year" placeholder="2026/27" />
          <FormInput label="Source URL" name="source_url" placeholder="https://..." />
          <FormInput label="Notes" name="notes" />
        </div>
      </StepShell>
    </form>
  );
}

// --- Import school term dates ---
const IMPORT_STEPS = ["Child & school", "Source", "Term-date text"];
export function ImportSchoolCalendarWizard({ children }: { children: Person[] }) {
  const [stepIndex, setStepIndex] = useState(0);
  return (
    <form action={importSchoolCalendarSource} className="mt-5 space-y-5 rounded-3xl bg-white/80 p-4">
      <StepShell steps={IMPORT_STEPS} stepIndex={stepIndex} setStepIndex={setStepIndex} submitLabel="Import and create reviewable dates" barColor="bg-emerald-400" buttonColor="bg-emerald-500 hover:bg-emerald-600">
        <div style={{ display: stepIndex === 0 ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Child</span>
            <select name="child_person_id" className={inputClass} required>
              <ChildOptions children={children} />
            </select>
          </label>
          <FormInput label="School/nursery name" name="school_name" placeholder="St Philip Westbrook CEAPS" />
          <FormInput label="Academic year" name="academic_year" placeholder="2026/27" />
          <FormInput label="Label" name="label" placeholder="Oakley 2026/27 school calendar" />
        </div>
        <div style={{ display: stepIndex === 1 ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
          <FormInput label="Source URL" name="source_url" placeholder="https://school.example/term-dates" />
          <label className="block">
            <span className="text-sm font-bold text-slate-700">PDF/photo/text file</span>
            <input name="calendar_file" type="file" accept=".txt,.csv,.pdf,image/*" className={inputClass} />
          </label>
        </div>
        <div style={{ display: stepIndex === 2 ? "block" : "none" }} className="space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Paste term-date table text</span>
            <textarea name="calendar_text" className={`${inputClass} min-h-36`} placeholder="Autumn 1 2026 Thursday 3rd September 2026 Friday 23rd October 2026... Inset Days Tuesday 1st September 2026..." />
          </label>
          <FormInput label="Notes" name="notes" placeholder="Anything that needs review before confirming dates" />
        </div>
      </StepShell>
    </form>
  );
}
