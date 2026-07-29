import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdContext, householdMemberDataOrFilter } from "@/lib/auth/household-context";
import { formatMoney } from "@/lib/format/money";
import { calculateMonthlyMortgagePayment } from "@/lib/calculations/mortgage";
import { calculateAffordabilityScenario, calculateStampDutyEngland } from "@/lib/calculations/property";
import { ActivityBillingMode, BillingSchedule, DaySession, FundingMode, calculateActivityMonthlyCost, calculateNurseryMonthlyCost } from "@/lib/calculations/childcare";
import { addAffordabilityScenario, deleteAffordabilityScenario } from "./actions";

type Scenario = {
  id: string;
  label: string;
  purchase_price: number;
  deposit_cash: number;
  current_property_sale_price: number;
  current_mortgage_balance: number;
  gross_household_income: number;
  monthly_fixed_costs: number;
  monthly_childcare: number;
  interest_rate: number;
  stress_rate: number;
  term_years: number;
  arrangement_and_moving_costs: number;
  is_additional_property: boolean;
  first_time_buyer: boolean;
};

type PayEvent = {
  gross_annual_salary: number;
  effective_from: string;
  effective_until: string | null;
};

type ChildCost = {
  cost_kind: "fixed" | "nursery" | "activity" | null;
  monthly_cost: number;
  billing_month: string | null;
  daily_rate: number | null;
  extra_daily_cost: number | null;
  funded_hours_per_week: number | null;
  funding_mode: FundingMode | null;
  hourly_funding_credit: number | null;
  term_weeks_per_year: number | null;
  billing_schedule: BillingSchedule | null;
  bank_holidays_are_free: boolean | null;
  tax_free_childcare_enabled?: boolean | null;
  tax_free_childcare_cap_per_quarter?: number | null;
  part_day_multiplier: number | null;
  full_day_hours: number | null;
  part_day_hours: number | null;
  monday_session: DaySession | null;
  tuesday_session: DaySession | null;
  wednesday_session: DaySession | null;
  thursday_session: DaySession | null;
  friday_session: DaySession | null;
  activity_weekly_cost: number | null;
  activity_weekday: number | null;
  activity_billing_mode: ActivityBillingMode | null;
  activity_term_weeks_per_year: number | null;
  monday_hours: number | null;
  tuesday_hours: number | null;
  wednesday_hours: number | null;
  thursday_hours: number | null;
  friday_hours: number | null;
  starts_on: string;
  ends_on: string | null;
};

type SpendingCategory = {
  monthly_budget: number;
  type: string;
};

function isActiveRange(start: string, end: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  return start <= today && (!end || end >= today);
}

function currentBillingMonth() {
  return new Date().toISOString().slice(0, 7);
}

function getChildCostMonthlyAmount(cost: ChildCost, billingMonth = currentBillingMonth()) {
  if (cost.cost_kind === "activity") {
    return calculateActivityMonthlyCost({
      billingMonth,
      weeklyCost: Number(cost.activity_weekly_cost ?? cost.monthly_cost ?? 0),
      activityWeekday: Number(cost.activity_weekday ?? 6),
      activityBillingMode: cost.activity_billing_mode ?? "calendar",
      activityTermWeeksPerYear: Number(cost.activity_term_weeks_per_year ?? 38),
      bankHolidaysAreFree: Boolean(cost.bank_holidays_are_free),
    }).estimatedMonthlyCost;
  }

  if (cost.cost_kind !== "nursery") return Number(cost.monthly_cost ?? 0);

  return calculateNurseryMonthlyCost({
    billingMonth,
    dailyRate: Number(cost.daily_rate ?? 0),
    extraDailyCost: Number(cost.extra_daily_cost ?? 0),
    fundedHoursPerWeek: Number(cost.funded_hours_per_week ?? 0),
    fundingMode: cost.funding_mode ?? "none",
    hourlyFundingCredit: Number(cost.hourly_funding_credit ?? 0),
    termWeeksPerYear: Number(cost.term_weeks_per_year ?? 38),
    billingSchedule: cost.billing_schedule ?? "all_year",
    bankHolidaysAreFree: Boolean(cost.bank_holidays_are_free),
    taxFreeChildcareEnabled: Boolean(cost.tax_free_childcare_enabled),
    taxFreeChildcareCapPerQuarter: Number(cost.tax_free_childcare_cap_per_quarter ?? 500),
    partDayMultiplier: Number(cost.part_day_multiplier ?? 0.5),
    fullDayHours: Number(cost.full_day_hours ?? 10),
    partDayHours: Number(cost.part_day_hours ?? 5),
    mondaySession: cost.monday_session ?? "off",
    tuesdaySession: cost.tuesday_session ?? "off",
    wednesdaySession: cost.wednesday_session ?? "off",
    thursdaySession: cost.thursday_session ?? "off",
    fridaySession: cost.friday_session ?? "off",
    mondayHours: Number(cost.monday_hours ?? 0),
    tuesdayHours: Number(cost.tuesday_hours ?? 0),
    wednesdayHours: Number(cost.wednesday_hours ?? 0),
    thursdayHours: Number(cost.thursday_hours ?? 0),
    fridayHours: Number(cost.friday_hours ?? 0),
  }).estimatedMonthlyCost;
}

