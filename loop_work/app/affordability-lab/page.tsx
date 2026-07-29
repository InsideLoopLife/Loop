import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { AffordabilitySearchClient } from "@/components/affordability/AffordabilitySearchClient";
import { calculateMonthlyMortgagePayment } from "@/lib/calculations/mortgage";
import {
  buildMonthPlan,
  currentMonth,
  isActiveInMonth,
  type ChildCostForPlan,
  type FinancialProfile,
  type HomeMortgageDealForPlan,
  type PayEventForPlan,
  type PersonForPlan,
  type PlannedItemForPlan,
  type SpendingCategoryForPlan,
} from "@/lib/planning/month-plan";

// The lab reads the same planning tables as Financial Flow so affordability checks
// are based on actual household costs, not stale manual fields.
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
  affordability_score: string | null;
  monthly_buffer: number | null;
  notes: string | null;
  created_at: string | null;
};

type MortgageDeal = HomeMortgageDealForPlan & { monthly_payment_override: number | null };
type StudentLoanAccount = { current_balance: number | null; payroll_monthly_override: number | null };

function mortgageMonthlyPayment(deal: MortgageDeal) {
  if (deal.monthly_payment_override !== null && deal.monthly_payment_override !== undefined) return Number(deal.monthly_payment_override);
  return calculateMonthlyMortgagePayment({ balance: Number(deal.balance || 0), annualInterestRate: Number(deal.interest_rate || 0), termYears: Number(deal.term_years || 25) });
}

function plannedItemActive(item: PlannedItemForPlan, month: string) {
  return item.recurrence === "one_off"
    ? item.start_date.slice(0, 7) === month
    : isActiveInMonth(item.start_date, item.end_date, month);
}

