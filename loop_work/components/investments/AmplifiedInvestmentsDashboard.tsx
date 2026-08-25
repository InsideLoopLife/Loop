"use client";

import { useEffect, useMemo, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowDown, ArrowUp, BriefcaseBusiness, Building2,
  Check, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Cog, Eye,
  List, Loader2, Maximize2, Moon, Newspaper, RefreshCw, Repeat2, Save,
  Sun, Wallet, X, Lock, Upload, Plus, ArrowRight, TrendingUp, Layers, Filter,
  BarChart3
} from "lucide-react";
import { formatMoney } from "@/lib/format/money";
import {
  refreshAllInvestmentPrices,
  refreshInvestmentHoldingPrice,
  saveInvestmentCostBasisBatch,
  updateInvestmentAccountOwners,
  updateInvestmentHolding,
} from "@/lib/investments/actions";
import { fetchLiveFxRates } from "@/lib/investments/live-fx";

export type InvestmentPeriod = "1D" | "5D" | "1M" | "6M" | "YTD" | "1Y" | "5Y" | "MAX";

export type InvestmentHolding = {
  id: string; investment_account_id: string; asset_name: string; ticker: string | null; exchange: string | null; group_label: string | null; asset_kind?: string | null; isin?: string | null; units: number; average_buy_price: number; latest_price: number; latest_price_date: string; last_price_check_at?: string | null; price_check_status?: string | null; currency: string; annual_asset_fee_percent?: number; target_allocation_percent?: number; price_polling_enabled?: boolean | null; source_url?: string | null; notes?: string | null; price_quote_unit?: string | null; native_latest_price?: number | null; native_currency?: string | null; native_exchange?: string | null; imported_invested_value?: number | null; imported_current_value?: number | null; imported_result_value?: number | null; imported_account_currency?: string | null; day_open_price_gbp?: number | null; day_open_native_price?: number | null; day_open_at?: string | null; previous_close_price_gbp?: number | null; previous_close_native_price?: number | null; previous_close_at?: string | null; day_change_gbp?: number | null; day_change_percent?: number | null; day_change_native?: number | null; day_change_native_percent?: number | null; external_provider?: string | null; external_position_raw?: any; child_holding_ids?: string[]; aggregated_holding_count?: number; bundled_account_count?: number; total_cost_basis?: number | null; cost_basis_status?: string | null; logo_url?: string | null;
};

type InvestmentSnapshot = { id: string; holding_id: string; snapshot_at: string | null; snapshot_date: string | null; price: number | null; units: number | null; value: number | null; source: string | null; };
type InvestmentLot = { id: string; holding_id: string; purchase_date: string; execution_date?: string | null; contribution_date?: string | null; units: number; purchase_price: number; native_purchase_price?: number | null; native_currency?: string | null; price_quote_unit?: string | null; external_transaction_id?: string | null; external_source?: string | null; contribution_source?: string | null; total_cost?: number | null; fees?: number | null; estimated?: boolean | null; notes?: string | null; };
type InvestmentProviderActivity = { id: string; investment_account_id: string | null; provider: string; external_activity_id: string; activity_type: string; activity_date: string; ticker?: string | null; units?: number | null; unit_price?: number | null; amount?: number | null; currency?: string | null; };
type PopularMarketTick = { ticker: string | null; exchange_code?: string | null; native_price?: number | null; native_currency?: string | null; gbp_price?: number | null; price_gbp?: number | null; point_at?: string | null; pre_market_price?: number | null; pre_market_change_percent?: number | null; post_market_price?: number | null; post_market_change_percent?: number | null; };
type PersonLite = { id: string; name: string; relationship?: string | null; avatar_url?: string | null; };
type InvestmentAccountOwner = { investment_account_id: string; person_id: string | null; };
type InvestmentAccountLite = { id: string; label: string; provider: string; account_type: string; provider_cash_value?: number | null; };
type InvestmentPieSettingLite = { investment_account_id: string; group_label: string; monthly_reinvest_amount?: number | null; reinvest_frequency?: string | null; expected_dividend_yield_percent?: number | null; auto_reinvest_dividends?: boolean | null; };
type RemoteHistoryPoint = { at: string; label?: string; price?: number; value: number; source?: string };
type RemoteHistoryStage = { key: "portfolio_snapshots" | "stored_instrument_history" | "direct_market_history" | "current_baseline"; label: string; status: "used" | "available" | "missing" | "skipped"; points: number; coveragePercent: number | null; note: string; };
type RemoteHistoryPayload = { ok?: boolean; points?: RemoteHistoryPoint[]; currentValue?: number; sourceMode?: string; estimateOnly?: boolean; quality?: { reliable?: boolean; coverage?: number; reason?: string; latestCoverage?: number } | null; historyStages?: RemoteHistoryStage[]; historyCoveragePercent?: number | null; change?: { absolute?: number; percent?: number; firstValue?: number; latestValue?: number; pointCount?: number; basis?: string; startValue?: number; reliable?: boolean }; };
type RemoteMovement = { pct: number; change: number; has: boolean; source?: string; points?: number };

type Props = {
  holdings: InvestmentHolding[]; snapshots: InvestmentSnapshot[]; totalValue: number; costValue: number; unverifiedCost?: boolean; tierLabel?: string; filterLabel?: string; popularMarketTicks?: PopularMarketTick[]; people?: PersonLite[]; investmentAccountOwners?: InvestmentAccountOwner[]; investmentAccounts?: InvestmentAccountLite[]; investmentPieSettings?: InvestmentPieSettingLite[]; investmentLots?: InvestmentLot[]; providerActivities?: InvestmentProviderActivity[]; hideHeader?: boolean;
};

const PERIODS: InvestmentPeriod[] = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"];
const PERIOD_RANGE: Record<InvestmentPeriod, string> = { "1D": "1d", "5D": "5d", "1M": "1m", "6M": "6m", "YTD": "ytd", "1Y": "1y", "5Y": "5y", "MAX": "max" };
const PERIOD_DAYS: Record<InvestmentPeriod, number> = { "1D": 1, "5D": 5, "1M": 31, "6M": 186, "YTD": 366, "1Y": 366, "5Y": 365 * 5, "MAX": 365 * 20 };

const CLIENT_HISTORY_CACHE = new Map<string, { payload: RemoteHistoryPayload; expiresAt: number }>();
const INVESTMENTS_THEME_STORAGE_KEY = "loop:investments-theme";

