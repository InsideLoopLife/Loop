import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import {
  getActiveHouseholdContext,
  householdMemberDataOrFilter,
  householdPeopleOrFilter,
  visibleDataOrFilter,
} from "@/lib/auth/household-context";
import {
  buildSavingsIntelligence,
  savingsDealEligibleBalance,
  savingsDealMatchesAccount,
} from "@/lib/wealth/savings-intelligence";
import { calculateSavingsAccruedBalance } from "@/lib/wealth/savings-accrual";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const memberFilter = householdMemberDataOrFilter(householdContext);
  const visibleFilter = visibleDataOrFilter(householdContext);
  const requestedPeople = String(request.nextUrl.searchParams.get("people") || "")
    .split(",").map((value) => value.trim()).filter(Boolean);

  const ratesSupabase = createWorkerDatabaseClient("rates");

  const [accountsResult, dealsResult, payResult, plannedResult, peopleResult] = await Promise.all([
    supabase.from("financial_accounts")
      .select("id, owner_person_id, person_id, ownership_scope, name, provider, provider_slug, account_type, current_balance, balance_last_confirmed_value, balance_last_confirmed_at, interest_rate, interest_rate_end_date, end_date, is_liability, monthly_top_up_amount")
      .or(memberFilter),
    ratesSupabase.from("savings_rate_deals")
      .select("id, provider_slug, provider_name, product_name, account_type, gross_aer, minimum_balance, maximum_balance, monthly_min_deposit, monthly_max_deposit, access_type, withdrawal_rules, notice_period_days, term_length_months, requires_existing_customer, last_checked_at, status")
      .eq("status", "active")
      .order("gross_aer", { ascending: false })
      .limit(150),
    supabase.from("pay_events")
      .select("id, person_id, gross_annual_salary, monthly_take_home_override, effective_from, effective_until")
      .or(memberFilter),
    supabase.from("planned_items")
      .select("id, person_id, direction, label, amount, recurrence, start_date, end_date")
      .or(visibleFilter),
    supabase.from("people")
      .select("id, relationship")
      .or(householdPeopleOrFilter(householdContext)),
  ]);

  const accounts = (accountsResult.data || []).filter((account: any) => {
    if (account.is_liability) return false;
    if (requestedPeople.length) {
      const owner = account.owner_person_id || account.person_id || null;
      if (owner && !requestedPeople.includes(owner)) return false;
    }
    const kind = String(account.account_type || "").toLowerCase();
    return !kind.includes("investment") && !kind.includes("pension") && !kind.includes("current_account");
  });

  const deals = dealsResult.data || [];
  const intelligence = buildSavingsIntelligence({
    accounts: accounts as any,
    deals: deals as any,
    relationships: [],
    plannedItems: plannedResult.data || [],
    payEvents: payResult.data || [],
    subjectPersonId: requestedPeople[0] || null,
    adultPersonIds: (peopleResult.data || [])
      .filter((person: any) => String(person.relationship || "").toLowerCase() !== "child")
      .map((person: any) => person.id),
  });

  const annualOpportunity = accounts.reduce((sum: number, account: any) => {
    const currentRate = Number(account.interest_rate || 0);
    const compatible = deals
      .filter((deal: any) => !deal.requires_existing_customer)
      .filter((deal: any) => savingsDealMatchesAccount(account, deal));
    const best = [...compatible].sort((a: any, b: any) => Number(b.gross_aer || 0) - Number(a.gross_aer || 0))[0];
    if (!best) return sum;
    const bestRate = Number(best.gross_aer || 0);
    const eligible = savingsDealEligibleBalance(account, best);
    const balance = calculateSavingsAccruedBalance(account).estimatedBalance;
    return sum + Math.max(0, Math.min(balance, eligible || balance) * (bestRate - currentRate) / 100);
  }, 0);

  return NextResponse.json({
    score: intelligence.score,
    status: intelligence.catalogue.status,
    annualOpportunity,
    checkedAt: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=900" },
  });
}
