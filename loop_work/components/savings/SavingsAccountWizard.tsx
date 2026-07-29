"use client";

import { useMemo, useState, useTransition } from "react";
import type { FinancialInstitution } from "@/lib/catalogue/financial-institutions";

type SavingsDeal = {
  id?: string;
  provider_slug: string | null;
  provider_name: string | null;
  product_name: string | null;
  account_type: string | null;
  gross_aer: number | null;
  bonus_rate: number | null;
  requires_existing_customer?: boolean | null;
  eligible_provider_slug?: string | null;
  eligibility_note?: string | null;
  source_url?: string | null;
  status?: string | null;
};
type SavingsOwner = { id: string; name: string; relationship: string | null };
type Props = {
  institutions: FinancialInstitution[];
  deals: SavingsDeal[];
  owners?: SavingsOwner[];
  defaultOwnerPersonId?: string | null;
  hasHousehold?: boolean;
  addAction: (formData: FormData) => Promise<void>;
};

const fieldClass = "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none ring-orange-500 focus:ring-2";

function clean(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function moneyHint(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "";
  return `${Number(value).toFixed(2)}%`;
}

type StepId = "ownership" | "provider" | "naming" | "deals" | "balance-rate" | "deal-dates" | "top-up" | "goal";

export function SavingsAccountWizard({ institutions, deals, owners = [], defaultOwnerPersonId = null, hasHousehold = false, addAction }: Props) {
  const [providerQuery, setProviderQuery] = useState("");
  const [providerSlug, setProviderSlug] = useState("");
  const [providerOpen, setProviderOpen] = useState(false);
  const [productName, setProductName] = useState("");
  const [rate, setRate] = useState("");
  const [dealMode, setDealMode] = useState<"ongoing" | "boosted">("ongoing");
  const [selectedDealId, setSelectedDealId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [stepIndex, setStepIndex] = useState(0);

  const selectedProvider = institutions.find((item) => item.slug === providerSlug) ?? null;
  const filteredProviders = useMemo(() => {
    const query = clean(providerQuery);
    const rows = institutions.filter((item) => item.type !== "investment_platform");
    if (!query) return rows.slice(0, 10);
    return rows.filter((item) => {
      const haystack = clean([item.name, item.slug, ...item.aliases].join(" "));
      return haystack.includes(query) || query.includes(clean(item.name));
    }).slice(0, 10);
  }, [institutions, providerQuery]);

  const providerDeals = useMemo(() => {
    if (!providerSlug) return [];
    return deals.filter((deal) => deal.provider_slug === providerSlug && deal.status !== "archived").slice(0, 6);
  }, [deals, providerSlug]);

  const productSuggestions = useMemo(() => {
    const fromProvider = selectedProvider?.commonSavingsTypes ?? [];
    const fromDeals = providerDeals.map((deal) => deal.product_name).filter(Boolean) as string[];
    return Array.from(new Set([...fromDeals, ...fromProvider])).slice(0, 8);
  }, [selectedProvider, providerDeals]);

  function chooseProvider(slug: string) {
    const provider = institutions.find((item) => item.slug === slug);
    setProviderSlug(slug);
    setProviderQuery(provider?.name ?? "");
    setProviderOpen(false);
    setSelectedDealId("");
  }
  function chooseDeal(deal: SavingsDeal) {
    setSelectedDealId(deal.id ?? "");
    setProviderSlug(deal.provider_slug ?? "");
    setProviderQuery(deal.provider_name ?? selectedProvider?.name ?? "");
    setProductName(deal.product_name ?? "");
    setRate(String(deal.gross_aer ?? ""));
    setDealMode(deal.bonus_rate ? "boosted" : "ongoing");
  }

  const steps: StepId[] = useMemo(() => {
    const list: StepId[] = ["ownership", "provider", "naming"];
    if (providerDeals.length > 0) list.push("deals");
    list.push("balance-rate");
    if (dealMode === "boosted") list.push("deal-dates");
    list.push("top-up", "goal");
    return list;
  }, [providerDeals.length, dealMode]);

  const currentStepId = steps[Math.min(stepIndex, steps.length - 1)];
  const isLastStep = stepIndex >= steps.length - 1;

  return (
    <form
      action={(formData) => {
        startTransition(async () => addAction(formData));
      }}
      className="space-y-5"
    >
      <input type="hidden" name="provider_slug" value={providerSlug} />
      <input type="hidden" name="provider" value={providerSlug ? selectedProvider?.name ?? providerQuery : providerQuery} />
      <input type="hidden" name="deal_duration_mode" value={dealMode} />
      <input type="hidden" name="savings_rate_deal_id" value={selectedDealId} />
      <input type="hidden" name="savings_product_name" value={productName} />
      <input type="hidden" name="interest_rate" value={rate} />

      <div className="rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-100">
        <div className="mb-2 flex items-center gap-1.5">
          {steps.map((id, i) => (
            <div key={id} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-orange-400" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
          Step {stepIndex + 1} of {steps.length}
        </p>
      </div>

      <div style={{ display: currentStepId === "ownership" ? "block" : "none" }} className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Belongs to</span>
          <select name="owner_person_id" defaultValue={defaultOwnerPersonId || ""} className={fieldClass}>
            <option value="">Household / joint</option>
            {owners.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
                {person.relationship ? ` · ${person.relationship}` : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs font-bold text-slate-500">This controls whose ISA/savings allowance and totals it sits under.</p>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Ownership</span>
          <select name="ownership_scope" defaultValue="personal" className={fieldClass}>
            <option value="personal">Personal</option>
            <option value="joint">Joint</option>
            <option value="household">Household/shared</option>
            <option value="child">Child savings</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Visibility</span>
          <select name="visibility_scope" defaultValue={hasHousehold ? "household" : "private"} className={fieldClass}>
            <option value="private">Private to owner</option>
            <option value="household">Visible in household planning</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Allowance scope</span>
          <select name="savings_limit_scope" defaultValue="individual" className={fieldClass}>
            <option value="individual">Individual</option>
            <option value="joint">Joint</option>
            <option value="household">Household</option>
            <option value="child">Child</option>
          </select>
        </label>
      </div>

      <div style={{ display: currentStepId === "provider" ? "block" : "none" }}>
        <label className="relative block">
          <span className="text-sm font-bold text-slate-700">Provider</span>
          <input
            value={providerQuery}
            onChange={(event) => {
              setProviderQuery(event.target.value);
              setProviderSlug("");
              setProviderOpen(true);
            }}
            onFocus={() => setProviderOpen(true)}
            placeholder="Start typing your bank/building society"
            className={fieldClass}
            autoComplete="off"
            required
          />
          {providerOpen ? (
            <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
              {filteredProviders.map((item) => (
                <button key={item.slug} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseProvider(item.slug)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-50">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black ${item.brandClass}`}>{item.logoText}</span>
                  <span>
                    <span className="block text-sm font-black text-slate-950">{item.name}</span>
                    <span className="block text-xs font-bold text-slate-500">{item.type.replaceAll("_", " ")}</span>
                  </span>
                </button>
              ))}
              {providerQuery && filteredProviders.length === 0 ? (
                <div className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">Not listed yet — save it as a manual provider and LOOP can queue it for the catalogue.</div>
              ) : null}
            </div>
          ) : null}
        </label>
      </div>

      <div style={{ display: currentStepId === "naming" ? "block" : "none" }} className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Your name for it</span>
          <input name="name" placeholder="Holiday saver, ISA, Oakley account" className={fieldClass} />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Account type</span>
          <select name="account_type" defaultValue="savings" className={fieldClass}>
            <option value="savings">Savings</option>
            <option value="cash_isa">Cash ISA</option>
            <option value="children_savings">Children's savings</option>
            <option value="fixed_bond">Fixed bond</option>
            <option value="premium_bonds">Premium Bonds</option>
            <option value="platform_cash">Platform cash</option>
            <option value="other">Other cash asset</option>
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="text-sm font-bold text-slate-700">Product/account type</span>
          <input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Regular saver, Cash ISA, fixed bond" list="savings-product-suggestions" className={fieldClass} />
          <datalist id="savings-product-suggestions">
            {productSuggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </label>
        <div>
          <span className="text-sm font-bold text-slate-700">Rate style</span>
          <div className="mt-1 flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
            <button type="button" onClick={() => setDealMode("ongoing")} className={`flex-1 rounded-xl px-3 py-2 text-sm font-black ${dealMode === "ongoing" ? "bg-slate-950 text-white" : "text-slate-600"}`}>
              Ongoing
            </button>
            <button type="button" onClick={() => setDealMode("boosted")} className={`flex-1 rounded-xl px-3 py-2 text-sm font-black ${dealMode === "boosted" ? "bg-orange-500 text-white" : "text-slate-600"}`}>
              Boost/deal
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: currentStepId === "deals" ? "block" : "none" }}>
        {providerDeals.length > 0 ? (
          <div className="rounded-3xl border border-emerald-100 bg-emerald-50/70 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Logged deals for {selectedProvider?.name}</p>
            <p className="text-sm font-semibold text-emerald-900">Pick one to pre-fill rate/product, or skip and keep typing manually.</p>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
              {providerDeals.map((deal) => (
                <button key={deal.id ?? `${deal.provider_slug}-${deal.product_name}`} type="button" onClick={() => chooseDeal(deal)} className="min-w-[240px] rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-emerald-100 hover:ring-emerald-300">
                  <p className="text-sm font-black text-slate-950">{deal.product_name || "Savings deal"}</p>
                  <p className="mt-1 text-2xl font-black text-emerald-700">{moneyHint(deal.gross_aer) || "Rate TBC"}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{deal.requires_existing_customer ? "Existing customer only" : "Open eligibility"}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: currentStepId === "balance-rate" ? "block" : "none" }} className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Today's balance</span>
          <input name="current_balance" type="number" step="0.01" placeholder="Current balance" required className={fieldClass} />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Opening/start amount</span>
          <input name="opening_balance_assumption" type="number" step="0.01" placeholder="Assume current if blank" className={fieldClass} />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Interest rate %</span>
          <input type="number" step="0.001" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="e.g. 5.25" className={fieldClass} />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Accrues</span>
          <select name="interest_accrual_frequency" defaultValue="daily" className={fieldClass}>
            <option value="daily">Daily</option>
            <option value="monthly">Monthly</option>
            <option value="annually">Annually</option>
            <option value="maturity">At maturity</option>
            <option value="none">No automatic interest</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Paid / compounds</span>
          <select name="interest_compounding_frequency" defaultValue="monthly" className={fieldClass}>
            <option value="monthly">Monthly</option>
            <option value="daily">Daily</option>
            <option value="annually">Annually</option>
            <option value="maturity">At maturity</option>
            <option value="none">Not compounded</option>
          </select>
        </label>
        {dealMode === "ongoing" ? (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 md:col-span-2">
            <p className="text-sm font-black text-emerald-900">Ongoing account</p>
            <p className="mt-1 text-xs font-bold text-emerald-700">No fixed end date is needed. LOOP will flag better deals when logged rates beat this account.</p>
          </div>
        ) : null}
      </div>

      <div style={{ display: currentStepId === "deal-dates" ? "block" : "none" }} className="grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Boost/rate ends</span>
          <input name="interest_rate_end_date" type="date" className={fieldClass} />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Deal starts</span>
          <input name="start_date" type="date" className={fieldClass} />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Deal ends</span>
          <input name="end_date" type="date" className={fieldClass} />
        </label>
      </div>

      <div style={{ display: currentStepId === "top-up" ? "block" : "none" }} className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Top-up day</span>
          <input name="top_up_day" type="number" step="1" placeholder="e.g. 1" className={fieldClass} />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Top-up amount</span>
          <input name="monthly_top_up_amount" type="number" step="0.01" placeholder="e.g. 200" className={fieldClass} />
        </label>
      </div>

      <div style={{ display: currentStepId === "goal" ? "block" : "none" }}>
        <div className="rounded-[2rem] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-orange-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Savings pot goal (optional)</p>
          <p className="mt-1 text-sm font-bold text-slate-600">LOOP will calculate how far away the pot is and what top-up is needed to hit the date.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Goal name</span>
              <input name="savings_goal_name" placeholder="Emergency fund, holiday, house move" className={fieldClass} />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Target amount</span>
              <input name="savings_goal_target_amount" type="number" step="0.01" placeholder="e.g. 10000" className={fieldClass} />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Target date</span>
              <input name="savings_goal_target_date" type="date" className={fieldClass} />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Goal top-up override</span>
              <input name="savings_goal_monthly_contribution_override" type="number" step="0.01" placeholder="Use normal top-up" className={fieldClass} />
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button type="button" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0} className="text-sm font-black text-slate-500 hover:text-slate-900 disabled:opacity-30">
          ← Back
        </button>
        {isLastStep ? (
          <button disabled={isPending} className="rounded-2xl bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-xl disabled:opacity-60">
            {isPending ? "Adding..." : "Add savings account"}
          </button>
        ) : (
          <button type="button" onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))} className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-600">
            Next →
          </button>
        )}
      </div>
    </form>
  );
}