export default async function AffordabilityLabPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const month = currentMonth();
  const [
    { data: scenarios },
    { data: people },
    { data: profile },
    { data: payEvents },
    { data: childCosts },
    { data: categories },
    { data: plannedItems },
    { data: mortgageDeals },
    { data: homes },
    { data: studentLoans },
  ] = await Promise.all([
    supabase.from("affordability_scenarios").select("id, label, purchase_price, deposit_cash, current_property_sale_price, current_mortgage_balance, gross_household_income, monthly_fixed_costs, monthly_childcare, interest_rate, stress_rate, term_years, arrangement_and_moving_costs, affordability_score, monthly_buffer, notes, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).returns<Scenario[]>(),
    supabase.from("people").select("id, name, relationship").eq("user_id", user.id).returns<PersonForPlan[]>(),
    supabase.from("financial_profiles").select("name, annual_salary, monthly_take_home, monthly_dividends, pension_percent, student_loan_plan, monthly_mortgage, monthly_savings_target").eq("user_id", user.id).maybeSingle(),
    supabase.from("pay_events").select("id, person_id, label, pay_kind, gross_annual_salary, monthly_take_home_override, pension_percent, pension_method, student_loan_plan, effective_from, effective_until, maternity_scheme, maternity_leave_start, maternity_leave_end, maternity_pay_mode, maternity_full_pay_weeks, maternity_half_pay_weeks, maternity_smp_only_weeks, maternity_unpaid_weeks, maternity_smp_weekly_rate").eq("user_id", user.id).returns<PayEventForPlan[]>(),
    supabase.from("child_costs").select("id, child_id, label, cost_kind, monthly_cost, billing_month, daily_rate, extra_daily_cost, funded_hours_per_week, funding_mode, hourly_funding_credit, term_weeks_per_year, billing_schedule, bank_holidays_are_free, tax_free_childcare_enabled, tax_free_childcare_cap_per_quarter, part_day_multiplier, full_day_hours, part_day_hours, monday_session, tuesday_session, wednesday_session, thursday_session, friday_session, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, activity_weekly_cost, activity_weekday, activity_billing_mode, activity_term_weeks_per_year, starts_on, ends_on").eq("user_id", user.id).returns<ChildCostForPlan[]>(),
    supabase.from("spending_categories").select("id, name, type, monthly_budget").eq("user_id", user.id).returns<SpendingCategoryForPlan[]>(),
    supabase.from("planned_items").select("id, person_id, category_id, direction, item_type, label, amount, recurrence, recurrence_interval_days, start_date, end_date, day_of_month").eq("user_id", user.id).returns<(PlannedItemForPlan & { category_id: string | null })[]>(),
    supabase.from("home_mortgage_deals").select("id, lender, balance, interest_rate, term_years, monthly_payment_override, start_date, end_date").eq("user_id", user.id).returns<MortgageDeal[]>(),
    supabase.from("homes").select("property_value, estimated_value_mid, target_purchase_price").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
    supabase.from("student_loan_accounts").select("current_balance, payroll_monthly_override").eq("user_id", user.id).returns<StudentLoanAccount[]>(),
  ]);

  const peopleRows = people ?? [];
  const peopleById = new Map(peopleRows.map((person) => [person.id, person]));
  const profileRow = profile as FinancialProfile | null;
  const categoryRows = (categories ?? []) as SpendingCategoryForPlan[];
  const plannedRows = (plannedItems ?? []) as (PlannedItemForPlan & { category_id: string | null })[];
  const mortgageRows = mortgageDeals ?? [];
  const monthPlan = buildMonthPlan({
    month,
    profile: profileRow,
    categories: categoryRows,
    childCosts: childCosts ?? [],
    payEvents: payEvents ?? [],
    mortgageDeals: mortgageRows,
    plannedItems: plannedRows,
    peopleById,
  });

  const activeMortgagePayment = mortgageRows.filter((deal) => isActiveInMonth(deal.start_date, deal.end_date, month)).reduce((sum, deal) => sum + mortgageMonthlyPayment(deal), 0) || Number(profileRow?.monthly_mortgage || 0);
  const activeChildcare = monthPlan.outgoingItems.filter((item) => /nursery|childcare|child cost|activity|class/i.test(`${item.label} ${item.helper}`)).reduce((sum, item) => sum + item.value, 0);
  const categoryById = new Map(categoryRows.map((category) => [category.id, category]));
  const activeOutgoingPlanned = plannedRows.filter((item) => item.direction === "outgoing" && plannedItemActive(item, month));
  const debtPayments = activeOutgoingPlanned.filter((item) => item.item_type === "debt_payment" || categoryById.get(item.category_id || "")?.type === "debt").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const carFinance = activeOutgoingPlanned.filter((item) => /car|vehicle|pcp|lease|vw|finance|transport/i.test(`${item.item_type} ${item.label} ${categoryById.get(item.category_id || "")?.name || ""}`)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const studentLoanMonthly = (studentLoans ?? []).reduce((sum, loan) => sum + Number(loan.payroll_monthly_override || 0), 0);
  const fixedCosts = Math.max(0, monthPlan.outgoings - activeMortgagePayment - activeChildcare);
  const activeGrossIncome = (payEvents ?? [])
    .filter((event) => isActiveInMonth(event.effective_from, event.effective_until, month))
    .reduce((sum, event) => sum + Number(event.gross_annual_salary || 0), 0) || Number(profileRow?.annual_salary || 0);
  const latestHome = Array.isArray(homes) ? homes[0] as { property_value?: number | null; estimated_value_mid?: number | null; target_purchase_price?: number | null } | undefined : undefined;
  const currentMortgageBalance = mortgageRows.filter((deal) => isActiveInMonth(deal.start_date, deal.end_date, month)).reduce((sum, deal) => sum + Number(deal.balance || 0), 0);

  return (
    <>
      <Nav />
      <main className="mx-auto w-[95vw] max-w-none space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        <AffordabilitySearchClient
          context={{
            currentGrossIncome: activeGrossIncome,
            currentNetMonthlyIncome: monthPlan.income,
            currentChildcare: activeChildcare,
            fixedCosts,
            debtPayments,
            carFinance,
            studentLoans: studentLoanMonthly,
            currentMortgagePayment: activeMortgagePayment,
            currentMortgageBalance,
            currentPropertyValue: Number(latestHome?.estimated_value_mid || latestHome?.property_value || 0),
            dependantChildren: peopleRows.filter((person) => person.relationship === "child").length,
            dependantAdults: peopleRows.filter((person) => person.relationship !== "child").length,
          }}
          scenarios={scenarios ?? []}
        />
      </main>
    </>
  );
}
