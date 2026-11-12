// The month plan behind the Summary page: money in, bills and spending,
// savings and left over for one month. Shared so the Household page and the
// weekly email show exactly the same figures.
import {
  getChildCostMonthlyAmount as sharedChildCostMonthlyAmount,
  getIncomeEntryMonthlyAmount as sharedIncomeEntryMonthlyAmount,
  getPayAmount as sharedGetPayAmount,
  incomeEntryAppliesToMonth as sharedIncomeEntryAppliesToMonth,
  mortgageDealMonthlyPayment as sharedMortgageDealMonthlyPayment,
  selectActivePayEventsForMonth as sharedSelectActivePayEvents,
} from "@/lib/planning/month-plan";
import { estimateAnnualTakeHome, PensionMethod, StudentLoanPlan } from "@/lib/calculations/tax";
import { MaternityPayMode, calculateNhsMaternityMonthlyAmount, maternityInputFromPayEvent, pensionArrearsForMonth } from "@/lib/calculations/maternity";
import {
  ActivityBillingMode,
  BillingSchedule,
  DaySession,
  FundingMode,
  calculateActivityMonthlyCost,
  calculateNurseryMonthlyCost,
} from "@/lib/calculations/childcare";
import { calculateMonthlyMortgagePayment } from "@/lib/calculations/mortgage";
import { monthStepFor, monthSteppedDate } from "@/lib/planning/recurrence";

export type FinancialProfile = {
  name: string;
  annual_salary: number | null;
  monthly_take_home: number | null;
  monthly_dividends: number;
  pension_percent: number | null;
  student_loan_plan: string | null;
  monthly_mortgage: number;
  monthly_savings_target: number;
};

export type SpendingCategory = {
  id: string;
  name: string;
  type: "fixed" | "variable" | "saving" | "debt";
  monthly_budget: number | null;
  category_icon?: string | null;
  emergency_fund_essential?: boolean | null;
  spending_category_groups?: { emergency_fund_essential?: boolean | null } | Array<{ emergency_fund_essential?: boolean | null }> | null;
};

export type Person = {
  id: string;
  name: string;
  relationship: "self" | "partner" | "child" | "other";
  avatar_url?: string | null;
};

export type PayEvent = {
  id: string;
  person_id: string | null;
  label: string;
  pay_kind: string | null;
  gross_annual_salary: number;
  monthly_take_home_override: number | null;
  pension_percent: number;
  pension_method: PensionMethod | null;
  employer_pension_percent?: number | null;
  employer_pension_monthly_amount?: number | null;
  employer_ni_topup_enabled?: boolean | null;
  employer_ni_rate_percent?: number | null;
  employer_ni_topup_share_percent?: number | null;
  student_loan_plan: StudentLoanPlan;
  effective_from: string;
  effective_until: string | null;
  maternity_scheme: string | null;
  maternity_leave_start: string | null;
  maternity_leave_end: string | null;
  maternity_pay_mode: MaternityPayMode | null;
  maternity_full_pay_weeks: number | null;
  maternity_half_pay_weeks: number | null;
  maternity_smp_only_weeks: number | null;
  maternity_unpaid_weeks: number | null;
  maternity_smp_weekly_rate: number | null;
  maternity_extras?: unknown;
  pay_timing: "fixed_day" | "last_workday" | null;
  pay_day_of_month: number | null;
  pay_adjustment: "previous_workday" | "next_workday" | "none" | null;
  overrides?: PayEventOverride[];
};


export type PayEventOverride = {
  id: string;
  pay_event_id: string | null;
  person_id: string | null;
  month: string;
  statutory_pay: number | null;
  occupational_pay: number | null;
  gross_pay: number | null;
  net_pay_override: number | null;
};

export type FinancialPositionSnapshot = {
  snapshot_date: string;
  net_worth: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  investment_value: number | null;
  savings_value: number | null;
  pension_value: number | null;
  property_equity: number | null;
};

export type ChildCost = {
  id: string;
  child_id: string | null;
  label: string;
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
  part_day_multiplier: number | null;
  full_day_hours: number | null;
  part_day_hours: number | null;
  monday_session: DaySession | null;
  tuesday_session: DaySession | null;
  wednesday_session: DaySession | null;
  thursday_session: DaySession | null;
  friday_session: DaySession | null;
  monday_hours: number | null;
  tuesday_hours: number | null;
  wednesday_hours: number | null;
  thursday_hours: number | null;
  friday_hours: number | null;
  activity_weekly_cost: number | null;
  activity_weekday: number | null;
  activity_billing_mode: ActivityBillingMode | null;
  activity_term_weeks_per_year: number | null;
  payment_timing?: "fixed_day" | "last_workday" | null;
  payment_day_of_month?: number | null;
  payment_adjustment?: "previous_workday" | "next_workday" | "none" | null;
  tax_free_childcare_enabled?: boolean | null;
  tax_free_childcare_cap_per_quarter?: number | null;
  starts_on: string;
  ends_on: string | null;
};



