import { calculateProjectedMortgageBalance } from "@/lib/calculations/mortgage";
import { getActiveHouseholdContext } from "@/lib/auth/household-context";

function n(value: unknown) { const num = Number(value || 0); return Number.isFinite(num) ? num : 0; }
function monthStart(month: string) { return `${month}-01`; }
function monthEnd(month: string) { const [y, m] = month.split("-").map(Number); return new Date(y, m, 0).toISOString().slice(0, 10); }
function activeInMonth(start?: string | null, end?: string | null, month?: string) { if (!month) return true; return String(start || "1900-01-01") <= monthEnd(month) && String(end || "9999-12-31") >= monthStart(month); }
function monthlyAmount(item: any) { const amount = n(item.monthly_cost ?? item.amount ?? 0); if (item.recurrence === "weekly") return amount * 52 / 12; if (item.recurrence === "annual") return amount / 12; return amount; }
function pensionFundValue(fund: any) { return n(fund.current_value) || n(fund.units) * n(fund.unit_price); }
function holdingValue(holding: any) { return n(holding.imported_current_value) || n(holding.units) * n(holding.latest_price); }
function mortgageProjectedBalance(deal: any) {
  try {
    return calculateProjectedMortgageBalance({
      openingBalance: n(deal.balance),
      annualInterestRate: n(deal.interest_rate),
      termYears: n(deal.term_years),
      balanceAsOfDate: deal.balance_as_of_date ?? deal.start_date,
      monthlyPayment: deal.monthly_payment_override,
      repaymentType: deal.repayment_type ?? "repayment",
    }).projectedBalance;
  } catch { return n(deal.balance); }
}

export async function buildWealthSummary(supabase: any, userId: string, month = new Date().toISOString().slice(0, 7)) {
  const householdContext = await getActiveHouseholdContext(supabase, { id: userId });
  const userIds = householdContext.householdId ? householdContext.memberUserIds : [userId];

  const [accounts, homes, valuations, mortgages, pensions, pensionFunds, investmentAccounts, holdings, plannedItems, incomeEntries, payEvents, childCosts, spendingEntries] = await Promise.all([
    supabase.from("financial_accounts").select("account_type,current_balance,is_liability").in("user_id", userIds),
    supabase.from("homes").select("id,property_value,estimated_value_mid").in("user_id", userIds),
    supabase.from("home_valuation_sources").select("home_id,valuation_mid,valuation_amount").in("user_id", userIds),
    supabase.from("home_mortgage_deals").select("balance,balance_as_of_date,interest_rate,term_years,monthly_payment_override,repayment_type,start_date,end_date").in("user_id", userIds),
    supabase.from("pension_accounts").select("id,current_value").in("user_id", userIds),
    supabase.from("pension_funds").select("pension_account_id,current_value,units,unit_price").in("user_id", userIds),
    supabase.from("investment_accounts").select("id").in("user_id", userIds),
    supabase.from("investment_holdings").select("investment_account_id,units,latest_price,imported_current_value").in("user_id", userIds),
    supabase.from("planned_items").select("direction,amount,monthly_cost,recurrence,start_date,end_date,end_behavior").in("user_id", userIds),
    supabase.from("income_entries").select("gross_amount,net_amount,frequency,entry_date").in("user_id", userIds),
    supabase.from("pay_events").select("monthly_take_home_override,effective_from,effective_until").in("user_id", userIds),
    supabase.from("child_costs").select("monthly_cost,starts_on,ends_on").in("user_id", userIds),
    supabase.from("spending_entries").select("amount,spent_at").in("user_id", userIds).gte("spent_at", monthStart(month)).lte("spent_at", monthEnd(month)),
  ]);

  const manualAssets = (accounts.data || []).filter((a: any) => !a.is_liability).reduce((sum: number, a: any) => sum + Math.abs(n(a.current_balance)), 0);
  const manualLiabilities = (accounts.data || []).filter((a: any) => a.is_liability).reduce((sum: number, a: any) => sum + Math.abs(n(a.current_balance)), 0);
  const valuationByHome = new Map((valuations.data || []).map((v: any) => [v.home_id, n(v.valuation_mid ?? v.valuation_amount)]));
  const propertyAssets = (homes.data || []).reduce((sum: number, h: any) => sum + (n(h.estimated_value_mid) || n(h.property_value) || n(valuationByHome.get(h.id))), 0);
  const mortgageDebt = (mortgages.data || []).filter((d: any) => activeInMonth(d.start_date, d.end_date, month)).reduce((sum: number, d: any) => sum + mortgageProjectedBalance(d), 0);
  const pensionFromFunds = (pensionFunds.data || []).reduce((sum: number, f: any) => sum + pensionFundValue(f), 0);
  const pensionValue = pensionFromFunds || (pensions.data || []).reduce((sum: number, p: any) => sum + n(p.current_value), 0);
  const investmentValue = (holdings.data || []).reduce((sum: number, h: any) => sum + holdingValue(h), 0);

  const planned = (plannedItems.data || []).filter((item: any) => activeInMonth(item.start_date, item.end_behavior === "drops_off" ? item.end_date : null, month));
  const plannedIncome = planned.filter((item: any) => item.direction === "income").reduce((sum: number, item: any) => sum + monthlyAmount(item), 0);
  const plannedOutgoings = planned.filter((item: any) => item.direction !== "income").reduce((sum: number, item: any) => sum + monthlyAmount(item), 0);
  const entryIncome = (incomeEntries.data || []).reduce((sum: number, item: any) => {
    const amount = n(item.net_amount ?? item.gross_amount);
    if (item.frequency === "annual") return sum + amount / 12;
    if (item.frequency === "weekly") return sum + amount * 52 / 12;
    return sum + amount;
  }, 0);
  const salaryIncome = (payEvents.data || []).filter((event: any) => activeInMonth(event.effective_from, event.effective_until, month)).reduce((sum: number, event: any) => sum + n(event.monthly_take_home_override), 0);
  const childcare = (childCosts.data || []).filter((cost: any) => activeInMonth(cost.starts_on, cost.ends_on, month)).reduce((sum: number, cost: any) => sum + n(cost.monthly_cost), 0);
  const actualSpending = (spendingEntries.data || []).reduce((sum: number, entry: any) => sum + Math.abs(n(entry.amount)), 0);

  const income = plannedIncome + entryIncome + salaryIncome;
  const outgoings = plannedOutgoings + childcare + actualSpending;
  const assets = manualAssets + propertyAssets + pensionValue + investmentValue;
  const liabilities = manualLiabilities + mortgageDebt;

  return {
    month,
    income,
    outgoings,
    flow: income - outgoings,
    assets,
    liabilities,
    netWorth: assets - liabilities,
    propertyAssets,
    mortgageDebt,
    pensionValue,
    investmentValue,
    manualAccounts: accounts.data?.length || 0,
    investmentAccounts: investmentAccounts.data?.length || 0,
  };
}