export default async function AffordabilityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const householdVisibleFilter = householdMemberDataOrFilter(householdContext);

  const [{ data: scenarios }, { data: payEvents }, { data: childCosts }, { data: categories }] = await Promise.all([
    supabase.from("affordability_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).returns<Scenario[]>(),
    supabase.from("pay_events").select("gross_annual_salary, effective_from, effective_until").or(householdVisibleFilter).returns<PayEvent[]>(),
    supabase.from("child_costs").select("cost_kind, monthly_cost, billing_month, daily_rate, extra_daily_cost, funded_hours_per_week, funding_mode, hourly_funding_credit, term_weeks_per_year, billing_schedule, bank_holidays_are_free, tax_free_childcare_enabled, tax_free_childcare_cap_per_quarter, part_day_multiplier, full_day_hours, part_day_hours, monday_session, tuesday_session, wednesday_session, thursday_session, friday_session, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, activity_weekly_cost, activity_weekday, activity_billing_mode, activity_term_weeks_per_year, starts_on, ends_on").or(householdVisibleFilter).returns<ChildCost[]>(),
    supabase.from("spending_categories").select("monthly_budget, type").or(householdVisibleFilter).returns<SpendingCategory[]>(),
  ]);

  const currentGrossIncome = (payEvents ?? [])
    .filter((event) => isActiveRange(event.effective_from, event.effective_until))
    .reduce((sum, event) => sum + Number(event.gross_annual_salary), 0);

  const currentChildcare = (childCosts ?? [])
    .filter((cost) => isActiveRange(cost.starts_on, cost.ends_on))
    .reduce((sum, cost) => sum + getChildCostMonthlyAmount(cost), 0);

  const fixedCosts = (categories ?? [])
    .filter((category) => ["fixed", "debt"].includes(category.type))
    .reduce((sum, category) => sum + Number(category.monthly_budget), 0);

  const scenarioRows = scenarios ?? [];
  const latest = scenarioRows[0];

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">House move affordability search</h1>
          <p className="mt-1 text-slate-600">
            Model future house purchases using income, equity, LTV, mortgage rates, stamp duty, fixed costs and child costs.
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard title="Current gross income" value={formatMoney(currentGrossIncome)} helper="From active household pay events" />
          <StatCard title="Current child costs" value={formatMoney(currentChildcare)} helper="Active monthly child costs" />
          <StatCard title="Fixed/debt costs" value={formatMoney(fixedCosts)} helper="From spending planner" />
        </section>

        <SectionCard title="Quick answer box" description="Tell it the house budget or paste a target-house URL, then save the result as a previous search you can delete later.">
          <form action={addAffordabilityScenario} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <FormInput label="Search name" name="label" placeholder="Can we afford a £550k house?" required />
            <FormInput label="Target house price" name="purchase_price" type="number" step="0.01" required />
            <FormInput label="Deposit cash" name="deposit_cash" type="number" step="0.01" defaultValue={0} />
            <FormInput label="Current property sale price" name="current_property_sale_price" type="number" step="0.01" defaultValue={0} />
            <FormInput label="Current mortgage balance" name="current_mortgage_balance" type="number" step="0.01" defaultValue={0} />
            <FormInput label="Gross household income" name="gross_household_income" type="number" step="0.01" defaultValue={currentGrossIncome} />
            <FormInput label="Monthly fixed costs" name="monthly_fixed_costs" type="number" step="0.01" defaultValue={fixedCosts} />
            <FormInput label="Monthly child costs" name="monthly_childcare" type="number" step="0.01" defaultValue={currentChildcare} />
            <FormInput label="Interest rate %" name="interest_rate" type="number" step="0.001" defaultValue={4.75} required />
            <FormInput label="Stress rate %" name="stress_rate" type="number" step="0.001" defaultValue={6.5} />
            <FormInput label="Term years" name="term_years" type="number" step="1" defaultValue={30} />
            <FormInput label="Fees/moving costs" name="arrangement_and_moving_costs" type="number" step="0.01" defaultValue={3500} />
            <label className="block lg:col-span-2"><span className="text-sm font-medium text-slate-700">Target property URL / notes</span><input name="target_property_url" placeholder="Rightmove/Zoopla URL or notes" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2" /></label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="first_time_buyer" className="h-4 w-4 rounded border-slate-300" /> First-time buyer relief
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="is_additional_property" className="h-4 w-4 rounded border-slate-300" /> Additional property
            </label>
            <div className="flex items-end"><SubmitButton>Save affordability search</SubmitButton></div>
          </form>
        </SectionCard>

        {latest ? (
          <SectionCard title="Latest scenario headline">
            {(() => {
              const stampDuty = calculateStampDutyEngland({
                purchasePrice: Number(latest.purchase_price),
                firstTimeBuyer: latest.first_time_buyer,
                additionalProperty: latest.is_additional_property,
              });
              const equity = Math.max(0, Number(latest.current_property_sale_price) - Number(latest.current_mortgage_balance));
              const loanRequired = Math.max(0, Number(latest.purchase_price) - Number(latest.deposit_cash) - equity);
              const payment = calculateMonthlyMortgagePayment({ balance: loanRequired, annualInterestRate: Number(latest.interest_rate), termYears: Number(latest.term_years) });
              const stressPayment = calculateMonthlyMortgagePayment({ balance: loanRequired, annualInterestRate: Number(latest.stress_rate), termYears: Number(latest.term_years) });
              const calc = calculateAffordabilityScenario({
                purchasePrice: Number(latest.purchase_price),
                depositCash: Number(latest.deposit_cash),
                currentPropertySalePrice: Number(latest.current_property_sale_price),
                currentMortgageBalance: Number(latest.current_mortgage_balance),
                grossHouseholdIncome: Number(latest.gross_household_income),
                monthlyFixedCosts: Number(latest.monthly_fixed_costs),
                monthlyChildcare: Number(latest.monthly_childcare),
                monthlyMortgagePayment: payment,
                stressMortgagePayment: stressPayment,
                stampDuty,
                arrangementAndMovingCosts: Number(latest.arrangement_and_moving_costs),
              });

              return (
                <section className="grid gap-4 md:grid-cols-4">
                  <StatCard title="Loan required" value={formatMoney(calc.loanRequired)} helper={`${calc.ltv.toFixed(1)}% LTV`} />
                  <StatCard title="Monthly mortgage" value={formatMoney(payment)} helper={`${latest.interest_rate}% over ${latest.term_years} years`} />
                  <StatCard title="Stress payment" value={formatMoney(stressPayment)} helper={`${latest.stress_rate}% stress rate`} />
                  <StatCard title="Stamp duty" value={formatMoney(stampDuty)} helper="England/NI residential estimate" />
                </section>
              );
            })()}
          </SectionCard>
        ) : null}

        <SectionCard title="Previous affordability searches">
          <div className="grid gap-4 lg:grid-cols-2">
            {scenarioRows.map((scenario) => {
              const stampDuty = calculateStampDutyEngland({
                purchasePrice: Number(scenario.purchase_price),
                firstTimeBuyer: scenario.first_time_buyer,
                additionalProperty: scenario.is_additional_property,
              });
              const equity = Math.max(0, Number(scenario.current_property_sale_price) - Number(scenario.current_mortgage_balance));
              const loanRequired = Math.max(0, Number(scenario.purchase_price) - Number(scenario.deposit_cash) - equity);
              const payment = calculateMonthlyMortgagePayment({ balance: loanRequired, annualInterestRate: Number(scenario.interest_rate), termYears: Number(scenario.term_years) });
              const stressPayment = calculateMonthlyMortgagePayment({ balance: loanRequired, annualInterestRate: Number(scenario.stress_rate), termYears: Number(scenario.term_years) });
              const calc = calculateAffordabilityScenario({
                purchasePrice: Number(scenario.purchase_price),
                depositCash: Number(scenario.deposit_cash),
                currentPropertySalePrice: Number(scenario.current_property_sale_price),
                currentMortgageBalance: Number(scenario.current_mortgage_balance),
                grossHouseholdIncome: Number(scenario.gross_household_income),
                monthlyFixedCosts: Number(scenario.monthly_fixed_costs),
                monthlyChildcare: Number(scenario.monthly_childcare),
                monthlyMortgagePayment: payment,
                stressMortgagePayment: stressPayment,
                stampDuty,
                arrangementAndMovingCosts: Number(scenario.arrangement_and_moving_costs),
              });

              return (
                <div key={scenario.id} className="rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-950">{scenario.label}</h3>
                      <p className="text-sm text-slate-500">{formatMoney(scenario.purchase_price)} purchase · {formatMoney(calc.availableDeposit)} available deposit/equity</p>
                    </div>
                    <form action={deleteAffordabilityScenario}>
                      <input type="hidden" name="id" value={scenario.id} />
                      <button className="text-sm font-medium text-red-600">Delete</button>
                    </form>
                  </div>
                  <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Loan required</dt><dd className="font-bold">{formatMoney(calc.loanRequired)}</dd></div>
                    <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">LTV</dt><dd className="font-bold">{calc.ltv.toFixed(1)}%</dd></div>
                    <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Income multiple</dt><dd className="font-bold">{calc.incomeMultiple.toFixed(2)}x</dd></div>
                    <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Mortgage payment</dt><dd className="font-bold">{formatMoney(payment)}</dd></div>
                    <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Stress payment</dt><dd className="font-bold">{formatMoney(stressPayment)}</dd></div>
                    <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Stamp duty + fees</dt><dd className="font-bold">{formatMoney(calc.upfrontCashNeeded)}</dd></div>
                  </dl>
                </div>
              );
            })}
            {scenarioRows.length === 0 ? <p className="text-sm text-slate-500">No scenarios yet.</p> : null}
          </div>
        </SectionCard>
      </main>
    </>
  );
}