export type IncomeEntry = {
  id: string;
  person_id: string | null;
  label: string;
  gross_amount: number;
  net_amount: number | null;
  frequency: "monthly" | "annual" | "weekly";
  entry_date: string;
};

export type PlannedItem = {
  id: string;
  person_id: string | null;
  category_id?: string | null;
  direction: "income" | "outgoing";
  item_type: string;
  label: string;
  amount: number;
  recurrence: "monthly" | "four_weekly" | "custom_interval" | "one_off";
  recurrence_interval_days?: number | null;
  start_date: string;
  end_date: string | null;
  day_of_month: number | null;
  payment_timing: "fixed_day" | "last_workday" | null;
  payment_adjustment: "previous_workday" | "next_workday" | "none" | null;
  end_behavior?: "drops_off" | "renews" | "review_needed" | null;
  renewal_notice_days?: number | null;
  early_upgrade_date?: string | null;
  expected_refund_amount?: number | null;
};

export type HomeMortgageDeal = {
  id: string;
  lender: string | null;
  balance: number;
  interest_rate: number;
  term_years: number;
  monthly_payment_override: number | null;
  payment_day_of_month?: number | null;
  initial_period_end?: string | null;
  start_date: string;
  end_date: string | null;
};

export type DealBill = {
  id: string;
  label: string;
  provider: string;
  category: string;
  monthly_cost: number;
  contract_end: string | null;
  notice_days: number;
  comparison_url: string | null;
  auto_recommendation_enabled: boolean;
};

export type MonthPlan = {
  month: string;
  label: string;
  income: number;
  outgoings: number;
  surplus: number;
  incomeItems: { label: string; value: number; href: string; helper: string; dueDate?: string; personId?: string | null; categoryLabel?: string; categoryIcon?: string | null }[];
  outgoingItems: { label: string; value: number; href: string; helper: string; dueDate?: string; personId?: string | null; categoryLabel?: string; categoryIcon?: string | null; endDate?: string | null; endBehavior?: string | null; earlyUpgradeDate?: string | null; expectedRefundAmount?: number | null }[];
};

export function monthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1);
}

export function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0);
}

export function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isActiveInMonth(start: string, end: string | null, month: string) {
  const startDate = start || "1900-01-01";
  const endDate = end || "9999-12-31";
  return startDate <= toDateString(monthEnd(month)) && endDate >= toDateString(monthStart(month));
}


export function dateIsInMonth(date: string, month: string) {
  return date >= toDateString(monthStart(month)) && date <= toDateString(monthEnd(month));
}

export function plannedItemForecastEndDate(item: PlannedItem) {
  if (item.recurrence !== "monthly") return item.end_date;
  if (!item.end_date) return null;
  return (item.end_behavior ?? "drops_off") === "drops_off" ? item.end_date : null;
}

// Step size in days for the "every N days/weeks" recurrences. four_weekly is a fixed
// 28-day case of the same pattern; custom_interval uses whatever the person configured.
export function plannedItemIntervalDays(item: PlannedItem) {
  if (item.recurrence === "custom_interval") return Math.max(1, Number(item.recurrence_interval_days || 0) || 7);
  return 28;
}

// Every date this item actually falls on within the given month. Monthly/one-off items
// resolve to at most one date; four-weekly/custom-interval items can land 0, 1 or
// occasionally 2 times in a given calendar month depending on where the cycle sits.
export function plannedItemDatesForMonth(item: PlannedItem, month: string): string[] {
  if (monthStepFor(item.recurrence)) { const d = monthSteppedDate(item as any, month); return d ? [d] : []; }
  if (item.recurrence === "one_off") return dateIsInMonth(item.start_date, month) ? [item.start_date] : [];
  if (item.recurrence === "monthly") return isActiveInMonth(item.start_date, plannedItemForecastEndDate(item), month) ? [dueDateForMonth(month, item.payment_timing ?? "fixed_day", item.day_of_month ?? Number(item.start_date.slice(8, 10)), item.payment_adjustment ?? "previous_workday")] : [];
  const stepDays = plannedItemIntervalDays(item);
  const monthStartDate = new Date(`${month}-01T12:00:00Z`);
  const [year, monthNumber] = month.split("-").map(Number);
  const monthEndDate = new Date(Date.UTC(year, monthNumber, 0, 12));
  const cursor = new Date(`${item.start_date}T12:00:00Z`);
  const end = item.end_date ? new Date(`${item.end_date}T12:00:00Z`) : null;
  if (Number.isNaN(cursor.getTime())) return [];
  while (cursor < monthStartDate) cursor.setUTCDate(cursor.getUTCDate() + stepDays);
  const dates: string[] = [];
  while (cursor <= monthEndDate && (!end || cursor <= end)) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + stepDays);
  }
  return dates;
}

