import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { currencyForExchange, fxToGbp, normaliseExchangeCode } from "@/lib/investments/fx";
import { investmentDataEntitlementForProfile } from "@/lib/wealth/user-tiers";

export const runtime = "nodejs";

type SnapshotRow = {
  holding_id: string;
  snapshot_at: string | null;
  snapshot_date: string | null;
  price: number | null;
  units: number | null;
  value: number | null;
  native_price?: number | null;
  native_value?: number | null;
  native_currency?: string | null;
  fx_rate_to_gbp?: number | null;
  source: string | null;
  investment_holdings?: { investment_account_id?: string | null; asset_name?: string | null } | null;
};

type HoldingRow = {
  id: string;
  investment_account_id: string;
  ticker: string | null;
  exchange: string | null;
  latest_price: number | null;
  units: number | null;
  imported_current_value?: number | null;
  asset_name?: string | null;
  source_url?: string | null;
  currency?: string | null;
  native_currency?: string | null;
};

type ChartPoint = { at: string; label: string; price: number; value: number; source: string };
type HoldingSeries = { holdingId: string; points: Array<{ at: string; value: number; price: number }> };

function sinceForRange(range: string) {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  if (range === "1d") return new Date(now.getTime() - dayMs).toISOString();
  if (range === "5d") return new Date(now.getTime() - 5 * dayMs).toISOString();
  if (range === "1m") return new Date(now.getTime() - 31 * dayMs).toISOString();
  if (range === "6m") return new Date(now.getTime() - 183 * dayMs).toISOString();
  if (range === "ytd") return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  if (range === "1y") return new Date(now.getTime() - 366 * dayMs).toISOString();
  if (range === "5y") return new Date(now.getTime() - 366 * 5 * dayMs).toISOString();
  if (range === "max") return "1970-01-01T00:00:00.000Z";
  return new Date(now.getTime() - 31 * dayMs).toISOString();
}

function yahooRange(range: string) {
  if (range === "1d") return "1d";
  if (range === "5d") return "5d";
  if (range === "6m") return "6mo";
  if (range === "ytd") return "ytd";
  if (range === "1y") return "1y";
  if (range === "5y") return "5y";
  if (range === "max") return "5y";
  return "1mo";
}

function yahooInterval(range: string) {
  if (range === "1d") return "5m";
  if (range === "5d") return "30m";
  return "1d";
}

function isGbxHolding(holding: HoldingRow) {
  const ex = normaliseExchangeCode(holding.exchange);
  const native = String(holding.native_currency || holding.currency || "").toUpperCase();
  return ex === "LSE" || native === "GBX";
}
function latestPriceGbp(holding: HoldingRow) {
  const latest = Number(holding.latest_price || 0);
  if (!latest) return 0;
  if (isGbxHolding(holding)) {
    const imported = Number(holding.imported_current_value || 0);
    const units = Number(holding.units || 0);
    const rawPenceValue = units * latest;
    if ((imported > 0 && Math.abs(imported - rawPenceValue) < Math.max(1, imported * 0.02)) || latest > 20) return latest / 100;
  }
  return latest;
}
function holdingValue(holding: HoldingRow) {
  const imported = Number(holding.imported_current_value || 0);
  if (imported > 0) {
    const units = Number(holding.units || 0);
    const latest = Number(holding.latest_price || 0);
    if (isGbxHolding(holding) && units > 0 && latest > 0) {
      const rawPenceValue = units * latest;
      if (Math.abs(imported - rawPenceValue) < Math.max(1, imported * 0.02)) return imported / 100;
    }
    return imported;
  }
  return Number(holding.units || 0) * latestPriceGbp(holding);
}

function labelFor(value: string, range = "1m") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (range === "1d") return date.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (range === "5d") return date.toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short" });
}

function yahooSymbol(ticker: string | null, exchange: string | null) {
  const clean = String(ticker || "").trim().toUpperCase();
  if (!clean) return "";
  if (clean.includes(".")) return clean;
  const ex = normaliseExchangeCode(exchange);
  if (ex === "LSE") return `${clean}.L`;
  return clean;
}

function downsample<T>(items: T[], max = 180) {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  return items.filter((_, index) => index % step === 0 || index === items.length - 1);
}

function compactNearDuplicatePoints(points: ChartPoint[]) {
  const map = new Map<string, ChartPoint>();
  for (const point of points) map.set(point.at, point);
  return Array.from(map.values()).sort((a, b) => a.at.localeCompare(b.at));
}

