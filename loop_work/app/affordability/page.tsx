import { Nav } from "@/components/Nav";
import { HouseShell } from "@/components/mortgage/HouseShell";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { householdMemberDataOrFilter } from "@/lib/auth/household-context";
import { formatMoney } from "@/lib/format/money";
import { calculateMonthlyMortgagePayment } from "@/lib/calculations/mortgage";
import { calculateAffordabilityScenario, calculateStampDutyEngland } from "@/lib/calculations/property";
import { ActivityBillingMode, BillingSchedule, DaySession, FundingMode, calculateActivityMonthlyCost, calculateNurseryMonthlyCost } from "@/lib/calculations/childcare";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { houseValue, loadHouseCore } from "@/domains/wealth/house/house-page-data";
import { addAffordabilityScenario, deleteAffordabilityScenario } from "./actions";

type Scenario = {
  id: string; label: string; purchase_price: number; deposit_cash: number;
  current_property_sale_price: number; current_mortgage_balance: number;
  gross_household_income: number; monthly_fixed_costs: number; monthly_childcare: number;
  interest_rate: number; stress_rate: number; term_years: number;
  arrangement_and_moving_costs: number; is_additional_property: boolean; first_time_buyer: boolean;
};
type PayEvent = { gross_annual_salary: number; effective_from: string; effective_until: string | null };
type SpendingCategory = { monthly_budget: number; type: string; name: string | null; standard_category_key: string | null };
type ChildCost = {
  cost_kind: "fixed" | "nursery" | "activity" | null; monthly_cost: number; billing_month: string | null;
  daily_rate: number | null; extra_daily_cost: number | null; funded_hours_per_week: number | null;
  funding_mode: FundingMode | null; hourly_funding_credit: number | null; term_weeks_per_year: number | null;
  billing_schedule: BillingSchedule | null; bank_holidays_are_free: boolean | null; tax_free_childcare_enabled?: boolean | null;
  tax_free_childcare_cap_per_quarter?: number | null; part_day_multiplier: number | null; full_day_hours: number | null;
  part_day_hours: number | null; monday_session: DaySession | null; tuesday_session: DaySession | null;
  wednesday_session: DaySession | null; thursday_session: DaySession | null; friday_session: DaySession | null;
  activity_weekly_cost: number | null; activity_weekday: number | null; activity_billing_mode: ActivityBillingMode | null;
  activity_term_weeks_per_year: number | null; monday_hours: number | null; tuesday_hours: number | null;
  wednesday_hours: number | null; thursday_hours: number | null; friday_hours: number | null;
  starts_on: string; ends_on: string | null;
};

function isActiveRange(start: string, end: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  return start <= today && (!end || end >= today);
}
function currentBillingMonth() { return new Date().toISOString().slice(0, 7); }
function childMonthly(cost: ChildCost, billingMonth = currentBillingMonth()) {
  if (cost.cost_kind === "activity") {
    return calculateActivityMonthlyCost({ billingMonth, weeklyCost: Number(cost.activity_weekly_cost ?? cost.monthly_cost ?? 0), activityWeekday: Number(cost.activity_weekday ?? 6), activityBillingMode: cost.activity_billing_mode ?? "calendar", activityTermWeeksPerYear: Number(cost.activity_term_weeks_per_year ?? 38), bankHolidaysAreFree: Boolean(cost.bank_holidays_are_free) }).estimatedMonthlyCost;
  }
  if (cost.cost_kind !== "nursery") return Number(cost.monthly_cost ?? 0);
  return calculateNurseryMonthlyCost({
    billingMonth, dailyRate: Number(cost.daily_rate ?? 0), extraDailyCost: Number(cost.extra_daily_cost ?? 0),
    fundedHoursPerWeek: Number(cost.funded_hours_per_week ?? 0), fundingMode: cost.funding_mode ?? "none",
    hourlyFundingCredit: Number(cost.hourly_funding_credit ?? 0), termWeeksPerYear: Number(cost.term_weeks_per_year ?? 38),
    billingSchedule: cost.billing_schedule ?? "all_year", bankHolidaysAreFree: Boolean(cost.bank_holidays_are_free),
    taxFreeChildcareEnabled: Boolean(cost.tax_free_childcare_enabled), taxFreeChildcareCapPerQuarter: Number(cost.tax_free_childcare_cap_per_quarter ?? 500),
    partDayMultiplier: Number(cost.part_day_multiplier ?? 0.5), fullDayHours: Number(cost.full_day_hours ?? 10), partDayHours: Number(cost.part_day_hours ?? 5),
    mondaySession: cost.monday_session ?? "off", tuesdaySession: cost.tuesday_session ?? "off", wednesdaySession: cost.wednesday_session ?? "off",
    thursdaySession: cost.thursday_session ?? "off", fridaySession: cost.friday_session ?? "off",
    mondayHours: Number(cost.monday_hours ?? 0), tuesdayHours: Number(cost.tuesday_hours ?? 0), wednesdayHours: Number(cost.wednesday_hours ?? 0),
    thursdayHours: Number(cost.thursday_hours ?? 0), fridayHours: Number(cost.friday_hours ?? 0),
  }).estimatedMonthlyCost;
}
function isMortgageCategory(category: SpendingCategory) {
  const text = `${category.standard_category_key || ""} ${category.name || ""}`.toLowerCase().replaceAll("_", " ");
  return /\bmortgage\b|\bhome loan\b/.test(text);
}
function Known({ children }: { children: React.ReactNode }) {
  return <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 ring-1 ring-violet-200">{children}</span>;
}