export function plannedItemAppliesToMonth(item: PlannedItem, month: string) {
  if (monthStepFor(item.recurrence)) return Boolean(monthSteppedDate(item as any, month));
  if (item.recurrence === "one_off") return dateIsInMonth(item.start_date, month);
  if (item.recurrence === "monthly") return isActiveInMonth(item.start_date, plannedItemForecastEndDate(item), month);
  return plannedItemDatesForMonth(item, month).length > 0;
}

export function plannedItemRecurrenceLabel(item: PlannedItem) {
  if (item.recurrence === "monthly") return "Planned monthly";
  if (item.recurrence === "four_weekly") return "Every 4 weeks";
  if (item.recurrence === "custom_interval") {
    const days = plannedItemIntervalDays(item);
    if (days % 7 === 0) { const weeks = days / 7; return `Every ${weeks} week${weeks === 1 ? "" : "s"}`; }
    return `Every ${days} day${days === 1 ? "" : "s"}`;
  }
  return "One-off";
}

export function monthsForYear(year: number) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

export function monthsFrom(startMonth: string, count: number) {
  const [year, monthNumber] = startMonth.split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, monthNumber - 1 + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

export function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export const englandWalesBankHolidays = new Set([
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
]);

export function isWeekendOrBankHoliday(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6 || englandWalesBankHolidays.has(toDateString(date));
}

export function adjustedWorkday(date: Date, adjustment: "previous_workday" | "next_workday" | "none" = "previous_workday") {
  if (adjustment === "none") return date;
  const next = new Date(date);
  const step = adjustment === "next_workday" ? 1 : -1;
  while (isWeekendOrBankHoliday(next)) next.setDate(next.getDate() + step);
  return next;
}

export function dueDateForMonth(month: string, timing?: string | null, dayOfMonth?: number | null, adjustment?: string | null) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  let date: Date;
  if (timing === "last_workday") {
    date = new Date(year, monthNumber - 1, lastDay);
  } else {
    date = new Date(year, monthNumber - 1, Math.min(Math.max(Number(dayOfMonth || 1), 1), lastDay));
  }
  return toDateString(adjustedWorkday(date, (adjustment as "previous_workday" | "next_workday" | "none") || "previous_workday"));
}

export function shortDate(date?: string) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(`${date}T00:00:00`));
}