async function loadHistoryPayload(url: string, force = false) {
  const cached = CLIENT_HISTORY_CACHE.get(url);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.payload;
  const response = await fetch(url, { cache: force ? "reload" : "default" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || `History request failed: ${response.status}`);
  CLIENT_HISTORY_CACHE.set(url, { payload, expiresAt: Date.now() + 5 * 60_000 });
  return payload as RemoteHistoryPayload;
}

type TickerStripItem = { id: string; label: string; name: string; valueLabel: string; pct: number; source: "holding" | "popular"; holding?: InvestmentHolding; point?: PopularMarketTick; hasMove?: boolean; };

const POPULAR_TICKERS: TickerStripItem[] = [
  { id: "popular-spy", label: "SPY", name: "S&P 500 ETF", valueLabel: "popular", pct: 1.32, source: "popular" },
  { id: "popular-qqq", label: "QQQ", name: "Nasdaq 100 ETF", valueLabel: "popular", pct: 1.18, source: "popular" },
  { id: "popular-aapl", label: "AAPL", name: "Apple Inc.", valueLabel: "popular", pct: 2.35, source: "popular" },
  { id: "popular-nvda", label: "NVDA", name: "NVIDIA Corp.", valueLabel: "popular", pct: -0.54, source: "popular" },
  { id: "popular-msft", label: "MSFT", name: "Microsoft Corp.", valueLabel: "popular", pct: 0.88, source: "popular" },
  { id: "popular-amzn", label: "AMZN", name: "Amazon.com Inc.", valueLabel: "popular", pct: 1.21, source: "popular" },
  { id: "popular-meta", label: "META", name: "Meta Platforms", valueLabel: "popular", pct: 0.74, source: "popular" },
  { id: "popular-vusa", label: "VUSA", name: "Vanguard S&P 500", valueLabel: "popular", pct: 0.49, source: "popular" },
];

export function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function safeDate(value?: string | null) { if (!value) return null; const date = new Date(value); return Number.isFinite(date.getTime()) ? date : null; }
function periodStart(period: InvestmentPeriod) { const date = new Date(); date.setDate(date.getDate() - PERIOD_DAYS[period]); return date; }

export function normalisedPrice(holding: InvestmentHolding, raw: number) {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const quoteUnit = String(holding.price_quote_unit || "").toLowerCase();
  const nativeCurrency = String(holding.native_currency || holding.currency || "").toUpperCase();
  const exchange = String(holding.exchange || holding.native_exchange || "").toUpperCase();
  if ((quoteUnit === "gbx" || nativeCurrency === "GBX" || ["LSE", "XLON", "LON"].includes(exchange)) && raw >= 5) return raw / 100;
  return raw;
}

export function latestHoldingPrice(holding: InvestmentHolding) {
  const price = normalisedPrice(holding, Number(holding.latest_price || 0));
  if (price > 0) return price;
  const units = Number(holding.units || 0);
  const providerValue = Number(holding.imported_current_value || 0);
  if (units > 0 && providerValue > 0) return providerValue / units;
  return 0;
}

export function averageHoldingPrice(holding: InvestmentHolding) { return normalisedPrice(holding, Number(holding.average_buy_price || 0)); }
export function holdingValue(holding: InvestmentHolding) {
  const units = Number(holding.units || 0); const price = latestHoldingPrice(holding);
  if (units > 0 && price > 0) return units * price;
  const importedValue = Number(holding.imported_current_value || 0);
  if (importedValue > 0) return importedValue; return 0;
}
export function holdingCost(holding: InvestmentHolding) {
  const units = Number(holding.units || 0); const avgPrice = averageHoldingPrice(holding);
  if (units > 0 && avgPrice > 0) return units * avgPrice;
  const importedCost = Number(holding.imported_invested_value || 0);
  if (importedCost > 0) return importedCost; return 0;
}

const VERIFIED_COST_BASIS_STATUSES = new Set(["known", "provider_verified", "manual_confirmed", "verified"]);
function holdingNeedsCostBasis(holding: InvestmentHolding) {
  if (Number(holding.units || 0) <= 0) return false;
  const status = String(holding.cost_basis_status || "").trim().toLowerCase();
  if (VERIFIED_COST_BASIS_STATUSES.has(status) && holdingCost(holding) > 0) return false;
  return holdingCost(holding) <= 0 || ["", "missing", "unknown", "unverified", "provider_unverified", "estimated"].includes(status);
}

type PieGroupSummary = { key: string; accountId: string; accountLabel: string; provider: string; groupLabel: string; value: number; holdings: number; monthlyReinvestAmount: number; reinvestFrequency: string; expectedDividendYieldPercent: number; };

function commandPieGroups(tableItems: Array<{ holding: InvestmentHolding; value: number }>, accounts: InvestmentAccountLite[], settings: InvestmentPieSettingLite[]) {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const settingsByKey = new Map(settings.map((setting) => [`${setting.investment_account_id}::${String(setting.group_label || "Core").toLowerCase()}`, setting]));
  const groups = new Map<string, PieGroupSummary>();

  tableItems.forEach((item) => {
    const account = accountsById.get(item.holding.investment_account_id);
    const groupLabel = String(item.holding.group_label || "Core").trim() || "Core";
    const key = `${item.holding.investment_account_id}::${groupLabel.toLowerCase()}`;
    const setting = settingsByKey.get(key);
    const existing = groups.get(key) || {
      key, accountId: item.holding.investment_account_id, accountLabel: account?.label || account?.provider || "Investment account", provider: account?.provider || item.holding.external_provider || "Manual/API", groupLabel, value: 0, holdings: 0, monthlyReinvestAmount: Number(setting?.monthly_reinvest_amount || 0), reinvestFrequency: String(setting?.reinvest_frequency || "manual"), expectedDividendYieldPercent: Number(setting?.expected_dividend_yield_percent || 0),
    };
    existing.value += item.value; existing.holdings += 1; groups.set(key, existing);
  });

  settings.forEach((setting) => {
    const groupLabel = String(setting.group_label || "Core").trim() || "Core";
    const key = `${setting.investment_account_id}::${groupLabel.toLowerCase()}`;
    if (groups.has(key)) return;
    const account = accountsById.get(setting.investment_account_id);
    groups.set(key, { key, accountId: setting.investment_account_id, accountLabel: account?.label || account?.provider || "Investment account", provider: account?.provider || "Manual/API", groupLabel, value: 0, holdings: 0, monthlyReinvestAmount: Number(setting.monthly_reinvest_amount || 0), reinvestFrequency: String(setting.reinvest_frequency || "manual"), expectedDividendYieldPercent: Number(setting.expected_dividend_yield_percent || 0), });
  });

  return groups;
}

function holdingSnapshotIds(holding: InvestmentHolding) {
  const ids = holding.child_holding_ids?.length ? holding.child_holding_ids : [holding.id];
  return new Set(ids.filter((id) => id && !String(id).startsWith("bundle:")));
}
function normaliseAssetKeyPart(value?: string | null) { return String(value || "").trim().toUpperCase().replace(/\s+/g, ""); }
function assetBundleKey(holding: InvestmentHolding) {
  const isin = normaliseAssetKeyPart(holding.isin); if (isin) return `isin:${isin}`;
  const ticker = normaliseAssetKeyPart(holding.ticker); const exchange = normaliseAssetKeyPart(holding.exchange || holding.native_exchange);
  if (ticker) return `ticker:${ticker}:${exchange || "ANY"}`; return `name:${normaliseAssetKeyPart(holding.asset_name)}`;
}

function bundleHoldingsByAsset(holdings: InvestmentHolding[]) {
  const groups = new Map<string, InvestmentHolding[]>();
  holdings.forEach((holding) => {
    const value = holdingValue(holding); if (value <= 0) return;
    const key = assetBundleKey(holding); if (!groups.has(key)) groups.set(key, []); groups.get(key)!.push(holding);
  });

  return Array.from(groups.entries()).map(([key, group]) => {
    const first = group[0];
    const units = group.reduce((sum, holding) => sum + Number(holding.units || 0), 0);
    const value = group.reduce((sum, holding) => sum + holdingValue(holding), 0);
    const cost = group.reduce((sum, holding) => sum + holdingCost(holding), 0);

    const dayChangeValue = group.reduce((sum, holding) => {
      let raw = Number(holding.day_change_gbp);
      if (!Number.isFinite(raw) || holding.day_change_gbp === null) {
        const nativeChange = Number(holding.day_change_native || 0); raw = normalisedPrice(holding, Math.abs(nativeChange)) * Math.sign(nativeChange);
      }
      return Number.isFinite(raw) ? sum + raw * Number(holding.units || 0) : sum;
    }, 0);

    const weightedDayOpenValue = group.reduce((sum, holding) => {
      const holdingUnits = Number(holding.units || 0); const openPrice = Number(holding.day_open_price_gbp || 0);
      if (holdingUnits > 0 && openPrice > 0) return sum + openPrice * holdingUnits;

      let change = Number(holding.day_change_gbp);
      if (!Number.isFinite(change) || holding.day_change_gbp === null) {
        const nativeChange = Number(holding.day_change_native || 0); change = normalisedPrice(holding, Math.abs(nativeChange)) * Math.sign(nativeChange);
      }
      const current = holdingValue(holding);
      if (Number.isFinite(change) && current > 0) return sum + Math.max(0, current - change * holdingUnits); return sum;
    }, 0);

    const openingValue = weightedDayOpenValue > 0 ? weightedDayOpenValue : value - dayChangeValue;
    const previousCloseValue = group.reduce((sum, holding) => {
      const holdingUnits = Number(holding.units || 0); const previous = Number(holding.previous_close_price_gbp || 0);
      return holdingUnits > 0 && previous > 0 ? sum + holdingUnits * previous : sum;
    }, 0);
    const dayComparisonValue = previousCloseValue > 0 ? previousCloseValue : openingValue;
    const hasSaneComparison = dayComparisonValue > 0 && value > 0 && dayComparisonValue / value > 0.5 && dayComparisonValue / value < 2;
    const dayComparisonChange = hasSaneComparison ? value - dayComparisonValue : 0;
    const latestPrice = units > 0 ? value / units : latestHoldingPrice(first);
    const averageBuyPrice = units > 0 && cost > 0 ? cost / units : averageHoldingPrice(first);
    const accountIds = new Set(group.map((holding) => holding.investment_account_id).filter(Boolean));

    return {
      ...first, id: `bundle:${key}`, units, latest_price: latestPrice, average_buy_price: averageBuyPrice, imported_current_value: value, imported_invested_value: cost > 0 ? cost : null, total_cost_basis: cost > 0 ? cost : null, cost_basis_status: group.every((holding) => !holdingNeedsCostBasis(holding)) ? "verified" : "missing", day_open_price_gbp: units > 0 && openingValue > 0 ? openingValue / units : first.day_open_price_gbp, day_open_native_price: first.day_open_native_price, day_open_at: first.day_open_at, previous_close_price_gbp: units > 0 && previousCloseValue > 0 ? previousCloseValue / units : first.previous_close_price_gbp, previous_close_native_price: first.previous_close_native_price, previous_close_at: first.previous_close_at, day_change_gbp: !hasSaneComparison ? null : units > 0 ? dayComparisonChange / units : first.day_change_gbp, day_change_percent: !hasSaneComparison ? null : dayComparisonValue > 0 ? (dayComparisonChange / dayComparisonValue) * 100 : first.day_change_percent, child_holding_ids: group.map((holding) => holding.id), aggregated_holding_count: group.length, bundled_account_count: accountIds.size,
    } satisfies InvestmentHolding;
  });
}

function bucketKeyForPeriod(snapshot: InvestmentSnapshot, date: Date, period: InvestmentPeriod) {
  return (snapshot.snapshot_at || snapshot.snapshot_date || date.toISOString()).slice(0, period === "1D" ? 16 : 10);
}

function aggregateSnapshots(snapshots: InvestmentSnapshot[], holdingIds: Set<string>, period: InvestmentPeriod, expectedTotal = 0) {
  const start = periodStart(period);
  const byKey = new Map<string, { value: number; holdings: Set<string> }>();
  snapshots.filter((snapshot) => holdingIds.has(snapshot.holding_id)).forEach((snapshot) => {
      const date = safeDate(snapshot.snapshot_at || snapshot.snapshot_date); if (!date || date < start) return;
      const key = bucketKeyForPeriod(snapshot, date, period);
      const value = Number(snapshot.value || Number(snapshot.price || 0) * Number(snapshot.units || 0));
      if (!Number.isFinite(value) || value <= 0) return;
      const entry = byKey.get(key) || { value: 0, holdings: new Set<string>() };
      entry.value += value; entry.holdings.add(snapshot.holding_id); byKey.set(key, entry);
    });

  const expectedHoldings = holdingIds.size;
  const minimumCoverage = expectedHoldings <= 2 ? expectedHoldings : Math.max(2, Math.ceil(expectedHoldings * 0.7));
  const minimumValue = expectedTotal > 0 ? expectedTotal * 0.65 : 0;

  return Array.from(byKey.entries()).filter(([, entry]) => { if (expectedHoldings <= 1) return true; return entry.holdings.size >= minimumCoverage || (minimumValue > 0 && entry.value >= minimumValue); }).sort(([a], [b]) => a.localeCompare(b)).map(([date, entry]) => ({ date, value: entry.value }));
}

// BUGFIX (chart/headline day-move mismatch): this used to only look at
// day_open_price_gbp / day_change_gbp / day_change_percent — a completely
// different set of fields from previousCloseMovement() below, which the
// headline "Day move" stat uses and checks previous_close_price_gbp
// first. Recently-fixed holdings (e.g. the Moneybox market-data worker
// fix) can have previous_close_price_gbp populated correctly while the
// day_open_*/day_change_* fields are still empty — the headline number
// was right, but the chart fell through every check to 0 and rendered
// flat. Checking the same field first, with the same sanity-bound guard
// previousCloseMovement() already trusts, fixes that without needing any
// backend/worker change.
function openingValueForOneDay(holding: InvestmentHolding) {
  const units = Number(holding.units || 0); const current = holdingValue(holding); if (current <= 0) return 0;
  const previousGbpPerUnit = Number(holding.previous_close_price_gbp || 0);
  if (units > 0 && previousGbpPerUnit > 0) {
    const previousValue = previousGbpPerUnit * units;
    if (previousValue / current > 0.2 && previousValue / current < 5) return previousValue;
  }
  const openPrice = Number(holding.day_open_price_gbp || 0); if (units > 0 && openPrice > 0) return openPrice * units;
  let changePerUnit = Number(holding.day_change_gbp);
  if (!Number.isFinite(changePerUnit) || holding.day_change_gbp === null) {
    const nativeChange = Number(holding.day_change_native || 0); changePerUnit = normalisedPrice(holding, Math.abs(nativeChange)) * Math.sign(nativeChange);
  }
  if (units > 0 && Number.isFinite(changePerUnit) && Math.abs(changePerUnit) > 0) return Math.max(0, current - changePerUnit * units);
  const pct = Number(holding.day_change_percent ?? holding.day_change_native_percent);
  if (Number.isFinite(pct) && Math.abs(pct) > 0) { const divisor = 1 + pct / 100; if (divisor > 0) return current / divisor; }
  return 0;
}

function realOneDayPointsForHolding(holding: InvestmentHolding, snapshots: InvestmentSnapshot[]) {
  const holdingIds = holdingSnapshotIds(holding);
  return aggregateSnapshots(snapshots, holdingIds, "1D", holdingValue(holding));
}

function syntheticOneDayPortfolioPoints(holdings: InvestmentHolding[], totalValue: number) {
  const openValue = holdings.reduce((sum, holding) => sum + openingValueForOneDay(holding), 0);
  const currentValue = totalValue > 0 ? totalValue : holdings.reduce((sum, holding) => sum + holdingValue(holding), 0);
  if (openValue > 0 && currentValue > 0) return [ { date: "Open", value: openValue }, { date: "Now", value: currentValue } ];
  return currentValue > 0 ? [{ date: "Start", value: currentValue }, { date: "Now", value: currentValue }] : [];
}

function holdingPeriodPoints(holding: InvestmentHolding, snapshots: InvestmentSnapshot[], period: InvestmentPeriod) {
  const holdingIds = holdingSnapshotIds(holding);
  const points = aggregateSnapshots(snapshots, holdingIds, period, holdingValue(holding));
  if (points.length >= 2) return points;
  if (period === "1D") return realOneDayPointsForHolding(holding, snapshots);
  const cost = holdingCost(holding); const value = holdingValue(holding);
  if (period === "5Y" && cost > 0 && value > 0 && Math.abs(value - cost) >= 0.01) return [ { date: "Cost", value: cost }, { date: "Now", value } ];
  return value > 0 ? [{ date: "Start", value }, { date: "Now", value }] : [];
}

function movementFromPoints(points: Array<{ date: string; value: number }>) {
  if (points.length < 2) return { change: 0, pct: 0, has: false };
  const first = points[0].value; const last = points[points.length - 1].value; const change = last - first;
  return { change, pct: first > 0 ? (change / first) * 100 : 0, has: true };
}

function previousCloseMovement(holding: InvestmentHolding) {
  const units = Number(holding.units || 0); const currentVal = holdingValue(holding); const previousGbpPerUnit = Number(holding.previous_close_price_gbp || 0);
  if (currentVal > 0 && previousGbpPerUnit > 0 && units > 0) {
    const previousValue = previousGbpPerUnit * units;
    if (previousValue / currentVal > 0.2 && previousValue / currentVal < 5) {
      const change = currentVal - previousValue; const pct = (change / previousValue) * 100;
      return { change, pct, has: true, basis: "previous close" };
    }
  }
  const storedDayPercent = Number(holding.day_change_percent ?? holding.day_change_native_percent);
  const storedDayChangePerUnit = Number(holding.day_change_gbp ?? holding.day_change_native);
  if (Number.isFinite(storedDayPercent) && Math.abs(storedDayPercent) > 0) {
    return { change: Number.isFinite(storedDayChangePerUnit) ? storedDayChangePerUnit * units : 0, pct: storedDayPercent, has: true, basis: "provider daily move" };
  }
  return { change: 0, pct: 0, has: false, basis: "intraday opening point" };
}

function movementForHolding(holding: InvestmentHolding, snapshots: InvestmentSnapshot[], period: InvestmentPeriod) {
  if (period !== "1D") {
    const fromSnapshots = movementFromPoints(holdingPeriodPoints(holding, snapshots, period));
    if (fromSnapshots.has) return fromSnapshots;
  }
  if (period === "1D") return previousCloseMovement(holding);
  return { change: 0, pct: 0, has: false };
}

// Math logic to draw the scalable SVG paths
function linePath(points: Array<{ date: string; value: number }>, min: number, spread: number, viewBoxHeight = 100, yPadding = 10) {
  if (points.length < 2) return "";
  const drawHeight = viewBoxHeight - (yPadding * 2);
  const coords = points.map((point, index) => ({
    x: (index / Math.max(1, points.length - 1)) * 100,
    y: viewBoxHeight - yPadding - ((point.value - min) / spread) * drawHeight,
  }));
  if (coords.length === 2) return `M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)} L${coords[1].x.toFixed(2)},${coords[1].y.toFixed(2)}`;
  let path = `M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? i : i - 1]; const p1 = coords[i]; const p2 = coords[i + 1]; const p3 = coords[i + 2 < coords.length ? i + 2 : i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6; const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6; const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return path;
}

function formatCompactMoney(value: number) {
  if (!Number.isFinite(value)) return "£0";
  if (Math.abs(value) >= 1_000_000) return `£${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `£${(value / 1_000).toFixed(1)}K`;
  return formatMoney(value);
}

function formatTickerPointPrice(point?: PopularMarketTick) {
  if (!point) return "popular";
  const native = Number(point.native_price || 0); const gbp = Number(point.gbp_price ?? point.price_gbp ?? 0);
  const currency = String(point.native_currency || "").toUpperCase();
  if (currency === "GBX" && native > 0) return `${native.toFixed(2)}p`;
  if (currency === "USD" && native > 0) return `$${native >= 100 ? native.toFixed(2) : native.toFixed(4)}`;
  if (currency === "EUR" && native > 0) return `€${native >= 100 ? native.toFixed(2) : native.toFixed(4)}`;
  if (gbp > 0) return formatCompactMoney(gbp); if (native > 0) return native.toFixed(4);
  return "price pending";
}

function assetInitials(holding: InvestmentHolding) {
  const base = holding.ticker || holding.asset_name || "?";
  return base.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "?";
}

function looksLikeIsin(value?: string | null) { return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(String(value || "").trim()); }

export function primaryHoldingLabel(holding: InvestmentHolding) {
  const ticker = String(holding.ticker || "").trim();
  if (ticker && !looksLikeIsin(ticker) && ticker.length <= 8) return ticker.toUpperCase();
  const name = String(holding.asset_name || "").trim();
  if (!name) return assetInitials(holding);
  const firstChunk = name.split(/[-–|]/)[0]?.trim() || name;
  const providerish = firstChunk.split(/\s+/).slice(0, 2).join(" ").trim();
  const fundMix = firstChunk.match(/\b(?:Global\s+)?\d{1,3}%\s+Equity\b/i)?.[0];
  if (fundMix && providerish) return `${providerish} ${fundMix}`;
  return providerish || name;
}

export function secondaryHoldingLabel(holding: InvestmentHolding) {
  const primary = primaryHoldingLabel(holding); const name = String(holding.asset_name || "").trim();
  if (!name) return holding.group_label || "Investment holding";
  if (name.toLowerCase() === primary.toLowerCase()) return holding.group_label || "Investment holding";
  return name;
}

export function formatNativeUnitPrice(value: number, currency?: string | null, priceUnit?: string | null) {
  if (!Number.isFinite(value) || value <= 0) return "Price pending";
  const unit = String(priceUnit || "").toLowerCase(); const code = String(currency || "").toUpperCase();
  if (unit === "gbx" || code === "GBX") return `${value.toFixed(2)}p`;
  if (code === "USD") return `$${value >= 100 ? value.toFixed(2) : value.toFixed(4)}`;
  if (code === "EUR") return `€${value >= 100 ? value.toFixed(2) : value.toFixed(4)}`;
  if (code === "GBP") return `£${value >= 100 ? value.toFixed(2) : value.toFixed(4)}`;
  return `${value.toFixed(value >= 100 ? 2 : 4)}${code ? ` ${code}` : ""}`;
}

export function unitPriceLabel(holding: InvestmentHolding) {
  const native = Number(holding.native_latest_price || 0);
  if (native > 0) return formatNativeUnitPrice(native, holding.native_currency, holding.price_quote_unit);
  const latest = latestHoldingPrice(holding); return latest > 0 ? formatMoney(latest) : "Price pending";
}

export function nativeCostInputMeta(holding: InvestmentHolding) {
  const unit = String(holding.price_quote_unit || "").toLowerCase(); const currency = String(holding.native_currency || holding.currency || "GBP").toUpperCase();
  if (unit === "gbx" || currency === "GBX") return { prefix: "p", currency: "GBX", quoteUnit: "gbx" };
  if (currency === "USD") return { prefix: "$", currency: "USD", quoteUnit: "native" };
  if (currency === "EUR") return { prefix: "€", currency: "EUR", quoteUnit: "native" };
  if (currency === "CAD") return { prefix: "C$", currency: "CAD", quoteUnit: "native" };
  return { prefix: "£", currency: currency || "GBP", quoteUnit: unit || "gbp" };
}

export function nativeCostSuggestion(holding: InvestmentHolding) {
  const averageGbp = averageHoldingPrice(holding); if (averageGbp <= 0) return 0;
  const meta = nativeCostInputMeta(holding); if (meta.quoteUnit === "gbx") return averageGbp * 100;
  const native = Number(holding.native_latest_price || 0); const latestGbp = latestHoldingPrice(holding);
  const impliedFx = native > 0 && latestGbp > 0 ? latestGbp / native : 0;
  return impliedFx > 0 && meta.currency !== "GBP" ? averageGbp / impliedFx : averageGbp;
}

const FALLBACK_LOGOS_BY_TICKER: Record<string, string> = {
  G4M: "https://logo.clearbit.com/gear4music.com", AAPL: "https://logo.clearbit.com/apple.com", GOOGL: "https://logo.clearbit.com/abc.xyz", GOOG: "https://logo.clearbit.com/abc.xyz", META: "https://logo.clearbit.com/meta.com", NVDA: "https://logo.clearbit.com/nvidia.com", MSFT: "https://logo.clearbit.com/microsoft.com", AMZN: "https://logo.clearbit.com/amazon.com", CSCO: "https://logo.clearbit.com/cisco.com", BMO: "https://logo.clearbit.com/bmo.com", TD: "https://logo.clearbit.com/td.com", VUSA: "https://logo.clearbit.com/vanguard.com", GB00: "https://logo.clearbit.com/vanguard.com", NIO: "https://logo.clearbit.com/nio.com", TSLA: "https://logo.clearbit.com/tesla.com", RY: "https://logo.clearbit.com/rbc.com", BNS: "https://logo.clearbit.com/scotiabank.com", JNJ: "https://logo.clearbit.com/jnj.com", IBM: "https://logo.clearbit.com/ibm.com", JPM: "https://logo.clearbit.com/jpmorganchase.com", WMT: "https://logo.clearbit.com/walmart.com", ISF: "https://logo.clearbit.com/ishares.com", INRG: "https://logo.clearbit.com/ishares.com",
};

function assetBadgeFallback(holding: InvestmentHolding) {
  const ticker = normaliseAssetKeyPart(holding.ticker); const name = String(holding.asset_name || "").toLowerCase();
  return FALLBACK_LOGOS_BY_TICKER[ticker] || (name.includes("vanguard") ? "https://logo.clearbit.com/vanguard.com" : null) || (name.includes("ishares") || name.includes("blackrock") ? "https://logo.clearbit.com/blackrock.com" : null) || (name.includes("legal & general") || name.includes("l&g") ? "https://logo.clearbit.com/legalandgeneral.com" : null) || (name.includes("fidelity") ? "https://logo.clearbit.com/fidelity.com" : null) || (name.includes("hsbc") ? "https://logo.clearbit.com/hsbc.com" : null) || (name.includes("tesla") ? "https://logo.clearbit.com/tesla.com" : null) || (name.includes("apple") ? "https://logo.clearbit.com/apple.com" : null) || (name.includes("microsoft") ? "https://logo.clearbit.com/microsoft.com" : null) || (name.includes("amazon") ? "https://logo.clearbit.com/amazon.com" : null) || (name.includes("nvidia") ? "https://logo.clearbit.com/nvidia.com" : null);
}

export function AssetBadge({ holding, dark, compact = false }: { holding: InvestmentHolding; dark?: boolean; compact?: boolean }) {
  const queryHoldingId = holding.child_holding_ids?.[0] || (holding.id.startsWith("bundle:") ? "" : holding.id);
  const logoParams = new URLSearchParams();
  if (queryHoldingId) logoParams.set("holdingId", queryHoldingId);
  if (holding.ticker) logoParams.set("ticker", holding.ticker);
  if (holding.asset_name) logoParams.set("name", holding.asset_name);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [queryHoldingId, holding.ticker, holding.asset_name]);

  const fallbackUrl = assetBadgeFallback(holding);

  return (
    <span className={`${compact ? "h-7 w-7" : "h-9 w-9"} relative flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-black/10 dark:ring-white/10 ${dark ? "bg-white/10 text-white" : "bg-slate-200 text-slate-700"}`}>
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fallbackUrl || `/api/investments/logo?${logoParams.toString()}`} alt={`${holding.asset_name || holding.ticker || "Asset"} logo`} className="absolute inset-0 h-full w-full object-cover" onError={() => setFailed(true)} loading="lazy" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black tracking-tighter">
          {assetInitials(holding)}
        </span>
      )}
    </span>
  );
}