export default async function AffordabilityPage() {
  const { supabase, user, householdContext, homes, deals, valuations } = await loadHouseCore();
  const visible = householdMemberDataOrFilter(householdContext);
  const home = homes.find((row) => row.ownership_status === "current_home") ?? homes[0];
  const deal = deals.find((row) => row.home_id === home?.id) ?? deals[0];
  const currentValue = houseValue(home, valuations);
  const currentBalance = Number(deal?.balance || 0);
  const equity = Math.max(0, currentValue - currentBalance);
  const ltv = currentValue > 0 ? (currentBalance / currentValue) * 100 : 0;

  const [{ data: scenarios }, { data: payEvents }, { data: childCosts }, { data: categories }] = await Promise.all([
    supabase.from("affordability_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).returns<Scenario[]>(),
    supabase.from("pay_events").select("gross_annual_salary, effective_from, effective_until").or(visible).returns<PayEvent[]>(),
    supabase.from("child_costs").select("cost_kind, monthly_cost, billing_month, daily_rate, extra_daily_cost, funded_hours_per_week, funding_mode, hourly_funding_credit, term_weeks_per_year, billing_schedule, bank_holidays_are_free, tax_free_childcare_enabled, tax_free_childcare_cap_per_quarter, part_day_multiplier, full_day_hours, part_day_hours, monday_session, tuesday_session, wednesday_session, thursday_session, friday_session, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, activity_weekly_cost, activity_weekday, activity_billing_mode, activity_term_weeks_per_year, starts_on, ends_on").or(visible).returns<ChildCost[]>(),
    supabase.from("spending_categories").select("monthly_budget, type, name, standard_category_key").or(visible).returns<SpendingCategory[]>(),
  ]);

  const grossIncome = (payEvents ?? []).filter((e) => isActiveRange(e.effective_from, e.effective_until)).reduce((s, e) => s + Number(e.gross_annual_salary || 0), 0);
  const childcare = (childCosts ?? []).filter((c) => isActiveRange(c.starts_on, c.ends_on)).reduce((s, c) => s + childMonthly(c), 0);
  const fixedCosts = (categories ?? []).filter((c) => ["fixed", "debt"].includes(c.type)).filter((c) => !isMortgageCategory(c)).reduce((s, c) => s + Number(c.monthly_budget || 0), 0);

  const rates = createWorkerDatabaseClient("rates");
  const { data: benchmarks } = await rates.from("mortgage_market_rate_benchmarks").select("term_type, ltv_tier, rate_percent, effective_month").order("effective_month", { ascending: false }).limit(50);
  const bankRate = Number((benchmarks ?? []).find((r) => r.term_type === "bank_rate")?.rate_percent || 0);
  const fixedRows = (benchmarks ?? []).filter((r) => r.term_type === "2yr_fixed" && Number(r.rate_percent || 0) > 0).sort((a, b) => Number(a.ltv_tier ?? 100) - Number(b.ltv_tier ?? 100));
  const benchmark = fixedRows.find((r) => Number(r.ltv_tier ?? 100) >= ltv) ?? fixedRows.at(-1);
  const benchmarkRate = Number(benchmark?.rate_percent || 0);
  const defaultRate = benchmarkRate || Number(deal?.interest_rate || 0) || 4.75;
  const rows = scenarios ?? [];
  const latest = rows[0];

  return <><Nav/><HouseShell homes={homes} deals={deals} valuations={valuations}><div className="space-y-5">
    <header><p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-600">Affordability</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">What could your household comfortably afford?</h1><p className="mt-2 max-w-4xl text-sm font-medium leading-6 text-slate-500">LOOP starts with what it already knows. Every scenario value can still be overwritten without changing the underlying House or household records.</p></header>

    <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
      <StatCard title="Current home value" value={formatMoney(currentValue)} helper="From House valuation"/>
      <StatCard title="Current mortgage" value={formatMoney(currentBalance)} helper={`${ltv.toFixed(1)}% LTV`}/>
      <StatCard title="Current equity" value={formatMoney(equity)} helper="Value less mortgage"/>
      <StatCard title="BoE Bank Rate" value={bankRate > 0 ? `${bankRate.toFixed(2)}%` : "Pending"} helper="Market context, not an offer"/>
    </section>
    <section className="grid gap-3 md:grid-cols-3">
      <StatCard title="Gross household income" value={formatMoney(grossIncome)} helper="Active pay events"/>
      <StatCard title="Fixed/debt costs" value={formatMoney(fixedCosts)} helper="Current mortgage excluded"/>
      <StatCard title="Child costs" value={formatMoney(childcare)} helper="Active childcare/activity logic"/>
    </section>

    <SectionCard title="Build a house-move scenario" description="Known values are pre-filled from LOOP. Change any of them for this scenario only.">
      <form action={addAffordabilityScenario} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FormInput label="Scenario name" name="label" placeholder="Can we afford a £550k house?" required/>
        <FormInput label="Target house price" name="purchase_price" type="number" step="0.01" required/>
        <FormInput label="Additional deposit cash" name="deposit_cash" type="number" step="0.01" defaultValue={0}/>
        <label className="block"><span className="text-sm font-medium text-slate-700">Current property sale price<Known>From House</Known></span><input name="current_property_sale_price" type="number" step="0.01" defaultValue={currentValue} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"/></label>
        <label className="block"><span className="text-sm font-medium text-slate-700">Current mortgage balance<Known>From House</Known></span><input name="current_mortgage_balance" type="number" step="0.01" defaultValue={currentBalance} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"/></label>
        <label className="block"><span className="text-sm font-medium text-slate-700">Gross household income<Known>From household</Known></span><input name="gross_household_income" type="number" step="0.01" defaultValue={grossIncome} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"/></label>
        <label className="block"><span className="text-sm font-medium text-slate-700">Monthly fixed costs<Known>Mortgage excluded</Known></span><input name="monthly_fixed_costs" type="number" step="0.01" defaultValue={fixedCosts} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"/></label>
        <label className="block"><span className="text-sm font-medium text-slate-700">Monthly child costs<Known>From household</Known></span><input name="monthly_childcare" type="number" step="0.01" defaultValue={childcare} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"/></label>
        <label className="block"><span className="text-sm font-medium text-slate-700">Interest rate %<Known>{benchmarkRate > 0 ? "BoE benchmark" : "Current/default"}</Known></span><input name="interest_rate" type="number" step="0.001" defaultValue={defaultRate} required className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"/></label>
        <FormInput label="Stress rate %" name="stress_rate" type="number" step="0.001" defaultValue={Math.max(defaultRate + 2, 6.5)}/>
        <FormInput label="Term years" name="term_years" type="number" step="1" defaultValue={Number(deal?.term_years || 30)}/>
        <FormInput label="Fees / moving costs" name="arrangement_and_moving_costs" type="number" step="0.01" defaultValue={3500}/>
        <label className="block md:col-span-2"><span className="text-sm font-medium text-slate-700">Target property URL / notes</span><input name="target_property_url" placeholder="Rightmove/Zoopla URL or notes" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-violet-500 focus:ring-2"/></label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="first_time_buyer" className="h-4 w-4 rounded border-slate-300"/> First-time buyer relief</label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="is_additional_property" className="h-4 w-4 rounded border-slate-300"/> Additional property</label>
        <div className="flex items-end"><SubmitButton>Save affordability scenario</SubmitButton></div>
      </form>
    </SectionCard>

    {latest ? <SectionCard title="Latest scenario">{(() => {
      const stampDuty = calculateStampDutyEngland({ purchasePrice: Number(latest.purchase_price), firstTimeBuyer: latest.first_time_buyer, additionalProperty: latest.is_additional_property });
      const latestEquity = Math.max(0, Number(latest.current_property_sale_price) - Number(latest.current_mortgage_balance));
      const loan = Math.max(0, Number(latest.purchase_price) - Number(latest.deposit_cash) - latestEquity);
      const payment = calculateMonthlyMortgagePayment({ balance: loan, annualInterestRate: Number(latest.interest_rate), termYears: Number(latest.term_years) });
      const stress = calculateMonthlyMortgagePayment({ balance: loan, annualInterestRate: Number(latest.stress_rate), termYears: Number(latest.term_years) });
      const calc = calculateAffordabilityScenario({ purchasePrice: Number(latest.purchase_price), depositCash: Number(latest.deposit_cash), currentPropertySalePrice: Number(latest.current_property_sale_price), currentMortgageBalance: Number(latest.current_mortgage_balance), grossHouseholdIncome: Number(latest.gross_household_income), monthlyFixedCosts: Number(latest.monthly_fixed_costs), monthlyChildcare: Number(latest.monthly_childcare), monthlyMortgagePayment: payment, stressMortgagePayment: stress, stampDuty, arrangementAndMovingCosts: Number(latest.arrangement_and_moving_costs) });
      return <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><StatCard title="Loan required" value={formatMoney(calc.loanRequired)} helper={`${calc.ltv.toFixed(1)}% LTV`}/><StatCard title="Monthly mortgage" value={formatMoney(payment)} helper={`${latest.interest_rate}% over ${latest.term_years} years`}/><StatCard title="Stress payment" value={formatMoney(stress)} helper={`${latest.stress_rate}% stress rate`}/><StatCard title="Stamp duty" value={formatMoney(stampDuty)} helper="England/NI estimate"/></section>;
    })()}</SectionCard> : null}

    <SectionCard title="Previous affordability scenarios"><div className="grid gap-4 lg:grid-cols-2">{rows.map((scenario) => {
      const sd = calculateStampDutyEngland({ purchasePrice: Number(scenario.purchase_price), firstTimeBuyer: scenario.first_time_buyer, additionalProperty: scenario.is_additional_property });
      const eq = Math.max(0, Number(scenario.current_property_sale_price) - Number(scenario.current_mortgage_balance));
      const loan = Math.max(0, Number(scenario.purchase_price) - Number(scenario.deposit_cash) - eq);
      const payment = calculateMonthlyMortgagePayment({ balance: loan, annualInterestRate: Number(scenario.interest_rate), termYears: Number(scenario.term_years) });
      return <article key={scenario.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="font-bold text-slate-950">{scenario.label}</h3><p className="mt-1 text-xs font-medium text-slate-500">{formatMoney(Number(scenario.purchase_price))} target · {formatMoney(loan)} mortgage</p></div><form action={deleteAffordabilityScenario}><input type="hidden" name="id" value={scenario.id}/><button className="text-xs font-bold text-rose-600">Delete</button></form></div><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Payment</p><p className="mt-1 font-bold text-slate-950">{formatMoney(payment)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Stamp duty</p><p className="mt-1 font-bold text-slate-950">{formatMoney(sd)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Rate</p><p className="mt-1 font-bold text-slate-950">{Number(scenario.interest_rate).toFixed(2)}%</p></div></div></article>;
    })}{!rows.length ? <p className="text-sm font-medium text-slate-400">No saved affordability scenarios yet.</p> : null}</div></SectionCard>
  </div></HouseShell></>;
}
