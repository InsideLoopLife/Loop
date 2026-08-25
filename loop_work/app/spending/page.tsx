import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { FinancialFlowWorkspaceNav } from "@/components/financial-flow/FinancialFlowWorkspaceNav";
import { RouteBootSnapshotPublisher } from "@/components/performance/RouteBootSnapshotPublisher";
import { PageLandingExperience } from "@/components/landing/PageLandingExperience";
import { createClient } from "@/lib/supabase/server";
import { dedupeHouseholdPeople, getActiveHouseholdContext, householdMemberDataOrFilter, householdPeopleOrFilter } from "@/lib/auth/household-context";
import { type BankImport, type RegularPaymentCandidate, type ChildCost, type PayEvent, type Person, type PlannedItem, type SpendingCategory, type SpendingEntry, type StudentLoanAccount } from "@/components/spending/SpendingPlannerClient";
import { SpendingPlannerDeferredClient } from "@/components/spending/SpendingPlannerDeferredClient";

export default async function SpendingPage({ searchParams }: { searchParams?: Promise<{ month?: string; person?: string; direction?: string; add?: string; prefill_label?: string; prefill_amount?: string }> }) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const dataOwnerUserId = householdContext.dataOwnerUserId || user.id;
  const hasActiveHousehold = Boolean(householdContext.householdId);
  const householdVisibleFilter = householdMemberDataOrFilter(householdContext);
  const householdPeopleFilter = householdPeopleOrFilter(householdContext);

  const [
    { data: profile },
    { data: people },
    { data: categories },
    { data: entries },
    { data: plannedItems },
    { data: payEvents },
    { data: childCosts },
    { data: bankImports },
    { data: regularCandidates },
    { data: studentLoanAccounts },
    { data: paymentAccounts },
    { data: householdPets },
    { data: homeProfile },
    { data: categoryGroups },
    householdCountResult,
  ] = await Promise.all([
    supabase
      .from("app_user_profiles")
      .select("spending_person_display_mode, spending_date_format, spending_bill_logo_mode, money_display_precision, financial_flow_student_loan_enabled")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("people")
      .select("id, user_id, name, relationship, birth_date, avatar_url, linked_user_id, email, account_status, active_until")
      .or(householdPeopleFilter)
      .or("account_status.is.null,account_status.neq.duplicate_merged")
      .order("relationship")
      .order("name")
      .returns<Person[]>(),
    supabase
      .from("spending_categories")
      .select("id, name, monthly_budget, type, category_icon, standard_category_key, group_id")
      .or(householdVisibleFilter)
      .order("type")
      .returns<SpendingCategory[]>(),
    supabase
      .from("spending_entries")
      .select("id, person_id, label, amount, spent_at, notes, category_id, payment_account_id, pet_id")
      .or(householdVisibleFilter)
      .order("spent_at", { ascending: false })
      .limit(250)
      .returns<SpendingEntry[]>(),
    supabase
      .from("planned_items")
      .select("id, person_id, category_id, direction, item_type, label, amount, recurrence, recurrence_interval_days, start_date, end_date, day_of_month, payment_timing, payment_adjustment, brand_name, brand_domain, brand_logo_url, brand_logo_source, brand_logo_checked_at, end_behavior, renewal_notice_days, early_upgrade_date, expected_refund_amount, notes, payment_account_id, pet_id")
      .or(householdVisibleFilter)
      .order("start_date", { ascending: false })
      .returns<PlannedItem[]>(),
    supabase
      .from("pay_events")
      .select("id, person_id, label, pay_kind, gross_annual_salary, monthly_take_home_override, pension_percent, pension_method, student_loan_plan, effective_from, effective_until, maternity_scheme, maternity_leave_start, maternity_leave_end, maternity_pay_mode, maternity_full_pay_weeks, maternity_half_pay_weeks, maternity_smp_only_weeks, maternity_unpaid_weeks, maternity_smp_weekly_rate, pay_timing, pay_day_of_month, pay_adjustment")
      .or(householdVisibleFilter)
      .returns<PayEvent[]>(),
    supabase
      .from("child_costs")
      .select("id, child_id, bill_person_id, label, cost_kind, monthly_cost, billing_month, daily_rate, extra_daily_cost, funded_hours_per_week, funding_mode, hourly_funding_credit, term_weeks_per_year, billing_schedule, bank_holidays_are_free, tax_free_childcare_enabled, tax_free_childcare_cap_per_quarter, part_day_multiplier, full_day_hours, part_day_hours, monday_session, tuesday_session, wednesday_session, thursday_session, friday_session, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, activity_weekly_cost, activity_weekday, activity_billing_mode, activity_term_weeks_per_year, payment_timing, payment_day_of_month, payment_adjustment, starts_on, ends_on, care_type, care_details")
      .or(householdVisibleFilter)
      .order("starts_on", { ascending: false })
      .returns<ChildCost[]>(),
    Promise.resolve({ data: [] as BankImport[] }),
    Promise.resolve({ data: [] as RegularPaymentCandidate[] }),
    Promise.resolve({ data: [] as StudentLoanAccount[] }),
    Promise.resolve({ data: [] as any[] }),
    Promise.resolve({ data: [] as any[] }),
    Promise.resolve({ data: null }),
    Promise.resolve({ data: [] as any[] }),
    supabase
      .from("app_household_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", dataOwnerUserId)
      .eq("status", "active"),
  ]);

  const basePeople = dedupeHouseholdPeople((people ?? []) as any[], householdContext.dataOwnerUserId) as Person[];
  const linkedUserIds = Array.from(new Set(basePeople.map((person) => person.linked_user_id).filter(Boolean))) as string[];
  let peopleWithAvatars = basePeople;

  if (linkedUserIds.length > 0) {
    const { data: linkedProfiles } = await supabase
      .from("app_user_profiles")
      .select("user_id, avatar_url")
      .in("user_id", linkedUserIds);
    const avatarByUserId = new Map((linkedProfiles || []).map((linkedProfile: any) => [linkedProfile.user_id, linkedProfile.avatar_url]));
    peopleWithAvatars = basePeople.map((person) => ({
      ...person,
      avatar_url: person.avatar_url || (person.linked_user_id ? avatarByUserId.get(person.linked_user_id) || null : null),
    }));
  }

  return (
    <>
      <Nav />
      <FinancialFlowWorkspaceNav section="spending" month={resolvedSearchParams.month} />
      <RouteBootSnapshotPublisher
        routeKey="spending"
        payload={{
          version: 1,
          eyebrow: "Financial Flow · Spending",
          title: "Your spending workspace",
          headline: `${(plannedItems ?? []).length} planned item${(plannedItems ?? []).length === 1 ? "" : "s"}`,
          description: "Bills, logged spending and category context are refreshing from the latest household data.",
          tone: "orange",
          metrics: [
            { label: "Logged entries", value: String((entries ?? []).length) },
            { label: "Categories", value: String((categories ?? []).length) },
            { label: "Child costs", value: String((childCosts ?? []).length) },
            { label: "New suggestions", value: String((regularCandidates ?? []).length) },
          ],
        }}
      />
      <main className="mx-auto w-[95vw] max-w-[2000px] space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        {((entries ?? []).length + (plannedItems ?? []).length + (childCosts ?? []).length + (regularCandidates ?? []).length) === 0 ? <PageLandingExperience kind="spending" /> : null}
        <SpendingPlannerDeferredClient
          people={peopleWithAvatars}
          categories={categories ?? []}
          entries={entries ?? []}
          plannedItems={plannedItems ?? []}
          payEvents={payEvents ?? []}
          childCosts={childCosts ?? []}
          bankImports={bankImports ?? []}
          regularCandidates={regularCandidates ?? []}
          studentLoanAccounts={(profile as any)?.financial_flow_student_loan_enabled ? studentLoanAccounts ?? [] : []}
          studentLoanEnabled={Boolean((profile as any)?.financial_flow_student_loan_enabled)}
          paymentAccounts={(paymentAccounts ?? []) as any}
          householdPets={(householdPets ?? []) as any}
          homeProfile={(homeProfile ?? null) as any}
          categoryGroups={(categoryGroups ?? []) as any}
          initialMonth={resolvedSearchParams.month}
          initialPersonId={resolvedSearchParams.person}
          initialDirectionFilter={resolvedSearchParams.direction === "income" || resolvedSearchParams.direction === "outgoing" ? resolvedSearchParams.direction : "all"}
          hasHousehold={hasActiveHousehold}
          compactPage
          initialAddMode={resolvedSearchParams.add === "monthly" || resolvedSearchParams.add === "one_off" || resolvedSearchParams.add === "child_cost" || resolvedSearchParams.add === "category" || resolvedSearchParams.add === "bank_import" ? resolvedSearchParams.add : undefined}
          initialAddTemplate={(resolvedSearchParams.prefill_label || resolvedSearchParams.prefill_amount) ? {
            label: resolvedSearchParams.prefill_label || undefined,
            amount: resolvedSearchParams.prefill_amount ? Number(resolvedSearchParams.prefill_amount) : undefined,
            direction: "outgoing",
            recurrence: resolvedSearchParams.add === "monthly" ? "monthly" : "one_off",
            itemType: resolvedSearchParams.add === "monthly" ? "bill" : "one_off",
          } : undefined}
          flowSettings={{
            personDisplayMode: ((profile as any)?.spending_person_display_mode || "both") as any,
            dateFormat: ((profile as any)?.spending_date_format || "day_month_ordinal") as any,
            billLogoMode: ((profile as any)?.spending_bill_logo_mode || "auto") as any,
            moneyDisplayPrecision: ((profile as any)?.money_display_precision || "exact") as any,
          }}
        />
      </main>
    </>
  );
}
