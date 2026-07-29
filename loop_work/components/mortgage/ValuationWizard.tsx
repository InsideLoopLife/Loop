"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { Home, HomeValuationSource } from "@/components/mortgage/MortgagePlannerClient";

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

type StepId = "source" | "amounts" | "final";
const STEPS: { id: StepId; label: string }[] = [
  { id: "source", label: "Source" },
  { id: "amounts", label: "Valuation" },
  { id: "final", label: "Date & notes" },
];

export function ValuationWizard({ homes, valuation, homeId, action }: { homes: Home[]; valuation?: HomeValuationSource; homeId?: string; action: (formData: FormData) => void | Promise<void> }) {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStepId = STEPS[stepIndex].id;
  const isLastStep = stepIndex === STEPS.length - 1;

  return (
    <form action={action} className="space-y-5">
      {valuation ? <input type="hidden" name="id" value={valuation.id} /> : null}

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

      <div style={{ display: currentStepId === "source" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-orange-200 bg-orange-50 p-4 md:col-span-2">
          <h3 className="font-black text-orange-950">Valuation source</h3>
          <p className="mt-1 text-sm font-bold leading-6 text-orange-900/80">Source URL and notes are important so the estimate can be checked later instead of becoming an unexplained number.</p>
        </div>
        <SelectField label="Home" name="home_id" defaultValue={valuation?.home_id ?? homeId ?? homes[0]?.id ?? ""}>
          {homes.map((home) => (
            <option key={home.id} value={home.id}>
              {home.label}
            </option>
          ))}
        </SelectField>
        <SelectField label="Source type" name="source_type" defaultValue={valuation?.source_type ?? "user_estimate"}>
          <option value="user_estimate">Your estimate</option>
          <option value="estate_agent">Estate agent</option>
          <option value="survey">Survey / RICS</option>
          <option value="zoopla">Zoopla / AVM</option>
          <option value="rightmove">Rightmove / listing</option>
          <option value="land_registry">Land Registry comparable</option>
          <option value="propertydata">PropertyData / API</option>
          <option value="other">Other</option>
        </SelectField>
        <TextField label="Source name" name="source_name" defaultValue={valuation?.source_name} placeholder="Zoopla, agent name, Land Registry" required />
        <SelectField label="Confidence" name="confidence" defaultValue={valuation?.confidence ?? "medium"}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </SelectField>
      </div>

      <div style={{ display: currentStepId === "amounts" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <TextField label="Single valuation" name="valuation_amount" type="number" step="0.01" defaultValue={numberValue(valuation?.valuation_amount)} placeholder="e.g. 363000" />
        <TextField label="Low" name="valuation_low" type="number" step="0.01" defaultValue={numberValue(valuation?.valuation_low)} placeholder="Low estimate, e.g. 345000" />
        <TextField label="Mid" name="valuation_mid" type="number" step="0.01" defaultValue={numberValue(valuation?.valuation_mid)} placeholder="Mid estimate, e.g. 363000" />
        <TextField label="High" name="valuation_high" type="number" step="0.01" defaultValue={numberValue(valuation?.valuation_high)} placeholder="High estimate, e.g. 381000" />
      </div>

      <div style={{ display: currentStepId === "final" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <TextField label="Valuation date" name="valuation_date" type="date" defaultValue={valuation?.valuation_date ?? currentDate()} />
        <TextField label="Source URL" name="source_url" defaultValue={valuation?.source_url} placeholder="Paste Zoopla, Rightmove, agent or Land Registry link" />
        <label className="block md:col-span-2">
          <span className="text-sm font-black text-slate-700">Notes</span>
          <input name="notes" defaultValue={valuation?.notes ?? ""} placeholder="Condition, comparable sale, valuation caveats" className={inputClass} />
        </label>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button type="button" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0} className="text-sm font-black text-slate-500 hover:text-slate-900 disabled:opacity-30">
          ← Back
        </button>
        {isLastStep ? (
          <SubmitButton>{valuation ? "Save valuation" : "Add valuation"}</SubmitButton>
        ) : (
          <button type="button" onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))} className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-600">
            Next →
          </button>
        )}
      </div>
    </form>
  );
}
