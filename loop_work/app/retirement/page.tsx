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
import { RetirementPageClient } from "./RetirementPageClient";

export const dynamic = "force-dynamic";

type Person = { id: string; name: string; relationship: string; birth_date: string | null };
type PensionAccount = { id: string; person_id: string | null; label: string; provider: string; current_value: number; fixed_monthly_contribution: number | null };
type PensionFund = { id: string; pension_account_id: string; current_value: number };
type InvestmentAccount = { id: string; person_id: string | null; label: string; provider: string; account_type: string; provider_cash_value: number | null };
type InvestmentHolding = { id: string; investment_account_id: string; asset_name: string; units: number; latest_price: number; imported_current_value: number | null };
type ContributionEvent = { pension_account_id: string; contribution_month: string | null; contribution_date: string | null; contribution_amount: number | null; event_status: string | null };

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

  const [peopleResult, pensionAccountsResult, pensionFundsResult, investmentAccountsResult, investmentHoldingsResult, plansResult, contributionsResult] = await Promise.all([
    supabase.from("people").select("id,name,relationship,birth_date").eq("user_id", dataOwnerUserId).order("relationship").returns<Person[]>(),
    supabase.from("pension_accounts").select("id,person_id,label,provider,current_value,fixed_monthly_contribution").eq("user_id", dataOwnerUserId).returns<PensionAccount[]>(),
    supabase.from("pension_funds").select("id,pension_account_id,current_value").eq("user_id", dataOwnerUserId).returns<PensionFund[]>(),
    supabase.from("investment_accounts").select("id,person_id,label,provider,account_type,provider_cash_value").eq("user_id", dataOwnerUserId).neq("record_status", "archived").returns<InvestmentAccount[]>(),
    supabase.from("investment_holdings").select("id,investment_account_id,asset_name,units,latest_price,imported_current_value").eq("user_id", dataOwnerUserId).neq("record_status", "archived").returns<InvestmentHolding[]>(),
    supabase.from("retirement_plans").select("id,user_id,person_id,household_id,scope,retirement_age,target_annual_income,target_legacy_pot,annual_growth_rate_percent,annual_inflation_percent,sustainable_withdrawal_rate_percent,guaranteed_annual_income,created_at,updated_at").eq("user_id", dataOwnerUserId).order("updated_at", { ascending: false }).returns<RetirementPlanRecord[]>(),
    supabase.from("pension_contribution_events").select("pension_account_id,contribution_month,contribution_date,contribution_amount,event_status").eq("user_id", dataOwnerUserId).order("contribution_date", { ascending: false }).limit(500).returns<ContributionEvent[]>(),
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
  const pensionFunds = (pensionFundsResult.data ?? []).filter((fund) => pensionAccountIds.has(fund.pension_account_id));
  const investmentAccounts = (investmentAccountsResult.data ?? []).filter((account) => !account.person_id || account.person_id === primaryPerson.id);
  const investmentAccountIds = new Set(investmentAccounts.map((account) => account.id));
  const investmentHoldings = (investmentHoldingsResult.data ?? []).filter((holding) => investmentAccountIds.has(holding.investment_account_id));
  const assets = retirementAssetsFromCurrentWealth({ pensionAccounts, pensionFunds, investmentAccounts, investmentHoldings });
  const contributions = actualPensionContributions(pensionAccounts, contributionsResult.data ?? []);
  const initialPlan = (plansResult.data ?? []).find((plan) => plan.scope === "person" && plan.person_id === primaryPerson.id) || null;

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-center gap-3 rounded-[1.5rem] border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm font-semibold text-violet-950">
        <PiggyBank className="h-5 w-5 shrink-0 text-violet-700" aria-hidden="true" />
        <span>Using {assets.length} tracked retirement asset{assets.length === 1 ? "" : "s"} and {contributions.length} evidenced monthly contribution{contributions.length === 1 ? "" : "s"} for {primaryPerson.name}.</span>
      </div>
      <RetirementPageClient personId={primaryPerson.id} assets={assets} contributions={contributions} initialPlan={initialPlan} currentAge={currentAge} />
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
