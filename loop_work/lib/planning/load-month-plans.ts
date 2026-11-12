// Loads everything a month plan needs and builds plans for the months asked.
// The Summary, Household page and weekly email all use this, so their
// "money in", "bills and spending", "saved" and "left over" always agree.
import { buildMonthPlan, type MonthPlan } from "@/lib/planning/summary-plan";

export type MonthTotals = { income: number; spending: number; saved: number; leftOver: number; savingsRate: number };

/** `filter` is the household visibility filter (visibleDataOrFilter). */
export async function loadMonthPlans(supabase: any, opts: { userId: string; filter: string; months: string[] }) {
  const { userId, filter } = opts;
  const [profile, categories, childCosts, people, payEvents, overrides, deals, items, incomeEntries] = await Promise.all([
    supabase.from("financial_profiles").select("name, annual_salary, monthly_take_home, monthly_dividends, pension_percent, student_loan_plan, monthly_mortgage, monthly_savings_target").eq("user_id", userId).maybeSingle(),
    supabase.from("spending_categories").select("id, name, type, monthly_budget, category_icon").or(filter),
    supabase.from("child_costs").select("*").or(filter),
    supabase.from("people").select("id, name, relationship").or(filter).or("account_status.is.null,account_status.neq.duplicate_merged"),
    supabase.from("pay_events").select("*").or(filter),
    supabase.from("pay_event_monthly_overrides").select("id, pay_event_id, person_id, month, statutory_pay, occupational_pay, gross_pay, net_pay_override").eq("user_id", userId),
    supabase.from("home_mortgage_deals").select("id, lender, product_name, balance, balance_as_of_date, interest_rate, term_years, monthly_payment_override, payment_day_of_month, initial_period_end, start_date, end_date, first_payment_date").or(filter),
    supabase.from("planned_items").select("id, person_id, category_id, direction, item_type, label, amount, recurrence, recurrence_interval_days, start_date, end_date, day_of_month, payment_timing, payment_adjustment, end_behavior, renewal_notice_days, early_upgrade_date, expected_refund_amount").or(filter),
    supabase.from("income_entries").select("id, person_id, label, gross_amount, net_amount, frequency, entry_date").or(filter),
  ]);
  const byEvent = new Map<string, any[]>();
  for (const o of (overrides.data ?? []) as any[]) if (o.pay_event_id) byEvent.set(o.pay_event_id, [...(byEvent.get(o.pay_event_id) || []), o]);
  const peopleById = new Map(((people.data ?? []) as any[]).map((p) => [p.id, p]));
  let payRows = (payEvents.data ?? []) as any[];
  if (!payRows.length && peopleById.size) {
    const { data } = await supabase.from("pay_events").select("*").in("person_id", Array.from(peopleById.keys()));
    payRows = data ?? [];
  }
  const cats = (categories.data ?? []) as any[];
  const plans = opts.months.map((month) => buildMonthPlan({
    month,
    profile: profile.data ?? null,
    categories: cats,
    childCosts: (childCosts.data ?? []) as any,
    payEvents: payRows.map((e) => ({ ...e, overrides: byEvent.get(e.id) || [] })),
    mortgageDeals: (deals.data ?? []) as any,
    plannedItems: (items.data ?? []) as any,
    incomeEntries: (incomeEntries.data ?? []) as any,
    peopleById,
  }));
  const savingNames = new Set(cats.filter((c) => c.type === "saving").map((c) => c.name));
  return { plans, savingNames };
}

/** The four headline numbers, the same way the Summary page works them out. */
export function monthTotals(plan: MonthPlan, savingNames: Set<string>): MonthTotals {
  const saved = plan.outgoingItems.filter((item: any) => item.categoryLabel && savingNames.has(item.categoryLabel)).reduce((s, item) => s + Number(item.value || 0), 0);
  const spending = Math.max(0, plan.outgoings - saved);
  return { income: plan.income, spending, saved, leftOver: plan.surplus, savingsRate: plan.income > 0 ? Math.round((saved / plan.income) * 100) : 0 };
}

export function monthsFrom(start: string, count: number) {
  const [y, m] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m - 1 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}