// FULL MAIN PORTFOLIO CHART (Taller height, deeper padding, clear axes)
function PortfolioChart({ points, costValue, positive, dark }: { points: Array<{ date: string; value: number }>; costValue: number; positive: boolean; dark: boolean; }) {
  if (points.length < 2) {
    return <div className={`grid min-h-[460px] place-items-center rounded-2xl border border-dashed ${dark ? "border-white/10 bg-white/[0.02] text-white/40" : "border-slate-200 bg-slate-50 text-slate-400"}`}><p className="text-sm font-semibold">Waiting for a second evidenced price point.</p></div>;
  }
  const values = points.map((point) => Number(point.value || 0)).filter((value) => Number.isFinite(value));
  const rawMin = Math.min(...values, costValue > 0 ? costValue : values[0]);
  const rawMax = Math.max(...values, costValue > 0 ? costValue : values[0]);
  const rawSpread = Math.max(1, rawMax - rawMin);
  
  // Dynamic padding so the chart never touches the top or bottom edges
  const padding = Math.max(rawSpread * 0.15, rawMax * 0.01, 1); 
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  const spread = Math.max(1, max - min);
  const d = linePath(points, min, spread, 100, 10);
  
  const costY = costValue > 0 ? clamp(100 - 10 - ((costValue - min) / spread) * 80, 10, 90) : 90;
  const last = values[values.length - 1];
  const ticks = [max, max - spread / 2, min];
  const xIndexes = Array.from(new Set([0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1]));
  const formatAxisDate = (value: string) => { const date = safeDate(value); if (!date) return value.slice(0, 10); return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", ...(points.length > 100 ? { year: "2-digit" } : {}) }); };
  
  return (
    <div className="relative min-h-[400px] lg:min-h-[460px] w-full select-none overflow-hidden pb-4">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id="loopInvestmentArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={positive ? "#10b981" : "#f43f5e"} stopOpacity="0.22" />
            <stop offset="100%" stopColor={positive ? "#10b981" : "#f43f5e"} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        
        {/* Horizontal Background Grids */}
        {[10, 50, 90].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="currentColor" strokeDasharray="2 4" className={dark ? "text-white/[0.07]" : "text-slate-200"} strokeWidth="0.3" />)}
        
        {/* Cost Basis Line */}
        {costValue > 0 ? <line x1="0" x2="100" y1={costY} y2={costY} stroke="currentColor" strokeDasharray="3 3" className={dark ? "text-white/40" : "text-slate-500"} strokeWidth="0.5" /> : null}
        
        {/* Main Chart SVG */}
        <path d={`${d} L100,90 L0,90 Z`} fill="url(#loopInvestmentArea)" />
        <path d={d} fill="none" stroke="currentColor" className={positive ? "text-emerald-400" : "text-rose-500"} strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* Solid Bottom Axis */}
        <line x1="0" x2="100" y1="90" y2="90" stroke="currentColor" className={dark ? "text-white/20" : "text-slate-300"} strokeWidth="0.5" />
      </svg>
      
      <div className="pointer-events-none absolute inset-y-0 right-1 flex flex-col justify-between text-right pb-[8%] pt-[1%]">
        {ticks.map((tick, index) => <span key={index} className={`text-[10px] font-medium ${dark ? "text-white/40" : "text-slate-400"}`}>{formatCompactMoney(tick)}</span>)}
      </div>
      
      <div className="pointer-events-none absolute inset-x-2 bottom-0 flex justify-between">
        {xIndexes.map((index) => <span key={index} className={`text-[10px] font-medium ${dark ? "text-white/40" : "text-slate-400"}`}>{formatAxisDate(points[index]?.date || "")}</span>)}
      </div>
      
      <div className={`absolute right-12 top-6 rounded-md px-2 py-0.5 text-[11px] font-bold ${positive ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30" : "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/30"}`}>
        {formatCompactMoney(last)}
      </div>
      {costValue > 0 ? (
        <div className={`absolute right-12 rounded px-1.5 py-0.5 text-[10px] font-semibold ${dark ? "bg-white/10 text-white/70" : "bg-slate-200 text-slate-700 shadow"}`} style={{ top: `${clamp(costY - 4, 5, 88)}%` }}>
          {formatCompactMoney(costValue)}
        </div>
      ) : null}
    </div>
  );
}

