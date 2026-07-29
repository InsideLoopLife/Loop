"use client";

import { useMemo, useState } from "react";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { pensionProviders, findProvider, accountOfferingsFor, providerValuationMode, providerContributionMode } from "@/lib/investments/provider-glossary";
import { addPensionAccount, updatePensionAccount } from "@/lib/investments/actions";

type Person = { id: string; name: string; relationship: string };

type PensionAccount = {
  id: string;
  provider: string;
  label: string;
  person_id: string | null;
  pension_type?: string | null;
  valuation_mode?: string | null;
  contribution_method?: string | null;
  employee_contribution_percent?: number | null;
  employer_contribution_percent?: number | null;
  employer_ni_topup_enabled?: boolean | null;
  employer_ni_topup_percent?: number | null;
  employer_ni_rate_percent?: number | null;
  employer_ni_passback_percent?: number | null;
  employer_base_salary_basis?: string | null;
  fixed_monthly_contribution?: number | null;
  contribution_frequency?: string | null;
  contribution_day?: number | null;
  regular_pay_day?: number | null;
  pension_payment_timing?: string | null;
  contribution_delay_days?: number | null;
  pension_investment_day?: number | null;
  pension_investment_timing?: string | null;
  contribution_started_on?: string | null;
  contribution_ended_on?: string | null;
  contribution_paused?: boolean | null;
  contribution_auto_apply_enabled?: boolean | null;
  annual_platform_fee_percent?: number | null;
  fixed_monthly_fee?: number | null;
  current_value?: number | null;
  value_as_of_date?: string | null;
  source_url?: string | null;
  notes?: string | null;
};

const inputClass =
  "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 transition focus:border-orange-400 focus:ring-2";

function PersonOptions({ people }: { people: Person[] }) {
  return (
    <>
      <option value="">Household / shared</option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name} ({person.relationship})
        </option>
      ))}
    </>
  );
}

type StepId =
  | "provider"
  | "label-person"
  | "pension-type"
  | "contribution-method"
  | "contribution-percents"
  | "ni-topup-toggle"
  | "ni-topup-detail"
  | "fixed-contribution"
  | "pay-in-timing"
  | "investment-timing"
  | "contribution-dates"
  | "auto-apply"
  | "fees"
  | "current-value"
  | "notes-source";

const STEP_ORDER: StepId[] = [
  "provider",
  "label-person",
  "pension-type",
  "contribution-method",
  "contribution-percents",
  "ni-topup-toggle",
  "ni-topup-detail",
  "fixed-contribution",
  "pay-in-timing",
  "investment-timing",
  "contribution-dates",
  "auto-apply",
  "fees",
  "current-value",
  "notes-source",
];

const STEP_LABELS: Record<StepId, string> = {
  provider: "Provider",
  "label-person": "Name & owner",
  "pension-type": "Account type",
  "contribution-method": "Contributions",
  "contribution-percents": "Contribution %",
  "ni-topup-toggle": "Employer NI top-up",
  "ni-topup-detail": "NI top-up detail",
  "fixed-contribution": "Fixed contribution",
  "pay-in-timing": "Pay-in timing",
  "investment-timing": "Investment timing",
  "contribution-dates": "Contribution dates",
  "auto-apply": "Auto-apply",
  fees: "Fees",
  "current-value": "Current value",
  "notes-source": "Notes",
};

