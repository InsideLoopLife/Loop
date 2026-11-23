import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { FinancialFlowWorkspaceNav } from "@/components/financial-flow/FinancialFlowWorkspaceNav";
import { AccountsHome, type AccountsHomeAccount } from "@/components/accounts/AccountsHome";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import {
  dedupeHouseholdPeople, getActiveHouseholdContext, householdMemberDataOrFilter, householdPeopleOrFilter, visibleDataOrFilter,
} from "@/lib/auth/household-context";
import { withPayOverrides } from "@/lib/planning/pay-overrides";
import { buildAccountActivity } from "@/lib/accounts/account-activity";
import type { StandingTransfer } from "@/lib/accounts/standing-transfers";
import { carryAnchor, carryBackAnchor, type BalanceAnchor } from "@/lib/accounts/daily-balance";

export const metadata = { title: "Accounts · Loop" };

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

function nextMonthStart(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

export default async function BankAccountsPage({ searchParams }: { searchParams?: Promise<{ month?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const month = /^\d{4}-\d{2}$/.test(String(params.month || "")) ? String(params.month) : currentMonth();
  const supabase = await createClient();
  const { data: { user } } = await getVerifiedUser(supabase);
  if (!user) redirect("/login");

  const household = await getActiveHouseholdContext(supabase, user);
  const memberFilter = householdMemberDataOrFilter(household);

  const [
    { data: accountRows },
    { data: peopleRows },
    { data: plannedItems },
    { data: payEvents },
    { data: childCosts },
    { data: entries },
    { data: transferRows },
    { data: mortgageDeals },
  ] = await Promise.all([
    supabase.from("financial_accounts")
      .select("id, name, provider, provider_slug, savings_product_name, account_type, current_balance, balance_last_confirmed_at, balance_tracked_from, interest_rate, interest_rate_end_date, monthly_top_up_amount, top_up_day, savings_goal_name, savings_goal_target_amount, owner_person_id, ownership_scope, visibility_scope, user_id, updated_at")
      .or(visibleDataOrFilter(household)).eq("is_liability", false).order("created_at"),
    supabase.from("people")
      .select("id, user_id, linked_user_id, name, relationship, birth_date, account_status, active_until, avatar_url")
      .or(householdPeopleOrFilter(household)),
    supabase.from("planned_items")
      .select("id, person_id, category_id, direction, item_type, label, amount, recurrence, recurrence_interval_days, start_date, end_date, day_of_month, payment_timing, payment_adjustment, end_behavior, renewal_notice_days, early_upgrade_date, expected_refund_amount, payment_account_id, notes")
      .or(memberFilter),
    supabase.from("pay_events")
      .select("id, person_id, label, pay_kind, gross_annual_salary, monthly_take_home_override, pension_percent, pension_method, student_loan_plan, effective_from, effective_until, maternity_scheme, maternity_leave_start, maternity_leave_end, maternity_pay_mode, maternity_full_pay_weeks, maternity_half_pay_weeks, maternity_smp_only_weeks, maternity_unpaid_weeks, maternity_smp_weekly_rate, maternity_extras, pay_timing, pay_day_of_month, pay_adjustment, tax_region, payment_account_id")
      .or(memberFilter),
    supabase.from("child_costs")
      .select("id, child_id, bill_person_id, label, cost_kind, monthly_cost, billing_month, daily_rate, extra_daily_cost, funded_hours_per_week, funding_mode, hourly_funding_credit, term_weeks_per_year, billing_schedule, bank_holidays_are_free, tax_free_childcare_enabled, tax_free_childcare_cap_per_quarter, part_day_multiplier, full_day_hours, part_day_hours, monday_session, tuesday_session, wednesday_session, thursday_session, friday_session, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, activity_weekly_cost, activity_weekday, activity_billing_mode, activity_term_weeks_per_year, payment_timing, payment_day_of_month, payment_adjustment, starts_on, ends_on, care_type, care_details, payment_account_id")
      .or(memberFilter),
    supabase.from("spending_entries")
      .select("id, person_id, label, amount, spent_at, payment_account_id")
      .or(memberFilter).gte("spent_at", `${shiftMonth(month, -12)}-01`).lt("spent_at", nextMonthStart(month)),
    supabase.from("household_account_transfers")
      .select("id, person_id, from_account_id, to_account_id, amount, frequency, weekday, day_of_month, start_date, end_date, note")
      .is("archived_at", null).or(memberFilter).order("created_at"),
    supabase.from("home_mortgage_deals")
      .select("id, lender, product_name, balance, balance_as_of_date, interest_rate, term_years, monthly_payment_override, start_date, end_date, payment_day_of_month, first_payment_date, initial_period_end, payment_account_id")
      .or(memberFilter),
  ]);

  const people = dedupeHouseholdPeople((peopleRows ?? []) as any[], user.id) as Array<{ id: string; name: string; relationship?: string | null; avatar_url?: string | null; user_id?: string | null; linked_user_id?: string | null }>;
  const adults = people.filter((p) => String(p.relationship || "").toLowerCase() !== "child");
  const me = adults.find((p) => p.linked_user_id === user.id || (p.user_id === user.id && p.relationship === "self")) ?? adults.find((p) => p.user_id === user.id) ?? null;

  const transfers = (transferRows || []).map((row: any) => ({ ...row, amount: Number(row.amount || 0) })) as StandingTransfer[];
  const accountNames = Object.fromEntries((accountRows || []).map((a: any) => [a.id, a.name || a.savings_product_name || "Account"]));
  const personNames = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const payWithOverrides = (await withPayOverrides(supabase, payEvents || [])) as any[];
  const activityCache = new Map<string, ReturnType<typeof buildAccountActivity>>();
  const activityFor = (m: string) => {
    if (!activityCache.has(m)) {
      activityCache.set(m, buildAccountActivity({
        month: m,
        plannedItems: (plannedItems || []) as any,
        payEvents: payWithOverrides,
        childCosts: (childCosts || []) as any,
        entries: (entries || []) as any,
        mortgageDeals: (mortgageDeals || []) as any,
        transfers,
        accountNames,
        personNames,
      }));
    }
    return activityCache.get(m)!;
  };
  const { activity, unassigned, unassignedLines } = activityFor(month);
  const today = todayIso();

  // Where each account's balance is known from, moved to the month being looked at.
  const anchorFor = (a: any): { anchor: BalanceAnchor; trackedFrom: string | null } => {
    const balance = Number(a.current_balance || 0);
    const checked = String(a.balance_last_confirmed_at || a.updated_at || today).slice(0, 10);
    const tracked = a.balance_tracked_from ? String(a.balance_tracked_from).slice(0, 10) : null;
    const raw: BalanceAnchor = tracked && checked < tracked ? { date: tracked, balance, mode: "start" } : { date: checked, balance, mode: "end" };
    const oldest = `${shiftMonth(month, -12)}-01`;
    const usable = raw.date < oldest ? { ...raw, date: oldest, mode: "start" as const } : raw;
    const lines = (m: string) => activityFor(m).activity[a.id]?.lines || [];
    const anchor = usable.date < `${month}-01` ? carryAnchor(usable, month, lines) : usable.mode === "end" && usable.date > `${month}-31` ? carryBackAnchor(usable, month, lines) : usable;
    return { anchor, trackedFrom: tracked && checked < tracked ? tracked : null };
  };

  const accounts: AccountsHomeAccount[] = (accountRows || []).map((a: any) => {
    const joint = !a.owner_person_id || ["joint", "household"].includes(String(a.ownership_scope || "").toLowerCase());
    return {
      id: a.id,
      name: a.name || a.savings_product_name || "Account",
      provider: a.provider || null,
      providerSlug: a.provider_slug || null,
      kind: a.account_type === "current_account" ? "everyday" : "savings",
      balance: Number(a.current_balance || 0),
      balanceConfirmedAt: a.balance_last_confirmed_at || a.updated_at || null,
      ...(() => { const { anchor, trackedFrom } = anchorFor(a); return { anchor, trackedFrom }; })(),
      interestRate: a.interest_rate == null ? null : Number(a.interest_rate),
      rateEndsOn: a.interest_rate_end_date || null,
      monthlyTopUp: Number(a.monthly_top_up_amount || 0),
      topUpDay: a.top_up_day == null ? null : Number(a.top_up_day),
      goalName: a.savings_goal_name || null,
      goalTarget: a.savings_goal_target_amount == null ? null : Number(a.savings_goal_target_amount),
      joint,
      ownerPersonId: joint ? null : a.owner_person_id,
      shared: a.visibility_scope !== "private",
      ownershipScope: a.ownership_scope || (joint ? "household" : "personal"),
      activity: activity[a.id] || { in: 0, out: 0, lines: [] },
    };
  });

  return (
    <>
      <Nav />
      <FinancialFlowWorkspaceNav section="accounts" month={month === currentMonth() ? null : month} />
      <main className="mx-auto w-[95vw] max-w-[1240px] px-4 py-6">
        <AccountsHome
          month={month}
          today={today}
          accounts={accounts}
          people={adults.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatar_url || null }))}
          meId={me?.id || null}
          hasHousehold={Boolean(household.householdId)}
          transfers={transfers}
          unassignedCount={unassigned}
          unassignedLines={unassignedLines}
        />
      </main>
    </>
  );
}