// Widget Asset Mini Chart (Fixed Height, Not Stretched)
function AssetMiniChart({ points, positive, dark }: { points: Array<{ date: string; value: number }>; positive: boolean; dark: boolean; }) {
  if (!points || points.length < 2) return <div className={`h-full w-full flex items-center justify-center text-xs font-semibold ${dark ? "text-white/20" : "text-slate-400"}`}>Chart loading...</div>;
  const values = points.map(p => Number(p.value)).filter(v => Number.isFinite(v));
  const rawMin = Math.min(...values); const rawMax = Math.max(...values);
  const spread = Math.max(1, rawMax - rawMin);
  
  // Bounding flat lines to the center
  const min = Math.max(0, rawMin - spread * 0.1); 
  const max = rawMax + spread * 0.1;
  const pathD = linePath(points, min, Math.max(1, max - min), 100, 15);
  
  // Format the time strings for the X-axis timestamps
  const formatTime = (dateStr: string, isStart = false) => {
    if (dateStr === "Start" || dateStr === "Open") return isStart ? "08:00" : "16:30";
    if (dateStr === "Now") return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return dateStr;
  }
  const startTime = formatTime(points[0].date, true);
  const endTime = formatTime(points[points.length - 1].date, false);
  
  return (
    <div className="relative h-full w-full select-none overflow-hidden p-2 flex flex-col">
       <div className="flex-1 relative">
         <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
           <defs>
             <linearGradient id="miniChartGrad" x1="0" x2="0" y1="0" y2="1">
               <stop offset="0%" stopColor={positive ? "#10b981" : "#f43f5e"} stopOpacity="0.2" />
               <stop offset="100%" stopColor={positive ? "#10b981" : "#f43f5e"} stopOpacity="0.0" />
             </linearGradient>
           </defs>
           {[15, 50, 85].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="currentColor" strokeDasharray="1 3" className={dark ? "text-white/[0.05]" : "text-slate-200"} strokeWidth="0.5" />)}
           <path d={`${pathD} L100,85 L0,85 Z`} fill="url(#miniChartGrad)" />
           <path d={pathD} fill="none" stroke="currentColor" className={positive ? "text-emerald-400" : "text-rose-500"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
         </svg>
         
         {/* Y-Axis Value Bounds */}
         <div className={`absolute top-0 right-1 text-[9px] font-bold ${dark ? "text-white/30" : "text-slate-400"}`}>{formatCompactMoney(rawMax)}</div>
         <div className={`absolute bottom-3 right-1 text-[9px] font-bold ${dark ? "text-white/30" : "text-slate-400"}`}>{formatCompactMoney(rawMin)}</div>
       </div>
       
       {/* X-Axis Timestamps */}
       <div className={`h-4 shrink-0 flex items-center justify-between border-t text-[10px] font-semibold mt-1 px-1 ${dark ? "border-white/10 text-white/40" : "border-slate-200 text-slate-400"}`}>
          <span>{startTime}</span>
          <span>12:00</span>
          <span>{endTime}</span>
       </div>
    </div>
  );
}

