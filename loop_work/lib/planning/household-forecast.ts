// The household's month-by-month forecast, savings and safety buffer, as used by
// planned purchases ("can we afford it?") and the job-loss check on Income.
import { loadMonthPlans, monthsFrom, monthTotals } from "@/lib/planning/load-month-plans";

export type ForecastRow = { month: string; leftOver: number; income: number; payByPerson: Record<string, number> };

export type HouseholdForecast = {
  months: string[];
  forecast: ForecastRow[];
  savingsNow: number;
  buffer: number;
  bufferMonthly: number;
  bufferBasis: "essential" | "all";
};

export function londonMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

const round = (value: number) => Math.round(value * 100) / 100;

export async function loadHouseholdForecast(supabase: any, opts: { userId: string; filter: string; count?: number; excludePlannedItemIds?: string[] }): Promise<HouseholdForecast> {
  const months = monthsFrom(londonMonth(), opts.count ?? 36);
  const [{ plans, savingNames }, { data: accounts }, { data: categories }] = await Promise.all([
    loadMonthPlans(supabase, { userId: opts.userId, filter: opts.filter, months, excludePlannedItemIds: opts.excludePlannedItemIds }),
    supabase.from("financial_accounts").select("account_type, current_balance, is_liability").or(opts.filter),
    supabase.from("spending_categories").select("name, emergency_fund_essential, spending_category_groups(emergency_fund_essential)").or(opts.filter),
  ]);

  // Money in savings accounts (not pensions or investments) — same as Summary's safety net.
  const savingsNow = ((accounts || []) as any[])
    .filter((a) => !a.is_liability && ["savings", "cash_isa", "fixed_saver", "regular_saver"].includes(String(a.account_type)))
    .reduce((sum, a) => sum + Math.abs(Number(a.current_balance || 0)), 0);

  // Three months of essential bills (or of all bills, if nothing is marked essential).
  const essentialNames = new Set(((categories || []) as any[]).filter((c) => {
    const groups = Array.isArray(c.spending_category_groups) ? c.spending_category_groups : c.spending_category_groups ? [c.spending_category_groups] : [];
    return Boolean(c.emergency_fund_essential || groups.some((g: any) => g.emergency_fund_essential));
  }).map((c) => c.name));
  const first = plans[0];
  const essentialMonthly = first ? first.outgoingItems.filter((item: any) => item.categoryLabel && essentialNames.has(item.categoryLabel)).reduce((s: number, item: any) => s + Number(item.value || 0), 0) : 0;
  const totals = plans.map((plan) => monthTotals(plan, savingNames));
  const bufferMonthly = essentialMonthly > 0 ? essentialMonthly : totals[0]?.spending || 0;

  return {
    months,
    forecast: plans.map((plan, i) => {
      const payByPerson: Record<string, number> = {};
      for (const item of plan.incomeItems) {
        if (!item.payEventId || !item.personId) continue;
        payByPerson[item.personId] = round((payByPerson[item.personId] || 0) + Number(item.value || 0));
      }
      return { month: months[i], leftOver: round(totals[i].leftOver), income: round(totals[i].income), payByPerson };
    }),
    savingsNow: round(savingsNow),
    buffer: round(bufferMonthly * 3),
    bufferMonthly: round(bufferMonthly),
    bufferBasis: essentialMonthly > 0 ? "essential" : "all",
  };
}
