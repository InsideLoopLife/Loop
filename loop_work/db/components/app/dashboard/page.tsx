import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/format/money";
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
import { ensureDefaultAssumptions } from "@/lib/assumptions/server";
import { getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";

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
  monthly_budget: number;
};

type Person = {
  id: string;
  name: string;
  relationship: "self" | "partner" | "child" | "other";
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
  starts_on: string;
  ends_on: string | null;
};


type PlannedItem = {
  id: string;
  person_id: string | null;
  direction: "income" | "outgoing";
  item_type: string;
  label: string;
  amount: number;
  recurrence: "monthly" | "one_off";
  start_date: string;
  end_date: string | null;
  day_of_month: number | null;
  payment_timing: "fixed_day" | "last_workday" | null;
  payment_adjustment: "previous_workday" | "next_workday" | "none" | null;
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
  incomeItems: { label: string; value: number; href: string; helper: string; dueDate?: string }[];
  outgoingItems: { label: string; value: number; href: string; helper: string; dueDate?: string }[];
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

function plannedItemAppliesToMonth(item: PlannedItem, month: string) {
  if (item.recurrence === "one_off") return dateIsInMonth(item.start_date, month);
  return isActiveInMonth(item.start_date, item.end_date, month);
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

function getPersonName(peopleById: Map<string, Person>, id: string | null) {
  if (!id) return "Unassigned";
  return peopleById.get(id)?.name ?? "Unassigned";
}

function getPayAmount(event: PayEvent, month: string) {
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
      payMode: event.maternity_pay_mode ?? "spread_equal",
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
  peopleById,
}: {
  month: string;
  profile: FinancialProfile | null;
  categories: SpendingCategory[];
  childCosts: ChildCost[];
  payEvents: PayEvent[];
  mortgageDeals: HomeMortgageDeal[];
  plannedItems: PlannedItem[];
  peopleById: Map<string, Person>;
}): MonthPlan {
  const activePay = selectActivePayEventsForMonth(payEvents, month);
  const incomeItems = activePay.map((event) => ({
    label: `${getPersonName(peopleById, event.person_id)} · ${event.label}`,
    value: getPayAmount(event, month),
    href: event.person_id ? `/household/${event.person_id}` : "/household",
    helper: event.pay_kind === "maternity" ? "NHS maternity estimate for this month" : "Pay event",
    dueDate: dueDateForMonth(month, "last_workday", null, "previous_workday"),
  }));


  const activePlannedItems = plannedItems.filter((item) => plannedItemAppliesToMonth(item, month));
  activePlannedItems.filter((item) => item.direction === "income").forEach((item) => {
    incomeItems.push({
      label: `${getPersonName(peopleById, item.person_id)} · ${item.label}`,
      value: Number(item.amount ?? 0),
      href: "/spending",
      helper: item.recurrence === "monthly" ? "Planned monthly income" : "One-off income",
      dueDate: item.recurrence === "monthly" ? dueDateForMonth(month, item.payment_timing, item.day_of_month, item.payment_adjustment) : item.start_date,
    });
  });

  const activeMortgageDeals = mortgageDeals.filter((deal) => isActiveInMonth(deal.start_date, deal.end_date, month));
  const mortgageFromDeals = activeMortgageDeals.reduce((sum, deal) => sum + mortgageDealMonthlyPayment(deal), 0);
  const outgoingItems = [
    ...(mortgageFromDeals > 0 ? [{
      label: "Mortgage deals",
      value: mortgageFromDeals,
      href: "/mortgage",
      helper: `${activeMortgageDeals.length} active mortgage deal(s)`,
      dueDate: dueDateForMonth(month, "fixed_day", 1, "previous_workday"),
    }] : []),
    ...categories.map((category) => ({
      label: category.name,
      value: Number(category.monthly_budget ?? 0),
      href: "/spending",
      helper: `${category.type} spending category`,
      dueDate: dueDateForMonth(month, "fixed_day", 1, "previous_workday"),
    })),
  ];

  activePlannedItems.filter((item) => item.direction === "outgoing").forEach((item) => {
    outgoingItems.push({
      label: `${getPersonName(peopleById, item.person_id)} · ${item.label}`,
      value: Number(item.amount ?? 0),
      href: "/spending",
      helper: item.recurrence === "monthly" ? "Planned monthly outgoing" : "One-off planned outgoing",
      dueDate: item.recurrence === "monthly" ? dueDateForMonth(month, item.payment_timing, item.day_of_month, item.payment_adjustment) : item.start_date,
    });
  });

  const activeChildCosts = childCosts.filter((cost) => isActiveInMonth(cost.starts_on, cost.ends_on, month));
  activeChildCosts.forEach((cost) => {
    outgoingItems.push({
      label: `${getPersonName(peopleById, cost.child_id)} · ${cost.label}`,
      value: getChildCostMonthlyAmount(cost, month),
      href: cost.child_id ? `/household/${cost.child_id}` : "/household",
      helper: cost.cost_kind === "activity" ? "Activity / class" : cost.cost_kind === "nursery" ? "Nursery calendar estimate" : "Child cost",
      dueDate: dueDateForMonth(month, "fixed_day", 1, "previous_workday"),
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

export default async function DashboardPage({ searchParams }: { searchParams?: Promise<{ month?: string; year?: string }> }) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedMonth = resolvedSearchParams.month || currentMonth();
  const selectedYear = Number(resolvedSearchParams.year || selectedMonth.slice(0, 4) || new Date().getFullYear());

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  await ensureDefaultAssumptions(supabase, user.id);
  const householdContext = await getActiveHouseholdContext(supabase, user);

  const [{ data: profile }, { data: categories }, { data: childCosts }, { data: people }, { data: payEvents }, { data: mortgageDeals }, { data: plannedItems }, { data: dealBills }] = await Promise.all([
    supabase
      .from("financial_profiles")
      .select("name, annual_salary, monthly_take_home, monthly_dividends, pension_percent, student_loan_plan, monthly_mortgage, monthly_savings_target")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("spending_categories")
      .select("id, name, type, monthly_budget")
      .or(visibleDataOrFilter(householdContext))
      .returns<SpendingCategory[]>(),
    supabase
      .from("child_costs")
      .select("id, child_id, label, cost_kind, monthly_cost, billing_month, daily_rate, extra_daily_cost, funded_hours_per_week, funding_mode, hourly_funding_credit, term_weeks_per_year, billing_schedule, bank_holidays_are_free, tax_free_childcare_enabled, tax_free_childcare_cap_per_quarter, part_day_multiplier, full_day_hours, part_day_hours, monday_session, tuesday_session, wednesday_session, thursday_session, friday_session, monday_hours, tuesday_hours, wednesday_hours, thursday_hours, friday_hours, activity_weekly_cost, activity_weekday, activity_billing_mode, activity_term_weeks_per_year, starts_on, ends_on")
      .or(visibleDataOrFilter(householdContext))
      .returns<ChildCost[]>(),
    supabase
      .from("people")
      .select("id, name, relationship")
      .or("account_status.is.null,account_status.neq.duplicate_merged")
      .or(visibleDataOrFilter(householdContext))
      .returns<Person[]>(),
    supabase
      .from("pay_events")
      .select("id, person_id, label, pay_kind, gross_annual_salary, monthly_take_home_override, pension_percent, pension_method, student_loan_plan, effective_from, effective_until, maternity_scheme, maternity_leave_start, maternity_leave_end, maternity_pay_mode, maternity_full_pay_weeks, maternity_half_pay_weeks, maternity_smp_only_weeks, maternity_unpaid_weeks, maternity_smp_weekly_rate")
      .or(visibleDataOrFilter(householdContext))
      .returns<PayEvent[]>(),
    supabase
      .from("home_mortgage_deals")
      .select("id, lender, balance, interest_rate, term_years, monthly_payment_override, start_date, end_date")
      .or(visibleDataOrFilter(householdContext))
      .returns<HomeMortgageDeal[]>(),
    supabase
      .from("planned_items")
      .select("id, person_id, direction, item_type, label, amount, recurrence, start_date, end_date, day_of_month, payment_timing, payment_adjustment")
      .or(visibleDataOrFilter(householdContext))
      .returns<PlannedItem[]>(),
    supabase
      .from("deal_bills")
      .select("id, label, provider, category, monthly_cost, contract_end, notice_days, comparison_url, auto_recommendation_enabled")
      .or(visibleDataOrFilter(householdContext))
      .eq("auto_recommendation_enabled", true)
      .order("contract_end", { ascending: true, nullsFirst: false })
      .limit(6)
      .returns<DealBill[]>(),
  ]);

  const typedProfile = profile as FinancialProfile | null;
  const typedCategories = (categories ?? []) as SpendingCategory[];
  const childCostRows = (childCosts ?? []) as ChildCost[];
  const peopleRows = (people ?? []) as Person[];
  const payRows = (payEvents ?? []) as PayEvent[];
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
    peopleById,
  });

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[2.25rem] border border-white/70 bg-slate-950 p-6 text-white shadow-[0_36px_110px_-64px_rgba(15,23,42,.9)] md:p-8">
          <div className="absolute -right-28 -top-28 h-80 w-80 rounded-full bg-orange-500/30 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="relative grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-200">This month</p>
              <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">{formatMoney(selectedPlan.surplus)}</h1>
              <p className="mt-2 max-w-2xl text-sm font-medium text-slate-300">Expected left over in {selectedPlan.label} after tracked income, mortgage, spending, childcare and savings. Click any month below to see the line-by-line reason.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1.5 text-xs font-black ${selectedPlan.surplus >= 1000 ? "bg-emerald-400/20 text-emerald-100" : selectedPlan.surplus >= 0 ? "bg-amber-400/20 text-amber-100" : "bg-red-400/20 text-red-100"}`}>{selectedPlan.surplus >= 1000 ? "Comfortable" : selectedPlan.surplus >= 0 ? "Tight but positive" : "Shortfall"}</span>
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-slate-200">{peopleRows.length} people tracked</span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Income</p><p className="mt-1 text-2xl font-black">{formatMoney(selectedPlan.income)}</p></div>
              <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Outgoings</p><p className="mt-1 text-2xl font-black">{formatMoney(selectedPlan.outgoings)}</p></div>
              <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Lines</p><p className="mt-1 text-2xl font-black">{selectedPlan.incomeItems.length + selectedPlan.outgoingItems.length}</p></div>
            </div>
          </div>
        </section>



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
                    <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-700">{formatMoney(bill.monthly_cost)}</span>
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {yearPlans.map((plan) => (
              <Link
                key={plan.month}
                href={`/dashboard?year=${selectedYear}&month=${plan.month}`}
                className={`rounded-2xl border p-4 transition hover:bg-slate-50 ${plan.month === selectedMonth ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{plan.label}</p>
                    <p className="mt-1 text-xs text-slate-500">In {formatMoney(plan.income)} · Out {formatMoney(plan.outgoings)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${plan.surplus >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {formatMoney(plan.surplus)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title={`${selectedPlan.label} income`} description="This now pulls from active household pay events. Use monthly overrides for maternity or irregular months.">
            <div className="space-y-3">
              {selectedPlan.incomeItems.map((item) => (
                <Link key={`${item.label}-${item.value}`} href={item.href} className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-950">{item.label}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.dueDate ? `${shortDate(item.dueDate)} · ` : ""}{item.helper}</p>
                    </div>
                    <p className="font-bold text-slate-950">{formatMoney(item.value)}</p>
                  </div>
                </Link>
              ))}
              {selectedPlan.incomeItems.length === 0 ? <p className="text-sm text-slate-500">No active income found for this month. Add pay events in Household.</p> : null}
            </div>
          </SectionCard>

          <SectionCard title={`${selectedPlan.label} outgoings`} description="This is the detail behind planned outgoings for the selected month.">
            <div className="space-y-3">
              {selectedPlan.outgoingItems.map((item) => (
                <Link key={`${item.label}-${item.value}`} href={item.href} className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-950">{item.label}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.dueDate ? `${shortDate(item.dueDate)} · ` : ""}{item.helper}</p>
                    </div>
                    <p className="font-bold text-slate-950">{formatMoney(item.value)}</p>
                  </div>
                </Link>
              ))}
              {selectedPlan.outgoingItems.length === 0 ? <p className="text-sm text-slate-500">No planned outgoings yet. Add spending categories, mortgage and child costs.</p> : null}
            </div>
          </SectionCard>
        </div>

      </main>
    </>
  );
}