export function daysUntil(date: string | null) {
  if (!date) return null;
  const start = new Date(new Date().toISOString().slice(0, 10));
  const end = new Date(`${date}T00:00:00`);
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

export function dealRecommendation(bill: DealBill) {
  const days = daysUntil(bill.contract_end);
  if (days === null) return "No renewal date";
  if (days <= 0) return "Check now — deal ended";
  if (days <= Number(bill.notice_days ?? 45)) return `Switch window — ${days} day(s) left`;
  if (days <= 90) return `Coming up — ${days} day(s) left`;
  return `${days} day(s) left`;
}

export function plannedLifecycleLabel(item: MonthPlan["outgoingItems"][number]) {
  if (!item.endDate && !item.earlyUpgradeDate && !Number(item.expectedRefundAmount ?? 0)) return null;
  const behavior = item.endBehavior === "renews" ? "renews / continues" : item.endBehavior === "review_needed" ? "review before renewal" : "drops off";
  const parts = [];
  if (item.endDate) parts.push(`${behavior} ${shortDate(item.endDate)}`);
  if (item.earlyUpgradeDate) parts.push(`upgrade ${shortDate(item.earlyUpgradeDate)}`);
  if (Number(item.expectedRefundAmount ?? 0) > 0) parts.push(`refund £${Number(item.expectedRefundAmount).toFixed(2)}`);
  return parts.join(" · ");
}

export function getPersonName(peopleById: Map<string, Person>, id: string | null) {
  if (!id) return "Unassigned";
  return peopleById.get(id)?.name ?? "Unassigned";
}

export function guessCategoryIcon(label: string) {
  const lower = label.toLowerCase();
  if (/subscription|netflix|spotify|apple|phone|mobile/.test(lower)) return "📱";
  if (/mortgage|rent|home|house/.test(lower)) return "🏠";
  if (/utility|gas|electric|water|energy|council/.test(lower)) return "⚡";
  if (/car|fuel|transport|vw|train|bus|parking/.test(lower)) return "🚗";
  if (/child|nursery|school|activity/.test(lower)) return "👶";
  if (/food|grocery|shop|supermarket/.test(lower)) return "🛒";
  if (/insurance|cover|policy/.test(lower)) return "🛡️";
  if (/loan|debt|credit|card/.test(lower)) return "💳";
  if (/saving|investment|isa|pension/.test(lower)) return "💰";
  if (/health|dental|doctor|medical/.test(lower)) return "🏥";
  return "🏷️";
}

export function labelise(value: string | null | undefined) {
  return String(value || "General").replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

// Pay, income and mortgage amounts come from the shared month plan so the
// Summary page can't drift from the other pages and the calendar.
export function getIncomeEntryMonthlyAmount(entry: IncomeEntry) {
  return sharedIncomeEntryMonthlyAmount(entry as any);
}

export function incomeEntryAppliesToMonth(entry: IncomeEntry, month: string) {
  return sharedIncomeEntryAppliesToMonth(entry as any, month);
}

export function getPayAmount(event: PayEvent, month: string) {
  return sharedGetPayAmount(event as any, month);
}

export function selectActivePayEventsForMonth(payEvents: PayEvent[], month: string) {
  return sharedSelectActivePayEvents(payEvents as any, month) as unknown as PayEvent[];
}

export function getChildCostMonthlyAmount(cost: ChildCost, month: string) {
  return sharedChildCostMonthlyAmount(cost as any, month);
}

export function mortgageDealMonthlyPayment(deal: HomeMortgageDeal) {
  return sharedMortgageDealMonthlyPayment(deal as any);
}

export function buildMonthPlan({
  month,
  profile,
  categories,
  childCosts,
  payEvents,
  mortgageDeals,
  plannedItems,
  incomeEntries,
  peopleById,
}: {
  month: string;
  profile: FinancialProfile | null;
  categories: SpendingCategory[];
  childCosts: ChildCost[];
  payEvents: PayEvent[];
  mortgageDeals: HomeMortgageDeal[];
  plannedItems: PlannedItem[];
  incomeEntries: IncomeEntry[];
  peopleById: Map<string, Person>;
}): MonthPlan {
  const activePay = selectActivePayEventsForMonth(payEvents, month);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const incomeItems: MonthPlan["incomeItems"] = activePay.map((event) => ({
    label: `${getPersonName(peopleById, event.person_id)} · ${event.label}`,
    value: getPayAmount(event, month),
    href: event.person_id ? `/household/${event.person_id}` : "/household",
    personId: event.person_id,
    helper: event.overrides?.some((item) => item.month === month) ? "Exact monthly pay override" : event.pay_kind === "maternity" ? "NHS maternity estimate for this month" : "Pay event",
    dueDate: dueDateForMonth(month, event.pay_timing ?? "last_workday", event.pay_day_of_month, event.pay_adjustment ?? "previous_workday"),
  }));


  incomeEntries.filter((entry) => incomeEntryAppliesToMonth(entry, month)).forEach((entry) => {
    incomeItems.push({
      label: `${getPersonName(peopleById, entry.person_id)} · ${entry.label}`,
      value: getIncomeEntryMonthlyAmount(entry),
      href: "/income",
      personId: entry.person_id,
      helper: entry.frequency === "monthly" ? "Manual monthly income" : `${entry.frequency} income converted monthly`,
      dueDate: dueDateForMonth(month, "last_workday", null, "previous_workday"),
    });
  });

  const activePlannedItems = plannedItems.filter((item) => plannedItemAppliesToMonth(item, month));
  activePlannedItems.filter((item) => item.direction === "income").forEach((item) => {
    const dates = plannedItemDatesForMonth(item, month);
    const occurrences = Math.max(1, dates.length);
    incomeItems.push({
      label: `${getPersonName(peopleById, item.person_id)} · ${item.label}${occurrences > 1 ? ` (×${occurrences})` : ""}`,
      value: Number(item.amount ?? 0) * occurrences,
      href: "/spending",
      personId: item.person_id,
      helper: plannedItemRecurrenceLabel(item),
      dueDate: dates[0] || item.start_date,
    });
  });

  const activeMortgageDeals = mortgageDeals.filter((deal) => isActiveInMonth(deal.start_date, deal.end_date, month));
  const mortgageFromDeals = activeMortgageDeals.reduce((sum, deal) => sum + mortgageDealMonthlyPayment(deal), 0);
  const outgoingItems: MonthPlan["outgoingItems"] = [
    ...(mortgageFromDeals > 0 ? [{
      label: "Mortgage deals",
      value: mortgageFromDeals,
      href: "/mortgage",
      personId: null,
      helper: `${activeMortgageDeals.length} active mortgage deal(s)`,
      categoryLabel: "Mortgage",
      categoryIcon: "🏠",
      dueDate: dueDateForMonth(month, "fixed_day", activeMortgageDeals[0]?.payment_day_of_month || 1, "previous_workday"),
    }] : []),
    ...categories.map((category) => ({
      label: category.name,
      value: Number(category.monthly_budget ?? 0),
      href: "/spending",
      personId: null,
      helper: `${category.type} spending category`,
      categoryLabel: category.name,
      categoryIcon: category.category_icon || guessCategoryIcon(category.name),
      dueDate: dueDateForMonth(month, "fixed_day", 1, "previous_workday"),
    })),
  ];

  activePlannedItems.filter((item) => item.direction === "outgoing").forEach((item) => {
    const category = item.category_id ? categoriesById.get(item.category_id) : null;
    const categoryLabel = category?.name || labelise(item.item_type);
    const dates = plannedItemDatesForMonth(item, month);
    const occurrences = Math.max(1, dates.length);
    outgoingItems.push({
      label: `${getPersonName(peopleById, item.person_id)} · ${item.label}${occurrences > 1 ? ` (×${occurrences})` : ""}`,
      value: Number(item.amount ?? 0) * occurrences,
      href: "/spending",
      personId: item.person_id,
      helper: categoryLabel,
      categoryLabel,
      categoryIcon: category?.category_icon || guessCategoryIcon(categoryLabel),
      dueDate: dates[0] || item.start_date,
      endDate: item.end_date,
      endBehavior: item.end_behavior,
      earlyUpgradeDate: item.early_upgrade_date,
      expectedRefundAmount: item.expected_refund_amount,
    });
  });

  const activeChildCosts = childCosts.filter((cost) => isActiveInMonth(cost.starts_on, cost.ends_on, month));
  activeChildCosts.forEach((cost) => {
    outgoingItems.push({
      label: `${getPersonName(peopleById, cost.child_id)} · ${cost.label}`,
      value: getChildCostMonthlyAmount(cost, month),
      href: cost.child_id ? `/household/${cost.child_id}` : "/household",
      personId: cost.child_id,
      helper: cost.cost_kind === "activity" ? "Activities" : cost.cost_kind === "nursery" ? "Childcare" : "Child cost",
      categoryLabel: cost.cost_kind === "activity" ? "Activities" : cost.cost_kind === "nursery" ? "Childcare" : "Child cost",
      categoryIcon: "👶",
      dueDate: dueDateForMonth(month, cost.payment_timing ?? "fixed_day", cost.payment_day_of_month ?? 1, cost.payment_adjustment ?? "previous_workday"),
    });
  });

  payEvents.filter((event) => event.pay_kind === "maternity").forEach((event) => {
    const arrears = pensionArrearsForMonth(maternityInputFromPayEvent(event), month);
    if (arrears.netCost <= 0) return;
    outgoingItems.push({
      label: `${getPersonName(peopleById, event.person_id)} · NHS pension buy-back (unpaid leave)`,
      value: arrears.netCost,
      href: event.person_id ? `/household/${event.person_id}` : "/household",
      personId: event.person_id,
      helper: `${arrears.explanation} £${arrears.grossAmount.toFixed(2)} gross before tax relief.`,
      categoryLabel: "Pension",
      categoryIcon: "💰",
      dueDate: dueDateForMonth(month, event.pay_timing ?? "last_workday", event.pay_day_of_month, event.pay_adjustment ?? "previous_workday"),
    });
  });


  const income = incomeItems.reduce((sum, item) => sum + item.value, 0);
  const outgoings = outgoingItems.reduce((sum, item) => sum + item.value, 0);

  return {
    month,
    label: monthLabel(month),
    income,
    outgoings,
    surplus: income - outgoings,
    incomeItems: incomeItems.sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || ""))),
    outgoingItems: outgoingItems.filter((item) => item.value > 0).sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || ""))),
  };
}
