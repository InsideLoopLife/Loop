import type { createClient } from "@/lib/supabase/server";

type AnyRow = Record<string, unknown>;
type DashboardDatabaseClient = Awaited<ReturnType<typeof createClient>>;

async function rows(query: PromiseLike<{ data: unknown }>): Promise<AnyRow[]> {
  try {
    const { data } = await query;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function n(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function holdingValue(row: AnyRow) {
  return n(row.imported_current_value) || n(row.units) * n(row.latest_price);
}

function pensionFundValue(row: AnyRow) {
  return n(row.current_value) || n(row.units) * n(row.unit_price);
}

export async function buildDashboardInsightEvidence(supabase: DashboardDatabaseClient, userIds: string[], fromDate: string) {
  const [accounts, pots, movements, investmentAccounts, holdings, pensionAccounts, pensionFunds, retirementPlans, connections] = await Promise.all([
    rows(supabase.from("financial_accounts").select("id,name,account_type,current_balance,is_liability,interest_rate,monthly_top_up_amount,balance_last_confirmed_at,updated_at").in("user_id", userIds)),
    rows(supabase.from("savings_pots").select("id,name,target_amount,target_date,monthly_target,current_allocated_amount,priority,status,goal_type,updated_at").in("user_id", userIds).in("status", ["active", "paused", "completed"]).order("priority", { ascending: true })),
    rows(supabase.from("savings_account_movements").select("financial_account_id,movement_type,amount,effective_at,created_at").in("user_id", userIds).gte("effective_at", fromDate).order("effective_at", { ascending: true })),
    rows(supabase.from("investment_accounts").select("id,label,provider,annual_platform_fee_percent,fixed_monthly_fee,provider_dividend_cash_value,provider_isa_subscribed_amount,provider_isa_remaining_amount,provider_isa_allowance_year,sync_status,last_provider_sync_at,updated_at").in("user_id", userIds).neq("record_status", "archived")),
    rows(supabase.from("investment_holdings").select("investment_account_id,asset_name,group_label,units,latest_price,imported_current_value,annual_asset_fee_percent,day_change_gbp,day_change_percent,updated_at,last_price_check_at").in("user_id", userIds).neq("record_status", "archived")),
    rows(supabase.from("pension_accounts").select("id,label,provider,current_value,value_as_of_date,annual_platform_fee_percent,fixed_monthly_fee,updated_at").in("user_id", userIds)),
    rows(supabase.from("pension_funds").select("pension_account_id,fund_name,group_label,current_value,units,unit_price,annual_fund_fee_percent,price_as_of_date,updated_at").in("user_id", userIds)),
    rows(supabase.from("retirement_plans").select("retirement_age,target_annual_income,target_legacy_pot,guaranteed_annual_income,updated_at").in("user_id", userIds).order("updated_at", { ascending: false }).limit(1)),
    rows(supabase.from("integration_connections").select("provider,status,last_synced_at,updated_at").in("user_id", userIds)),
  ]);

  const savingsAccounts = accounts.filter((account) => !account.is_liability && ["savings", "cash_isa", "fixed_saver", "regular_saver"].includes(String(account.account_type)));
  const savingsBalance = savingsAccounts.reduce((sum, account) => sum + Math.abs(n(account.current_balance)), 0);
  const confirmedInterest = movements.filter((movement) => movement.movement_type === "interest").reduce((sum, movement) => sum + Math.abs(n(movement.amount)), 0);
  const deposits = movements.filter((movement) => ["deposit", "top_up", "contribution"].includes(String(movement.movement_type))).reduce((sum, movement) => sum + Math.abs(n(movement.amount)), 0);
  const withdrawals = movements.filter((movement) => movement.movement_type === "withdrawal").reduce((sum, movement) => sum + Math.abs(n(movement.amount)), 0);
  const annualInterest = savingsAccounts.reduce((sum, account) => sum + Math.abs(n(account.current_balance)) * n(account.interest_rate) / 100, 0);

  const allocations = new Map<string, number>();
  for (const holding of holdings) {
    const label = String(holding.group_label || holding.asset_name || "Other");
    allocations.set(label, (allocations.get(label) || 0) + holdingValue(holding));
  }
  const allocationRows = [...allocations.entries()].sort((a, b) => b[1] - a[1]);
  const investmentValue = holdings.reduce((sum, holding) => sum + holdingValue(holding), 0);
  const investmentMovement = holdings.reduce((sum, holding) => sum + n(holding.day_change_gbp), 0);

  const pensionValue = pensionFunds.reduce((sum, fund) => sum + pensionFundValue(fund), 0) || pensionAccounts.reduce((sum, account) => sum + n(account.current_value), 0);
  const annualFees =
    investmentAccounts.reduce((sum, account) => {
      const accountValue = holdings.filter((holding) => holding.investment_account_id === account.id).reduce((total, holding) => total + holdingValue(holding), 0);
      return sum + accountValue * n(account.annual_platform_fee_percent) / 100 + n(account.fixed_monthly_fee) * 12;
    }, 0) +
    holdings.reduce((sum, holding) => sum + holdingValue(holding) * n(holding.annual_asset_fee_percent) / 100, 0) +
    pensionAccounts.reduce((sum, account) => {
      const funds = pensionFunds.filter((fund) => fund.pension_account_id === account.id);
      const accountValue = funds.reduce((total, fund) => total + pensionFundValue(fund), 0) || n(account.current_value);
      return sum + accountValue * n(account.annual_platform_fee_percent) / 100 + n(account.fixed_monthly_fee) * 12;
    }, 0) +
    pensionFunds.reduce((sum, fund) => sum + pensionFundValue(fund) * n(fund.annual_fund_fee_percent) / 100, 0);

  const timestamps = [
    ...accounts.flatMap((row) => [row.balance_last_confirmed_at, row.updated_at]),
    ...investmentAccounts.flatMap((row) => [row.last_provider_sync_at, row.updated_at]),
    ...holdings.flatMap((row) => [row.last_price_check_at, row.updated_at]),
    ...pensionAccounts.flatMap((row) => [row.value_as_of_date, row.updated_at]),
    ...pensionFunds.flatMap((row) => [row.price_as_of_date, row.updated_at]),
    ...connections.flatMap((row) => [row.last_synced_at, row.updated_at]),
  ].filter(Boolean).map((value) => String(value));

  return {
    accounts,
    pots,
    movements,
    savingsBalance,
    confirmedInterest,
    deposits,
    withdrawals,
    blendedSavingsRate: savingsBalance > 0 ? annualInterest / savingsBalance * 100 : 0,
    investmentAccounts,
    holdings,
    investmentValue,
    investmentMovement,
    allocationRows,
    pensionAccounts,
    pensionFunds,
    pensionValue,
    annualFees,
    dividendCash: investmentAccounts.reduce((sum, account) => sum + Math.max(0, n(account.provider_dividend_cash_value)), 0),
    isaSubscribed: investmentAccounts.reduce((sum, account) => sum + Math.max(0, n(account.provider_isa_subscribed_amount)), 0),
    isaRemaining: investmentAccounts.reduce((sum, account) => sum + Math.max(0, n(account.provider_isa_remaining_amount)), 0),
    retirementPlan: retirementPlans[0] || null,
    connections,
    timestamps,
  };
}
