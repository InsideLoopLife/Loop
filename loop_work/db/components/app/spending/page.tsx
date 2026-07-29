import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { SpendingPlannerClient, type BankImport, type RegularPaymentCandidate, type ChildCost, type PayEvent, type Person, type PlannedItem, type SpendingCategory, type SpendingEntry } from "@/components/spending/SpendingPlannerClient";
import { applyVisibleDataFilter, getActiveHouseholdContext } from "@/lib/auth/household-context";

export default async function SpendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const [
    { data: people },
    { data: categories },
    { data: entries },
    { data: plannedItems },
    { data: payEvents },
    { data: childCosts },
    { data: bankImports },
    { data: regularCandidates },
  ] = await Promise.all([
    supabase
      .from("people")
      .select("id, name, relationship")
      .or("account_status.is.null,account_status.neq.duplicate_merged")
      .or(`${householdContext.householdId ? `user_id.eq.${householdContext.userId},and(household_id.eq.${householdContext.householdId},visibility_scope.eq.household)` : `user_id.eq.${householdContext.userId}`}`)
      .order("relationship")
      .order("name")
      .returns<Person[]>(),
    supabase
      .from("spending_categories")
      .select("id, name, monthly_budget, type")
      .or(`${householdContext.householdId ? `user_id.eq.${householdContext.userId},and(household_id.eq.${householdContext.householdId},visibility_scope.eq.household)` : `user_id.eq.${householdContext.userId}`}`)
      .order("type")
      .returns<SpendingCategory[]>(),
    supabase
      .from("spending_entries")
      .select("id, person_id, label, amount, spent_at, notes, category_id")
      .or(`${householdContext.householdId ? `user_id.eq.${householdContext.userId},and(household_id.eq.${householdContext.householdId},visibility_scope.eq.household)` : `user_id.eq.${householdContext.userId}`}`)
      .order("spent_at", { ascending: false })
      .limit(250)
      .returns<SpendingEntry[]>(),
    supabase
      .from("planned_items")
      .select("id, person_id, category_id, direction, item_type, label, amount, recurrence, start_date, end_date, day_of_month, payment_timing, payment_adjustment, notes")
      .or(`${householdContext.householdId ? `user_id.eq.${householdContext.userId},and(household_id.eq.${householdContext.householdId},visibility_scope.eq.household)` : `user_id.eq.${householdContext.userId}`}`)
      .order("start_date", { ascending: false })
      .returns<PlannedItem[]>(),
    supabase
      .from("pay_events")
      .select("id, person_id, label, pay_kind, gross_annual_salary, monthly_take_home_override, pension_percent, pension_method, student_loan_plan, effective_from, effective_until, maternity_scheme, maternity_leave_start, maternity_leave_end, maternity_pay_mode, maternity_full_pay_weeks, maternity_half_pay_weeks, maternity_smp_only_weeks, maternity_unpaid_weeks, maternity_smp_weekly_rate")
      .or(`${householdContext.householdId ? `user_id.eq.${householdContext.userId},and(household_id.eq.${householdContext.householdId},visibility_scope.eq.household)` : `user_id.eq.${householdContext.userId}`}`)
      .returns<PayEvent[]>(),
    supabase
      .from("child_costs")
      .select("id, child_id, label, cost_kind, monthly_cost, billing_month, daily_rate, extra_daily_cost, funded_hours_per_week, funding_mode, hourly_funding_credit, term_weeks_per_year, billing_schedule, bank_holidays_are_free, tax_free_childcare_enabled, tax_free_childcare_cap_per_quarter, part_day_multiplier, full_day_hours, part_day_hours, monday_session, tuesday_session, wednesday_session, thursday_session, friday_session, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, activity_weekly_cost, activity_weekday, activity_billing_mode, activity_term_weeks_per_year, starts_on, ends_on")
      .or(`${householdContext.householdId ? `user_id.eq.${householdContext.userId},and(household_id.eq.${householdContext.householdId},visibility_scope.eq.household)` : `user_id.eq.${householdContext.userId}`}`)
      .order("starts_on", { ascending: false })
      .returns<ChildCost[]>(),
    supabase
      .from("bank_imports")
      .select("id, person_id, account_name, provider_name, original_filename, imported_rows, detected_rows, status, created_at")
      .or(`${householdContext.householdId ? `user_id.eq.${householdContext.userId},and(household_id.eq.${householdContext.householdId},visibility_scope.eq.household)` : `user_id.eq.${householdContext.userId}`}`)
      .order("created_at", { ascending: false })
      .limit(8)
      .returns<BankImport[]>(),
    supabase
      .from("bank_regular_payment_candidates")
      .select("id, person_id, account_name, normalized_key, direction, label_suggestion, amount_average, amount_min, amount_max, day_of_month, first_seen, last_seen, occurrence_count, seen_month_count, confidence, sample_descriptions, sample_dates, notes, status")
      .or(`${householdContext.householdId ? `user_id.eq.${householdContext.userId},and(household_id.eq.${householdContext.householdId},visibility_scope.eq.household)` : `user_id.eq.${householdContext.userId}`}`)
      .eq("status", "suggested")
      .order("confidence", { ascending: false })
      .limit(30)
      .returns<RegularPaymentCandidate[]>(),
  ]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        <SpendingPlannerClient
          people={people ?? []}
          categories={categories ?? []}
          entries={entries ?? []}
          plannedItems={plannedItems ?? []}
          payEvents={payEvents ?? []}
          childCosts={childCosts ?? []}
          bankImports={bankImports ?? []}
          regularCandidates={regularCandidates ?? []}
        />
      </main>
    </>
  );
}
