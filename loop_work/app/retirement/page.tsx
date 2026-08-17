import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CalendarClock, PiggyBank } from "lucide-react";
import { Nav } from "@/components/Nav";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdContext } from "@/lib/auth/household-context";
import { ageFromBirthDate, retirementAssetsFromCurrentWealth, retirementContributionsFromPensions } from "@/lib/retirement/adapter";
import type { RetirementContribution } from "@/lib/calculations/retirement";
import type { RetirementPlanRecord } from "@/lib/retirement/actions";
import { buildMonthPlan, type ChildCostForPlan, type FinancialProfile, type HomeMortgageDealForPlan, type PlannedItemForPlan, type SpendingCategoryForPlan } from "@/lib/planning/month-plan";
import { evidencePlanningRate, weightedRate, type RetirementAutomaticAssumptions } from "@/lib/retirement/automatic-assumptions";
import { RetirementPageClient } from "./RetirementPageClient";

export const dynamic = "force-dynamic";

type Person = { id: string; name: string; relationship: "self" | "partner" | "child" | "other"; birth_date: string | null };
type PensionAccount = { id: string; person_id: string | null; label: string; provider: string; current_value: number; fixed_monthly_contribution: number | null };
type PensionFund = { id: string; pension_account_id: string; fund_name: string; current_value: number; annual_fund_fee_percent: number | null };
type InvestmentAccount = { id: string; person_id: string | null; label: string; provider: string; account_type: string; provider_cash_value: number | null };
type InvestmentHolding = { id: string; investment_account_id: string; asset_name: string; units: number; latest_price: number; imported_current_value: number | null };
type ContributionEvent = { pension_account_id: string; contribution_month: string | null; contribution_date: string | null; contribution_amount: number | null; event_status: string | null };
type Performance = { pension_fund_id: string; annualised_5y_percent: number | null; annualised_10y_percent: number | null; as_of_date: string; source_name: string | null; source_url: string | null };
type InflationEvidence = { annualised_rate_percent: number; period_years: number; end_date: string; source_name: string; source_url: string };

