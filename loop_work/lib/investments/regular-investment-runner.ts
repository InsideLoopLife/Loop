import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type RegularInvestmentRunnerOptions = {
  now?: Date;
  lookbackMonths?: number;
  force?: boolean;
  logger?: Pick<Console, "log" | "warn" | "error">;
};

type PieSetting = {
  id?: string | null;
  user_id: string;
  investment_account_id: string;
  group_label: string;
  monthly_reinvest_amount?: number | null;
  reinvest_frequency?: string | null;
  expected_dividend_yield_percent?: number | null;
  auto_reinvest_dividends?: boolean | null;
  reinvest_day?: number | null;
  reinvest_delay_days?: number | null;
  auto_materialise_reinvestments_enabled?: boolean | null;
};

type Holding = {
  id: string;
  user_id: string;
  investment_account_id: string;
  asset_name?: string | null;
  ticker?: string | null;
  group_label?: string | null;
  units?: number | null;
  average_buy_price?: number | null;
  latest_price?: number | null;
  target_allocation_percent?: number | null;
};

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function dayOfMonth(value: unknown, fallback = 1) {
  const parsed = Math.round(n(value, fallback));
  return Math.max(1, Math.min(31, parsed));
}

// For weekly/fortnightly pies, "reinvest day" is a day of the week (0 = Sunday ... 6 = Saturday),
// not a day of the month — e.g. "money is taken on a Wednesday" (reinvest_day = 3), then
// reinvested reinvest_delay_days later (typically the following Wednesday, a 7-day delay).
function dayOfWeek(value: unknown, fallback = 0) {
  const parsed = Math.round(n(value, fallback));
  return ((parsed % 7) + 7) % 7;
}

function nextOrSameWeekday(date: Date, targetDay: number) {
  const current = date.getUTCDay();
  const diff = (targetDay - current + 7) % 7;
  return addDays(date, diff);
}

function dateForMonthDay(monthDate: Date, day: number) {
  const lastDay = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), Math.min(day, lastDay), 0, 0, 0, 0));
}

function frequency(value?: string | null) {
  const clean = String(value || "monthly").toLowerCase();
  return ["weekly", "fortnightly", "monthly", "quarterly", "annual", "manual"].includes(clean) ? clean : "monthly";
}

function datesForSetting(setting: PieSetting, fromDate: Date, toDate: Date) {
  const freq = frequency(setting.reinvest_frequency);
  if (freq === "manual") return [] as Date[];
  const dates: Date[] = [];
  if (freq === "weekly" || freq === "fortnightly") {
    const targetDay = dayOfWeek(setting.reinvest_day, fromDate.getUTCDay());
    let cursor = nextOrSameWeekday(fromDate, targetDay);
    let guard = 0;
    while (cursor <= toDate && guard < 370) {
      dates.push(addDays(cursor, n(setting.reinvest_delay_days, 0)));
      cursor = addDays(cursor, freq === "weekly" ? 7 : 14);
      guard += 1;
    }
    return dates.filter((date) => date <= toDate);
  }
  const step = freq === "quarterly" ? 3 : freq === "annual" ? 12 : 1;
  const day = dayOfMonth(setting.reinvest_day, 1);
  let cursor = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1));
  let guard = 0;
  while (cursor <= toDate && guard < 72) {
    const date = addDays(dateForMonthDay(cursor, day), n(setting.reinvest_delay_days, 0));
    if (date >= fromDate && date <= toDate) dates.push(date);
    cursor = addMonths(cursor, step);
    guard += 1;
  }
  return dates;
}

function normaliseHoldingAllocations(holdings: Holding[]) {
  const priced = holdings.filter((holding) => n(holding.latest_price) > 0);
  const explicitTotal = priced.reduce((sum, holding) => sum + n(holding.target_allocation_percent), 0);
  if (explicitTotal > 0) {
    return priced.map((holding) => ({ holding, allocationPercent: n(holding.target_allocation_percent) / explicitTotal * 100 }));
  }
  const values = priced.map((holding) => ({ holding, value: n(holding.units) * n(holding.latest_price) }));
  const valueTotal = values.reduce((sum, item) => sum + item.value, 0);
  if (valueTotal > 0) return values.map((item) => ({ holding: item.holding, allocationPercent: item.value / valueTotal * 100 }));
  const even = priced.length ? 100 / priced.length : 0;
  return priced.map((holding) => ({ holding, allocationPercent: even }));
}

function contributionAmount(setting: PieSetting, holdings: Holding[]) {
  const manual = n(setting.monthly_reinvest_amount, 0);
  const dividendAnnual = setting.auto_reinvest_dividends
    ? holdings.reduce((sum, holding) => sum + n(holding.units) * n(holding.latest_price), 0) * (n(setting.expected_dividend_yield_percent) / 100)
    : 0;
  return manual + dividendAnnual / 12;
}

