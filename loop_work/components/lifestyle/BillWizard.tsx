"use client";

import { useState } from "react";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { addDealBill, updateDealBill } from "@/app/lifestyle/actions";

type Person = { id: string; name: string; relationship?: string | null };
type DealBill = {
  id: string;
  label?: string | null;
  provider?: string | null;
  category?: string | null;
  person_id?: string | null;
  monthly_cost?: number | null;
  billing_day?: number | null;
  contract_start?: string | null;
  contract_end?: string | null;
  notice_days?: number | null;
  comparison_url?: string | null;
  account_reference?: string | null;
  notes?: string | null;
  auto_recommendation_enabled?: boolean | null;
};

const inputClass = "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 transition focus:border-orange-400 focus:ring-2";

function PersonOptions({ people }: { people: Person[] }) {
  return (
    <>
      <option value="">Household / shared</option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </>
  );
}

type StepId = "identity" | "cost-schedule" | "contract-dates" | "reference-notes";
const STEPS: { id: StepId; label: string }[] = [
  { id: "identity", label: "Bill & provider" },
  { id: "cost-schedule", label: "Cost & billing" },
  { id: "contract-dates", label: "Contract dates" },
  { id: "reference-notes", label: "Reference & notes" },
];

export function BillWizard({ people, bill }: { people: Person[]; bill?: DealBill }) {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStepId = STEPS[stepIndex].id;
  const isLastStep = stepIndex === STEPS.length - 1;

  return (
    <form action={bill ? updateDealBill : addDealBill} className="space-y-5">
      {bill ? <input type="hidden" name="id" value={bill.id} /> : null}

      <div className="rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-100">
        <div className="mb-2 flex items-center gap-1.5">
          {STEPS.map((step, i) => (
            <div key={step.id} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-orange-400" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
          {STEPS[stepIndex].label} · Step {stepIndex + 1} of {STEPS.length}
        </p>
      </div>

      <div style={{ display: currentStepId === "identity" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <FormInput label="Bill / contract name" name="label" defaultValue={bill?.label} placeholder="Broadband, car insurance, energy" required />
        <FormInput label="Provider" name="provider" defaultValue={bill?.provider} placeholder="Sky, Octopus, Admiral" required />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Category</span>
          <select name="category" defaultValue={bill?.category ?? "utilities"} className={inputClass}>
            <option value="utilities">Utilities</option>
            <option value="insurance">Insurance</option>
            <option value="mobile">Mobile</option>
            <option value="broadband">Broadband</option>
            <option value="subscription">Subscription</option>
            <option value="food">Food / grocery</option>
            <option value="health">Health</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Owner</span>
          <select name="person_id" defaultValue={bill?.person_id ?? ""} className={inputClass}>
            <PersonOptions people={people} />
          </select>
        </label>
      </div>

      <div style={{ display: currentStepId === "cost-schedule" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <FormInput label="Monthly cost" name="monthly_cost" type="number" step="0.01" defaultValue={bill?.monthly_cost} />
        <FormInput label="Billing day" name="billing_day" type="number" step="1" defaultValue={bill?.billing_day} placeholder="1-31" />
        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 md:col-span-2">
          <input name="auto_recommendation_enabled" type="checkbox" defaultChecked={bill?.auto_recommendation_enabled ?? true} className="h-4 w-4" /> Show renewal recommendation
        </label>
      </div>

      <div style={{ display: currentStepId === "contract-dates" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <FormInput label="Contract start" name="contract_start" type="date" defaultValue={bill?.contract_start} />
        <FormInput label="Contract end" name="contract_end" type="date" defaultValue={bill?.contract_end} />
        <FormInput label="Notice/check days before end" name="notice_days" type="number" step="1" defaultValue={bill?.notice_days ?? 45} />
      </div>

      <div style={{ display: currentStepId === "reference-notes" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <FormInput label="Comparison/source URL" name="comparison_url" defaultValue={bill?.comparison_url} placeholder="MSE, comparison site, provider URL" />
        <FormInput label="Account/reference" name="account_reference" defaultValue={bill?.account_reference} />
        <FormInput label="Notes" name="notes" defaultValue={bill?.notes} placeholder="Current deal, renewal notes" />
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button type="button" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0} className="text-sm font-black text-slate-500 hover:text-slate-900 disabled:opacity-30">
          ← Back
        </button>
        {isLastStep ? (
          <SubmitButton>{bill ? "Save bill" : "Add bill"}</SubmitButton>
        ) : (
          <button type="button" onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))} className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-600">
            Next →
          </button>
        )}
      </div>
    </form>
  );
}