function sanePoints(points: ChartPoint[], currentValue: number) {
  const deduped = compactNearDuplicatePoints(points);
  if (!currentValue || currentValue <= 0) return deduped;
  const lowCut = Math.max(0.01, currentValue * 0.02);
  const highCut = currentValue * 20;
  const filtered = deduped.filter((point) => {
    const value = Number(point.value || 0);
    return Number.isFinite(value) && value >= lowCut && value <= highCut;
  });
  return filtered.length >= 2 ? filtered : deduped.filter((point) => Number(point.value || 0) > 0);
}

async function fetchHoldingHistory(holding: HoldingRow, range: string): Promise<HoldingSeries | null> {
  const symbol = yahooSymbol(holding.ticker, holding.exchange);
  const units = Number(holding.units || 0);
  if (!symbol || units <= 0) return null;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(yahooRange(range))}&interval=${encodeURIComponent(yahooInterval(range))}`;
  try {
    const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    const result = payload?.chart?.result?.[0];
    const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
    const closes: Array<number | null> = Array.isArray(result?.indicators?.quote?.[0]?.close) ? result.indicators.quote[0].close : [];
    if (!timestamps.length || !closes.length) return null;
    const ex = normaliseExchangeCode(holding.exchange || result?.meta?.exchangeName);
    const nativeCurrency = String(result?.meta?.currency || holding.native_currency || currencyForExchange(ex, holding.currency)).toUpperCase();
    const lseOrPence = ex === "LSE" || (nativeCurrency === "GBP" && symbol.endsWith(".L")) || nativeCurrency === "GBX" || (String(result?.meta?.currency || "").toUpperCase() === "GBP" && symbol.endsWith(".L"));
    const fx = await fxToGbp(lseOrPence ? "GBP" : nativeCurrency);
    const points = timestamps.map((stamp, index) => {
      const close = Number(closes[index] || 0);
      if (!Number.isFinite(close) || close <= 0) return null;
      const nativeGbp = lseOrPence ? close / 100 : close;
      const price = nativeGbp * fx.rate;
      return { at: new Date(stamp * 1000).toISOString(), price, value: price * units };
    }).filter(Boolean) as Array<{ at: string; price: number; value: number }>;
    return points.length ? { holdingId: holding.id, points } : null;
  } catch {
    return null;
  }
}

async function generatedMarketHistory(holdings: HoldingRow[], range: string) {
  const series = (await Promise.all(holdings.map((holding) => fetchHoldingHistory(holding, range)))).filter(Boolean) as HoldingSeries[];
  if (!series.length) return [] as ChartPoint[];
  const times = Array.from(new Set(series.flatMap((item) => item.points.map((point) => point.at)))).sort();
  const indexBySeries = series.map(() => 0);
  const minCoverage = Math.max(1, Math.ceil(series.length * 0.78));
  const aggregated = times.map((at) => {
    let value = 0;
    let price = 0;
    let count = 0;
    series.forEach((item, seriesIndex) => {
      while (indexBySeries[seriesIndex] < item.points.length - 1 && item.points[indexBySeries[seriesIndex] + 1].at <= at) {
        indexBySeries[seriesIndex] += 1;
      }
      const point = item.points[indexBySeries[seriesIndex]];
      if (point && point.at <= at) {
        value += point.value;
        price += point.price;
        count += 1;
      }
    });
    return { at, label: labelFor(at, range), price: count ? price / count : 0, value, source: "Yahoo delayed historical market data", coverage: count };
  })
    .filter((point) => point.value > 0 && point.coverage >= minCoverage)
    .map(({ coverage: _coverage, ...point }) => point);
  return downsample(aggregated, range === "1d" ? 96 : 180);
}


export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const holdingId = request.nextUrl.searchParams.get("holdingId");
  const accountId = request.nextUrl.searchParams.get("accountId");
  const range = request.nextUrl.searchParams.get("range") || "1m";
  const since = sinceForRange(range);

  const { data: profile } = await supabase
    .from("app_user_profiles")
    .select("payment_tier, payment_tier_status, payment_tier_override, market_data_tier, market_data_tier_override, market_data_provider_status, market_data_realtime_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  const entitlement = investmentDataEntitlementForProfile(profile);

  if (!holdingId && !accountId) {
    return NextResponse.json({ error: "Provide holdingId or accountId" }, { status: 400 });
  }

  let holdingsQuery: any = supabase
    .from("investment_holdings")
    .select("id, investment_account_id, ticker, exchange, latest_price, units, imported_current_value, asset_name, source_url, currency, native_currency")
    .eq("user_id", user.id);
  if (holdingId) holdingsQuery = holdingsQuery.eq("id", holdingId);
  if (accountId) holdingsQuery = holdingsQuery.eq("investment_account_id", accountId);
  const holdingsResult = await holdingsQuery;
  const currentHoldings = (holdingsResult.data || []) as HoldingRow[];
  const holdingsError = holdingsResult.error;
  if (holdingsError) return NextResponse.json({ error: holdingsError.message }, { status: 500 });

  let query: any = supabase
    .from("investment_price_snapshots")
    .select("holding_id, snapshot_at, snapshot_date, price, units, value, native_price, native_value, native_currency, fx_rate_to_gbp, source, investment_holdings!inner(investment_account_id, asset_name)")
    .eq("user_id", user.id)
    .gte("snapshot_at", since)
    .order("snapshot_at", { ascending: true })
    .limit(5000);

  if (holdingId) query = query.eq("holding_id", holdingId);
  if (accountId) query = query.eq("investment_holdings.investment_account_id", accountId);

  const snapshotResult = await query;
  const data = (snapshotResult.data || []) as SnapshotRow[];
  const error = snapshotResult.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byTime = new Map<string, { at: string; priceTotal: number; valueTotal: number; count: number; sources: Set<string> }>();
  for (const row of data || []) {
    const at = row.snapshot_at || row.snapshot_date || "";
    if (!at) continue;
    const item = byTime.get(at) || { at, priceTotal: 0, valueTotal: 0, count: 0, sources: new Set<string>() };
    const fxRate = Number(row.fx_rate_to_gbp || 0) > 0 ? Number(row.fx_rate_to_gbp) : 1;
    const gbpPrice = row.native_price !== undefined && row.native_price !== null ? Number(row.native_price || 0) * fxRate : Number(row.price || 0);
    const gbpValue = row.native_value !== undefined && row.native_value !== null ? Number(row.native_value || 0) * fxRate : Number(row.value || (gbpPrice * Number(row.units || 0)));
    item.priceTotal += gbpPrice;
    item.valueTotal += gbpValue;
    item.count += 1;
    if (row.source) item.sources.add(row.source);
    byTime.set(at, item);
  }

  let points = Array.from(byTime.values()).map((item) => ({
    at: item.at,
    label: labelFor(item.at, range),
    price: item.count > 0 ? item.priceTotal / item.count : 0,
    value: item.valueTotal,
    source: Array.from(item.sources).join(", "),
  }));

  const currentValue = (currentHoldings || []).reduce((sum, holding) => sum + holdingValue(holding), 0);
  const currentPrice = holdingId && currentHoldings?.[0] ? Number(currentHoldings[0].latest_price || 0) : (currentHoldings?.length ? currentHoldings.reduce((sum, holding) => sum + Number(holding.latest_price || 0), 0) / currentHoldings.length : 0);
  const generated = entitlement.canUseDelayedPrices || entitlement.canUseRealtimePrices ? await generatedMarketHistory(currentHoldings, range) : [];
  const sanitized = sanePoints(points, currentValue);
  points = generated.length >= Math.max(4, sanitized.length) ? generated : sanitized;

  if (currentHoldings?.length && Number.isFinite(currentValue) && currentValue >= 0) {
    const nowIso = new Date().toISOString();
    const last = points[points.length - 1];
    const latestDiffers = !last || Math.abs(Number(last.value || 0) - currentValue) > Math.max(0.01, currentValue * 0.002) || Math.abs(Number(last.price || 0) - currentPrice) > 0.000001;
    if (latestDiffers) {
      points.push({
        at: nowIso,
        label: labelFor(nowIso, range),
        price: currentPrice,
        value: currentValue,
        source: "current saved holding value",
      });
    } else if (last) {
      last.source = [last.source, "current saved holding value"].filter(Boolean).join(", ");
    }
  }

  points = compactNearDuplicatePoints(points).map((point) => ({ ...point, label: labelFor(point.at, range) }));

  return NextResponse.json({ ok: true, range, mode: holdingId ? "holding" : "account", currentValue, points, entitlement, sourceNote: generated.length >= 4 ? `${entitlement.canUseRealtimePrices ? "Realtime tier enabled; this chart currently uses provider/Yahoo history where available" : "Generated from delayed Yahoo historical market data"} with GBP conversion, then anchored to the saved app value.` : "Using native app price snapshots converted to GBP for display, cleaned for obvious pence/currency outliers, then anchored to the saved app value." });
}
