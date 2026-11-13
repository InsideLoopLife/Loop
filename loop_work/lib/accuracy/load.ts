// Reads what "Keep LOOP accurate" needs. Each read stands alone: if one table
// can't be read, the other checks still show.
import { buildAccuracyChecks, type AccuracyCheck } from "@/lib/accuracy/checks";
import { currentMortgageSnapshot } from "@/lib/wealth/house-snapshot";
import { householdMemberDataOrFilter, type ActiveHouseholdContext } from "@/lib/auth/household-context";

async function rows<T>(query: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await query;
    return error ? [] : data || [];
  } catch {
    return [];
  }
}

export async function loadAccuracyChecks(supabase: any, ctx: ActiveHouseholdContext, today = new Date().toISOString().slice(0, 10)): Promise<AccuracyCheck[]> {
  const memberFilter = householdMemberDataOrFilter(ctx);
  const userIds = ctx.householdId && ctx.memberUserIds?.length ? ctx.memberUserIds : [ctx.userId || ctx.dataOwnerUserId];
  const watchFilter = ctx.householdId ? `user_id.eq.${ctx.userId},household_id.eq.${ctx.householdId}` : `user_id.eq.${ctx.userId}`;
  const [studentLoans, mortgages, pensions, watch, homes] = await Promise.all([
    rows<any>(supabase.from("student_loan_accounts").select("id, person_id, plan, current_balance, balance_date").or(memberFilter)),
    rows<any>(supabase.from("home_mortgage_deals").select("*").or(memberFilter)),
    rows<any>(supabase.from("pension_accounts").select("id, label, provider, current_value, value_as_of_date, valuation_mode").in("user_id", userIds)),
    rows<any>(supabase.from("bill_price_watch").select("watch_key, planned_item_id, response, value").or(watchFilter)),
    rows<any>(supabase.from("homes").select("*").or(memberFilter).limit(5)),
  ]);
  const itemIds = Array.from(new Set(watch.map((row: any) => row.planned_item_id).filter(Boolean)));
  const planned = itemIds.length ? await rows<any>(supabase.from("planned_items").select("id, label, amount, start_date, end_date").in("id", itemIds)) : [];
  // The saved balance is the figure on its "as of" date (or the deal's start).
  // Show what LOOP works it down to today, the same figure the Home page shows.
  const mortgagesWithEstimate = mortgages.map((deal: any) => ({ ...deal, estimated_balance: currentMortgageSnapshot(deal).balance }));
  const home = homes[0] || {};
  const councilName = home.council_tax_authority || home.local_authority_name || home.council_name || null;
  return buildAccuracyChecks({ today, studentLoans, mortgages: mortgagesWithEstimate, pensions, watch, planned, councilName });
}
