import { estimateAnnualTakeHome, type PensionMethod, type StudentLoanPlan } from "@/lib/calculations/tax";
import { calculateNhsMaternityMonthlyAmount, type MaternityPayMode } from "@/lib/calculations/maternity";
import {
  calculateActivityMonthlyCost,
  calculateNurseryMonthlyCost,
  type ActivityBillingMode,
  type BillingSchedule,
  type DaySession,
  type FundingMode,
} from "@/lib/calculations/childcare";
import { calculateMonthlyMortgagePayment } from "@/lib/calculations/mortgage";

export type FinancialProfile = {
  name: string | null;
  annual_salary: number | null;
  monthly_take_home: number | null;
  monthly_dividends: number | null;
  pension_percent: number | null;
  student_loan_plan: string | null;
  monthly_mortgage: number | null;
  monthly_savings_target: number | null;
};

export type SpendingCategoryForPlan = {
  id: string;
  name: string;
  type: "fixed" | "variable" | "saving" | "debt";
  monthly_budget: number;
};

export type PersonForPlan = {
  id: string;
  name: string;
  relationship: "self" | "partner" | "child" | "other";
};

export type PayEventForPlan = {
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
};

export type ChildCostForPlan = {
  id: string;
  child_id: string | null;
  label: string;
  cost_kind: "fixed" | "nursery" | "activity" | "nanny" | null;
  category_id?: string | null;
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
  monday_hours: number | null;
  tuesday_hours: number | null;
  wednesday_hours: number | null;
  thursday_hours: number | null;
  friday_hours: number | null;
  activity_weekly_cost: number | null;
  activity_weekday: number | null;
  activity_billing_mode: ActivityBillingMode | null;
  activity_term_weeks_per_year: number | null;
  starts_on: string;
  ends_on: string | null;
};

export type PlannedItemForPlan = {
  id: string;
  person_id: string | null;
  direction: "income" | "outgoing";
  item_type: string;
  label: string;
  amount: number;
  recurrence: "monthly" | "four_weekly" | "custom_interval" | "one_off";
  recurrence_interval_days?: number | null;
  start_date: string;
  end_date: string | null;
  day_of_month: number | null;
};


export type IncomeEntryForPlan = {
  id: string;
  person_id: string | null;
  label: string;
  gross_amount: number | null;
  net_amount: number | null;
  frequency: string | null;
  entry_date: string;
};

function incomeEntryAppliesToMonth(entry: IncomeEntryForPlan, month: string) {
  if (entry.frequency === "one_off") return dateIsInMonth(entry.entry_date, month);
  return entry.entry_date <= toDateString(monthEnd(month));
}

function getIncomeEntryMonthlyAmount(entry: IncomeEntryForPlan) {
  const amount = Number(entry.net_amount ?? entry.gross_amount ?? 0);
  if (entry.frequency === "weekly") return amount * 52 / 12;
  if (entry.frequency === "annual") return amount / 12;
  if (entry.frequency === "quarterly") return amount / 3;
  return amount;
}

export type HomeMortgageDealForPlan = {
  id: string;
  lender: string | null;
  balance: number;
  interest_rate: number;
  term_years: number;
  monthly_payment_override: number | null;
  start_date: string;
  end_date: string | null;
};

export type MonthPlanLine = { label: string; value: number; href: string; helper: string; personId?: string | null };

