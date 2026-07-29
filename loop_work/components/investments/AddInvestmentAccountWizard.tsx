"use client";

import { useState } from "react";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { investmentProviders, findProvider, accountOfferingsFor } from "@/lib/investments/provider-glossary";
import { addInvestmentAccount, saveMoneyboxInvestmentAccountSetup } from "@/lib/investments/actions";

type Person = { id: string; name: string; relationship: string };

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

type StepId = "provider" | "label-owner" | "account-type" | "fees" | "notes";
const STEPS: { id: StepId; label: string }[] = [
  { id: "provider", label: "Provider" },
  { id: "label-owner", label: "Name & owner" },
  { id: "account-type", label: "Account type" },
  { id: "fees", label: "Fees" },
  { id: "notes", label: "Notes" },
];

// NOTE: this wizard covers the standard add-account flow. Moneybox's extra
// allocation-model fields (MoneyboxAllocationSetupFields, still defined in
// PensionsInvestmentsClient.tsx) aren't reproduced here yet — Moneybox
// providers still fall back to the original dense form for that one extra
// section until that's folded in as its own step.
export function AddInvestmentAccountWizard({ people, defaultPersonId }: { people: Person[]; defaultPersonId?: string }) {
  const providers = investmentProviders();
  const [providerName, setProviderName] = useState(providers.find((p) => p.id === "trading-212")?.name || providers[0]?.name || "Trading 212");
  const [stepIndex, setStepIndex] = useState(0);

  const provider = findProvider(providerName);
  const offerings = accountOfferingsFor(providerName, "investment");
  const isMoneybox = provider?.id === "moneybox" || providerName.toLowerCase().includes("moneybox");
  const isLast = stepIndex === STEPS.length - 1;
  const currentStepId = STEPS[stepIndex].id;

  return (
    <form action={isMoneybox ? saveMoneyboxInvestmentAccountSetup : addInvestmentAccount} className="space-y-5">
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

      <div style={{ display: currentStepId === "provider" ? "block" : "none" }}>
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
      </div>

      <div style={{ display: currentStepId === "label-owner" ? "block" : "none" }} className="space-y-4">
        <FormInput label="Pot label" name="label" placeholder={`${providerName} ISA, GIA or stock group`} required />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Owner</span>
          <select name="person_id" defaultValue={defaultPersonId || ""} className={inputClass}>
            <PersonOptions people={people} />
          </select>
        </label>
      </div>

      <div style={{ display: currentStepId === "account-type" ? "block" : "none" }}>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Account type</span>
          <select name="account_type" className={inputClass}>
            {(offerings.length ? offerings : [{ value: "gia", label: "GIA" }, { value: "isa", label: "Stocks & Shares ISA" }]).map((offering) => (
              <option key={offering.value} value={offering.value}>
                {offering.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: currentStepId === "fees" ? "block" : "none" }} className="space-y-4">
        <FormInput
          label="Platform fee % / year"
          name="annual_platform_fee_percent"
          type="number"
          step="any"
          placeholder={provider?.defaultAnnualPlatformFeePercent === null ? "Provider-specific" : String(provider?.defaultAnnualPlatformFeePercent ?? 0)}
        />
        <FormInput
          label="Fixed monthly fee"
          name="fixed_monthly_fee"
          type="number"
          step="any"
          placeholder={provider?.defaultFixedMonthlyFee === null ? "Provider-specific" : String(provider?.defaultFixedMonthlyFee ?? 0)}
        />
      </div>

      <div style={{ display: currentStepId === "notes" ? "block" : "none" }}>
        <FormInput label="Notes" name="notes" placeholder={provider?.notes || "Manual until API/CSV connected"} />
        {isMoneybox ? <p className="mt-2 text-xs font-bold text-amber-700">Moneybox allocation-model setup isn't in this wizard yet — you'll be prompted for it separately after adding the pot.</p> : null}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button type="button" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0} className="text-sm font-black text-slate-500 hover:text-slate-900 disabled:opacity-30">
          ← Back
        </button>
        {isLast ? (
          <SubmitButton>{isMoneybox ? "Add Moneybox pot" : "Add investment pot"}</SubmitButton>
        ) : (
          <button type="button" onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))} className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-600">
            Next →
          </button>
        )}
      </div>
    </form>
  );
}
