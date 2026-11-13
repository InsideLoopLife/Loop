"use client";

// Edit a childminder, breakfast or after-school club, holiday camp or nanny.
// Asks the same questions as the add wizard, filled in with what's saved.
import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import {
  COST_TYPE_REGISTRY,
  PAYMENT_STEPS,
  calculateNewCareTypeMonthlyCost,
  type CareType,
  type WizardStep,
} from "@/lib/calculations/childcareRegistry";

type EditableCost = {
  id: string;
  label: string;
  child_id: string | null;
  bill_person_id?: string | null;
  care_type?: CareType | null;
  care_details?: Record<string, any> | null;
  starts_on?: string | null;
  ends_on?: string | null;
  payment_timing?: string | null;
  payment_day_of_month?: number | null;
  notes?: string | null;
};

const inputClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400";
const resolve = <T,>(value: T | ((a: Record<string, any>, c: null) => T), answers: Record<string, any>) =>
  typeof value === "function" ? (value as (a: Record<string, any>, c: null) => T)(answers, null) : value;

export function CareTypeEditForm({ cost, action, submitLabel = "Save" }: { cost: EditableCost; action: (formData: FormData) => void | Promise<void>; submitLabel?: string }) {
  const careType = cost.care_type as CareType;
  const definition = COST_TYPE_REGISTRY.find((entry) => entry.id === careType);
  const [answers, setAnswers] = useState<Record<string, any>>(() => ({
    ...(cost.care_details || {}),
    paymentTiming: cost.care_details?.paymentTiming ?? (cost.payment_timing === "last_workday" ? "last_workday" : "fixed_day"),
    paymentDay: cost.care_details?.paymentDay ?? cost.payment_day_of_month ?? 1,
  }));
  const set = (id: string, value: unknown) => setAnswers((current) => ({ ...current, [id]: value }));

  const steps: WizardStep[] = useMemo(() => {
    if (!definition) return [];
    return [...definition.steps(answers, null), ...PAYMENT_STEPS]
      // Who it's for is set when it's added; term-date confirmation isn't a setting.
      .filter((step) => !["child", "childMulti"].includes(step.type) && step.id !== "termDatesConfirmed")
      .filter((step) => !step.condition || step.condition(answers));
  }, [definition, answers]);

  const month = new Date().toISOString().slice(0, 7);
  const estimate = careType ? calculateNewCareTypeMonthlyCost(careType, answers, month) : null;
  const halfTermly = answers.cadence === "half_termly";

  if (!definition) return <p className="text-sm text-slate-600">This kind of cost can't be edited here yet.</p>;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={cost.id} />
      <input type="hidden" name="care_type" value={careType} />
      <input type="hidden" name="care_details" value={JSON.stringify(answers)} />
      <input type="hidden" name="child_id" value={cost.child_id ?? ""} />
      <input type="hidden" name="bill_person_id" value={cost.bill_person_id ?? ""} />
      <input type="hidden" name="billing_month" value={month} />
      <input type="hidden" name="payment_timing" value={halfTermly ? "fixed_day" : answers.paymentTiming === "last_workday" ? "last_workday" : "fixed_day"} />
      <input type="hidden" name="payment_day_of_month" value={String(halfTermly ? 1 : Math.min(31, Math.max(1, Number(answers.paymentDay) || 1)))} />
      <input type="hidden" name="payment_adjustment" value={halfTermly ? "next_workday" : "previous_workday"} />
      <input type="hidden" name="notes" value={cost.notes ?? ""} />

      <label className="block text-sm font-medium text-slate-700">
        Name
        <input name="label" defaultValue={cost.label} required className={inputClass} />
      </label>

      {steps.map((step) => {
        const title = resolve(step.title, answers);
        const hint = step.hint ? resolve(step.hint, answers) : undefined;
        const value = answers[step.id] ?? step.default ?? "";
        return (
          <div key={step.id}>
            {step.type === "boolean" ? (
              <fieldset>
                <legend className="text-sm font-medium text-slate-700">{title}</legend>
                <div className="mt-1 flex gap-2">
                  {[true, false].map((option) => (
                    <button key={String(option)} type="button" onClick={() => set(step.id, option)}
                      className={`rounded-full px-4 py-1.5 text-sm font-semibold ring-1 ${answers[step.id] === option ? "bg-slate-950 text-white ring-slate-950" : "bg-white text-slate-700 ring-slate-200"}`}>
                      {option ? "Yes" : "No"}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : step.type === "select" ? (
              <label className="block text-sm font-medium text-slate-700">
                {title}
                <select value={String(value)} onChange={(e) => set(step.id, e.target.value)} className={inputClass}>
                  {(step.options || []).map((option) => {
                    const opt = typeof option === "string" ? { value: option, label: option } : option;
                    return <option key={opt.value} value={opt.value}>{opt.label}</option>;
                  })}
                </select>
              </label>
            ) : step.type === "multiselect" ? null : (
              <label className="block text-sm font-medium text-slate-700">
                {title}
                <input type="number" step={step.type === "currency" ? "0.01" : "1"} min={step.min} max={step.max} value={value}
                  onChange={(e) => set(step.id, e.target.value === "" ? "" : Number(e.target.value))} className={inputClass} />
              </label>
            )}
            {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
          </div>
        );
      })}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Started
          <input type="date" name="starts_on" defaultValue={cost.starts_on ?? ""} className={inputClass} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Ends <span className="font-normal text-slate-400">(optional)</span>
          <input type="date" name="ends_on" defaultValue={cost.ends_on ?? ""} className={inputClass} />
        </label>
      </div>

      {estimate ? (
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="font-semibold text-slate-900">This month: £{estimate.estimatedMonthlyCost.toFixed(2)}</p>
          <p className="mt-0.5 text-xs text-slate-500">{estimate.explanation}</p>
        </div>
      ) : null}

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
