import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { MortgagePlannerClient, type Home, type HomeMortgageDeal, type HomeOwner, type HomeValuationSource, type MortgageScenario, type Person } from "@/components/mortgage/MortgagePlannerClient";
import {
  buildMonthPlan,
  currentMonth,
  type ChildCostForPlan,
  type FinancialProfile,
  type HomeMortgageDealForPlan,
  type PayEventForPlan,
  type PersonForPlan,
  type PlannedItemForPlan,
  type SpendingCategoryForPlan,
} from "@/lib/planning/month-plan";
import { getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";

export default async function MortgagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const [
    { data: scenarios },
    { data: people },
    { data: homes },
    { data: owners },
    { data: deals },
    { data: valuations },
    { data: profile },
    { data: categories },
    { data: childCosts },
    { data: payEvents },
    { data: plannedItems },
  ] = await Promise.all([
    supabase
      .from("mortgage_scenarios")
      .select("id, name, balance, interest_rate, term_years, monthly_overpayment")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .returns<MortgageScenario[]>(),
    supabase
      .from("people")
      .select("id, name, relationship, birth_date")
      .or(visibleDataOrFilter(householdContext))
      .or("account_status.is.null,account_status.neq.duplicate_merged")
      .order("relationship")
      .returns<Person[]>(),
    supabase
      .from("homes")
      .select("id, label, house_number, address_line, postcode, full_address, city, region, country, latitude, longitude, map_url, lookup_source, uprn, property_type, purchase_source_url, last_lookup_at, ownership_status, property_value, estimated_value_low, estimated_value_mid, estimated_value_high, estimated_value_date, purchase_price, purchase_date, target_purchase_price, target_extra_cash, target_interest_rate, target_term_years, notes")
      .or(visibleDataOrFilter(householdContext))
      .order("created_at", { ascending: false })
      .returns<Home[]>(),
    supabase
      .from("home_owners")
      .select("id, home_id, person_id, ownership_percent")
      .or(visibleDataOrFilter(householdContext))
      .returns<HomeOwner[]>(),
    supabase
      .from("home_mortgage_deals")
      .select("id, home_id, lender, product_name, balance, balance_as_of_date, interest_rate, rate_type, repayment_type, initial_period_end, term_years, monthly_payment_override, start_date, end_date, notes")
      .or(visibleDataOrFilter(householdContext))
      .order("created_at", { ascending: false })
      .returns<HomeMortgageDeal[]>(),
    supabase
      .from("home_valuation_sources")
      .select("id, home_id, source_name, source_type, valuation_low, valuation_mid, valuation_high, valuation_amount, confidence, valuation_date, source_url, notes")
      .or(visibleDataOrFilter(householdContext))
      .order("valuation_date", { ascending: false })
      .returns<HomeValuationSource[]>(),
    supabase
      .from("financial_profiles")
      .select("name, annual_salary, monthly_take_home, monthly_dividends, pension_percent, student_loan_plan, monthly_mortgage, monthly_savings_target")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("spending_categories")
      .select("id, name, type, monthly_budget")
      .or(visibleDataOrFilter(householdContext))
      .returns<SpendingCategoryForPlan[]>(),
    supabase
      .from("child_costs")
      .select("id, child_id, label, cost_kind, monthly_cost, billing_month, daily_rate, extra_daily_cost, funded_hours_per_week, funding_mode, hourly_funding_credit, term_weeks_per_year, billing_schedule, bank_holidays_are_free, tax_free_childcare_enabled, tax_free_childcare_cap_per_quarter, part_day_multiplier, full_day_hours, part_day_hours, monday_session, tuesday_session, wednesday_session, thursday_session, friday_session, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, activity_weekly_cost, activity_weekday, activity_billing_mode, activity_term_weeks_per_year, starts_on, ends_on")
      .or(visibleDataOrFilter(householdContext))
      .returns<ChildCostForPlan[]>(),
    supabase
      .from("pay_events")
      .select("id, person_id, label, pay_kind, gross_annual_salary, monthly_take_home_override, pension_percent, pension_method, student_loan_plan, effective_from, effective_until, maternity_scheme, maternity_leave_start, maternity_leave_end, maternity_pay_mode, maternity_full_pay_weeks, maternity_half_pay_weeks, maternity_smp_only_weeks, maternity_unpaid_weeks, maternity_smp_weekly_rate")
      .or(visibleDataOrFilter(householdContext))
      .returns<PayEventForPlan[]>(),
    supabase
      .from("planned_items")
      .select("id, person_id, direction, item_type, label, amount, recurrence, start_date, end_date, day_of_month")
      .or(visibleDataOrFilter(householdContext))
      .returns<PlannedItemForPlan[]>(),
  ]);

  const peopleRows = (people ?? []) as Person[];
  const peopleForPlan = peopleRows as PersonForPlan[];
  const peopleById = new Map(peopleForPlan.map((person) => [person.id, person]));
  const monthPlan = buildMonthPlan({
    month: currentMonth(),
    profile: (profile as FinancialProfile | null) ?? null,
    categories: (categories ?? []) as SpendingCategoryForPlan[],
    childCosts: (childCosts ?? []) as ChildCostForPlan[],
    payEvents: (payEvents ?? []) as PayEventForPlan[],
    mortgageDeals: ((deals ?? []) as HomeMortgageDeal[]).map((deal) => ({
      id: deal.id,
      lender: deal.lender,
      balance: deal.balance,
      interest_rate: deal.interest_rate,
      term_years: deal.term_years,
      monthly_payment_override: deal.monthly_payment_override,
      start_date: deal.start_date,
      end_date: deal.end_date,
    })) as HomeMortgageDealForPlan[],
    plannedItems: (plannedItems ?? []) as PlannedItemForPlan[],
    peopleById,
  });

  return (
    <>
      <Nav />
      <MortgagePlannerClient
        scenarios={scenarios ?? []}
        people={peopleRows}
        homes={homes ?? []}
        owners={owners ?? []}
        deals={deals ?? []}
        valuations={valuations ?? []}
        monthPlan={monthPlan}
      />
    </>
  );
}
