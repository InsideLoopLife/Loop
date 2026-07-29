"use client";

import { useState } from "react";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { addPensionFund } from "@/app/investments/actions";

type PensionAccount = { id: string; label: string; provider: string };
type PensionFund = {
  fund_name?: string;
  fund_code?: string | null;
  group_label?: string | null;
  current_value?: number | null;
  units?: number | null;
  unit_price?: number | null;
  target_allocation_percent?: number | null;
  monthly_contribution_percent?: number | null;
  annual_fund_fee_percent?: number | null;
  fee_source_url?: string | null;
  notes?: string | null;
};

const inputClass =
  "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 transition focus:border-orange-400 focus:ring-2";
const today = new Date().toISOString().slice(0, 10);

type StepId = "pot" | "name" | "group" | "value" | "allocation" | "fees" | "notes";
const STEPS: { id: StepId; label: string }[] = [
  { id: "pot", label: "Pension pot" },
  { id: "name", label: "Fund name" },
  { id: "group", label: "Group" },
  { id: "value", label: "Current value" },
  { id: "allocation", label: "Allocation" },
  { id: "fees", label: "Fees" },
  { id: "notes", label: "Notes" },
];

export function AddPensionFundWizard({
  accounts,
  defaultAccountId,
  defaults,
}: {
  accounts: PensionAccount[];
  defaultAccountId?: string;
  defaults?: Partial<PensionFund>;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const isLast = stepIndex === STEPS.length - 1;
  const currentStepId = STEPS[stepIndex].id;

  return (
    <form action={addPensionFund} className="space-y-5">
      <div className="rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-100">
        <div className="mb-2 flex items-center gap-1.5">
          {STEPS.map((step, i) => (
            <div key={step.id} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-emerald-500" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
          {STEPS[stepIndex].label} · Step {stepIndex + 1} of {STEPS.length}
        </p>
      </div>

      <div style={{ display: currentStepId === "pot" ? "block" : "none" }}>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Pension pot</span>
          <select name="pension_account_id" defaultValue={defaultAccountId ?? ""} className={inputClass} required>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label} · {account.provider}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: currentStepId === "name" ? "block" : "none" }} className="space-y-4">
        <FormInput label="Fund name" name="fund_name" defaultValue={defaults?.fund_name ?? ""} placeholder="L&G PMC Lazard Emerging Markets 3" required />
        <FormInput label="Fund code / ISIN" name="fund_code" defaultValue={defaults?.fund_code ?? ""} placeholder="Optional" />
      </div>

      <div style={{ display: currentStepId === "group" ? "block" : "none" }} className="space-y-4">
        <FormInput label="Group label" name="group_label" defaultValue={defaults?.group_label ?? ""} placeholder="Global equity, Multi asset" />
        <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">
          <input type="checkbox" name="contribution_active" defaultChecked /> Gets monthly allocation
        </label>
      </div>

      <div style={{ display: currentStepId === "value" ? "block" : "none" }} className="space-y-4">
        <FormInput label="Current value" name="current_value" type="number" step="any" defaultValue={defaults?.current_value ?? ""} />
        <FormInput label="Units" name="units" type="number" step="any" defaultValue={defaults?.units ?? ""} />
        <FormInput label="Unit price" name="unit_price" type="number" step="any" defaultValue={defaults?.unit_price ?? ""} />
        <FormInput label="Value date" name="price_as_of_date" type="date" defaultValue={today} />
      </div>

      <div style={{ display: currentStepId === "allocation" ? "block" : "none" }} className="space-y-4">
        <FormInput label="Current allocation target %" name="target_allocation_percent" type="number" step="any" defaultValue={defaults?.target_allocation_percent ?? ""} />
        <FormInput label="Monthly contribution %" name="monthly_contribution_percent" type="number" step="any" defaultValue={defaults?.monthly_contribution_percent ?? ""} />
      </div>

      <div style={{ display: currentStepId === "fees" ? "block" : "none" }} className="space-y-4">
        <FormInput label="Fund fee % / year" name="annual_fund_fee_percent" type="number" step="any" defaultValue={defaults?.annual_fund_fee_percent ?? ""} />
        <FormInput label="Fee/source URL" name="fee_source_url" defaultValue={defaults?.fee_source_url ?? ""} placeholder="Provider fund factsheet" />
      </div>

      <div style={{ display: currentStepId === "notes" ? "block" : "none" }}>
        <FormInput label="Notes" name="notes" defaultValue={defaults?.notes ?? ""} placeholder="No monthly allocation / switch planned" />
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button type="button" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0} className="text-sm font-black text-slate-500 hover:text-slate-900 disabled:opacity-30">
          ← Back
        </button>
        {isLast ? (
          <SubmitButton>Add fund</SubmitButton>
        ) : (
          <button type="button" onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))} className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-600">
            Next →
          </button>
        )}
      </div>
    </form>
  );
}
