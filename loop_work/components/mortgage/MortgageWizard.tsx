"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { Home, Person, HomeMortgageDeal, HomeMortgageLiabilityAllocation } from "@/components/mortgage/MortgagePlannerClient";

const inputClass = "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 focus:border-orange-400 focus:ring-2";

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}
function numberValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  return String(value);
}
function TextField({ label, name, defaultValue, type = "text", placeholder, step, required }: { label: string; name: string; defaultValue?: string | number | null; type?: string; placeholder?: string; step?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} step={step} required={required} className={inputClass} />
    </label>
  );
}
function SelectField({ label, name, defaultValue, children }: { label: string; name: string; defaultValue?: string | number | null; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ""} className={inputClass}>
        {children}
      </select>
    </label>
  );
}

type StepId = "home-lender" | "balance" | "rate" | "term-payment" | "notes" | "liability";
const STEPS: { id: StepId; label: string }[] = [
  { id: "home-lender", label: "Home & lender" },
  { id: "balance", label: "Balance" },
  { id: "rate", label: "Rate" },
  { id: "term-payment", label: "Term & payment" },
  { id: "notes", label: "Notes" },
  { id: "liability", label: "Who's liable" },
];

export function MortgageWizard({
  homes,
  people,
  allocations,
  deal,
  homeId,
  action,
}: {
  homes: Home[];
  people: Person[];
  allocations: HomeMortgageLiabilityAllocation[];
  deal?: HomeMortgageDeal;
  homeId?: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const adultPeople = people.filter((person) => person.relationship !== "child");
  const allocationByPerson = new Map(allocations.filter((allocation) => !deal || allocation.home_mortgage_deal_id === deal.id).map((allocation) => [allocation.person_id, allocation.liability_percent]));
  const defaultChecked = new Set(allocationByPerson.size > 0 ? Array.from(allocationByPerson.keys()) : adultPeople.map((person) => person.id));
  const [stepIndex, setStepIndex] = useState(0);
  const currentStepId = STEPS[stepIndex].id;
  const isLastStep = stepIndex === STEPS.length - 1;

  return (
    <form action={action} className="space-y-5">
      {deal ? <input type="hidden" name="id" value={deal.id} /> : null}

      <div className="rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-100">
        <div className="mb-2 flex items-center gap-1.5">
          {STEPS.map((step, i) => (
            <div key={step.id} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-blue-400" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
          {STEPS[stepIndex].label} · Step {stepIndex + 1} of {STEPS.length}
        </p>
      </div>

      <div style={{ display: currentStepId === "home-lender" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4 md:col-span-2">
          <h3 className="font-black text-blue-950">Mortgage / rate record</h3>
          <p className="mt-1 text-sm font-bold leading-6 text-blue-900/80">Attach the mortgage to the home, then allocate the legal/payment liability across the adults in the household.</p>
        </div>
        <SelectField label="Home" name="home_id" defaultValue={deal?.home_id ?? homeId ?? homes[0]?.id ?? ""}>
          {homes.map((home) => (
            <option key={home.id} value={home.id}>
              {home.label}
            </option>
          ))}
        </SelectField>
        <TextField label="Lender" name="lender" defaultValue={deal?.lender} placeholder="NatWest, Halifax" />
        <TextField label="Product name" name="product_name" defaultValue={deal?.product_name} placeholder="2-year fix, tracker" />
      </div>

      <div style={{ display: currentStepId === "balance" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <TextField label="Opening / last known balance" name="balance" type="number" step="0.01" defaultValue={numberValue(deal?.balance)} placeholder="e.g. 168564" required />
        <TextField label="Balance date" name="balance_as_of_date" type="date" defaultValue={deal?.balance_as_of_date ?? deal?.start_date ?? currentDate()} />
      </div>

      <div style={{ display: currentStepId === "rate" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <TextField label="Interest rate %" name="interest_rate" type="number" step="0.001" defaultValue={numberValue(deal?.interest_rate)} placeholder="e.g. 1.77 or 4.75" required />
        <SelectField label="Repayment type" name="repayment_type" defaultValue={deal?.repayment_type ?? "repayment"}>
          <option value="repayment">Repayment</option>
          <option value="interest_only">Interest only</option>
        </SelectField>
        <SelectField label="Rate type" name="rate_type" defaultValue={deal?.rate_type ?? "fixed"}>
          <option value="fixed">Fixed</option>
          <option value="tracker">Tracker</option>
          <option value="variable">Variable</option>
          <option value="standard_variable">SVR</option>
        </SelectField>
        <TextField label="Rate ends" name="initial_period_end" type="date" defaultValue={deal?.initial_period_end} />
      </div>

      <div style={{ display: currentStepId === "term-payment" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <TextField label="Term years" name="term_years" type="number" step="1" defaultValue={numberValue(deal?.term_years ?? 25)} placeholder="e.g. 25 or 30" required />
        <TextField label="Payment override" name="monthly_payment_override" type="number" step="0.01" defaultValue={numberValue(deal?.monthly_payment_override)} placeholder="Actual monthly payment, e.g. 583" />
        <TextField label="Start date" name="start_date" type="date" defaultValue={deal?.start_date ?? currentDate()} />
        <TextField label="End date" name="end_date" type="date" defaultValue={deal?.end_date} />
      </div>

      <div style={{ display: currentStepId === "notes" ? "block" : "none" }}>
        <TextField label="Notes" name="notes" defaultValue={deal?.notes} placeholder="Fees, ERC, product transfer details, source URL" />
      </div>

      <div style={{ display: currentStepId === "liability" ? "block" : "none" }} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-black text-slate-950">Who is liable for this mortgage?</p>
        <p className="mt-1 text-xs font-bold text-slate-500">Select the adults and set liability percentages. Leave percentages blank for an equal split.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {adultPeople.map((person) => (
            <label key={person.id} className="rounded-2xl border border-slate-200 bg-white p-3">
              <span className="flex items-center gap-2 text-sm font-black text-slate-900">
                <input type="checkbox" name="liability_person_ids" value={person.id} defaultChecked={defaultChecked.has(person.id)} />
                {person.name}
              </span>
              <input name={`liability_percent_${person.id}`} type="number" min="0" max="100" step="0.01" defaultValue={numberValue(allocationByPerson.get(person.id))} placeholder="Equal split" className="mt-2 w-full rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700" />
            </label>
          ))}
          {adultPeople.length === 0 ? <p className="text-sm font-bold text-amber-700">Add the adults to Household before allocating mortgage liability.</p> : null}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button type="button" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0} className="text-sm font-black text-slate-500 hover:text-slate-900 disabled:opacity-30">
          ← Back
        </button>
        {isLastStep ? (
          <SubmitButton>{deal ? "Save mortgage" : "Add mortgage"}</SubmitButton>
        ) : (
          <button type="button" onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))} className="rounded-full bg-blue-500 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-600">
            Next →
          </button>
        )}
      </div>
    </form>
  );
}