export async function runRegularInvestmentReinvestmentProjection(
  supabase: SupabaseAdmin = createAdminClient(),
  options: RegularInvestmentRunnerOptions = {},
) {
  const logger = options.logger || console;
  const now = options.now || new Date();
  const lookbackMonths = Math.max(1, Math.min(24, Math.round(options.lookbackMonths || 2)));
  const fromDate = addMonths(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), -lookbackMonths + 1);
  const result = { ok: true, checked_settings: 0, lots_created: 0, lots_existing: 0, holdings_updated: 0, failed: 0, notes: [] as string[] };

  const { data: settings, error: settingsError } = await supabase
    .from("investment_pie_settings")
    .select("id,user_id,investment_account_id,group_label,monthly_reinvest_amount,reinvest_frequency,expected_dividend_yield_percent,auto_reinvest_dividends,reinvest_day,reinvest_delay_days,auto_materialise_reinvestments_enabled")
    .or("auto_materialise_reinvestments_enabled.eq.true,monthly_reinvest_amount.gt.0,auto_reinvest_dividends.eq.true")
    .returns<PieSetting[]>();
  if (settingsError) throw settingsError;

  for (const setting of settings || []) {
    result.checked_settings += 1;
    if (setting.auto_materialise_reinvestments_enabled === false) continue;
    const group = String(setting.group_label || "").trim();
    let query = supabase
      .from("investment_holdings")
      .select("id,user_id,investment_account_id,asset_name,ticker,group_label,units,average_buy_price,latest_price,target_allocation_percent")
      .eq("user_id", setting.user_id)
      .eq("investment_account_id", setting.investment_account_id)
      .neq("record_status", "archived");
    if (group) query = query.eq("group_label", group);
    const { data: holdings, error: holdingError } = await query.returns<Holding[]>();
    if (holdingError) {
      result.failed += 1;
      result.ok = false;
      result.notes.push(`${setting.investment_account_id}/${group}: ${holdingError.message}`);
      continue;
    }

    const amount = contributionAmount(setting, holdings || []);
    if (amount <= 0) continue;
    const allocations = normaliseHoldingAllocations(holdings || []);
    if (!allocations.length) continue;

    for (const date of datesForSetting(setting, fromDate, now)) {
      for (const allocation of allocations) {
        const holding = allocation.holding;
        const price = n(holding.latest_price, 0);
        if (price <= 0) continue;
        const allocated = amount * (allocation.allocationPercent / 100);
        const units = allocated / price;
        const txId = `investment:reinvest:${setting.id || setting.investment_account_id}:${holding.id}:${isoDate(date)}`;
        const { data: existing } = await supabase
          .from("investment_purchase_lots")
          .select("id")
          .eq("user_id", setting.user_id)
          .eq("external_transaction_id", txId)
          .maybeSingle();
        if (existing && !options.force) {
          result.lots_existing += 1;
          continue;
        }
        const write = existing?.id
          ? await supabase.from("investment_purchase_lots").update({
              holding_id: holding.id,
              purchase_date: isoDate(date),
              contribution_date: isoDate(date),
              execution_date: isoDate(date),
              units,
              purchase_price: price,
              total_cost: Math.round(allocated * 100) / 100,
              fees: 0,
              price_quote_unit: "gbp",
              currency: "GBP",
              external_source: "regular_reinvestment_projection",
              contribution_source: "pie_regular_reinvestment",
              allocation_percent: allocation.allocationPercent,
              estimated: true,
              notes: `Auto-projected regular reinvestment for ${group || "investment pot"}; allocation ${allocation.allocationPercent.toFixed(3)}%.`,
            } as any).eq("id", existing.id)
          : await supabase.from("investment_purchase_lots").insert({
              user_id: setting.user_id,
              holding_id: holding.id,
              purchase_date: isoDate(date),
              contribution_date: isoDate(date),
              execution_date: isoDate(date),
              units,
              purchase_price: price,
              total_cost: Math.round(allocated * 100) / 100,
              fees: 0,
              price_quote_unit: "gbp",
              currency: "GBP",
              external_source: "regular_reinvestment_projection",
              external_transaction_id: txId,
              contribution_source: "pie_regular_reinvestment",
              allocation_percent: allocation.allocationPercent,
              estimated: true,
              notes: `Auto-projected regular reinvestment for ${group || "investment pot"}; allocation ${allocation.allocationPercent.toFixed(3)}%.`,
            } as any);
        if (write.error) {
          result.failed += 1;
          result.ok = false;
          result.notes.push(`${holding.asset_name || holding.id}: ${write.error.message}`);
          continue;
        }
        result.lots_created += existing?.id ? 0 : 1;

        const previousUnits = n(holding.units, 0);
        const previousCost = previousUnits * n(holding.average_buy_price, price);
        const nextUnits = previousUnits + units;
        const nextAverage = nextUnits > 0 ? (previousCost + allocated) / nextUnits : price;
        const update = await supabase.from("investment_holdings").update({
          units: nextUnits,
          average_buy_price: nextAverage,
          latest_price_date: isoDate(now),
          updated_at: new Date().toISOString(),
        }).eq("id", holding.id).eq("user_id", setting.user_id);
        if (!update.error) {
          holding.units = nextUnits;
          holding.average_buy_price = nextAverage;
          result.holdings_updated += 1;
        }
      }
    }
  }

  logger.log(`[regular-investment-runner] settings=${result.checked_settings} lots=${result.lots_created} existing=${result.lots_existing} holdings=${result.holdings_updated} failed=${result.failed}`);
  return result;
}