export type MonthPlan = {
  month: string;
  label: string;
  income: number;
  outgoings: number;
  surplus: number;
  incomeItems: MonthPlanLine[];
  outgoingItems: MonthPlanLine[];
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

function dateIsInMonth(date: string, month: string) {
  return date >= toDateString(monthStart(month)) && date <= toDateString(monthEnd(month));
}

function plannedItemIntervalDays(item: PlannedItemForPlan) {
  if (item.recurrence === "custom_interval") return Math.max(1, Number(item.recurrence_interval_days || 0) || 7);
  return 28;
}

function plannedItemDatesForMonth(item: PlannedItemForPlan, month: string): string[] {
  if (item.recurrence === "one_off") return dateIsInMonth(item.start_date, month) ? [item.start_date] : [];
  if (item.recurrence === "monthly") return isActiveInMonth(item.start_date, item.end_date, month) ? [item.start_date] : [];
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

function plannedItemRecurrenceLabel(item: PlannedItemForPlan, direction: "income" | "outgoing") {
  if (item.recurrence === "monthly") return direction === "income" ? "Planned monthly income" : "Planned monthly outgoing";
  if (item.recurrence === "one_off") return direction === "income" ? "One-off income" : "One-off planned outgoing";
  if (item.recurrence === "four_weekly") return "Every 4 weeks";
  const days = plannedItemIntervalDays(item);
  if (days % 7 === 0) { const weeks = days / 7; return `Every ${weeks} week${weeks === 1 ? "" : "s"}`; }
  return `Every ${days} day${days === 1 ? "" : "s"}`;
}

function plannedItemAppliesToMonth(item: PlannedItemForPlan, month: string) {
  if (item.recurrence === "one_off") return dateIsInMonth(item.start_date, month);
  if (item.recurrence === "monthly") return isActiveInMonth(item.start_date, item.end_date, month);
  return plannedItemDatesForMonth(item, month).length > 0;
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

function getPersonName(peopleById: Map<string, PersonForPlan>, id: string | null) {
  if (!id) return "Unassigned";
  return peopleById.get(id)?.name ?? "Unassigned";
}

function getPayAmount(event: PayEventForPlan, month: string) {
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

function selectActivePayEventsForMonth(payEvents: PayEventForPlan[], month: string) {
  const latestByPerson = new Map<string, PayEventForPlan>();

  payEvents
    .filter((event) => isActiveInMonth(event.effective_from, event.effective_until, month))
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from))
    .forEach((event) => {
      latestByPerson.set(event.person_id ?? event.id, event);
    });

  return Array.from(latestByPerson.values());
}

export function getChildCostMonthlyAmount(cost: ChildCostForPlan, month: string) {
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

function mortgageDealMonthlyPayment(deal: HomeMortgageDealForPlan) {
  if (deal.monthly_payment_override !== null && deal.monthly_payment_override !== undefined) {
    return Number(deal.monthly_payment_override);
  }

  return calculateMonthlyMortgagePayment({
    balance: Number(deal.balance ?? 0),
    annualInterestRate: Number(deal.interest_rate ?? 0),
    termYears: Number(deal.term_years ?? 25),
  });
}

export function buildMonthPlan({
  month,
  profile,
  categories,
  childCosts,
  payEvents,
  mortgageDeals,
  plannedItems,
  incomeEntries = [],
  peopleById,
}: {
  month: string;
  profile: FinancialProfile | null;
  categories: SpendingCategoryForPlan[];
  childCosts: ChildCostForPlan[];
  payEvents: PayEventForPlan[];
  mortgageDeals: HomeMortgageDealForPlan[];
  plannedItems: PlannedItemForPlan[];
  incomeEntries?: IncomeEntryForPlan[];
  peopleById: Map<string, PersonForPlan>;
}): MonthPlan {
  const activePay = selectActivePayEventsForMonth(payEvents, month);
  const incomeItems = activePay.map((event) => ({
    label: `${getPersonName(peopleById, event.person_id)} · ${event.label}`,
    value: getPayAmount(event, month),
    href: event.person_id ? `/household/${event.person_id}` : "/household",
    personId: event.person_id,
    helper: event.pay_kind === "maternity" ? "NHS maternity estimate for this month" : "Pay event",
  }));

  if (incomeItems.length === 0 && Number(profile?.monthly_take_home ?? 0) > 0) {
    incomeItems.push({
      label: profile?.name ?? "Profile take-home pay",
      value: Number(profile?.monthly_take_home ?? 0),
      href: "/dashboard",
      personId: null,
      helper: "Fallback from financial profile",
    });
  }

  incomeEntries.filter((entry) => incomeEntryAppliesToMonth(entry, month)).forEach((entry) => {
    incomeItems.push({
      label: `${getPersonName(peopleById, entry.person_id)} · ${entry.label}`,
      value: getIncomeEntryMonthlyAmount(entry),
      href: "/income",
      personId: entry.person_id,
      helper: entry.frequency === "monthly" ? "Manual monthly income" : `${entry.frequency || "manual"} income converted monthly`,
    });
  });

  if (Number(profile?.monthly_dividends ?? 0) > 0) {
    incomeItems.push({
      label: "Dividends / side income",
      value: Number(profile?.monthly_dividends ?? 0),
      href: "/dashboard",
      personId: null,
      helper: "Monthly recurring amount",
    });
  }

  const activePlannedItems = plannedItems.filter((item) => plannedItemAppliesToMonth(item, month));
  activePlannedItems.filter((item) => item.direction === "income").forEach((item) => {
    const occurrences = Math.max(1, plannedItemDatesForMonth(item, month).length);
    incomeItems.push({
      label: `${getPersonName(peopleById, item.person_id)} · ${item.label}${occurrences > 1 ? ` (×${occurrences})` : ""}`,
      value: Number(item.amount ?? 0) * occurrences,
      href: "/spending",
      personId: item.person_id,
      helper: plannedItemRecurrenceLabel(item, "income"),
    });
  });

  const activeMortgageDeals = mortgageDeals.filter((deal) => isActiveInMonth(deal.start_date, deal.end_date, month));
  const mortgageFromDeals = activeMortgageDeals.reduce((sum, deal) => sum + mortgageDealMonthlyPayment(deal), 0);
  const outgoingItems: MonthPlanLine[] = [
    {
      label: mortgageFromDeals > 0 ? "Mortgage deals" : "Mortgage",
      value: mortgageFromDeals > 0 ? mortgageFromDeals : Number(profile?.monthly_mortgage ?? 0),
      href: "/mortgage",
      personId: null,
      helper: mortgageFromDeals > 0 ? `${activeMortgageDeals.length} active mortgage deal(s)` : "Current profile mortgage",
    },
    ...categories.map((category) => ({
      label: category.name,
      value: Number(category.monthly_budget ?? 0),
      href: "/spending",
      personId: null,
      helper: `${category.type} spending category`,
    })),
  ];

  activePlannedItems.filter((item) => item.direction === "outgoing").forEach((item) => {
    const occurrences = Math.max(1, plannedItemDatesForMonth(item, month).length);
    outgoingItems.push({
      label: `${getPersonName(peopleById, item.person_id)} · ${item.label}${occurrences > 1 ? ` (×${occurrences})` : ""}`,
      value: Number(item.amount ?? 0) * occurrences,
      href: "/spending",
      personId: item.person_id,
      helper: plannedItemRecurrenceLabel(item, "outgoing"),
    });
  });

  const activeChildCosts = childCosts.filter((cost) => isActiveInMonth(cost.starts_on, cost.ends_on, month));
  activeChildCosts.forEach((cost) => {
    outgoingItems.push({
      label: `${getPersonName(peopleById, cost.child_id)} · ${cost.label}`,
      value: getChildCostMonthlyAmount(cost, month),
      href: cost.child_id ? `/household/${cost.child_id}` : "/household",
      personId: cost.child_id,
      helper: cost.cost_kind === "activity" ? "Activity / class" : cost.cost_kind === "nursery" ? "Nursery calendar estimate" : "Child cost",
    });
  });

  const savingsTarget = Number(profile?.monthly_savings_target ?? 0);
  if (savingsTarget > 0) {
    outgoingItems.push({ label: "Savings target", value: savingsTarget, href: "/dashboard", personId: null, helper: "Monthly saving plan" });
  }

  const income = incomeItems.reduce((sum, item) => sum + item.value, 0);
  const outgoings = outgoingItems.reduce((sum, item) => sum + item.value, 0);

  return {
    month,
    label: monthLabel(month),
    income,
    outgoings,
    surplus: income - outgoings,
    incomeItems,
    outgoingItems: outgoingItems.filter((item) => item.value > 0),
  };
}