function DiversificationBars({ holdings, snapshots, totalValue, period, dark, onOpenOther, onOpenHolding }: { holdings: InvestmentHolding[]; snapshots: InvestmentSnapshot[]; totalValue: number; period: InvestmentPeriod; dark: boolean; onOpenOther: (items: InvestmentHolding[]) => void; onOpenHolding: (holding: InvestmentHolding) => void; }) {
  const [localPeriod, setLocalPeriod] = useState<InvestmentPeriod>(period);
  const [remoteMoves, setRemoteMoves] = useState<Record<string, { pct: number; has: boolean }>>({});
  const [loadingMoves, setLoadingMoves] = useState(false);

  const rawItems = useMemo(() => holdings.map((holding) => ({ holding, value: holdingValue(holding) })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value), [holdings]);
  const representedValue = rawItems.reduce((sum, item) => sum + item.value, 0);
  const allItems = rawItems.map((item) => { const local = movementForHolding(item.holding, snapshots, localPeriod); const remote = remoteMoves[assetBundleKey(item.holding)]; const move = localPeriod !== "1D" && remote?.has ? { ...local, pct: remote.pct, has: true } : local; return { ...item, share: representedValue > 0 ? (item.value / representedValue) * 100 : 0, move }; });
  // Nine labelled segments is the most that remains legible at the smallest
  // supported dashboard width. Keep every holding when it fits; only roll up
  // the smallest positions when another segment would make labels unusable.
  const maxReadableSegments = 9;
  const shouldGroupSmallHoldings = allItems.length > maxReadableSegments;
  const visibleCount = shouldGroupSmallHoldings ? maxReadableSegments - 1 : allItems.length;
  const visible = allItems.slice(0, visibleCount);
  const remainder = shouldGroupSmallHoldings ? allItems.slice(visibleCount) : [];
  const otherValue = remainder.reduce((sum, item) => sum + item.value, 0);
  const knownOtherWeight = remainder.reduce((sum, item) => sum + (item.move.has ? item.value : 0), 0);
  const otherMove = knownOtherWeight > 0 ? remainder.reduce((sum, item) => sum + (item.move.has ? item.value * item.move.pct : 0), 0) / knownOtherWeight : 0;
  const items = otherValue > 0 ? [ ...visible, { holding: { id: "portfolio-other", investment_account_id: "portfolio-other", asset_name: `Other (${remainder.length} assets)`, ticker: "Other", exchange: null, group_label: null, units: 1, average_buy_price: 0, latest_price: otherValue, latest_price_date: "", currency: "GBP", } as InvestmentHolding, value: otherValue, share: representedValue > 0 ? (otherValue / representedValue) * 100 : 0, move: { has: knownOtherWeight > 0, pct: otherMove, change: 0 }, }, ] : visible;

  useEffect(() => { setLocalPeriod(period); }, [period]);

  useEffect(() => {
    let cancelled = false;
    const accountIds = Array.from(new Set(holdings.map((holding) => holding.investment_account_id).filter(Boolean)));
    if (!holdings.length) return;
    setLoadingMoves(true);
    const params = new URLSearchParams({ movements: "1", portfolio: "1", range: PERIOD_RANGE[localPeriod] });
    if (accountIds.length) params.set("accountIds", accountIds.join(","));
    loadHistoryPayload(`/api/investments/history?${params.toString()}`).then((payload: any) => { if (cancelled) return; const next: Record<string, { pct: number; has: boolean }> = {}; Object.entries(payload?.movements || {}).forEach(([key, row]: [string, any]) => { next[key] = { pct: Number(row?.pct || 0), has: Boolean(row?.has) }; }); setRemoteMoves(next); }).catch(() => { if (!cancelled) setRemoteMoves({}); }).finally(() => { if (!cancelled) setLoadingMoves(false); });
    return () => { cancelled = true; };
  }, [localPeriod, holdings]);

  if (!items.length) return <div className={`rounded-3xl border border-dashed p-8 text-center text-sm font-semibold ${dark ? "border-white/10 text-white/40" : "border-slate-200 text-slate-400"}`}>Add holdings to see diversification.</div>;

  return (
    <div className={`rounded-3xl border p-3 sm:p-5 ${dark ? "border-white/10 bg-[#0c1017]" : "border-slate-200 bg-white"}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? "text-white/40" : "text-slate-500"}`}>Diversification</p>
          <div className="mt-0.5 flex items-center gap-1.5"><h3 className={`text-base font-bold ${dark ? "text-white" : "text-slate-900"}`}><span className="md:hidden">Allocation &amp; movement</span><span className="hidden md:inline">Weight × movement bars</span></h3></div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1 ${dark ? "bg-white/[0.05]" : "bg-slate-100"}`}>
            {(["1D", "5D", "1M", "6M", "YTD", "1Y"] as InvestmentPeriod[]).map((item) => (
              <button key={`div-period-${item}`} type="button" onClick={() => setLocalPeriod(item)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${localPeriod === item ? (dark ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30" : "bg-white text-emerald-700 shadow-sm") : dark ? "text-white/50 hover:text-white" : "text-slate-500 hover:text-slate-900"}`}>
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:hidden">
        {items.map((item) => {
          const positive = item.move.pct >= 0;
          const isOther = item.holding.id === "portfolio-other";
          const prominent = item.share >= 20;
          return (
            <button
              key={`mobile-allocation-${item.holding.id}`}
              type="button"
              onClick={() => (isOther ? onOpenOther(remainder.map((row) => row.holding)) : onOpenHolding(item.holding))}
              className={`min-w-0 rounded-2xl border p-3 text-left transition active:scale-[0.99] ${prominent ? "col-span-2" : "col-span-1"} ${dark ? (positive ? "border-emerald-400/15 bg-emerald-400/10" : "border-rose-400/15 bg-rose-400/10") : positive ? "border-emerald-100 bg-emerald-50" : "border-rose-100 bg-rose-50"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`truncate text-xs font-bold ${dark ? "text-white" : "text-slate-900"}`}>{primaryHoldingLabel(item.holding)}</p>
                  <p className={`mt-2 text-2xl font-black tracking-tight ${dark ? "text-white" : "text-slate-950"}`}>{item.share.toFixed(1)}%</p>
                  <p className={`text-[10px] font-semibold ${dark ? "text-white/45" : "text-slate-500"}`}>of selected portfolio</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-black ${!item.move.has ? (dark ? "bg-white/10 text-white/40" : "bg-white/70 text-slate-400") : positive ? (dark ? "bg-emerald-400/15 text-emerald-300" : "bg-white/80 text-emerald-700") : (dark ? "bg-rose-400/15 text-rose-300" : "bg-white/80 text-rose-600")}`}>
                  {item.move.has ? `${positive ? "▲ " : "▼ "}${Math.abs(item.move.pct).toFixed(2)}%` : "—"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="relative hidden min-h-[220px] items-center pt-6 pb-2 md:flex">
        <div className={`absolute left-0 right-0 top-1/2 h-px ${dark ? "bg-white/10" : "bg-slate-200"}`} />
        <div className="z-10 flex w-full items-stretch overflow-hidden rounded-xl">
          {items.map((item) => {
            const positive = item.move.pct >= 0;
            const barHeight = item.move.has ? clamp(12 + Math.sqrt(Math.abs(item.move.pct)) * 36, 12, 90) : 4;
            const isOther = item.holding.id === "portfolio-other";
            return (
              <button key={item.holding.id} type="button" onClick={() => (isOther ? onOpenOther(remainder.map((row) => row.holding)) : onOpenHolding(item.holding))} className={`group relative min-w-0 shrink-0 text-center transition ${isOther ? "cursor-pointer border-x border-dashed border-rose-500/60 hover:bg-rose-500/5" : "cursor-pointer border-r border-white/10 hover:bg-white/[0.04]"}`} style={{ flexBasis: `${item.share}%`, width: `${item.share}%` }}>
                <div className="relative flex h-[150px] w-full items-center justify-center">
                  <div className={`absolute inset-x-px rounded-sm transition-all ${positive ? "bg-gradient-to-t from-emerald-500 to-emerald-400" : "bg-gradient-to-b from-rose-400 to-rose-600"} ${!item.move.has ? "grayscale opacity-20" : ""}`} style={positive ? { bottom: "50%", height: `${barHeight}px`, borderTopLeftRadius: "4px", borderTopRightRadius: "4px" } : { top: "50%", height: `${barHeight}px`, borderBottomLeftRadius: "4px", borderBottomRightRadius: "4px" }} />
                  <span className={`absolute whitespace-nowrap text-[10px] font-bold ${!item.move.has ? (dark ? "text-white/40" : "text-slate-400") : positive ? "text-emerald-400" : "text-rose-500"}`} style={positive ? { bottom: `calc(50% + ${barHeight + 4}px)` } : { top: `calc(50% + ${barHeight + 4}px)` }}>
                    {item.move.has ? `${positive ? "+" : ""}${item.move.pct.toFixed(2)}%` : "—"}
                  </span>
                </div>
                <div className="mt-1 min-w-0 px-0.5">
                  <p className={`truncate text-xs font-bold ${dark ? "text-white group-hover:text-emerald-400" : "text-slate-900"}`}>{primaryHoldingLabel(item.holding)}</p>
                  <p className={`text-[10px] ${dark ? "text-white/40" : "text-slate-400"}`}>{item.share.toFixed(1)}% of selected view</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CostBasisRail({ holdings, dark, onOpenFull, onClose }: { holdings: InvestmentHolding[]; dark: boolean; onOpenFull: () => void; onClose: () => void; }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const missing = holdings.filter(holdingNeedsCostBasis).sort((a, b) => holdingValue(b) - holdingValue(a));
  const visible = missing.slice(0, 5);

  const importFromBroker = () => {
    if (!formRef.current) return;
    const inputs = formRef.current.querySelectorAll<HTMLInputElement>("input[name^='average_buy_price:']");
    let count = 0;
    inputs.forEach((input) => {
      const nameParts = input.name.split(":");
      const holdingId = nameParts[1];
      const holding = missing.find((h) => h.id === holdingId);
      if (holding) { const suggestion = nativeCostSuggestion(holding); if (suggestion > 0) { input.value = suggestion.toFixed(2); count++; } }
    });
    setError(count > 0 ? null : "No additional broker cost estimates were found for these items.");
  };

  return (
    <div className={`flex flex-col h-full rounded-3xl border overflow-hidden ${dark ? "border-white/10 bg-[#0c1017]" : "border-slate-200 bg-white"}`}>
      <div className="shrink-0 p-5 pb-0">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? "text-amber-400" : "text-amber-600"}`}>Portfolio accuracy</p>
            <div className="mt-0.5 flex items-center gap-2">
              <h3 className={`text-lg font-bold ${dark ? "text-white" : "text-slate-900"}`}>Missing cost basis</h3>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-white">{missing.length}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className={`grid h-8 w-8 place-items-center rounded-full transition ${dark ? "bg-white/10 text-white/70 hover:text-white" : "bg-slate-100 text-slate-700"}`}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs font-medium leading-relaxed text-amber-600 dark:text-amber-200/90">These holdings are missing a cost basis. Add it to unlock accurate gain/loss reporting.</p>
          </div>
          <button type="button" onClick={onOpenFull} className="flex shrink-0 items-center text-xs font-bold text-amber-500 hover:text-amber-400">
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-3">
          <button type="button" onClick={importFromBroker} className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${dark ? "border-white/10 bg-white/5 text-white hover:bg-white/10" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>
            <Upload className="h-3.5 w-3.5" /> Import from broker
          </button>
        </div>
      </div>

      <form ref={formRef} className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={(event) => {
          event.preventDefault(); setError(null); const data = new FormData(event.currentTarget);
          startTransition(async () => { try { const result = await saveInvestmentCostBasisBatch(data); if (!result?.updated) throw new Error(result?.message || "Add at least one valid purchase price."); router.refresh(); } catch (caught: any) { setError(caught?.message || "The cost basis could not be saved."); } });
        }}>
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
          {error ? <p className="mb-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-500 dark:text-rose-300">{error}</p> : null}
          {visible.length ? (
            visible.map((holding) => {
              const meta = nativeCostInputMeta(holding); const suggested = nativeCostSuggestion(holding); const fx = Number(holding.native_latest_price || 0) > 0 && latestHoldingPrice(holding) > 0 ? latestHoldingPrice(holding) / Number(holding.native_latest_price || 0) : 1;
              return (
                <div key={`rail-cost-${holding.id}`} className={`group flex flex-col gap-2 rounded-xl p-3 border transition-all ${dark ? "border-white/10 bg-white/5 focus-within:border-emerald-500 focus-within:bg-white/10" : "border-slate-200 bg-slate-50 focus-within:border-emerald-500"}`}>
                  <input type="hidden" name="holding_id" value={holding.id} /> <input type="hidden" name={`purchase_date:${holding.id}`} value={new Date().toISOString().slice(0, 10)} /> <input type="hidden" name={`cost_currency:${holding.id}`} value={meta.currency} /> <input type="hidden" name={`cost_quote_unit:${holding.id}`} value={meta.quoteUnit} /> <input type="hidden" name={`cost_fx_rate:${holding.id}`} value={fx} />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AssetBadge holding={holding} dark={dark} compact />
                      <div className="min-w-0">
                        <p className={`truncate text-xs font-bold transition-colors ${dark ? "text-white" : "text-slate-900"}`}>{primaryHoldingLabel(holding)}</p>
                        <p className={`truncate text-[10px] ${dark ? "text-white/40" : "text-slate-500"}`}>{secondaryHoldingLabel(holding)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <span className={`text-xs font-semibold ${dark ? "text-white/80" : "text-slate-700"}`}>{unitPriceLabel(holding)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-1">
                     <span className={`text-[10px] font-semibold ${dark ? "text-white/40" : "text-slate-500"}`}>{Number(holding.units || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} units</span>
                     <div className="flex items-center gap-2">
                      <span className={`mr-1 text-xs font-bold ${dark ? "text-white/40" : "text-slate-400"}`}>{meta.prefix}</span>
                      <input name={`average_buy_price:${holding.id}`} type="number" min="0.000001" step="any" defaultValue={suggested > 0 ? suggested.toFixed(2) : undefined} placeholder="0.00" className={`w-20 !bg-transparent focus:!bg-transparent active:!bg-transparent border-0 shadow-none focus:ring-0 text-right text-xs font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${dark ? "text-white placeholder:text-white/20" : "text-slate-900 placeholder:text-slate-400"}`} />
                      <button type="button" onClick={() => { const input = formRef.current?.querySelector<HTMLInputElement>(`input[name="average_buy_price:${holding.id}"]`); if (input && suggested > 0) input.value = suggested.toFixed(2); }} className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500/20 text-emerald-500 transition hover:bg-emerald-500/30" title="Confirm estimate"><Check className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : ( <div className="py-8 text-center text-xs font-semibold text-white/40">All cost basis items confirmed.</div> )}
          {missing.length > visible.length ? (
            <button type="button" onClick={onOpenFull} className={`mt-2 w-full rounded-xl py-2 text-xs font-bold transition-colors ${dark ? "bg-white/5 text-white hover:bg-white/10" : "bg-slate-100 text-slate-800 hover:bg-slate-200"}`}>Open all {missing.length} holdings</button>
          ) : null}
        </div>
        <div className={`shrink-0 flex items-center justify-between border-t p-5 ${dark ? "border-white/10" : "border-slate-200 bg-slate-50"}`}>
          <button type="button" onClick={onClose} className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${dark ? "text-white/70 hover:bg-white/10" : "text-slate-600 hover:bg-slate-200"}`}>Cancel</button>
          <button type="submit" disabled={pending || !visible.length} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-5 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-50">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Save all
          </button>
        </div>
      </form>
    </div>
  );
}

function OtherHoldingsRail({ holdings, snapshots, period, dark, onClose, onExpand }: { holdings: InvestmentHolding[]; snapshots: InvestmentSnapshot[]; period: InvestmentPeriod; dark: boolean; onClose: () => void; onExpand: () => void; }) {
  const [page, setPage] = useState(0);
  const pageSize = 7;
  const rows = holdings.map((holding) => ({ holding, value: holdingValue(holding), move: movementForHolding(holding, snapshots, period) })).sort((a, b) => b.value - a.value);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visible = rows.slice(page * pageSize, page * pageSize + pageSize);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <div className={`flex flex-col h-full rounded-3xl border overflow-hidden ${dark ? "border-white/10 bg-[#0c1017]" : "border-slate-200 bg-white"}`}>
      <div className="shrink-0 flex items-start justify-between gap-3 p-5 pb-0">
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? "text-emerald-400" : "text-emerald-600"}`}>Other holdings</p>
          <h3 className={`mt-1 text-xl font-bold ${dark ? "text-white" : "text-slate-900"}`}>{formatMoney(total)}</h3>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onExpand} className={`grid h-8 w-8 place-items-center rounded-full ${dark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600"}`}><Maximize2 className="h-4 w-4" /></button>
          <button type="button" onClick={onClose} className={`grid h-8 w-8 place-items-center rounded-full ${dark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600"}`}><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-2">
        {visible.map(({ holding, value, move }) => (
          <div key={`other-rail-${holding.id}`} className={`flex items-center gap-3 rounded-2xl border p-3 ${dark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
            <AssetBadge holding={holding} dark={dark} compact />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-bold ${dark ? "text-white" : "text-slate-900"}`}>{primaryHoldingLabel(holding)}</p>
              <p className={`truncate text-[10px] font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>{secondaryHoldingLabel(holding)}</p>
            </div>
            <div className="text-right">
              <p className={`text-xs font-bold ${dark ? "text-white" : "text-slate-900"}`}>{formatMoney(value)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AmplifiedInvestmentsDashboard({
  holdings, snapshots, totalValue, costValue, unverifiedCost = false, tierLabel = "Realtime", filterLabel = "Household", popularMarketTicks = [], people = [], investmentAccountOwners = [], investmentAccounts = [], investmentPieSettings = [], investmentLots = [], providerActivities = [], hideHeader = false,
}: Props) {
  const router = useRouter();
  const [period, setPeriod] = useState<InvestmentPeriod>("1D");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [selectedHolding, setSelectedHolding] = useState<InvestmentHolding | null>(null);
  const [selectedTickerItem, setSelectedTickerItem] = useState<string | null>(null);
  const [showCostBasisDrawer, setShowCostBasisDrawer] = useState(false);
  const [showOtherHoldingsDrawer, setShowOtherHoldingsDrawer] = useState(false);
  const [sidePanel, setSidePanel] = useState<"summary" | "cost-basis" | "other">(() => (holdings.some(holdingNeedsCostBasis) ? "cost-basis" : "summary"));
  const [otherHoldings, setOtherHoldings] = useState<InvestmentHolding[]>([]);
  const [remotePortfolioHistory, setRemotePortfolioHistory] = useState<RemoteHistoryPayload | null>(null);
  const [remoteAssetMoves, setRemoteAssetMoves] = useState<Record<string, RemoteMovement>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [movementLoading, setMovementLoading] = useState(false);
  const dark = theme === "dark";
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string | null>(null);
  const [liveRates, setLiveRates] = useState<Record<string, number>>({});

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(INVESTMENTS_THEME_STORAGE_KEY);
    const initialTheme = savedTheme === "dark" || savedTheme === "light"
      ? savedTheme
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(initialTheme);
  }, []);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem(INVESTMENTS_THEME_STORAGE_KEY, next);
      return next;
    });
  };

  useEffect(() => {
    let isMounted = true;
    async function loadRates() { const rates = await fetchLiveFxRates("GBP"); if (isMounted) setLiveRates(rates); }
    loadRates();
    const interval = setInterval(loadRates, 30 * 1000);
    return () => { isMounted = false; clearInterval(interval); };
  }, []);

  const filteredHoldings = useMemo(() => {
    if (!selectedAccountFilter || selectedAccountFilter === "ALL") return holdings;
    return holdings.filter((h) => `${h.investment_account_id}::${String(h.group_label || "Core").toLowerCase()}` === selectedAccountFilter || h.investment_account_id === selectedAccountFilter);
  }, [holdings, selectedAccountFilter]);

  const activeTotalValue = useMemo(() => (!selectedAccountFilter || selectedAccountFilter === "ALL") ? totalValue : filteredHoldings.reduce((sum, h) => sum + holdingValue(h), 0), [filteredHoldings, totalValue, selectedAccountFilter]);
  const activeCostValue = useMemo(() => (!selectedAccountFilter || selectedAccountFilter === "ALL") ? costValue : filteredHoldings.reduce((sum, h) => sum + holdingCost(h), 0), [filteredHoldings, costValue, selectedAccountFilter]);

  const bundledHoldings = useMemo(() => bundleHoldingsByAsset(filteredHoldings), [filteredHoldings]);
  const holdingIds = useMemo(() => new Set(filteredHoldings.map((holding) => holding.id)), [filteredHoldings]);
  const accountIdsKey = useMemo(() => investmentAccounts.map((account) => account.id).filter(Boolean).sort().join(","), [investmentAccounts]);

  useEffect(() => {
    let cancelled = false; setHistoryLoading(true);
    const params = new URLSearchParams({ portfolio: "1", range: PERIOD_RANGE[period] });
    if (accountIdsKey) params.set("accountIds", accountIdsKey);
    loadHistoryPayload(`/api/investments/history?${params.toString()}`).then((payload) => { if (!cancelled) setRemotePortfolioHistory(payload); }).catch(() => { if (!cancelled) setRemotePortfolioHistory(null); }).finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [period, accountIdsKey, filteredHoldings.length]);

  useEffect(() => {
    let cancelled = false; if (!filteredHoldings.length) { setRemoteAssetMoves({}); return; }
    setMovementLoading(true);
    const params = new URLSearchParams({ movements: "1", portfolio: "1", range: PERIOD_RANGE[period] });
    if (accountIdsKey) params.set("accountIds", accountIdsKey);
    loadHistoryPayload(`/api/investments/history?${params.toString()}`).then((payload: any) => { if (!cancelled) setRemoteAssetMoves(payload?.movements || {}); }).catch(() => { if (!cancelled) setRemoteAssetMoves({}); }).finally(() => { if (!cancelled) setMovementLoading(false); });
    return () => { cancelled = true; };
  }, [period, accountIdsKey, filteredHoldings.length]);

  const localPortfolioPoints = useMemo(() => {
    const fromSnapshots = aggregateSnapshots(snapshots, holdingIds, period, activeTotalValue);
    if (fromSnapshots.length >= 2) return fromSnapshots;
    if (period === "1D") { const dayPoints = syntheticOneDayPortfolioPoints(bundledHoldings, activeTotalValue); if (dayPoints.length >= 2) return dayPoints; }
    if (activeTotalValue <= 0) return [];
    let opening = 0; let covered = 0;
    bundledHoldings.forEach((holding) => {
      const value = holdingValue(holding); const localMove = movementForHolding(holding, snapshots, period); const remoteMove = remoteAssetMoves[assetBundleKey(holding)]; const move = period !== "1D" && remoteMove?.has ? remoteMove : localMove;
      if (!move?.has || value <= 0 || 1 + Number(move.pct || 0) / 100 <= 0) return;
      opening += value / (1 + Number(move.pct || 0) / 100); covered += value;
    });
    const coverage = activeTotalValue > 0 ? covered / activeTotalValue : 0;
    const start = new Date(); start.setDate(start.getDate() - PERIOD_DAYS[period]);
    if (opening > 0 && coverage >= 0.55) {
      const scaledOpening = opening * (activeTotalValue / Math.max(covered, 0.01));
      return [ { date: start.toISOString(), value: scaledOpening }, { date: new Date().toISOString(), value: activeTotalValue } ];
    }
    return [ { date: start.toISOString(), value: activeTotalValue }, { date: new Date().toISOString(), value: activeTotalValue } ];
  }, [snapshots, holdingIds, period, activeTotalValue, bundledHoldings, remoteAssetMoves]);

  // BUGFIX (investment pricing audit): the server-side history estimate is
  // explicitly a "market performance estimate" when sourceMode/estimateOnly
  // says so, and its own `change.reliable` flag tells us whether it rests on
  // a real previous-close/saved-snapshot basis or a thin-coverage fallback.
  // Only trust the chart-derived movement (and let it feed the headline
  // badge) when the server says it's reliable.
  const remoteChangeReliable = Boolean(remotePortfolioHistory?.change?.reliable);
  const remotePoints = Array.isArray(remotePortfolioHistory?.points) ? remotePortfolioHistory!.points!.filter((point) => Number.isFinite(Number(point.value)) && Number(point.value) > 0).map((point) => ({ date: point.at, value: Number(point.value) })) : [];
  const portfolioPoints = remotePoints.length >= 2 ? remotePoints : localPortfolioPoints;
  const chartPeriodMoveRaw = movementFromPoints(portfolioPoints);
  const chartPeriodMove = remotePoints.length >= 2 && !remoteChangeReliable ? { ...chartPeriodMoveRaw, has: false } : chartPeriodMoveRaw;
  const representedValue = bundledHoldings.reduce((sum, holding) => sum + holdingValue(holding), 0);

  const marketMoveEvidence = bundledHoldings.reduce((state, holding) => {
      const value = holdingValue(holding); const localMove = movementForHolding(holding, snapshots, period); const remoteMove = remoteAssetMoves[assetBundleKey(holding)]; const move = period !== "1D" && remoteMove?.has ? { pct: Number(remoteMove.pct || 0), has: true } : localMove;
      if (!move?.has || value <= 0 || 1 + Number(move.pct || 0) / 100 <= 0) return state;
      state.current += value; state.opening += value / (1 + Number(move.pct || 0) / 100); state.covered += value; return state;
    }, { current: 0, opening: 0, covered: 0 });

  const marketMoveCoverage = representedValue > 0 ? marketMoveEvidence.covered / representedValue : 0;
  // BUGFIX (investment pricing audit): a big swing extrapolated from partial
  // coverage (55%+ was previously enough to show a confident badge) is far
  // more likely to be a data/resolution bug than a genuine diversified-
  // portfolio move. No real portfolio should swing >20% in a day; if the
  // computed move claims that much, only trust it when coverage is close to
  // complete (97%+) rather than the original 55% bar.
  const IMPLAUSIBLE_DAILY_MOVE_PCT = 20;
  const marketMovePct = marketMoveEvidence.opening > 0 ? ((marketMoveEvidence.current - marketMoveEvidence.opening) / marketMoveEvidence.opening) * 100 : 0;
  const marketMovePlausible = Math.abs(marketMovePct) <= IMPLAUSIBLE_DAILY_MOVE_PCT || marketMoveCoverage >= 0.97;
  const marketPeriodMove = marketMoveEvidence.opening > 0 ? { change: marketMoveEvidence.current - marketMoveEvidence.opening, pct: marketMovePct, has: marketMoveCoverage >= 0.55 && marketMovePlausible } : { change: 0, pct: 0, has: false };
  const periodMove = marketPeriodMove.has ? marketPeriodMove : chartPeriodMove;
  const positive = periodMove.change >= 0;

  const tableItems = bundledHoldings.map((holding) => {
      const value = holdingValue(holding); const localMove = movementForHolding(holding, snapshots, period); const remoteMove = remoteAssetMoves[assetBundleKey(holding)]; const move = period !== "1D" && remoteMove?.has ? { change: Number(remoteMove.change || 0), pct: Number(remoteMove.pct || 0), has: true } : localMove;
      let points = holdingPeriodPoints(holding, snapshots, period);
      // Chart points are real stored snapshots only. The day-move figure remains a separate headline metric.
      return { holding, value, move, points, allocation: representedValue > 0 ? (value / representedValue) * 100 : 0 };
    }).filter((item) => item.value > 0).sort((a, b) => b.value - a.value);

  const activeWidgetAsset = tableItems.find(item => item.holding.id === selectedTickerItem);

  const allTableItems = useMemo(() => holdings.map((h) => ({ holding: h, value: holdingValue(h) })).filter((item) => item.value > 0), [holdings]);
  const pieGroups = useMemo(() => Array.from(commandPieGroups(allTableItems, investmentAccounts, investmentPieSettings).values()).filter((group) => group.value > 0 || group.holdings > 0).sort((a, b) => b.value - a.value), [allTableItems, investmentAccounts, investmentPieSettings]);
  const missingCostBasis = filteredHoldings.filter((holding) => holdingNeedsCostBasis(holding));

  const holdingTickerItems: TickerStripItem[] = tableItems.slice(0, 16).map((item) => { return { id: item.holding.id, label: primaryHoldingLabel(item.holding), name: secondaryHoldingLabel(item.holding), valueLabel: unitPriceLabel(item.holding), pct: item.move.pct, source: "holding", holding: item.holding, hasMove: item.move.has }; });
  const latestPopularPoints = new Map<string, PopularMarketTick>();
  popularMarketTicks.forEach((point) => { const ticker = String(point.ticker || "").toUpperCase(); if (!ticker) return; if (!latestPopularPoints.has(ticker)) latestPopularPoints.set(ticker, point); });
  const popularTickerItems = POPULAR_TICKERS.map((item) => { const point = latestPopularPoints.get(item.label.toUpperCase()); return point ? { ...item, valueLabel: formatTickerPointPrice(point), point, hasMove: true } : { ...item, hasMove: true }; });
  const tickerItems = holdingTickerItems.length ? [...holdingTickerItems, ...popularTickerItems.filter((item) => !holdingTickerItems.some((held) => held.label.toUpperCase() === item.label.toUpperCase())).slice(0, Math.max(0, 10 - holdingTickerItems.length))] : popularTickerItems;
  const marqueeTickerItems = tickerItems.length ? [...tickerItems, ...tickerItems] : [];

  const profileMode = (!selectedAccountFilter || selectedAccountFilter === "ALL") ? "Household" : "Account";
  const profileImage = (!selectedAccountFilter || selectedAccountFilter === "ALL") ? "/household-avatar.png" : (people[0]?.avatar_url || "/default-avatar.png");

  return (
    <section className={`min-h-screen w-full max-w-none px-4 py-6 font-sans transition-colors duration-200 sm:px-6 lg:px-8 ${dark ? "bg-[#06080c] text-white" : "bg-slate-50 text-slate-900"}`}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes loopMarquee { 0% { transform: translateX(0%); } 100% { transform: translateX(-50%); } }
        .animate-loop-marquee { display: flex; width: max-content; animation: loopMarquee 45s linear infinite; }
        .animate-loop-marquee:hover { animation-play-state: paused; }
      `}} />

      <div className="w-full space-y-6">
        {hideHeader ? (
          <div className="sticky top-3 z-40 flex justify-end pointer-events-none">
            <button type="button" onClick={toggleTheme} aria-label={`Switch to ${dark ? "light" : "dark"} mode`} className={`pointer-events-auto inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur transition ${dark ? "border-white/10 bg-[#0c1017]/90 text-white hover:bg-white/10" : "border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-50"}`}>
              {dark ? <Sun className="h-3.5 w-3.5 text-amber-500" /> : <Moon className="h-3.5 w-3.5 text-slate-600" />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>
        ) : null}
        
        {/* HEADER */}
        {!hideHeader ? (
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <img src={profileImage} className="w-12 h-12 rounded-full object-cover shadow-sm bg-white/10" alt="Profile" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{profileMode} Portfolio</h1>
                <p className={`mt-0.5 text-xs ${dark ? "text-white/40" : "text-slate-500"}`}>
                  {filterLabel} · {bundledHoldings.length} asset(s) · {filteredHoldings.length} position(s) · {tierLabel}
                </p>
              </div>
            </div>
            
            {/* LIGHT/DARK TOGGLE FIX */}
            <div className="flex items-center gap-3">
              <form action={refreshAllInvestmentPrices}>
                <button type="submit" className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold shadow-sm transition ${dark ? "border-white/10 bg-white/5 text-white hover:bg-white/10" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh prices
                </button>
              </form>
              <button type="button" onClick={toggleTheme} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold shadow-sm transition ${dark ? "border-white/10 bg-white/5 text-white hover:bg-white/10" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
                {dark ? <Sun className="h-3.5 w-3.5 text-amber-500" /> : <Moon className="h-3.5 w-3.5 text-slate-600" />}
                {dark ? "Light mode" : "Dark mode"}
              </button>
            </div>
          </div>
        ) : null}

        <div className={`relative overflow-hidden rounded-2xl border ${dark ? "border-white/10 bg-[#0c1017]" : "border-slate-200 bg-white"}`}>
          <div className="animate-loop-marquee gap-3 px-4 py-3">
            {marqueeTickerItems.map((item, index) => {
              const isUp = item.pct >= 0;
              return (
                <div key={`${item.id}-${index}`} onClick={() => { if (item.holding) setSelectedHolding(item.holding); }} className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-1.5 transition ${dark ? "border-white/5 bg-white/[0.02] hover:bg-white/10" : "border-slate-100 bg-slate-50 hover:bg-slate-100"}`}>
                  {item.holding ? <AssetBadge holding={item.holding} dark={dark} compact /> : <span className={`grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold ${dark ? "bg-white/10 text-white" : "bg-slate-200 text-slate-700"}`}>{item.label.slice(0, 4)}</span>}
                  <div className="min-w-0">
                    <p className={`text-xs font-bold leading-none ${dark ? "text-white" : "text-slate-900"}`}>{item.label}</p>
                    <p className={`mt-0.5 text-[10px] ${dark ? "text-white/40" : "text-slate-500"}`}>{item.valueLabel} / unit</p>
                  </div>
                  <span className={`ml-2 text-xs font-bold ${!item.hasMove ? (dark ? "text-white/30" : "text-slate-400") : isUp ? "text-emerald-500" : "text-rose-500"}`}>
                    {item.hasMove ? `${isUp ? "▲" : "▼"} ${Math.abs(item.pct).toFixed(2)}%` : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* MAIN CHART & RIGHT-RAIL CONTAINER */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_440px]">
          <div className="space-y-6">
            <div className={`rounded-3xl border p-6 ${dark ? "border-white/10 bg-[#0c1017]" : "border-slate-200 bg-white"}`}>
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="max-w-sm space-y-4">
                  <div>
                    <div className={`flex items-center gap-1.5 text-xs font-semibold ${dark ? "text-white/40" : "text-slate-500"}`}>
                      <span>Total portfolio value</span>
                      {selectedAccountFilter && selectedAccountFilter !== "ALL" ? (
                        <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-500">Filtered view</span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-baseline gap-3">
                      <span className={`text-4xl font-extrabold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>{formatMoney(activeTotalValue)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs font-bold">
                      <span className={positive ? "text-emerald-500" : "text-rose-500"}>
                        {positive ? "▲" : "▼"} {periodMove.has ? `${periodMove.change >= 0 ? "+" : ""}${formatMoney(periodMove.change)} (${periodMove.pct.toFixed(2)}%)` : "—"}
                      </span>
                      <span className={dark ? "text-white/40" : "text-slate-400"}>{period}</span>
                    </div>
                  </div>

                  {missingCostBasis.length > 0 ? (
                    <button type="button" onClick={() => { setSidePanel("cost-basis"); setShowCostBasisDrawer(true); }} className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-500 transition hover:bg-amber-500/20">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>{missingCostBasis.length} holdings missing cost basis — add now</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : null}

                  <div className="space-y-2 border-t border-white/10 pt-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>-- Current value (mid)</span>
                      <span className={`font-bold ${dark ? "text-white" : "text-slate-900"}`}>{formatMoney(activeTotalValue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>-- Buy line (cost basis)</span>
                      <span className={`font-bold ${dark ? "text-white" : "text-slate-900"}`}>{activeCostValue > 0 ? formatMoney(activeCostValue) : "—"}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className={`font-medium ${dark ? "text-white/40" : "text-slate-500"}`}>Gain / loss</span>
                      <span className={`font-bold ${activeCostValue > 0 && activeTotalValue >= activeCostValue ? "text-emerald-500" : "text-rose-500"}`}>
                        {activeCostValue > 0 ? `${activeTotalValue >= activeCostValue ? "+" : ""}${formatMoney(activeTotalValue - activeCostValue)} (${((activeTotalValue - activeCostValue) / activeCostValue * 100).toFixed(2)}%)` : "—"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-full flex-1 md:w-auto">
                  <div className="mb-4 flex justify-end">
                    <div className={`flex items-center gap-1 rounded-full p-1 ${dark ? "bg-white/5" : "bg-slate-100"}`}>
                      {PERIODS.map((item) => (
                        <button key={`chart-period-${item}`} type="button" onClick={() => setPeriod(item)} className={`rounded-full px-3 py-1 text-xs font-bold transition ${period === item ? (dark ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30" : "bg-white text-emerald-700 shadow-sm") : dark ? "text-white/50 hover:text-white" : "text-slate-500 hover:text-slate-900"}`}>
                          {item === "MAX" ? "All" : item}
                        </button>
                      ))}
                    </div>
                  </div>
                  <PortfolioChart points={portfolioPoints} costValue={activeCostValue} positive={positive} dark={dark} />
                </div>
              </div>
            </div>

            <DiversificationBars holdings={bundledHoldings} snapshots={snapshots} totalValue={activeTotalValue} period={period} dark={dark} onOpenOther={(items) => { setOtherHoldings(items); setSidePanel("other"); }} onOpenHolding={(holding) => { setSelectedHolding(holding); }} />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? "text-white/40" : "text-slate-500"}`}>Accounts, pies and groups</p>
                </div>
                {selectedAccountFilter && selectedAccountFilter !== "ALL" ? (
                  <button type="button" onClick={() => setSelectedAccountFilter(null)} className="flex items-center gap-1 text-xs font-semibold text-emerald-500 hover:text-emerald-600">
                    <Filter className="h-3.5 w-3.5" /> Clear filter ({selectedAccountFilter})
                  </button>
                ) : null}
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                <div onClick={() => setSelectedAccountFilter(null)} className={`flex cursor-pointer flex-col justify-between rounded-2xl border p-4 transition ${(!selectedAccountFilter || selectedAccountFilter === "ALL") ? (dark ? "border-emerald-500/80 bg-emerald-500/10" : "border-emerald-500/50 bg-emerald-50") : dark ? "border-white/10 bg-[#0c1017] hover:border-white/20" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <div>
                    <div className="mb-3 flex items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500 text-xs font-extrabold text-black">ALL</span>
                      <div className="min-w-0">
                        <p className={`truncate text-xs font-bold ${dark ? "text-white" : "text-slate-900"}`}>All Accounts</p>
                        <p className={`truncate text-[10px] ${dark ? "text-white/40" : "text-slate-500"}`}>Household aggregate</p>
                      </div>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className={`text-base font-bold ${dark ? "text-white" : "text-slate-900"}`}>{formatMoney(totalValue)}</span>
                      <span className="text-xs font-semibold text-emerald-500">100.0%</span>
                    </div>
                  </div>
                </div>

                {pieGroups.map((group, idx) => {
                  const share = totalValue > 0 ? (group.value / totalValue) * 100 : 0;
                  const colours = ["bg-blue-500", "bg-purple-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];
                  const circleColour = colours[idx % colours.length];
                  const isSelected = selectedAccountFilter === group.key;
                  return (
                    <div key={group.key} onClick={() => setSelectedAccountFilter(isSelected ? null : group.key)} className={`flex cursor-pointer flex-col justify-between rounded-2xl border p-4 transition ${isSelected ? (dark ? "border-emerald-500/80 bg-emerald-500/10" : "border-emerald-500/50 bg-emerald-50") : dark ? "border-white/10 bg-[#0c1017] hover:border-white/20" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                      <div>
                        <div className="mb-3 flex items-center gap-3">
                          <span className={`h-8 w-8 rounded-full ${circleColour} grid shrink-0 place-items-center text-xs font-extrabold text-white`}>{group.groupLabel.slice(0, 2).toUpperCase()}</span>
                          <div className="min-w-0">
                            <p className={`truncate text-xs font-bold ${dark ? "text-white" : "text-slate-900"}`}>{group.groupLabel}</p>
                            <p className={`truncate text-[10px] ${dark ? "text-white/40" : "text-slate-500"}`}>{group.accountLabel}</p>
                          </div>
                        </div>
                        <div className="flex items-baseline justify-between">
                          <span className={`text-base font-bold ${dark ? "text-white" : "text-slate-900"}`}>{formatMoney(group.value)}</span>
                          <span className="text-xs font-semibold text-emerald-500">{share.toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* INTERACTIVE HOLDINGS GRID WITH STICKY CHART */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative items-start mt-6">
              
              {/* LEFT COLUMN: TABLE */}
              <div className={`lg:col-span-2 rounded-3xl border p-6 ${dark ? "border-white/10 bg-[#0c1017]" : "border-slate-200 bg-white"}`}>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className={`text-base font-bold ${dark ? "text-white" : "text-slate-900"}`}>All holdings ({tableItems.length})</h3>
                    <p className={`text-xs ${dark ? "text-white/40" : "text-slate-500"}`}>Scroll and click any asset to inspect deep performance analytics.</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${dark ? "bg-white/5 text-white/60" : "bg-slate-100 text-slate-500"}`}>
                    {selectedAccountFilter && selectedAccountFilter !== "ALL" ? "Filtered list" : "Full household"}
                  </span>
                </div>

                {/* Mobile: clean stacked cards, matching Trading212's own
                    style — no horizontal scrolling, no squeezed columns.
                    Desktop keeps the table below, which works fine at
                    that width. */}
                <div className="space-y-2 lg:hidden">
                  {tableItems.map((item) => {
                    const isUp = item.move.pct >= 0;
                    const isSelected = selectedTickerItem === item.holding.id;
                    return (
                      <button
                        key={item.holding.id}
                        type="button"
                        onClick={() => setSelectedTickerItem(item.holding.id)}
                        className={`w-full rounded-2xl border p-3 text-left transition-colors ${isSelected ? (dark ? "border-emerald-500/40 bg-white/10" : "border-emerald-200 bg-emerald-50") : (dark ? "border-white/10 bg-white/[0.02]" : "border-slate-200 bg-white")}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <AssetBadge holding={item.holding} dark={dark} />
                            <div className="min-w-0">
                              <p className={`truncate font-bold ${isSelected ? "text-emerald-500" : (dark ? "text-white" : "text-slate-900")}`}>{primaryHoldingLabel(item.holding)}</p>
                              <p className={`truncate text-[11px] ${dark ? "text-white/40" : "text-slate-500"}`}>{secondaryHoldingLabel(item.holding)}</p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={`font-bold ${dark ? "text-white" : "text-slate-900"}`}>{formatMoney(item.value)}</p>
                            <p className={`text-xs font-bold ${!item.move.has ? (dark ? "text-white/30" : "text-slate-400") : isUp ? "text-emerald-500" : "text-rose-500"}`}>
                              {item.move.has ? `${isUp ? "▲" : "▼"} ${Math.abs(item.move.pct).toFixed(2)}%` : "—"}
                            </p>
                          </div>
                        </div>
                        <div className={`mt-2 flex items-center justify-between border-t pt-2 text-[11px] ${dark ? "border-white/5 text-white/50" : "border-slate-100 text-slate-500"}`}>
                          <span>Price {unitPriceLabel(item.holding)}</span>
                          <span>Cost {holdingCost(item.holding) > 0 ? formatMoney(averageHoldingPrice(item.holding)) : <span className="font-bold text-amber-500">Missing</span>}</span>
                        </div>
                        {/* Tap-to-expand chart, right in the card — mobile
                            never had this before at all (the chart panel
                            was desktop-only), same data the desktop sticky
                            panel already uses, no extra fetch needed. */}
                        {isSelected ? (
                          <div className={`mt-3 border-t pt-3 ${dark ? "border-white/10" : "border-slate-100"}`} onClick={(e) => e.stopPropagation()}>
                            <div className={`h-40 w-full rounded-2xl border ${dark ? "border-white/10 bg-[#06080c]" : "border-slate-200 bg-slate-50"}`}>
                              <AssetMiniChart points={item.points} positive={item.move.pct >= 0} dark={dark} />
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                              <div>
                                <p className={`text-[10px] font-bold uppercase tracking-wide ${dark ? "text-white/40" : "text-slate-500"}`}>Value</p>
                                <p className={`text-sm font-bold ${dark ? "text-white" : "text-slate-900"}`}>{formatMoney(item.value)}</p>
                              </div>
                              <div>
                                <p className={`text-[10px] font-bold uppercase tracking-wide ${dark ? "text-white/40" : "text-slate-500"}`}>Day move</p>
                                <p className={`text-sm font-bold ${item.move.pct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{item.move.pct >= 0 ? "+" : ""}{item.move.pct.toFixed(2)}%</p>
                              </div>
                              <div>
                                <p className={`text-[10px] font-bold uppercase tracking-wide ${dark ? "text-white/40" : "text-slate-500"}`}>Allocation</p>
                                <p className="text-sm font-bold text-emerald-500">{item.allocation.toFixed(2)}%</p>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className={`border-b text-[10px] font-bold uppercase tracking-wider ${dark ? "border-white/10 text-white/40" : "border-slate-200 text-slate-400"}`}>
                        <th className="py-3 pl-2">Asset</th>
                        <th className="py-3 text-right">Price (mid)</th>
                        <th className="py-3 text-right">Day Move</th>
                        <th className="py-3 text-right">Cost / unit</th>
                        <th className="py-3 text-right">Total Value</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y text-xs font-medium ${dark ? "divide-white/5" : "divide-slate-100"}`}>
                      {tableItems.map((item) => {
                        const isUp = item.move.pct >= 0;
                        const isSelected = selectedTickerItem === item.holding.id;
                        return (
                          <tr key={item.holding.id} onClick={() => setSelectedTickerItem(item.holding.id)} className={`cursor-pointer transition-colors ${isSelected ? (dark ? "bg-white/10" : "bg-slate-100") : (dark ? "hover:bg-white/5" : "hover:bg-slate-50")}`}>
                            <td className="py-3 pl-2">
                              <div className="flex items-center gap-3">
                                <AssetBadge holding={item.holding} dark={dark} />
                                <div>
                                  <p className={`font-bold transition-colors ${isSelected ? "text-emerald-500" : (dark ? "text-white" : "text-slate-900")}`}>{primaryHoldingLabel(item.holding)}</p>
                                  <p className={`text-[10px] ${dark ? "text-white/40" : "text-slate-500"}`}>{secondaryHoldingLabel(item.holding)}</p>
                                </div>
                              </div>
                            </td>
                            <td className={`py-3 text-right font-semibold ${dark ? "text-white" : "text-slate-900"}`}>{unitPriceLabel(item.holding)}</td>
                            <td className={`py-3 text-right font-bold ${!item.move.has ? (dark ? "text-white/30" : "text-slate-400") : isUp ? "text-emerald-500" : "text-rose-500"}`}>
                              {item.move.has ? `${isUp ? "▲" : "▼"} ${Math.abs(item.move.pct).toFixed(2)}%` : "—"}
                            </td>
                            <td className={`py-3 text-right font-semibold ${dark ? "text-white/70" : "text-slate-600"}`}>
                              {holdingCost(item.holding) > 0 ? formatMoney(averageHoldingPrice(item.holding)) : <span className="text-amber-500 font-bold">Missing</span>}
                            </td>
                            <td className={`py-3 pr-2 text-right font-bold ${dark ? "text-white" : "text-slate-900"}`}>{formatMoney(item.value)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* RIGHT COLUMN: STICKY CHART WIDGET */}
              {/* FIX: Removed vertical height stretching so it doesn't break the layout. It's now a clean, fixed-size card. */}
              <div className="lg:col-span-1 relative hidden lg:block h-full">
                 <div className={`sticky top-24 rounded-3xl border p-6 shadow-2xl ${dark ? "border-white/10 bg-[#0c1017]" : "border-slate-200 bg-white"}`}>
                    {activeWidgetAsset ? (
                       <div>
                         {/* Asset Title Bar */}
                         <div className="flex items-center gap-4 mb-6">
                           <AssetBadge holding={activeWidgetAsset.holding} dark={dark} />
                           <div>
                             <h3 className={`text-xl font-bold ${dark ? "text-white" : "text-slate-900"}`}>{primaryHoldingLabel(activeWidgetAsset.holding)}</h3>
                             <p className={`text-xs ${dark ? "text-white/40" : "text-slate-500"}`}>{secondaryHoldingLabel(activeWidgetAsset.holding)}</p>
                           </div>
                         </div>
                         
                         {/* Real Asset Chart Rendering - Fixed to a clean h-56 */}
                         <div className={`h-56 w-full rounded-2xl border ${dark ? "border-white/10 bg-[#06080c]" : "border-slate-200 bg-slate-50"}`}>
                           <AssetMiniChart points={activeWidgetAsset.points} positive={activeWidgetAsset.move.pct >= 0} dark={dark} />
                         </div>
                         
                         {/* Financial Snapshot */}
                         <div className="mt-6 space-y-4">
                            <div className={`flex items-center justify-between border-b pb-3 ${dark ? "border-white/5" : "border-slate-100"}`}>
                               <p className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-white/40" : "text-slate-500"}`}>Current Value</p>
                               <p className={`text-lg font-bold ${dark ? "text-white" : "text-slate-900"}`}>{formatMoney(activeWidgetAsset.value)}</p>
                            </div>
                            <div className={`flex items-center justify-between border-b pb-3 ${dark ? "border-white/5" : "border-slate-100"}`}>
                               <p className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-white/40" : "text-slate-500"}`}>Day Move</p>
                               <p className={`text-lg font-bold ${activeWidgetAsset.move.pct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                 {activeWidgetAsset.move.pct >= 0 ? "+" : ""}{activeWidgetAsset.move.change ? formatMoney(activeWidgetAsset.move.change) : "0.00"} ({activeWidgetAsset.move.pct.toFixed(2)}%)
                               </p>
                            </div>
                            <div className="flex items-center justify-between pb-3">
                               <p className={`text-xs font-bold uppercase tracking-wider ${dark ? "text-white/40" : "text-slate-500"}`}>Allocation</p>
                               <p className="text-lg font-bold text-emerald-500">{activeWidgetAsset.allocation.toFixed(2)}%</p>
                            </div>
                         </div>
                       </div>
                    ) : (
                       <div className="h-64 flex flex-col items-center justify-center text-center px-4">
                          <div className={`grid h-12 w-12 place-items-center rounded-full mb-4 ${dark ? "bg-white/5 text-white/30" : "bg-slate-100 text-slate-400"}`}>
                            <TrendingUp className="h-6 w-6" />
                          </div>
                          <p className={`text-sm font-bold mb-1 ${dark ? "text-white/50" : "text-slate-600"}`}>No asset selected</p>
                          <p className={`text-xs ${dark ? "text-white/30" : "text-slate-400"}`}>Click a holding from the list on the left to view its real-time chart and performance metrics.</p>
                       </div>
                    )}
                 </div>
              </div>
            </div>
          </div>

          {/* FAR RIGHT COLUMN (Side Panel for Cost Basis & Summary) */}
          <div className="h-full relative">
            <div className="sticky top-24 h-[calc(100vh-7rem)]">
              {sidePanel === "cost-basis" ? (
                <CostBasisRail holdings={filteredHoldings} dark={dark} onOpenFull={() => setShowCostBasisDrawer(true)} onClose={() => setSidePanel("summary")} />
              ) : sidePanel === "other" ? (
                <OtherHoldingsRail holdings={otherHoldings} snapshots={snapshots} period={period} dark={dark} onClose={() => setSidePanel("summary")} onExpand={() => setShowOtherHoldingsDrawer(true)} />
              ) : (
                <div className={`flex h-full flex-col justify-between rounded-3xl border p-6 ${dark ? "border-white/10 bg-[#0c1017]" : "border-slate-200 bg-white"}`}>
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? "text-white/40" : "text-slate-500"}`}>Portfolio summary</p>
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-500">Live sync</span>
                    </div>
                    <h3 className={`mb-1 text-2xl font-bold ${dark ? "text-white" : "text-slate-900"}`}>{formatMoney(activeTotalValue)}</h3>
                    <p className={`mb-6 text-xs ${dark ? "text-white/40" : "text-slate-500"}`}>Aggregate across {bundledHoldings.length} tracked entities</p>
                    <div className="space-y-4">
                      <div className={`rounded-2xl border p-4 ${dark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50"}`}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className={dark ? "text-white/40" : "text-slate-500"}>Selected Period Move</span>
                          <span className={`font-bold ${positive ? "text-emerald-500" : "text-rose-500"}`}>{periodMove.has ? `${periodMove.change >= 0 ? "+" : ""}${formatMoney(periodMove.change)} (${periodMove.pct.toFixed(2)}%)` : "—"}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className={dark ? "text-white/40" : "text-slate-500"}>Total Cost Basis</span>
                          <span className={`font-bold ${dark ? "text-white" : "text-slate-900"}`}>{activeCostValue > 0 ? formatMoney(activeCostValue) : "Not verified"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 pt-6">
                    {missingCostBasis.length > 0 ? (
                      <button type="button" onClick={() => setSidePanel("cost-basis")} className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 py-2.5 text-xs font-bold text-amber-600 dark:text-amber-500 transition hover:bg-amber-500/20">
                        <AlertTriangle className="h-4 w-4" /> Resolve {missingCostBasis.length} missing cost basis
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* KNOWN GAP (not silently fixed): CostBasisDrawer/OtherHoldingsDrawer
          were referenced here but never actually built anywhere in this
          file — only the Rail (side-panel) versions above exist and work.
          The "expand to full drawer" buttons (onOpenFull/onExpand) still
          set showCostBasisDrawer/showOtherHoldingsDrawer to true, but
          nothing currently renders when they do — clicking "expand" is
          currently a no-op rather than a crash. Building the actual full
          drawer components is real, separate work if this feature is
          wanted. */}
    </section>
  );
}