export function AddPensionAccountWizard({
  people,
  defaultPersonId,
  account,
}: {
  people: Person[];
  defaultPersonId?: string;
  account?: PensionAccount;
}) {
  const providers = pensionProviders();
  const [providerName, setProviderName] = useState(account?.provider || providers[0]?.name || "Legal & General");
  const [contributionMethod, setContributionMethod] = useState<string>(account?.contribution_method || "");
  const [niTopupEnabled, setNiTopupEnabled] = useState(Boolean(account?.employer_ni_topup_enabled));
  const [stepIndex, setStepIndex] = useState(0);

  const provider = findProvider(providerName);
  const offerings = accountOfferingsFor(providerName, "pension").filter((item) => item.value !== "defined_benefit");
  const defaultFee = account?.annual_platform_fee_percent ?? (provider?.defaultAnnualPlatformFeePercent === null ? "" : String(provider?.defaultAnnualPlatformFeePercent ?? 0));
  const defaultMonthly = account?.fixed_monthly_fee ?? (provider?.defaultFixedMonthlyFee === null ? "" : String(provider?.defaultFixedMonthlyFee ?? 0));
  const defaultContributionMethod = account?.contribution_method || providerContributionMode(providerName);
  const defaultValuationMode = account?.valuation_mode || providerValuationMode(providerName);
  const today = new Date().toISOString().slice(0, 10);

  const contributionActive = contributionMethod !== "none" && contributionMethod !== "";

  const visibleSteps = useMemo(
    () =>
      STEP_ORDER.filter((id) => {
        if (!contributionActive && ["contribution-percents", "ni-topup-toggle", "ni-topup-detail", "fixed-contribution", "pay-in-timing", "investment-timing", "contribution-dates", "auto-apply"].includes(id))
          return false;
        if (id === "ni-topup-detail" && !niTopupEnabled) return false;
        return true;
      }),
    [contributionActive, niTopupEnabled],
  );

  const currentStepId = visibleSteps[Math.min(stepIndex, visibleSteps.length - 1)];
  const isLastStep = stepIndex >= visibleSteps.length - 1;

  function next() {
    setStepIndex((i) => Math.min(visibleSteps.length - 1, i + 1));
  }
  function back() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  return (
    <form action={account ? updatePensionAccount : addPensionAccount} className="space-y-5">
      {account ? <input type="hidden" name="id" value={account.id} /> : null}
      <input type="hidden" name="employer_ni_topup_mode" value={niTopupEnabled ? "saved_ni" : "none"} />

      <div className="rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-100">
        <div className="mb-2 flex items-center gap-1.5 overflow-x-auto">
          {visibleSteps.map((id, i) => (
            <div key={id} className={`h-1 flex-1 min-w-[16px] rounded-full ${i <= stepIndex ? "bg-teal-500" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
          {STEP_LABELS[currentStepId]} · Step {stepIndex + 1} of {visibleSteps.length}
        </p>
      </div>

      <div style={{ display: currentStepId === "provider" ? "block" : "none" }} className="space-y-4">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Provider</span>
          <select name="provider" value={providerName} onChange={(event) => setProviderName(event.target.value)} className={inputClass}>
            {providers.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
            <option value="Other">Other / manual</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Valuation mode</span>
          <select name="valuation_mode" defaultValue={defaultValuationMode} className={inputClass}>
            <option value="provider_value">Provider pot value, like PensionBee/Nest/standard workplace accounts</option>
            <option value="fund_units">Fund units and fund prices</option>
            <option value="manual_value">Manual value only</option>
          </select>
        </label>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
          <p className="font-black text-slate-950">How {providerName} normally works</p>
          <p className="mt-1">{provider?.notes || "Provider defaults will be suggested shortly and can be updated."}</p>
        </div>
      </div>

      <div style={{ display: currentStepId === "label-person" ? "block" : "none" }} className="space-y-4">
        <FormInput label="What do you want to call the pot?" name="label" defaultValue={account?.label} placeholder={`${providerName} pension`} required />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Who is it for?</span>
          <select name="person_id" defaultValue={account?.person_id || defaultPersonId || ""} className={inputClass}>
            <PersonOptions people={people} />
          </select>
        </label>
      </div>

      <div style={{ display: currentStepId === "pension-type" ? "block" : "none" }} className="space-y-4">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Account type</span>
          <select name="pension_type" defaultValue={account?.pension_type ?? undefined} className={inputClass}>
            {(offerings.length ? offerings : [{ value: "work", label: "Workplace pension" }, { value: "private", label: "Private/personal pension" }]).map((offering) => (
              <option key={offering.value} value={offering.value}>
                {offering.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: currentStepId === "contribution-method" ? "block" : "none" }} className="space-y-4">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Contribution method</span>
          <select name="contribution_method" defaultValue={defaultContributionMethod} onChange={(event) => setContributionMethod(event.target.value)} className={inputClass}>
            <option value="salary_sacrifice">Salary sacrifice</option>
            <option value="net_pay">Net pay</option>
            <option value="relief_at_source">Relief at source</option>
            <option value="none">No contributions</option>
          </select>
        </label>
        <p className="text-xs text-slate-500">Choosing "No contributions" skips the contribution-detail questions below.</p>
      </div>

      <div style={{ display: currentStepId === "contribution-percents" ? "block" : "none" }} className="space-y-4">
        <FormInput label="Employee contribution %" name="employee_contribution_percent" type="number" step="any" defaultValue={account?.employee_contribution_percent ?? ""} placeholder="e.g. 17.5" />
        <FormInput label="Employer contribution %" name="employer_contribution_percent" type="number" step="any" defaultValue={account?.employer_contribution_percent ?? ""} placeholder="e.g. 3" />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Employer base contribution salary basis</span>
          <select name="employer_base_salary_basis" defaultValue={account?.employer_base_salary_basis || "pre_sacrifice"} className={inputClass}>
            <option value="pre_sacrifice">Pre-sacrifice / notional salary</option>
            <option value="post_sacrifice">Post-sacrifice salary</option>
          </select>
        </label>
      </div>

      <div style={{ display: currentStepId === "ni-topup-toggle" ? "block" : "none" }} className="space-y-4">
        <label className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">
          <input type="checkbox" checked={niTopupEnabled} onChange={(event) => setNiTopupEnabled(event.target.checked)} />
          Employer NI saving is reinvested into the pension
        </label>
        <p className="text-xs text-slate-500">This is the only switch that controls NI reinvestment now — turning it on always feeds through to the contribution total, with no separate "mode" to also set correctly.</p>
      </div>

      <div style={{ display: currentStepId === "ni-topup-detail" ? "block" : "none" }} className="space-y-4">
        <FormInput label="Employer NI rate %" name="employer_ni_rate_percent" type="number" step="any" defaultValue={account?.employer_ni_rate_percent ?? 15} placeholder="2026/27 main employer rate is 15%" />
        <FormInput label="NI saving passed back %" name="employer_ni_passback_percent" type="number" step="any" defaultValue={account?.employer_ni_passback_percent ?? 100} placeholder="0, 50 or 100" />
        <FormInput
          label="Additional fixed employer top-up % (optional)"
          name="employer_ni_topup_percent"
          type="number"
          step="any"
          defaultValue={account?.employer_ni_topup_percent ?? ""}
          placeholder="Separate from NI reinvestment above — only if your employer adds an extra fixed %"
        />
      </div>

      <div style={{ display: currentStepId === "fixed-contribution" ? "block" : "none" }} className="space-y-4">
        <FormInput label="Fixed monthly contribution" name="fixed_monthly_contribution" type="number" step="any" defaultValue={account?.fixed_monthly_contribution ?? ""} placeholder="Use for a fixed known extra £ amount" />
      </div>

      <div style={{ display: currentStepId === "pay-in-timing" ? "block" : "none" }} className="space-y-4">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Contribution frequency</span>
          <select name="contribution_frequency" defaultValue={account?.contribution_frequency || "monthly"} className={inputClass}>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
            <option value="one_off">One-off</option>
            <option value="manual">Manual / irregular</option>
          </select>
        </label>
        <FormInput label="Contribution / pay-in day" name="contribution_day" type="number" step="1" defaultValue={account?.contribution_day ?? account?.regular_pay_day ?? ""} placeholder="1–31 for monthly pensions" />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Pay-in day handling</span>
          <select name="pension_payment_timing" defaultValue={account?.pension_payment_timing || "next_working_day"} className={inputClass}>
            <option value="next_working_day">Move weekends to next working day</option>
            <option value="previous_working_day">Move weekends to previous working day</option>
            <option value="same_day">Use exact calendar day</option>
          </select>
        </label>
      </div>

      <div style={{ display: currentStepId === "investment-timing" ? "block" : "none" }} className="space-y-4">
        <FormInput label="Days until pension is invested" name="contribution_delay_days" type="number" step="1" defaultValue={account?.contribution_delay_days ?? 0} placeholder="e.g. 3" />
        <FormInput label="Specific investment day" name="pension_investment_day" type="number" step="1" defaultValue={account?.pension_investment_day ?? ""} placeholder="Optional 1–31" />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Investment day handling</span>
          <select name="pension_investment_timing" defaultValue={account?.pension_investment_timing || "next_working_day"} className={inputClass}>
            <option value="next_working_day">Move weekends to next working day</option>
            <option value="previous_working_day">Move weekends to previous working day</option>
            <option value="same_day">Use exact calendar day</option>
          </select>
        </label>
      </div>

      <div style={{ display: currentStepId === "contribution-dates" ? "block" : "none" }} className="space-y-4">
        <FormInput label="Contribution started" name="contribution_started_on" type="date" defaultValue={account?.contribution_started_on ?? ""} />
        <FormInput label="Contribution ended / left job" name="contribution_ended_on" type="date" defaultValue={account?.contribution_ended_on ?? ""} />
      </div>

      <div style={{ display: currentStepId === "auto-apply" ? "block" : "none" }} className="space-y-4">
        <label className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800">
          <input type="checkbox" name="contribution_auto_apply_enabled" defaultChecked={account?.contribution_auto_apply_enabled !== false} />
          Auto-create projected pension investments on the due dates
        </label>
        <label className="flex items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">
          <input type="checkbox" name="contribution_paused" defaultChecked={account?.contribution_paused === true} />
          Pause regular contribution assumptions
        </label>
      </div>

      <div style={{ display: currentStepId === "fees" ? "block" : "none" }} className="space-y-4">
        <FormInput label="Platform fee % / year" name="annual_platform_fee_percent" type="number" step="any" defaultValue={defaultFee} placeholder="Confirm provider fee" />
        <FormInput label="Fixed monthly fee" name="fixed_monthly_fee" type="number" step="any" defaultValue={defaultMonthly} placeholder="Subscription/platform monthly cost" />
      </div>

      <div style={{ display: currentStepId === "current-value" ? "block" : "none" }} className="space-y-4">
        <FormInput label="Current total value" name="current_value" type="number" step="any" defaultValue={account?.current_value ?? ""} placeholder="Current pot value from provider" />
        <FormInput label="Value date" name="value_as_of_date" type="date" defaultValue={account?.value_as_of_date || today} />
      </div>

      <div style={{ display: currentStepId === "notes-source" ? "block" : "none" }} className="space-y-4">
        <FormInput label="Fee/source URL" name="source_url" defaultValue={account?.source_url ?? ""} placeholder="Plan/fund charge link" />
        <FormInput label="Notes" name="notes" defaultValue={account?.notes ?? provider?.notes ?? ""} placeholder="Scheme notes, employer NI arrangement, pay-in date behaviour" />
        <div className="rounded-3xl border border-teal-100 bg-teal-50 p-4 text-sm font-bold text-teal-900">
          PensionBee/Nest/workplace provider pots can be tracked as provider-value accounts: the value still moves up/down, but LOOP does not force stock-style units unless the provider exposes them.
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button type="button" onClick={back} disabled={stepIndex === 0} className="text-sm font-black text-slate-500 hover:text-slate-900 disabled:opacity-30">
          ← Back
        </button>
        {isLastStep ? (
          <SubmitButton>{account ? "Save pension settings" : "Add pension pot"}</SubmitButton>
        ) : (
          <button type="button" onClick={next} className="rounded-full bg-teal-500 px-5 py-2.5 text-sm font-black text-white hover:bg-teal-600">
            Next →
          </button>
        )}
      </div>
    </form>
  );
}
