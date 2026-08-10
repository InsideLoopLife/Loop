import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { PageLandingExperience } from "@/components/landing/PageLandingExperience";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type MoneyDisplayPrecision } from "@/lib/format/money";
import { estimateAnnualTakeHome, PensionMethod, StudentLoanPlan } from "@/lib/calculations/tax";
import { MaternityPayMode, calculateNhsMaternityMonthlyAmount } from "@/lib/calculations/maternity";
import {
  ActivityBillingMode,
  BillingSchedule,
  DaySession,
  FundingMode,
  calculateActivityMonthlyCost,
  calculateNurseryMonthlyCost,
} from "@/lib/calculations/childcare";
import { calculateMonthlyMortgagePayment } from "@/lib/calculations/mortgage";
import { getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";
import { buildWealthSummary } from "@/lib/wealth/summary";
import { buildMonthlyInvestmentPensionPerformance } from "@/lib/wealth/monthly-performance";

type FinancialProfile = {
  name: string;
  annual_salary: number | null;
  monthly_take_home: number | null;
  monthly_dividends: number;
  pension_percent: number | null;
  student_loan_plan: string | null;
  monthly_mortgage: number;
  monthly_savings_target: number;
};

type SpendingCategory = {
  id: string;
  name: string;
  type: "fixed" | "variable" | "saving" | "debt";
  monthly_budget: number | null;
  category_icon?: string | null;
};

type Person = {
  id: string;
  name: string;
  relationship: "self" | "partner" | "child" | "other";
  avatar_url?: string | null;
};

type PayEvent = {
  id: string;
  person_id: string | null;
  label: string;
  pay_kind: string | null;
  gross_annual_salary: number;
  monthly_take_home_override: number | null;
  pension_percent: number;
  pension_method: PensionMethod | null;
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
  pay_timing: "fixed_day" | "last_workday" | null;
  pay_day_of_month: number | null;
  pay_adjustment: "previous_workday" | "next_workday" | "none" | null;
  overrides?: PayEventOverride[];
};


type PayEventOverride = {
  id: string;
  pay_event_id: string | null;
  person_id: string | null;
  month: string;
  statutory_pay: number | null;
  occupational_pay: number | null;
  gross_pay: number | null;
  net_pay_override: number | null;
};

type ChildCost = {
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



type IncomeEntry = {
  id: string;
  person_id: string | null;
  label: string;
  gross_amount: number;
  net_amount: number | null;
  frequency: "monthly" | "annual" | "weekly";
  entry_date: string;
};

type PlannedItem = {
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

type HomeMortgageDeal = {
  id: string;
  lender: string | null;
  balance: number;
  interest_rate: number;
  term_years: number;
  monthly_payment_override: number | null;
  start_date: string;
  end_date: string | null;
};

type DealBill = {
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

type MonthPlan = {
  month: string;
  label: string;
  income: number;
  outgoings: number;
  surplus: number;
  incomeItems: { label: string; value: number; href: string; helper: string; dueDate?: string; personId?: string | null; categoryLabel?: string; categoryIcon?: string | null }[];
  outgoingItems: { label: string; value: number; href: string; helper: string; dueDate?: string; personId?: string | null; categoryLabel?: string; categoryIcon?: string | null; endDate?: string | null; endBehavior?: string | null; earlyUpgradeDate?: string | null; expectedRefundAmount?: number | null }[];
};

function monthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1);
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0);
}

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isActiveInMonth(start: string, end: string | null, month: string) {
  const startDate = start || "1900-01-01";
  const endDate = end || "9999-12-31";
  return startDate <= toDateString(monthEnd(month)) && endDate >= toDateString(monthStart(month));
}


function dateIsInMonth(date: string, month: string) {
  return date >= toDateString(monthStart(month)) && date <= toDateString(monthEnd(month));
}

function plannedItemForecastEndDate(item: PlannedItem) {
  if (item.recurrence !== "monthly") return item.end_date;
  if (!item.end_date) return null;
  return (item.end_behavior ?? "drops_off") === "drops_off" ? item.end_date : null;
}

// Step size in days for the "every N days/weeks" recurrences. four_weekly is a fixed
// 28-day case of the same pattern; custom_interval uses whatever the person configured.
function plannedItemIntervalDays(item: PlannedItem) {
  if (item.recurrence === "custom_interval") return Math.max(1, Number(item.recurrence_interval_days || 0) || 7);
  return 28;
}

// Every date this item actually falls on within the given month. Monthly/one-off items
// resolve to at most one date; four-weekly/custom-interval items can land 0, 1 or
// occasionally 2 times in a given calendar month depending on where the cycle sits.
function plannedItemDatesForMonth(item: PlannedItem, month: string): string[] {
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

function plannedItemAppliesToMonth(item: PlannedItem, month: string) {
  if (item.recurrence === "one_off") return dateIsInMonth(item.start_date, month);
  if (item.recurrence === "monthly") return isActiveInMonth(item.start_date, plannedItemForecastEndDate(item), month);
  return plannedItemDatesForMonth(item, month).length > 0;
}

function plannedItemRecurrenceLabel(item: PlannedItem) {
  if (item.recurrence === "monthly") return "Planned monthly";
  if (item.recurrence === "four_weekly") return "Every 4 weeks";
  if (item.recurrence === "custom_interval") {
    const days = plannedItemIntervalDays(item);
    if (days % 7 === 0) { const weeks = days / 7; return `Every ${weeks} week${weeks === 1 ? "" : "s"}`; }
    return `Every ${days} day${days === 1 ? "" : "s"}`;
  }
  return "One-off";
}

// A light seasonal backdrop per calendar month, purely decorative — keeps the year calendar from
// looking like 12 identical grey boxes and gives a quick visual "where in the year am I" cue.
const MONTH_THEMES: Record<number, { gradient: string; emoji: string }> = {
  1: { gradient: "from-sky-50 to-white", emoji: "❄️" },
  2: { gradient: "from-rose-50 to-white", emoji: "💗" },
  3: { gradient: "from-emerald-50 to-white", emoji: "🌱" },
  4: { gradient: "from-lime-50 to-white", emoji: "🌷" },
  5: { gradient: "from-pink-50 to-white", emoji: "🌸" },
  6: { gradient: "from-amber-50 to-white", emoji: "☀️" },
  7: { gradient: "from-orange-50 to-white", emoji: "🏖️" },
  8: { gradient: "from-yellow-50 to-white", emoji: "🎡" },
  9: { gradient: "from-amber-100 to-white", emoji: "🍂" },
  10: { gradient: "from-orange-100 to-white", emoji: "🎃" },
  11: { gradient: "from-stone-100 to-white", emoji: "🎆" },
  12: { gradient: "from-red-50 to-white", emoji: "🎄" },
};

function monthTheme(month: string) {
  const monthNumber = Number(month.slice(5, 7));
  return MONTH_THEMES[monthNumber] || { gradient: "from-slate-50 to-white", emoji: "📅" };
}

function monthsForYear(year: number) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

const englandWalesBankHolidays = new Set([
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
]);

function isWeekendOrBankHoliday(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6 || englandWalesBankHolidays.has(toDateString(date));
}

function adjustedWorkday(date: Date, adjustment: "previous_workday" | "next_workday" | "none" = "previous_workday") {
  if (adjustment === "none") return date;
  const next = new Date(date);
  const step = adjustment === "next_workday" ? 1 : -1;
  while (isWeekendOrBankHoliday(next)) next.setDate(next.getDate() + step);
  return next;
}

function dueDateForMonth(month: string, timing?: string | null, dayOfMonth?: number | null, adjustment?: string | null) {
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

function shortDate(date?: string) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(new Date(`${date}T00:00:00`));
}

function daysUntil(date: string | null) {
  if (!date) return null;
  const start = new Date(new Date().toISOString().slice(0, 10));
  const end = new Date(`${date}T00:00:00`);
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

function dealRecommendation(bill: DealBill) {
  const days = daysUntil(bill.contract_end);
  if (days === null) return "No renewal date";
  if (days <= 0) return "Check now — deal ended";
  if (days <= Number(bill.notice_days ?? 45)) return `Switch window — ${days} day(s) left`;
  if (days <= 90) return `Coming up — ${days} day(s) left`;
  return `${days} day(s) left`;
}

function plannedLifecycleLabel(item: MonthPlan["outgoingItems"][number]) {
  if (!item.endDate && !item.earlyUpgradeDate && !Number(item.expectedRefundAmount ?? 0)) return null;
  const behavior = item.endBehavior === "renews" ? "renews / continues" : item.endBehavior === "review_needed" ? "review before renewal" : "drops off";
  const parts = [];
  if (item.endDate) parts.push(`${behavior} ${shortDate(item.endDate)}`);
  if (item.earlyUpgradeDate) parts.push(`upgrade ${shortDate(item.earlyUpgradeDate)}`);
  if (Number(item.expectedRefundAmount ?? 0) > 0) parts.push(`refund £${Number(item.expectedRefundAmount).toFixed(2)}`);
  return parts.join(" · ");
}

function getPersonName(peopleById: Map<string, Person>, id: string | null) {
  if (!id) return "Unassigned";
  return peopleById.get(id)?.name ?? "Unassigned";
}

function guessCategoryIcon(label: string) {
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

function labelise(value: string | null | undefined) {
  return String(value || "General").replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function getIncomeEntryMonthlyAmount(entry: IncomeEntry) {
  const amount = Number(entry.net_amount ?? entry.gross_amount ?? 0);
  if (entry.frequency === "annual") return amount / 12;
  if (entry.frequency === "weekly") return amount * 52 / 12;
  return amount;
}

function incomeEntryAppliesToMonth(entry: IncomeEntry, month: string) {
  // Manual income entries are treated as ongoing from entry_date unless entered as one-off elsewhere later.
  return entry.entry_date <= toDateString(monthEnd(month));
}

function getPayAmount(event: PayEvent, month: string) {
  const override = event.overrides?.find((item) => item.month === month);
  if (override) {
    if (override.net_pay_override !== null && override.net_pay_override !== undefined) return Number(override.net_pay_override);
    if (override.gross_pay !== null && override.gross_pay !== undefined) return Number(override.gross_pay);
    return Number(override.statutory_pay ?? 0) + Number(override.occupational_pay ?? 0);
  }

  if (event.pay_kind === "maternity") {
    const estimate = calculateNhsMaternityMonthlyAmount({
      month,
      grossAnnualSalary: Number(event.gross_annual_salary),
      leaveStart: event.maternity_leave_start ?? event.effective_from,
      leaveEnd: event.maternity_leave_end ?? event.effective_until ?? event.effective_from,
      fullPayWeeks: Number(event.maternity_full_pay_weeks ?? 8),
      halfPayWeeks: Number(event.maternity_half_pay_weeks ?? 18),
      smpOnlyWeeks: Number(event.maternity_smp_only_weeks ?? 13),
      unpaidWeeks: Number(event.maternity_unpaid_weeks ?? 13),
      smpWeeklyRate: Number(event.maternity_smp_weekly_rate ?? 194.32),
      payMode: event.maternity_pay_mode ?? "nhs_spread_occupational_actual_smp",
      pensionPercent: Number(event.pension_percent),
      pensionMethod: event.pension_method ?? "net_pay",
      studentLoanPlan: event.student_loan_plan,
    });

    return estimate.estimatedNetAmount;
  }

  if (event.monthly_take_home_override !== null && event.monthly_take_home_override !== undefined) {
    return Number(event.monthly_take_home_override);
  }

  return estimateAnnualTakeHome({
    grossAnnual: Number(event.gross_annual_salary),
    pensionPercent: Number(event.pension_percent),
    pensionMethod: event.pension_method ?? "net_pay",
    studentLoanPlan: event.student_loan_plan,
  }).monthlyTakeHome;
}

function selectActivePayEventsForMonth(payEvents: PayEvent[], month: string) {
  const latestByPerson = new Map<string, PayEvent>();

  payEvents
    .filter((event) => isActiveInMonth(event.effective_from, event.effective_until, month))
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from))
    .forEach((event) => {
      latestByPerson.set(event.person_id ?? event.id, event);
    });

  return Array.from(latestByPerson.values());
}

function getChildCostMonthlyAmount(cost: ChildCost, month: string) {
  if (cost.cost_kind === "activity") {
    return calculateActivityMonthlyCost({
      billingMonth: month,
      weeklyCost: Number(cost.activity_weekly_cost ?? cost.monthly_cost ?? 0),
      activityWeekday: Number(cost.activity_weekday ?? 6),
      activityBillingMode: cost.activity_billing_mode ?? "calendar",
      activityTermWeeksPerYear: Number(cost.activity_term_weeks_per_year ?? 38),
      bankHolidaysAreFree: Boolean(cost.bank_holidays_are_free),
    }).estimatedMonthlyCost;
  }

  if (cost.cost_kind !== "nursery") return Number(cost.monthly_cost ?? 0);

  return calculateNurseryMonthlyCost({
    billingMonth: month,
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


function mortgageDealMonthlyPayment(deal: HomeMortgageDeal) {
  if (deal.monthly_payment_override !== null && deal.monthly_payment_override !== undefined) {
    return Number(deal.monthly_payment_override);
  }

  return calculateMonthlyMortgagePayment({
    balance: Number(deal.balance ?? 0),
    annualInterestRate: Number(deal.interest_rate ?? 0),
    termYears: Number(deal.term_years ?? 25),
  });
}

function buildMonthPlan({
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
      dueDate: dueDateForMonth(month, "fixed_day", 1, "previous_workday"),
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

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ month?: string; year?: string; person?: string }> }) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedMonth = resolvedSearchParams.month || currentMonth();
  const selectedYear = Number(resolvedSearchParams.year || selectedMonth.slice(0, 4) || new Date().getFullYear());

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const dataOwnerUserId = user.id;
  const dataClient = supabase;
  const householdVisibleFilter = visibleDataOrFilter(householdContext);
  const wealthUserIds = householdContext.householdId ? householdContext.memberUserIds : [dataOwnerUserId];

  const [{ data: profile }, { data: dashboardPrefs }, { data: categories }, { data: childCosts }, { data: people }, { data: payEvents }, { data: mortgageDeals }, { data: plannedItems }, { data: incomeEntries }, { data: dealBills }, { data: payOverrides }, wealthSummary, investmentPensionPerformance] = await Promise.all([
    dataClient
      .from("financial_profiles")
      .select("name, annual_salary, monthly_take_home, monthly_dividends, pension_percent, student_loan_plan, monthly_mortgage, monthly_savings_target")
      .eq("user_id", dataOwnerUserId)
      .maybeSingle(),
    supabase
      .from("app_user_profiles")
      .select("dashboard_home_view, money_display_precision")
      .eq("user_id", user.id)
      .maybeSingle(),
    dataClient
      .from("spending_categories")
      .select("id, name, type, monthly_budget, category_icon")
      .or(householdVisibleFilter)
      .returns<SpendingCategory[]>(),
    dataClient
      .from("child_costs")
      .select("id, child_id, bill_person_id, label, cost_kind, monthly_cost, billing_month, daily_rate, extra_daily_cost, funded_hours_per_week, funding_mode, hourly_funding_credit, term_weeks_per_year, billing_schedule, bank_holidays_are_free, tax_free_childcare_enabled, tax_free_childcare_cap_per_quarter, part_day_multiplier, full_day_hours, part_day_hours, monday_session, tuesday_session, wednesday_session, thursday_session, friday_session, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, activity_weekly_cost, activity_weekday, activity_billing_mode, activity_term_weeks_per_year, payment_timing, payment_day_of_month, payment_adjustment, starts_on, ends_on, care_type, care_details")
      .or(householdVisibleFilter)
      .returns<ChildCost[]>(),
    dataClient
      .from("people")
      .select("id, name, relationship, avatar_url")
      .or(householdVisibleFilter)
      .or("account_status.is.null,account_status.neq.duplicate_merged")
      .returns<Person[]>(),
    dataClient
      .from("pay_events")
      .select("*")
      .or(householdVisibleFilter)
      .returns<PayEvent[]>(),
    dataClient
      .from("home_mortgage_deals")
      .select("id, lender, balance, interest_rate, term_years, monthly_payment_override, start_date, end_date")
      .or(householdVisibleFilter)
      .returns<HomeMortgageDeal[]>(),
    dataClient
      .from("planned_items")
      .select("id, person_id, category_id, direction, item_type, label, amount, recurrence, recurrence_interval_days, start_date, end_date, day_of_month, payment_timing, payment_adjustment, end_behavior, renewal_notice_days, early_upgrade_date, expected_refund_amount")
      .or(householdVisibleFilter)
      .returns<PlannedItem[]>(),
    dataClient
      .from("income_entries")
      .select("id, person_id, label, gross_amount, net_amount, frequency, entry_date")
      .or(householdVisibleFilter)
      .returns<IncomeEntry[]>(),
    dataClient
      .from("deal_bills")
      .select("id, label, provider, category, monthly_cost, contract_end, notice_days, comparison_url, auto_recommendation_enabled")
      .or(householdVisibleFilter)
      .eq("auto_recommendation_enabled", true)
      .order("contract_end", { ascending: true, nullsFirst: false })
      .limit(6)
      .returns<DealBill[]>(),
    dataClient
      .from("pay_event_monthly_overrides")
      .select("id, pay_event_id, person_id, month, statutory_pay, occupational_pay, gross_pay, net_pay_override")
      .eq("user_id", dataOwnerUserId)
      .returns<PayEventOverride[]>(),
    buildWealthSummary(dataClient, dataOwnerUserId, selectedMonth).catch(() => null),
    buildMonthlyInvestmentPensionPerformance(dataClient, wealthUserIds, selectedMonth).catch(() => null),
  ]);

  const typedProfile = profile as FinancialProfile | null;
  const typedCategories = (categories ?? []) as SpendingCategory[];
  const childCostRows = (childCosts ?? []) as ChildCost[];
  const peopleRows = (people ?? []) as Person[];
  const overrideRows = (payOverrides ?? []) as PayEventOverride[];
  const overridesByEvent = new Map<string, PayEventOverride[]>();
  for (const override of overrideRows) {
    if (!override.pay_event_id) continue;
    const current = overridesByEvent.get(override.pay_event_id) || [];
    current.push(override);
    overridesByEvent.set(override.pay_event_id, current);
  }
  let rawPayRows = ((payEvents ?? []) as PayEvent[]);
  if (rawPayRows.length === 0 && peopleRows.length > 0) {
    const { data: payByPerson } = await dataClient
      .from("pay_events")
      .select("*")
      .in("person_id", peopleRows.map((person) => person.id))
      .returns<PayEvent[]>();
    rawPayRows = (payByPerson ?? []) as PayEvent[];
  }
  const payRows = rawPayRows.map((event) => ({ ...event, overrides: overridesByEvent.get(event.id) || [] }));
  let incomeEntryRows = (incomeEntries ?? []) as IncomeEntry[];
  if (incomeEntryRows.length === 0 && peopleRows.length > 0) {
    const { data: incomeByPerson } = await dataClient
      .from("income_entries")
      .select("id, person_id, label, gross_amount, net_amount, frequency, entry_date")
      .in("person_id", peopleRows.map((person) => person.id))
      .returns<IncomeEntry[]>();
    incomeEntryRows = (incomeByPerson ?? []) as IncomeEntry[];
  }
  const mortgageDealRows = (mortgageDeals ?? []) as HomeMortgageDeal[];
  const plannedItemRows = (plannedItems ?? []) as PlannedItem[];
  const dealBillRows = (dealBills ?? []) as DealBill[];
  const recommendedDealChecks = dealBillRows.filter((bill) => {
    const days = daysUntil(bill.contract_end);
    return days === null || days <= 90;
  });
  const peopleById = new Map(peopleRows.map((person) => [person.id, person]));

  const yearPlans = monthsForYear(selectedYear).map((month) => buildMonthPlan({
    month,
    profile: typedProfile,
    categories: typedCategories,
    childCosts: childCostRows,
    payEvents: payRows,
    mortgageDeals: mortgageDealRows,
    plannedItems: plannedItemRows,
    incomeEntries: incomeEntryRows,
    peopleById,
  }));
  const selectedPlan = buildMonthPlan({
    month: selectedMonth,
    profile: typedProfile,
    categories: typedCategories,
    childCosts: childCostRows,
    payEvents: payRows,
    mortgageDeals: mortgageDealRows,
    plannedItems: plannedItemRows,
    incomeEntries: incomeEntryRows,
    peopleById,
  });

  const moneyDisplayPrecision: MoneyDisplayPrecision = (dashboardPrefs as { money_display_precision?: string } | null)?.money_display_precision === "rounded" ? "rounded" : "exact";
  const money = (value: number | null | undefined) => formatMoney(value, { precision: moneyDisplayPrecision });

  const committedOutgoingsByPerson = Array.from(selectedPlan.outgoingItems.reduce((map, item) => {
    const key = item.personId || "__household";
    const existing = map.get(key) || { id: item.personId || null, key, label: item.personId ? getPersonName(peopleById, item.personId) : "Household / shared", total: 0, lines: [] as typeof selectedPlan.outgoingItems };
    existing.total += Number(item.value || 0);
    existing.lines.push(item);
    map.set(key, existing);
    return map;
  }, new Map<string, { id: string | null; key: string; label: string; total: number; lines: typeof selectedPlan.outgoingItems }>()).values())
    .map((row) => {
      const categoryTotals = Array.from(row.lines.reduce((map, line) => {
        const label = line.categoryLabel || line.helper || "Other";
        const existing = map.get(label) || { label, icon: line.categoryIcon || guessCategoryIcon(label), total: 0 };
        existing.total += Number(line.value || 0);
        map.set(label, existing);
        return map;
      }, new Map<string, { label: string; icon: string | null; total: number }>()).values()).sort((a, b) => b.total - a.total);
      return { ...row, categoryTotals };
    })
    .sort((a, b) => b.total - a.total);

  const hasDashboardData = selectedPlan.income > 0 || selectedPlan.outgoings > 0 || peopleRows.length > 1;

  // --- Overview page redesign helpers -------------------------------------------------
  const selfPerson = peopleRows.find((person) => person.relationship === "self") || null;
  const firstName = (selfPerson?.name || typedProfile?.name || "").trim().split(/\s+/)[0] || null;

  const savingsCategoryNames = new Set(typedCategories.filter((category) => category.type === "saving").map((category) => category.name));
  const savingsThisMonth = selectedPlan.outgoingItems.filter((item) => item.categoryLabel && savingsCategoryNames.has(item.categoryLabel)).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const nonSavingsOutgoings = Math.max(0, selectedPlan.outgoings - savingsThisMonth);
  const savingsRatePercent = selectedPlan.income > 0 ? Math.round((savingsThisMonth / selectedPlan.income) * 100) : 0;

  const previousMonthKey = (() => {
    const [year, monthNumber] = selectedMonth.split("-").map(Number);
    const date = new Date(year, monthNumber - 2, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  })();
  const previousMonthPlan = yearPlans.find((plan) => plan.month === previousMonthKey) || buildMonthPlan({
    month: previousMonthKey,
    profile: typedProfile,
    categories: typedCategories,
    childCosts: childCostRows,
    payEvents: payRows,
    mortgageDeals: mortgageDealRows,
    plannedItems: plannedItemRows,
    incomeEntries: incomeEntryRows,
    peopleById,
  });
  const surplusChange = selectedPlan.surplus - previousMonthPlan.surplus;

  const performanceSummary = (() => {
    if (previousMonthPlan.income === 0 && previousMonthPlan.outgoings === 0) {
      return `First month with tracked data for ${selectedPlan.label} — once next month lands you'll see how it compares.`;
    }
    if (Math.abs(surplusChange) < 1) {
      return `${selectedPlan.label} is tracking almost exactly the same as ${previousMonthPlan.label} — ${money(selectedPlan.surplus)} left over either way.`;
    }
    const direction = surplusChange > 0 ? "better off" : "less left over";
    return `${selectedPlan.label} is ${money(Math.abs(surplusChange))} ${direction} than ${previousMonthPlan.label}, after income, bills, childcare and savings.`;
  })();

  // Standout points: the single biggest bill, anything genuinely new this month, and whoever is carrying the most.
  const biggestOutgoing = selectedPlan.outgoingItems.slice().sort((a, b) => b.value - a.value)[0] || null;
  const newChargesThisMonth = plannedItemRows.filter((item) => item.direction === "outgoing" && item.recurrence !== "one_off" && item.start_date && item.start_date.slice(0, 7) === selectedMonth && dateIsInMonth(item.start_date, selectedMonth));
  const biggestSpenderRow = committedOutgoingsByPerson.filter((row) => row.key !== "__household")[0] || null;
  const standoutPoints = [
    biggestOutgoing ? { icon: biggestOutgoing.categoryIcon || "💳", text: `${biggestOutgoing.label.split(" · ").pop()} is the largest single outgoing this month at ${money(biggestOutgoing.value)}.` } : null,
    newChargesThisMonth.length > 0 ? { icon: "🆕", text: `${newChargesThisMonth.length} new recurring charge${newChargesThisMonth.length === 1 ? "" : "s"} started this month: ${newChargesThisMonth.slice(0, 3).map((item) => item.label).join(", ")}${newChargesThisMonth.length > 3 ? "…" : ""}.` } : null,
    biggestSpenderRow ? { icon: "👤", text: `${biggestSpenderRow.label} is carrying the most this month at ${money(biggestSpenderRow.total)} across ${biggestSpenderRow.lines.length} payment${biggestSpenderRow.lines.length === 1 ? "" : "s"}.` } : null,
  ].filter(Boolean) as { icon: string; text: string }[];

  const investmentsPerf = investmentPensionPerformance?.investments || null;
  const pensionsPerf = investmentPensionPerformance?.pensions || null;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[2.25rem] border border-white/70 bg-slate-950 p-6 text-white shadow-[0_36px_110px_-64px_rgba(15,23,42,.9)] md:p-8">
          <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-orange-500/30 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="relative">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-200">{selectedPlan.label}</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">{firstName ? `Hey ${firstName},` : "Hey,"} here's how things are looking</h1>
            <p className="mt-3 max-w-2xl text-sm font-medium text-slate-300">{performanceSummary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1.5 text-xs font-black ${selectedPlan.surplus >= 1000 ? "bg-emerald-400/20 text-emerald-100" : selectedPlan.surplus >= 0 ? "bg-amber-400/20 text-amber-100" : "bg-red-400/20 text-red-100"}`}>{selectedPlan.surplus >= 1000 ? "Comfortable" : selectedPlan.surplus >= 0 ? "Tight but positive" : "Shortfall"}</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-slate-200">{peopleRows.length} people tracked</span>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-3xl border border-white/20 bg-white/95 p-4 text-slate-950 shadow-sm"><p className="text-xs font-black uppercase text-slate-500">Income</p><p className="mt-1 text-2xl font-black">{money(selectedPlan.income)}</p></div>
              <div className="rounded-3xl border border-white/20 bg-white/95 p-4 text-slate-950 shadow-sm"><p className="text-xs font-black uppercase text-slate-500">Outgoings</p><p className="mt-1 text-2xl font-black">{money(nonSavingsOutgoings)}</p></div>
              <div className="rounded-3xl border border-white/20 bg-white/95 p-4 text-slate-950 shadow-sm"><p className="text-xs font-black uppercase text-slate-500">Savings this month</p><p className="mt-1 text-2xl font-black text-emerald-700">{money(savingsThisMonth)}</p><p className="mt-1 text-[11px] font-bold text-slate-400">{savingsRatePercent}% of income</p></div>
              <div className="rounded-3xl border border-white/20 bg-white/95 p-4 text-slate-950 shadow-sm"><p className="text-xs font-black uppercase text-slate-500">Left over</p><p className={`mt-1 text-2xl font-black ${selectedPlan.surplus >= 0 ? "text-slate-950" : "text-red-600"}`}>{money(selectedPlan.surplus)}</p></div>
              <div className="rounded-3xl border border-white/20 bg-white/95 p-4 text-slate-950 shadow-sm">
                <p className="text-xs font-black uppercase text-slate-500">Investments &amp; pension</p>
                <p className="mt-1 text-2xl font-black">{money((wealthSummary?.investmentValue || 0) + (wealthSummary?.pensionValue || 0))}</p>
                {(investmentsPerf?.hasBaseline || pensionsPerf?.hasBaseline) ? (
                  <p className={`mt-1 text-[11px] font-bold ${(investmentsPerf?.changeAmount || 0) + (pensionsPerf?.changeAmount || 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {(investmentsPerf?.changeAmount || 0) + (pensionsPerf?.changeAmount || 0) >= 0 ? "+" : ""}{money((investmentsPerf?.changeAmount || 0) + (pensionsPerf?.changeAmount || 0))} so far this month
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] font-bold text-slate-400">No performance history yet</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {standoutPoints.length > 0 ? (
          <section className="grid gap-3 md:grid-cols-3">
            {standoutPoints.map((point, index) => (
              <div key={index} className="flex items-start gap-3 rounded-[1.75rem] border border-slate-200 bg-white/90 p-4 shadow-sm">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-orange-50 text-lg">{point.icon}</span>
                <p className="text-sm font-semibold leading-5 text-slate-700">{point.text}</p>
              </div>
            ))}
          </section>
        ) : null}

        {!hasDashboardData ? <PageLandingExperience kind="overview" /> : null}

        {recommendedDealChecks.length > 0 ? (
          <SectionCard title="Recommended deal checks" description="Bills and contracts from Lifestyle that are due soon or have no renewal date set.">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {recommendedDealChecks.map((bill) => (
                <Link key={bill.id} href="/lifestyle" className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">{bill.category.replaceAll("_", " ")}</p>
                      <p className="mt-1 font-black text-slate-950">{bill.provider}</p>
                      <p className="text-sm font-semibold text-slate-600">{bill.label}</p>
                    </div>
                    <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-700">{money(bill.monthly_cost)}</span>
                  </div>
                  <p className="mt-3 text-sm font-black text-orange-700">{dealRecommendation(bill)}</p>
                </Link>
              ))}
            </div>
          </SectionCard>
        ) : null}

        <SectionCard title={`${selectedYear} calendar`} description="Click a month to see the income and outgoing lines behind the number.">
          <div className="mb-4 flex justify-end gap-2">
            <Link href={`/dashboard?year=${selectedYear - 1}&month=${selectedYear - 1}-${selectedMonth.slice(5, 7)}`} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">← {selectedYear - 1}</Link>
            <Link href={`/dashboard?year=${selectedYear + 1}&month=${selectedYear + 1}-${selectedMonth.slice(5, 7)}`} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50">{selectedYear + 1} →</Link>
          </div>
          <div
            className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 sm:grid sm:gap-3 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0 sm:grid-cols-2 lg:grid-cols-4"
            style={{ scrollSnapType: "x mandatory" }}
          >
            {yearPlans.map((plan) => {
              const theme = monthTheme(plan.month);
              const spendingPct = plan.income > 0 ? Math.min(100, Math.round((plan.outgoings / plan.income) * 100)) : 0;
              const selected = plan.month === selectedMonth;
              return (
                <Link
                  key={plan.month}
                  href={`/dashboard?year=${selectedYear}&month=${plan.month}`}
                  className={`relative w-[210px] shrink-0 overflow-hidden rounded-2xl border bg-gradient-to-br p-4 transition hover:-translate-y-0.5 hover:shadow-sm sm:w-auto ${theme.gradient} ${selected ? "border-orange-300 ring-2 ring-orange-200" : "border-slate-200"}`}
                  style={{ scrollSnapAlign: "start" }}
                >
                  <span className="pointer-events-none absolute -right-2 -top-1 text-3xl opacity-30">{theme.emoji}</span>
                  <div className="relative flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{plan.label}</p>
                      <p className="mt-1 text-xs text-slate-500">In {money(plan.income)} · Out {money(plan.outgoings)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${plan.surplus >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                      {money(plan.surplus)}
                    </span>
                  </div>
                  <div className="relative mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-white/70">
                      <div className={`h-full rounded-full ${spendingPct >= 90 ? "bg-red-500" : spendingPct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${spendingPct}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] font-bold text-slate-500">{spendingPct}% of income committed</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </SectionCard>

      </main>
    </>
  );
}