function currentMonth() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`; }
function inferredChildCostEnd(cost: ChildCostForPlan, person: Person | undefined) {
  if (cost.ends_on) return { date: cost.ends_on, inferred: false };
  if (!person?.birth_date) return { date: null, inferred: false };
  const date = new Date(`${person.birth_date}T00:00:00`);
  date.setFullYear(date.getFullYear() + (cost.cost_kind === "nursery" || cost.cost_kind === "nanny" ? 5 : 18));
  return { date: date.toISOString().slice(0,10), inferred: true };
}

function actualPensionContributions(accounts: PensionAccount[], events: ContributionEvent[]): RetirementContribution[] {
  const fallback = retirementContributionsFromPensions(accounts);
  const byAccount = new Map<string, ContributionEvent[]>();
  for (const event of events) {
    if (!event.pension_account_id || ["cancelled", "skipped"].includes(String(event.event_status || "").toLowerCase())) continue;
    const rows = byAccount.get(event.pension_account_id) || [];
    rows.push(event);
    byAccount.set(event.pension_account_id, rows);
  }

  return accounts.flatMap((account) => {
    const rows = byAccount.get(account.id) || [];
    const latestMonth = rows.map((row) => row.contribution_month || row.contribution_date?.slice(0, 7) || "").filter(Boolean).sort().at(-1);
    const latestAmount = latestMonth
      ? rows.filter((row) => (row.contribution_month || row.contribution_date?.slice(0, 7)) === latestMonth).reduce((sum, row) => sum + Math.max(0, Number(row.contribution_amount || 0)), 0)
      : 0;
    if (latestAmount > 0) return [{ id: `pension-contribution-${account.id}`, label: `${account.provider || account.label} contribution`, monthlyAmount: latestAmount, assetId: `pension-${account.id}` }];
    return fallback.filter((item) => item.assetId === `pension-${account.id}`);
  });
}

async function RetirementContent() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const dataOwnerUserId = householdContext.dataOwnerUserId || user.id;

  const [peopleResult, pensionAccountsResult, pensionFundsResult, investmentAccountsResult, investmentHoldingsResult, plansResult, contributionsResult, performanceResult, inflationResult, profileResult, categoriesResult, childCostsResult, mortgageDealsResult, plannedItemsResult] = await Promise.all([
    supabase.from("people").select("id,name,relationship,birth_date").eq("user_id", dataOwnerUserId).order("relationship").returns<Person[]>(),
    supabase.from("pension_accounts").select("id,person_id,label,provider,current_value,fixed_monthly_contribution").eq("user_id", dataOwnerUserId).returns<PensionAccount[]>(),
    supabase.from("pension_funds").select("id,pension_account_id,fund_name,current_value,annual_fund_fee_percent").eq("user_id", dataOwnerUserId).returns<PensionFund[]>(),
    supabase.from("investment_accounts").select("id,person_id,label,provider,account_type,provider_cash_value").eq("user_id", dataOwnerUserId).neq("record_status", "archived").returns<InvestmentAccount[]>(),
    supabase.from("investment_holdings").select("id,investment_account_id,asset_name,units,latest_price,imported_current_value").eq("user_id", dataOwnerUserId).neq("record_status", "archived").returns<InvestmentHolding[]>(),
    supabase.from("retirement_plans").select("id,user_id,person_id,household_id,scope,retirement_age,target_annual_income,target_legacy_pot,annual_growth_rate_percent,annual_inflation_percent,sustainable_withdrawal_rate_percent,guaranteed_annual_income,growth_assumption_mode,inflation_assumption_mode,assumption_snapshot,created_at,updated_at").eq("user_id", dataOwnerUserId).order("updated_at", { ascending: false }).returns<RetirementPlanRecord[]>(),
    supabase.from("pension_contribution_events").select("pension_account_id,contribution_month,contribution_date,contribution_amount,event_status").eq("user_id", dataOwnerUserId).order("contribution_date", { ascending: false }).limit(500).returns<ContributionEvent[]>(),
    supabase.from("pension_fund_performance_assumptions").select("pension_fund_id,annualised_5y_percent,annualised_10y_percent,as_of_date,source_name,source_url").eq("user_id", dataOwnerUserId).order("as_of_date", { ascending: false }).returns<Performance[]>(),
    supabase.from("retirement_economic_assumptions").select("annualised_rate_percent,period_years,end_date,source_name,source_url").eq("assumption_key", "uk_cpih_prevailing_10y").order("end_date", { ascending: false }).limit(1).maybeSingle<InflationEvidence>(),
    supabase.from("financial_profiles").select("name,annual_salary,monthly_take_home,monthly_dividends,pension_percent,student_loan_plan,monthly_mortgage,monthly_savings_target").eq("user_id", dataOwnerUserId).maybeSingle<FinancialProfile>(),
    supabase.from("spending_categories").select("id,name,type,monthly_budget").eq("user_id", dataOwnerUserId).returns<SpendingCategoryForPlan[]>(),
    supabase.from("child_costs").select("id,child_id,label,cost_kind,monthly_cost,billing_month,daily_rate,extra_daily_cost,funded_hours_per_week,funding_mode,hourly_funding_credit,term_weeks_per_year,billing_schedule,bank_holidays_are_free,tax_free_childcare_enabled,tax_free_childcare_cap_per_quarter,part_day_multiplier,full_day_hours,part_day_hours,monday_session,tuesday_session,wednesday_session,thursday_session,friday_session,monday_hours,tuesday_hours,wednesday_hours,thursday_hours,friday_hours,activity_weekly_cost,activity_weekday,activity_billing_mode,activity_term_weeks_per_year,starts_on,ends_on").eq("user_id", dataOwnerUserId).returns<ChildCostForPlan[]>(),
    supabase.from("home_mortgage_deals").select("id,lender,balance,interest_rate,term_years,monthly_payment_override,start_date,end_date").eq("user_id", dataOwnerUserId).returns<HomeMortgageDealForPlan[]>(),
    supabase.from("planned_items").select("id,person_id,direction,item_type,label,amount,recurrence,recurrence_interval_days,start_date,end_date,day_of_month").eq("user_id", dataOwnerUserId).returns<PlannedItemForPlan[]>(),
  ]);

  const people = peopleResult.data ?? [];
  const primaryPerson = people.find((person) => person.relationship === "self") || people[0] || null;
  const currentAge = ageFromBirthDate(primaryPerson?.birth_date);

  if (!primaryPerson || currentAge === null) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700"><CalendarClock aria-hidden="true" /></span>
          <h1 className="mt-5 text-3xl font-black text-slate-950">Add your date of birth first</h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-600">Retirement projections need your current age. LOOP will then use your tracked pension and investment values rather than asking you to enter them again.</p>
          <Link href="/household" className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Update household details</Link>
        </section>
      </main>
    );
  }

  const pensionAccounts = (pensionAccountsResult.data ?? []).filter((account) => !account.person_id || account.person_id === primaryPerson.id);
  const pensionAccountIds = new Set(pensionAccounts.map((account) => account.id));
  const performanceByFund = new Map<string, Performance>();
  for (const row of performanceResult.data ?? []) if (!performanceByFund.has(row.pension_fund_id)) performanceByFund.set(row.pension_fund_id, row);
  const pensionFunds = (pensionFundsResult.data ?? []).filter((fund) => pensionAccountIds.has(fund.pension_account_id)).map((fund) => {
    const evidence = performanceByFund.get(fund.id);
    return { ...fund, annualGrowthRatePercent: evidencePlanningRate(Number(evidence?.annualised_5y_percent) || null, Number(evidence?.annualised_10y_percent) || null), annualFeePercent: fund.annual_fund_fee_percent };
  });
  const investmentAccounts = (investmentAccountsResult.data ?? []).filter((account) => !account.person_id || account.person_id === primaryPerson.id);
  const investmentAccountIds = new Set(investmentAccounts.map((account) => account.id));
  const investmentHoldings = (investmentHoldingsResult.data ?? []).filter((holding) => investmentAccountIds.has(holding.investment_account_id));
  const assets = retirementAssetsFromCurrentWealth({ pensionAccounts, pensionFunds, investmentAccounts, investmentHoldings });
  const contributions = actualPensionContributions(pensionAccounts, contributionsResult.data ?? []);
  const initialPlan = (plansResult.data ?? []).find((plan) => plan.scope === "person" && plan.person_id === primaryPerson.id) || null;
  const retirementAge = Number(initialPlan?.retirement_age ?? Math.max(currentAge + 1, 67));
  const planMonth = currentMonth();
  const monthPlan = buildMonthPlan({ month: planMonth, profile: profileResult.data ?? null, categories: categoriesResult.data ?? [], childCosts: childCostsResult.data ?? [], payEvents: [], mortgageDeals: mortgageDealsResult.data ?? [], plannedItems: plannedItemsResult.data ?? [], peopleById: new Map(people.map(person => [person.id, person])) });
  const livingMonthly = monthPlan.outgoingItems.filter(item => item.helper !== "Monthly saving plan").reduce((sum,item)=>sum+item.value,0);
  const childcareLines = monthPlan.outgoingItems.filter(item => /nursery|child cost|activity|class/i.test(`${item.helper} ${item.label}`));
  const retirementDate = new Date(); retirementDate.setFullYear(retirementDate.getFullYear() + Math.max(0, retirementAge-currentAge));
  let inferred = false; let explicit = false; let endingChildcareMonthly = 0;
  const childcareAdjustments: RetirementAutomaticAssumptions["childcareAdjustments"] = [];
  for (const cost of childCostsResult.data ?? []) {
    const end = inferredChildCostEnd(cost, people.find(person => person.id === cost.child_id));
    inferred ||= Boolean(end.inferred); explicit ||= Boolean(cost.ends_on);
    if (end.date && new Date(`${end.date}T00:00:00`) <= retirementDate) {
      const line = childcareLines.find(item => item.personId === cost.child_id && item.label.endsWith(cost.label));
      endingChildcareMonthly += Number(line?.value ?? cost.monthly_cost ?? 0);
    }
    if (end.date) {
      const endDate = new Date(`${end.date}T00:00:00`);
      const yearsAway = Math.max(0,(endDate.getTime()-new Date(`${planMonth}-01T00:00:00`).getTime())/(365.2425*86400000));
      const line = childcareLines.find(item => item.personId === cost.child_id && item.label.endsWith(cost.label));
      childcareAdjustments.push({label:cost.label,annualAmount:Number(line?.value??cost.monthly_cost??0)*12,endsAtAge:currentAge+yearsAway,basis:end.inferred?"age_inference":"explicit"});
    }
  }
  const fundEvidence = pensionFunds.map(fund => { const evidence=performanceByFund.get(fund.id); return { pensionFundId:fund.id,fundName:fund.fund_name,currentValue:Number(fund.current_value||0),fiveYearPercent:evidence?.annualised_5y_percent==null?null:Number(evidence.annualised_5y_percent),tenYearPercent:evidence?.annualised_10y_percent==null?null:Number(evidence.annualised_10y_percent),planningRatePercent:fund.annualGrowthRatePercent,asOfDate:evidence?.as_of_date||"",sourceName:evidence?.source_name||null,sourceUrl:evidence?.source_url||null }; });
  const inflationEvidence = inflationResult.data;
  const assumptions: RetirementAutomaticAssumptions = {
    portfolioGrowthPercent: weightedRate(fundEvidence.map(row=>({currentValue:row.currentValue,rate:row.planningRatePercent}))),
    evidencedPortfolioValue: fundEvidence.filter(row=>row.planningRatePercent!=null).reduce((sum,row)=>sum+row.currentValue,0),
    totalPensionValue: fundEvidence.reduce((sum,row)=>sum+row.currentValue,0),
    inflationPercent: Number(inflationEvidence?.annualised_rate_percent ?? 2.5), inflationPeriodYears:Number(inflationEvidence?.period_years??10), inflationAsOfDate:inflationEvidence?.end_date??null,
    inflationSourceName:inflationEvidence?.source_name??"Bank of England target fallback", inflationSourceUrl:inflationEvidence?.source_url??"https://www.bankofengland.co.uk/monetary-policy/inflation",
    lifestyleAnnualTarget:Math.max(0,(livingMonthly-endingChildcareMonthly)*12), currentAnnualSpending:livingMonthly*12, currentChildcareAnnual:childcareLines.reduce((sum,item)=>sum+item.value,0)*12,
    childcareEndingBeforeRetirementAnnual:endingChildcareMonthly*12, childcareBasis:inferred&&explicit?"mixed":inferred?"age_inference":explicit?"explicit_dates":"none", fundEvidence,
    childcareAdjustments,
  };

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3 rounded-[1.5rem] border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm font-semibold text-violet-950">
        <PiggyBank className="h-5 w-5 shrink-0 text-violet-700" aria-hidden="true" />
        <span>Using {assets.length} tracked retirement asset{assets.length === 1 ? "" : "s"} and {contributions.length} evidenced monthly contribution{contributions.length === 1 ? "" : "s"} for {primaryPerson.name}.</span>
      </div>
      <RetirementPageClient personId={primaryPerson.id} assets={assets} contributions={contributions} initialPlan={initialPlan} currentAge={currentAge} automaticAssumptions={assumptions} />
    </main>
  );
}

export default function RetirementPage() {
  return (
    <>
      <Nav />
      <Suspense fallback={<WealthRouteSkeleton label="retirement planning" />}>
        <RetirementContent />
      </Suspense>
    </>
  );
}
