import { PlainMonthPanel } from "@/components/dashboard/PlainMonthPanel";
import { monthDrivers, outlook } from "@/lib/planning/plain-money";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { createPageTimer } from "@/lib/perf/timing";
import {
  getChildCostMonthlyAmount as sharedChildCostMonthlyAmount,
  getIncomeEntryMonthlyAmount as sharedIncomeEntryMonthlyAmount,
  getPayAmount as sharedGetPayAmount,
  incomeEntryAppliesToMonth as sharedIncomeEntryAppliesToMonth,
  mortgageDealMonthlyPayment as sharedMortgageDealMonthlyPayment,
  selectActivePayEventsForMonth as sharedSelectActivePayEvents,
} from "@/lib/planning/month-plan";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { PageLandingExperience } from "@/components/landing/PageLandingExperience";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type MoneyDisplayPrecision } from "@/lib/format/money";
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
import { getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";
import { buildWealthSummary } from "@/lib/wealth/summary";
import { buildMonthlyInvestmentPensionPerformance } from "@/lib/wealth/monthly-performance";
import {
  deriveIncomePensionContribution,
  deriveMonthlyPensionContribution,
  derivePensionAnnualRate,
  derivePensionRateScenarios,
  type PensionContributionForProjection,
  type PensionPerformanceAssumption,
  type PensionSnapshotForProjection,
} from "@/lib/wealth/pension-projection";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";
import { buildDashboardInsightEvidence } from "@/lib/dashboard/dashboard-insight-evidence";
import type { WidgetInsightData } from "@/lib/dashboard/types";
import { monthStepFor, monthSteppedDate } from "@/lib/planning/recurrence";

import {
  FinancialProfile,
  SpendingCategory,
  Person,
  PayEvent,
  PayEventOverride,
  FinancialPositionSnapshot,
  ChildCost,
  IncomeEntry,
  PlannedItem,
  HomeMortgageDeal,
  DealBill,
  MonthPlan,
  monthStart,
  monthEnd,
  toDateString,
  isActiveInMonth,
  dateIsInMonth,
  plannedItemForecastEndDate,
  plannedItemIntervalDays,
  plannedItemDatesForMonth,
  plannedItemAppliesToMonth,
  plannedItemRecurrenceLabel,
  monthsForYear,
  monthsFrom,
  monthLabel,
  currentMonth,
  englandWalesBankHolidays,
  isWeekendOrBankHoliday,
  adjustedWorkday,
  dueDateForMonth,
  shortDate,
  daysUntil,
  dealRecommendation,
  plannedLifecycleLabel,
  getPersonName,
  guessCategoryIcon,
  labelise,
  getIncomeEntryMonthlyAmount,
  incomeEntryAppliesToMonth,
  getPayAmount,
  selectActivePayEventsForMonth,
  getChildCostMonthlyAmount,
  mortgageDealMonthlyPayment,
  buildMonthPlan,
} from "@/lib/planning/summary-plan";

async function DashboardContent({ searchParams }: { searchParams?: Promise<{ month?: string; year?: string; person?: string }> }) {
  const timer = createPageTimer("dashboard");
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedMonth = resolvedSearchParams.month || currentMonth();
  const selectedYear = Number(resolvedSearchParams.year || selectedMonth.slice(0, 4) || new Date().getFullYear());

  const supabase = await createClient();
  const {
    data: { user },
  } = await timer.time("auth", getVerifiedUser(supabase));

  if (!user) redirect("/login");

  const householdContext = await timer.time("household", getActiveHouseholdContext(supabase, user));
  const dataOwnerUserId = user.id;
  const dataClient = supabase;
  const householdVisibleFilter = visibleDataOrFilter(householdContext);
  const wealthUserIds = householdContext.householdId ? householdContext.memberUserIds : [dataOwnerUserId];

  const [{ data: profile }, { data: dashboardPrefs }, { data: categories }, { data: childCosts }, { data: people }, { data: payEvents }, { data: mortgageDeals }, { data: plannedItems }, { data: incomeEntries }, { data: dealBills }, { data: payOverrides }, wealthSummary, investmentPensionPerformance, { data: positionSnapshots }, { data: pensionSnapshots }, { data: pensionContributionEvents }, { data: pensionPerformanceAssumptions }, insightEvidence] = await timer.time("main_queries", Promise.all([
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
      .select("id, name, type, monthly_budget, category_icon, emergency_fund_essential, spending_category_groups(emergency_fund_essential)")
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
      .select("id, lender, product_name, balance, balance_as_of_date, interest_rate, term_years, monthly_payment_override, payment_day_of_month, initial_period_end, start_date, end_date, first_payment_date")
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
    timer.time("wealthSummary", buildWealthSummary(dataClient, dataOwnerUserId, selectedMonth, householdContext).catch(() => null)),
    timer.time("perf", buildMonthlyInvestmentPensionPerformance(dataClient, wealthUserIds, selectedMonth).catch(() => null)),
    dataClient
      .from("financial_position_snapshots")
      .select("snapshot_date, net_worth, total_assets, total_liabilities, investment_value, savings_value, pension_value, property_equity")
      .eq("user_id", dataOwnerUserId)
      .gte("snapshot_date", `${selectedYear - 1}-01-01`)
      .order("snapshot_date", { ascending: true })
      .returns<FinancialPositionSnapshot[]>(),
    dataClient
      .from("pension_fund_value_snapshots")
      .select("snapshot_date, value, monthly_contribution_applied")
      .in("user_id", wealthUserIds)
      .gte("snapshot_date", `${selectedYear - 5}-01-01`)
      .order("snapshot_date", { ascending: true })
      .returns<PensionSnapshotForProjection[]>(),
    dataClient
      .from("pension_contribution_events")
      .select("contribution_date, contribution_due_date, investment_date, contribution_amount, employee_amount, employer_amount, employer_ni_topup_amount, fixed_amount, event_status")
      .in("user_id", wealthUserIds)
      .gte("contribution_date", `${selectedYear - 5}-01-01`)
      .order("contribution_date", { ascending: true })
      .returns<PensionContributionForProjection[]>(),
    dataClient
      .from("pension_fund_performance_assumptions")
      .select("pension_fund_id, pension_account_id, fund_name, current_value, annualised_5y_percent, annualised_10y_percent, as_of_date, source_url, source_name, verified_at")
      .in("user_id", wealthUserIds)
      .order("as_of_date", { ascending: false })
      .returns<PensionPerformanceAssumption[]>(),
    timer.time("insights", buildDashboardInsightEvidence(dataClient, wealthUserIds, `${selectedYear}-01-01`)),
  ]));

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
    const { data: payByPerson } = await timer.time("payByPerson", dataClient
      .from("pay_events")
      .select("*")
      .in("person_id", peopleRows.map((person) => person.id))
      .returns<PayEvent[]>());
    rawPayRows = (payByPerson ?? []) as PayEvent[];
  }
  const payRows = rawPayRows.map((event) => ({ ...event, overrides: overridesByEvent.get(event.id) || [] }));
  const incomePensionContribution = deriveIncomePensionContribution(payRows, new Date(`${selectedMonth}-01T12:00:00Z`));
  const recordedPensionContribution = deriveMonthlyPensionContribution(pensionContributionEvents ?? [], incomePensionContribution.monthlyContribution);
  const pensionMonthlyContribution = recordedPensionContribution.monthlyContribution;
  const pensionSnapshotRate = derivePensionAnnualRate(pensionSnapshots ?? [], pensionContributionEvents ?? []);
  const pensionRateScenarios = derivePensionRateScenarios(pensionPerformanceAssumptions ?? [], pensionSnapshotRate);
  const pensionHistoryByDate = new Map<string, number>();
  for (const snapshot of pensionSnapshots ?? []) {
    const date = String(snapshot.snapshot_date || "").slice(0, 10);
    if (!date) continue;
    pensionHistoryByDate.set(date, (pensionHistoryByDate.get(date) || 0) + Math.max(0, Number(snapshot.value || 0)));
  }
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
  const forecastPlans = monthsFrom(selectedMonth, 12).map((month) => buildMonthPlan({
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
    biggestOutgoing ? { icon: biggestOutgoing.categoryIcon || "💳", text: `Your biggest payment this month is ${friendlyOutgoingName(biggestOutgoing.label.split(" · ").pop() || "")} at ${money(biggestOutgoing.value)}.` } : null,
    newChargesThisMonth.length > 0 ? { icon: "🆕", text: `${newChargesThisMonth.length} new recurring charge${newChargesThisMonth.length === 1 ? "" : "s"} started this month: ${newChargesThisMonth.slice(0, 3).map((item) => item.label).join(", ")}${newChargesThisMonth.length > 3 ? "…" : ""}.` } : null,
    biggestSpenderRow ? { icon: "👤", text: `${biggestSpenderRow.label} is carrying the most this month at ${money(biggestSpenderRow.total)} across ${biggestSpenderRow.lines.length} payment${biggestSpenderRow.lines.length === 1 ? "" : "s"}.` } : null,
  ].filter(Boolean) as { icon: string; text: string }[];

  function friendlyOutgoingName(label: string) {
    const lower = label.trim().toLowerCase();
    if (/^mortgage( deals?)?$/.test(lower)) return "the mortgage";
    if (lower === "rent") return "the rent";
    return label.trim();
  }

  const investmentsPerf = investmentPensionPerformance?.investments || null;
  const pensionsPerf = investmentPensionPerformance?.pensions || null;

  const compactMoney = (value: number) => formatMoney(value, { precision: "rounded" });
  const essentialCategoryNames = new Set(typedCategories.filter((category) => {
    const groups = Array.isArray(category.spending_category_groups) ? category.spending_category_groups : category.spending_category_groups ? [category.spending_category_groups] : [];
    return Boolean(category.emergency_fund_essential || groups.some((group) => group.emergency_fund_essential));
  }).map((category) => category.name));
  const essentialMonthlyOutgoings = selectedPlan.outgoingItems.filter((item) => item.categoryLabel && essentialCategoryNames.has(item.categoryLabel)).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const runwayMonths = essentialMonthlyOutgoings > 0 ? insightEvidence.savingsBalance / essentialMonthlyOutgoings : 0;
  const nextPlan = forecastPlans[1] || selectedPlan;
  const nextPayments = selectedPlan.outgoingItems.filter((item) => Boolean(item.dueDate)).slice(0, 3);
  const nextPaymentsTotal = nextPayments.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const familyTrend = forecastPlans.slice(0, 6).map((plan) => ({
    label: plan.label,
    value: plan.outgoingItems.filter((item) => ["Childcare", "Activities", "Child cost"].includes(item.categoryLabel || item.helper)).reduce((sum, item) => sum + Number(item.value || 0), 0),
  }));
  const currentFamilyCosts = familyTrend[0]?.value || 0;
  const activePot = insightEvidence.pots.find((pot) => pot.status === "active") || insightEvidence.pots[0] || null;
  const potCurrent = Number(activePot?.current_allocated_amount || 0);
  const potTarget = Number(activePot?.target_amount || 0);
  const potProgress = potTarget > 0 ? potCurrent / potTarget * 100 : 0;
  const propertyValue = Number(wealthSummary?.propertyAssets || 0);
  const mortgageDebt = Number(wealthSummary?.mortgageDebt || 0);
  const homeEquity = propertyValue - mortgageDebt;
  const ltv = propertyValue > 0 ? mortgageDebt / propertyValue * 100 : 0;
  // The date that matters is when the deal rate ends (initial_period_end); end_date is only set for closed deals.
  const dealEnd = (deal: HomeMortgageDeal) => deal.initial_period_end || deal.end_date || null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentMortgage = mortgageDealRows.filter((deal) => !deal.end_date || deal.end_date >= todayIso).sort((a, b) => String(dealEnd(a) || "9999").localeCompare(String(dealEnd(b) || "9999")))[0] || null;
  const currentMortgageEnd = currentMortgage ? dealEnd(currentMortgage) : null;
  const mortgageDays = currentMortgageEnd ? daysUntil(currentMortgageEnd) : null;
  const allocationTotal = insightEvidence.allocationRows.reduce((sum, [, value]) => sum + Number(value || 0), 0);
  const retirementPlan = insightEvidence.retirementPlan;
  const retirementTarget = Number(retirementPlan?.target_annual_income || 0);
  const householdTotal = committedOutgoingsByPerson.reduce((sum, row) => sum + row.total, 0);
  const householdSegments = committedOutgoingsByPerson.slice(0, 4).map((row) => ({ label: row.label, value: row.total }));
  const freshnessNow = new Date().getTime();
  const freshnessAges = insightEvidence.timestamps.map((timestamp) => Math.max(0, Math.floor((freshnessNow - new Date(timestamp).getTime()) / 86_400_000))).filter(Number.isFinite);
  const freshCount = freshnessAges.filter((age) => age <= 7).length;
  const freshnessPercent = freshnessAges.length > 0 ? freshCount / freshnessAges.length * 100 : 0;
  const staleCount = freshnessAges.filter((age) => age > 7).length;
  const nextAction = (() => {
    if (recommendedDealChecks[0]) return { title: `Review ${recommendedDealChecks[0].provider}`, body: dealRecommendation(recommendedDealChecks[0]), href: "/lifestyle" };
    if (currentMortgage && mortgageDays !== null && mortgageDays <= 365) return { title: "Review your mortgage", body: `${mortgageDays} days remain on the current deal.`, href: "/mortgage" };
    if (staleCount > 0) return { title: "Refresh stale data", body: `${staleCount} tracked source${staleCount === 1 ? " is" : "s are"} more than 7 days old.`, href: "/account" };
    if (selectedPlan.surplus > 100) return { title: "Give available money a job", body: `${compactMoney(selectedPlan.surplus)} remains after known commitments.`, href: "/financial-flow" };
    return { title: "Complete your financial picture", body: "Add missing accounts or dates to improve LOOP's next action.", href: "/account" };
  })();

  const insights: Record<string, WidgetInsightData> = {
    available_money: { value: compactMoney(selectedPlan.surplus), delta: "After every tracked commitment", status: selectedPlan.surplus >= 0 ? "positive" : "negative", segments: [{ label: "Spending", value: nonSavingsOutgoings }, { label: "Savings", value: savingsThisMonth }, { label: "Available", value: Math.max(0, selectedPlan.surplus) }], rows: [{ label: "Income", value: compactMoney(selectedPlan.income) }, { label: "Committed", value: compactMoney(nonSavingsOutgoings) }, { label: "Savings", value: compactMoney(savingsThisMonth) }], source: "Money in & out · planned items", href: "/financial-flow" },
    upcoming_payments: { value: compactMoney(nextPaymentsTotal), delta: nextPayments.length ? `${nextPayments.length} dated payment${nextPayments.length === 1 ? "" : "s"} shown` : "No dated payments in this month", empty: nextPayments.length === 0, emptyMessage: "Add payment dates in Money in & out to unlock this view.", rows: nextPayments.map((item) => ({ label: `${shortDate(item.dueDate)} · ${item.label.split(" · ").pop()}`, value: compactMoney(item.value) })), source: "planned_items · payment dates", href: "/financial-flow" },
    spending_pressure: { value: `${selectedPlan.income > 0 ? Math.round(nonSavingsOutgoings / selectedPlan.income * 100) : 0}%`, delta: "of this month's income committed", status: nonSavingsOutgoings <= selectedPlan.income ? "positive" : "negative", progress: selectedPlan.income > 0 ? nonSavingsOutgoings / selectedPlan.income * 100 : 0, trend: yearPlans.map((plan) => ({ label: plan.label, value: plan.income > 0 ? plan.outgoings / plan.income * 100 : 0 })), rows: selectedPlan.outgoingItems.slice().sort((a, b) => b.value - a.value).slice(0, 4).map((item) => ({ label: item.label.split(" · ").pop() || item.label, value: compactMoney(item.value) })), source: "Money in & out calendar", href: "/financial-flow" },
    income_changes: { value: compactMoney(selectedPlan.income), delta: `${compactMoney(Math.abs(nextPlan.income - selectedPlan.income))} ${nextPlan.income >= selectedPlan.income ? "higher" : "lower"} next month`, status: nextPlan.income >= selectedPlan.income ? "positive" : "warning", trend: forecastPlans.slice(0, 6).map((plan) => ({ label: plan.label, value: plan.income })), rows: selectedPlan.incomeItems.slice(0, 4).map((item) => ({ label: item.label.split(" · ").pop() || item.label, value: compactMoney(item.value) })), source: "pay events + income entries", href: "/income" },
    family_costs: { value: compactMoney(currentFamilyCosts), delta: currentFamilyCosts > 0 ? `${compactMoney(Math.abs((familyTrend[2]?.value || currentFamilyCosts) - currentFamilyCosts))} change within 3 months` : "No active family costs", empty: currentFamilyCosts <= 0, emptyMessage: "Add childcare or activity costs to see their future drop-off.", trend: familyTrend, rows: selectedPlan.outgoingItems.filter((item) => ["Childcare", "Activities", "Child cost"].includes(item.categoryLabel || item.helper)).slice(0, 4).map((item) => ({ label: item.label, value: compactMoney(item.value) })), source: "child_costs + funding rules", href: "/household" },
    bills_renewals: { value: String(recommendedDealChecks.length), delta: recommendedDealChecks.length ? "need attention within 90 days" : "No renewals need attention", status: recommendedDealChecks.length ? "warning" : "positive", empty: recommendedDealChecks.length === 0, emptyMessage: "Add contract end and notice dates to track renewals.", rows: recommendedDealChecks.slice(0, 4).map((bill) => ({ label: bill.provider || bill.label, value: bill.contract_end ? shortDate(bill.contract_end) : "Date needed" })), attention: recommendedDealChecks[0] ? { title: recommendedDealChecks[0].label, body: dealRecommendation(recommendedDealChecks[0]) } : undefined, source: "deal_bills · notice dates", href: "/lifestyle" },
    debt_payoff: { value: compactMoney(wealthSummary?.liabilities || 0), delta: "Total tracked liabilities", status: (wealthSummary?.liabilities || 0) > 0 ? "warning" : "positive", trend: ((positionSnapshots ?? []) as FinancialPositionSnapshot[]).map((row) => ({ label: row.snapshot_date, value: Number(row.total_liabilities || 0) })), rows: [{ label: "Mortgage", value: compactMoney(mortgageDebt) }, { label: "Other liabilities", value: compactMoney(Math.max(0, (wealthSummary?.liabilities || 0) - mortgageDebt)) }], source: "financial accounts + mortgages", href: "/net-worth" },
    savings_pots: { value: compactMoney(insightEvidence.savingsBalance), delta: `${insightEvidence.pots.length} tracked pot${insightEvidence.pots.length === 1 ? "" : "s"}`, empty: insightEvidence.savingsBalance <= 0 && insightEvidence.pots.length === 0, emptyMessage: "Add a savings account or pot to start tracking progress.", segments: insightEvidence.pots.slice(0, 4).map((pot) => ({ label: String(pot.name), value: Number(pot.current_allocated_amount || 0) })), rows: insightEvidence.pots.slice(0, 4).map((pot) => ({ label: String(pot.name), value: compactMoney(Number(pot.current_allocated_amount || 0)) })), source: "financial_accounts + savings_pots", href: "/accounts?tab=savings" },
    emergency_runway: { value: essentialMonthlyOutgoings > 0 ? `${runwayMonths.toFixed(1)} months` : "Set essentials", delta: essentialMonthlyOutgoings > 0 ? `${compactMoney(essentialMonthlyOutgoings)} essential monthly cost` : "Choose which spending is essential", empty: essentialMonthlyOutgoings <= 0, emptyMessage: "Mark spending categories or groups as essential to calculate runway.", progress: runwayMonths / 6 * 100, rows: [{ label: "Accessible savings", value: compactMoney(insightEvidence.savingsBalance) }, { label: "Six-month target", value: compactMoney(essentialMonthlyOutgoings * 6) }], source: "essential spending flags + savings", href: "/accounts?tab=savings" },
    goal_progress: { value: activePot && potTarget > 0 ? `${Math.round(potProgress)}%` : "No active goal", delta: activePot ? String(activePot.name) : "Create a savings pot", empty: !activePot || potTarget <= 0, emptyMessage: "Give a pot a target amount to unlock goal progress.", progress: potProgress, rows: activePot ? [{ label: "Saved", value: compactMoney(potCurrent) }, { label: "Target", value: compactMoney(potTarget) }, { label: "Target date", value: activePot.target_date ? shortDate(String(activePot.target_date)) : "Not set" }] : [], source: "savings_pots + allocations", href: "/accounts?tab=savings" },
    interest_earned: { value: compactMoney(insightEvidence.confirmedInterest), delta: insightEvidence.savingsBalance > 0 ? `${insightEvidence.blendedSavingsRate.toFixed(2)}% blended tracked rate` : "No savings balance tracked", empty: insightEvidence.savingsBalance <= 0, emptyMessage: "Add an interest rate to a savings account to track this.", rows: [{ label: "Deposited", value: compactMoney(insightEvidence.deposits) }, { label: "Withdrawn", value: compactMoney(insightEvidence.withdrawals) }, { label: "Confirmed interest", value: compactMoney(insightEvidence.confirmedInterest) }], trend: insightEvidence.movements.map((movement) => ({ label: String(movement.effective_at || movement.created_at), value: Number(movement.amount || 0) })), source: "savings_account_movements", href: "/accounts?tab=savings" },
    isa_allowance: { value: insightEvidence.isaRemaining > 0 ? `${compactMoney(insightEvidence.isaRemaining)} left` : "Allowance not synced", delta: insightEvidence.isaSubscribed > 0 ? `${compactMoney(insightEvidence.isaSubscribed)} provider-confirmed subscription` : "Connect or update an ISA account", empty: insightEvidence.isaRemaining <= 0 && insightEvidence.isaSubscribed <= 0, emptyMessage: "LOOP will only show allowance where a provider or account record supplies it.", progress: insightEvidence.isaRemaining + insightEvidence.isaSubscribed > 0 ? insightEvidence.isaSubscribed / (insightEvidence.isaRemaining + insightEvidence.isaSubscribed) * 100 : 0, source: "investment_accounts · provider ISA fields", href: "/investments" },
    home_equity: { value: compactMoney(homeEquity), delta: propertyValue > 0 ? `${(100 - ltv).toFixed(1)}% estimated equity` : "No tracked property", empty: propertyValue <= 0, emptyMessage: "Add a home valuation to calculate equity.", segments: [{ label: "Equity", value: Math.max(0, homeEquity) }, { label: "Mortgage", value: Math.max(0, mortgageDebt) }], rows: [{ label: "Property value", value: compactMoney(propertyValue) }, { label: "Mortgage", value: compactMoney(mortgageDebt) }], source: "homes + valuations + mortgages", href: "/mortgage" },
    mortgage_countdown: { value: mortgageDays !== null ? `${Math.max(0, Math.ceil(mortgageDays / 30.44))} months` : "End date needed", delta: currentMortgageEnd ? `Current deal ends ${shortDate(currentMortgageEnd)}` : "Add the fixed-deal end date", empty: !currentMortgageEnd, emptyMessage: "Set the current mortgage deal end date to start the countdown.", progress: mortgageDays !== null ? Math.min(100, Math.max(0, 100 - mortgageDays / 3.65)) : 0, rows: currentMortgage ? [{ label: "Lender", value: currentMortgage.lender || "Not set" }, { label: "Rate", value: `${Number(currentMortgage.interest_rate || 0).toFixed(2)}%` }, { label: "Balance", value: compactMoney(currentMortgage.balance) }] : [], source: "home_mortgage_deals", href: "/mortgage" },
    affordability_snapshot: { value: "Open the lab", delta: "Uses income, commitments and deposit", empty: true, emptyMessage: "Run the Affordability Lab once to save a traceable scenario here.", source: "Affordability Lab scenario", href: "/affordability-lab" },
    portfolio_allocation: { value: compactMoney(insightEvidence.investmentValue), delta: `${insightEvidence.allocationRows.length} priced grouping${insightEvidence.allocationRows.length === 1 ? "" : "s"}`, empty: allocationTotal <= 0, emptyMessage: "Add or refresh priced holdings to see allocation.", segments: insightEvidence.allocationRows.slice(0, 4).map(([label, value]) => ({ label, value })), rows: insightEvidence.allocationRows.slice(0, 5).map(([label, value]) => ({ label, value: allocationTotal > 0 ? `${Math.round(value / allocationTotal * 100)}%` : "—" })), source: "investment_holdings · priced values", href: "/investments" },
    portfolio_movement: { value: compactMoney(insightEvidence.investmentMovement), delta: "Latest weighted priced movement", status: insightEvidence.investmentMovement >= 0 ? "positive" : "negative", empty: insightEvidence.holdings.length === 0, emptyMessage: "Refresh investment prices to calculate movement.", trend: ((positionSnapshots ?? []) as FinancialPositionSnapshot[]).map((row) => ({ label: row.snapshot_date, value: Number(row.investment_value || 0) })), rows: insightEvidence.holdings.slice().sort((a, b) => Math.abs(Number(b.day_change_gbp || 0)) - Math.abs(Number(a.day_change_gbp || 0))).slice(0, 4).map((holding) => ({ label: String(holding.asset_name || holding.group_label || "Holding"), value: compactMoney(Number(holding.day_change_gbp || 0)) })), source: "investment price points + holdings", href: "/investments" },
    pension_journey: { value: compactMoney(wealthSummary?.pensionValue || 0), delta: pensionRateScenarios.isFallback ? `${compactMoney(pensionMonthlyContribution)} monthly contribution · history building` : `${pensionRateScenarios.middle.toFixed(1)}% verified annualised rate`, empty: (wealthSummary?.pensionValue || 0) <= 0, emptyMessage: "Add a pension account or provider value to begin the journey.", trend: Array.from(pensionHistoryByDate.entries()).map(([label, value]) => ({ label, value })), rows: [{ label: "Monthly contribution", value: compactMoney(pensionMonthlyContribution) }, { label: "This month", value: compactMoney(pensionsPerf?.changeAmount || 0) }, { label: "Growth evidence", value: pensionRateScenarios.isFallback ? "Building history" : pensionRateScenarios.source }], source: pensionRateScenarios.isFallback ? "pension snapshots + contribution events" : "verified pension provider performance", href: "/investments" },
    retirement_readiness: { value: retirementTarget > 0 ? `${compactMoney(retirementTarget)}/yr` : "Plan not set", delta: retirementPlan ? `Target retirement age ${retirementPlan.retirement_age || "not set"}` : "Create a retirement target", empty: !retirementPlan, emptyMessage: "Set retirement age and desired income to unlock readiness.", rows: retirementPlan ? [{ label: "Current pensions", value: compactMoney(wealthSummary?.pensionValue || 0) }, { label: "Guaranteed income", value: compactMoney(Number(retirementPlan.guaranteed_annual_income || 0)) }, { label: "Legacy target", value: compactMoney(Number(retirementPlan.target_legacy_pot || 0)) }] : [], source: "retirement_plans + verified pension value", href: "/retirement" },
    fees_drag: { value: compactMoney(insightEvidence.annualFees), delta: "Annualised from saved platform and fund rates", empty: insightEvidence.annualFees <= 0, emptyMessage: "Add provider and fund fee rates to calculate fee drag.", rows: [{ label: "Invested assets", value: compactMoney(insightEvidence.investmentValue + insightEvidence.pensionValue) }, { label: "Effective fee", value: insightEvidence.investmentValue + insightEvidence.pensionValue > 0 ? `${(insightEvidence.annualFees / (insightEvidence.investmentValue + insightEvidence.pensionValue) * 100).toFixed(2)}%` : "—" }], source: "account + fund fee schedules", href: "/investments" },
    dividends_reinvestment: { value: compactMoney(insightEvidence.dividendCash), delta: "Provider-reported dividend cash", empty: insightEvidence.dividendCash <= 0, emptyMessage: "No provider-confirmed dividend cash is currently available.", source: "investment_accounts · provider cash fields", href: "/investments" },
    household_contribution: { value: householdSegments.length > 1 && householdTotal > 0 ? householdSegments.slice(0, 2).map((row) => Math.round(row.value / householdTotal * 100)).join(" / ") : "Household", delta: "Share of committed costs", empty: householdSegments.length < 2, emptyMessage: "Assign spending to household members to compare contributions.", segments: householdSegments, rows: householdSegments.map((row) => ({ label: row.label, value: householdTotal > 0 ? `${Math.round(row.value / householdTotal * 100)}% · ${compactMoney(row.value)}` : "—" })), source: "people + assigned outgoings", href: "/household" },
    what_changed: { value: `${compactMoney(Math.abs(surplusChange))} ${surplusChange >= 0 ? "better" : "lower"}`, delta: `than ${previousMonthPlan.label}`, status: surplusChange >= 0 ? "positive" : "warning", trend: yearPlans.map((plan) => ({ label: plan.label, value: plan.surplus })), attention: { title: performanceSummary, body: biggestOutgoing ? `${biggestOutgoing.label.split(" · ").pop()} is the largest current outgoing.` : "Keep tracking to build a clearer explanation." }, rows: [{ label: "Income change", value: compactMoney(selectedPlan.income - previousMonthPlan.income) }, { label: "Outgoing change", value: compactMoney(selectedPlan.outgoings - previousMonthPlan.outgoings) }, { label: "Investment movement", value: compactMoney(investmentsPerf?.changeAmount || 0) }], source: "monthly plans + wealth snapshots", href: "/financial-flow" },
    data_freshness: { value: freshnessAges.length ? `${Math.round(freshnessPercent)}% current` : "No timestamps", delta: staleCount ? `${staleCount} source${staleCount === 1 ? "" : "s"} need attention` : "Tracked sources are current", status: staleCount ? "warning" : "positive", empty: freshnessAges.length === 0, emptyMessage: "Connect or update an account to begin freshness tracking.", progress: freshnessPercent, rows: insightEvidence.connections.slice(0, 4).map((connection) => ({ label: String(connection.provider || "Connection"), value: String(connection.status || "unknown") })), source: "sync state + source timestamps", href: "/account" },
    next_best_action: { value: nextAction.title, delta: "Highest-value evidenced action", attention: { title: nextAction.title, body: nextAction.body }, source: "renewals + freshness + Money in & out", href: nextAction.href },
  };

  const { data: dashboardWidgets } = await timer.time("widgets", dataClient
    .from("user_dashboard_widgets")
    .select("*")
    .eq("user_id", dataOwnerUserId)
    .order("layout_y", { ascending: true }));

  timer.log();
  return (
    <>
      <main className="loop-overview-page mx-auto w-full max-w-[2000px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        {/* The month in one figure: what's left once bills and saving are covered. */}
        {hasDashboardData ? (
        <section className="rounded-[18px] border border-[var(--line)] bg-white">
          <div className="flex flex-wrap items-end justify-between gap-6 px-6 pb-5 pt-6 md:px-8 md:pt-8">
            <div className="min-w-0">
              <p className="text-[15px] text-[var(--muted)]">{firstName ? `${firstName}, here's ${selectedPlan.label}` : selectedPlan.label}</p>
              <p className={`mt-2 text-[44px] font-semibold leading-none tracking-[-0.03em] md:text-[56px] ${selectedPlan.surplus >= 0 ? "text-[var(--ink)]" : "text-[var(--brick)]"}`}>{money(selectedPlan.surplus)}</p>
              <p className="mt-2 text-[15px] text-[var(--muted)]">
                {selectedPlan.surplus >= 0 ? "left over after bills and saving" : "short after bills and saving"}
                {" · "}
                <span className={selectedPlan.surplus >= 1000 ? "text-[var(--pine)]" : selectedPlan.surplus >= 0 ? "text-[var(--amber)]" : "text-[var(--brick)]"}>{selectedPlan.surplus >= 1000 ? "comfortable" : selectedPlan.surplus >= 0 ? "tight but positive" : "needs a look"}</span>
              </p>
            </div>
            {performanceSummary ? <p className="max-w-md text-sm text-[var(--muted)]">{performanceSummary}</p> : null}
          </div>
          <dl className="grid grid-cols-2 border-t border-[var(--line)] md:grid-cols-4">
            {[
              { label: "Money in", value: money(selectedPlan.income), tone: "text-[var(--pine)]", href: "/income" },
              { label: "Bills and spending", value: money(nonSavingsOutgoings), tone: "text-[var(--ink)]", href: "/spending" },
              { label: "Saved this month", value: money(savingsThisMonth), tone: "text-[var(--ink)]", href: "/financial-flow?tab=savings" },
              { label: "Pensions and investments", value: money((wealthSummary?.investmentValue || 0) + (wealthSummary?.pensionValue || 0)), tone: "text-[var(--ink)]", href: "/investments", note: (investmentsPerf?.hasBaseline || pensionsPerf?.hasBaseline) ? `${(investmentsPerf?.changeAmount || 0) + (pensionsPerf?.changeAmount || 0) >= 0 ? "+" : ""}${money((investmentsPerf?.changeAmount || 0) + (pensionsPerf?.changeAmount || 0))} this month` : null },
            ].map((stat, i) => (
              <Link key={stat.label} href={stat.href} className={`block px-6 py-4 hover:bg-[var(--paper)] md:px-8 ${i > 0 ? "border-l border-[var(--line)]" : ""} ${i === 2 ? "border-l-0 border-t md:border-l md:border-t-0" : ""} ${i === 3 ? "border-t md:border-t-0" : ""}`}>
                <dt className="text-sm text-[var(--muted)]">{stat.label}</dt>
                <dd className={`mt-1 text-[22px] font-semibold tracking-tight ${stat.tone}`}>{stat.value}</dd>
                {stat.note ? <dd className="mt-0.5 text-xs text-[var(--muted)]">{stat.note}</dd> : null}
              </Link>
            ))}
          </dl>
        </section>
        ) : null}
        {hasDashboardData ? (
          <PlainMonthPanel
            monthLabel={selectedPlan.label}
            previousLabel={previousMonthPlan.label}
            change={surplusChange}
            drivers={previousMonthPlan.income === 0 && previousMonthPlan.outgoings === 0 ? [] : monthDrivers(previousMonthPlan, selectedPlan, 3)}
            ahead={outlook(forecastPlans, 6)}
            savingsBalance={Number(insightEvidence.savingsBalance || 0)}
            monthlyCost={essentialMonthlyOutgoings > 0 ? essentialMonthlyOutgoings : nonSavingsOutgoings}
            essentialsOnly={essentialMonthlyOutgoings > 0}
          />
        ) : null}

{!hasDashboardData ? <PageLandingExperience kind="overview" /> : null}

        {hasDashboardData ? <DashboardGrid
          householdId={householdContext.householdId ?? dataOwnerUserId}
          initialWidgets={dashboardWidgets ?? []}
          dashboardContext={{
            overview: {
              income: selectedPlan.income,
              outgoings: nonSavingsOutgoings,
              savings: savingsThisMonth,
              leftOver: selectedPlan.surplus,
              assets: wealthSummary?.assets || 0,
              liabilities: wealthSummary?.liabilities || 0,
              netWorth: wealthSummary?.netWorth || 0,
              pensionValue: wealthSummary?.pensionValue || 0,
              investmentValue: wealthSummary?.investmentValue || 0,
              pensionChange: pensionsPerf?.changeAmount || 0,
              investmentChange: investmentsPerf?.changeAmount || 0,
              pensionMonthlyContribution,
            },
            positionHistory: ((positionSnapshots ?? []) as FinancialPositionSnapshot[]).map((snapshot) => ({
              date: snapshot.snapshot_date,
              netWorth: Number(snapshot.net_worth || 0),
              assets: Number(snapshot.total_assets || 0),
              liabilities: Number(snapshot.total_liabilities || 0),
              investmentValue: Number(snapshot.investment_value || 0),
              pensionValue: Number(snapshot.pension_value || 0),
              savingsValue: Number(snapshot.savings_value || 0),
              propertyEquity: Number(snapshot.property_equity || 0),
            })),
            pensionHistory: Array.from(pensionHistoryByDate.entries()).map(([date, value]) => ({ date, value })),
            pensionProjection: {
              annualGrowthRate: pensionRateScenarios.middle,
              growthSource: pensionRateScenarios.source,
              growthAsOfDate: pensionRateScenarios.asOfDate,
              growthIsFallback: pensionRateScenarios.isFallback,
              monthlyContribution: pensionMonthlyContribution,
              contributionSource: recordedPensionContribution.source,
            },
            calendar: {
              selectedYear,
              selectedMonth,
              months: yearPlans.map(({ month, label, income, outgoings, surplus }) => ({
                month,
                label,
                income,
                outgoings,
                surplus,
              })),
              forecastMonths: forecastPlans.map(({ month, label, income, outgoings, surplus }) => ({ month, label, income, outgoings, surplus })),
            },
            insights,
          }}
        /> : null}
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

      </main>
    </>
  );
}

export default function DashboardPage(props: { searchParams?: Promise<{ month?: string; year?: string; person?: string }> }) {
  return (
    <>
      <Nav />
      <Suspense fallback={<WealthRouteSkeleton label="your overview" />}>
        <DashboardContent {...props} />
      </Suspense>
    </>
  );
}
