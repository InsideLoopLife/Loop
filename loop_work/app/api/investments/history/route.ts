import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdContext } from "@/lib/auth/household-context";
import {
  currencyForExchange,
  fxToGbp,
  normaliseExchangeCode,
} from "@/lib/investments/fx";
import {
  yahooProviderSymbols,
  venueFor,
} from "@/lib/investments/market-venues";
import { investmentDataEntitlementForProfile } from "@/lib/wealth/user-tiers";
import {
  buildPortfolioHistory,
  snapshotPriceGbp,
  snapshotValueGbp,
} from "@/lib/investments/portfolio-history";
import {
  bucketIntervalForRange,
  historySpansSelectedRange,
  yahooIntervalForChart,
  yahooRangeForChart,
} from "@/lib/investments/history-range";

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
  snapshot_batch_id?: string | null;
  investment_holdings?: {
    investment_account_id?: string | null;
    asset_name?: string | null;
  } | null;
};

type HoldingRow = {
  id: string;
  investment_account_id: string;
  listing_id?: string | null;
  instrument_id?: string | null;
  ticker: string | null;
  exchange: string | null;
  latest_price: number | null;
  units: number | null;
  imported_current_value?: number | null;
  asset_name?: string | null;
  source_url?: string | null;
  currency?: string | null;
  native_currency?: string | null;
  price_polling_enabled?: boolean | null;
  isin?: string | null;
  day_change_percent?: number | null;
  day_change_native_percent?: number | null;
  day_change_gbp?: number | null;
  day_change_native?: number | null;
  native_latest_price?: number | null;
  previous_close_price_gbp?: number | null;
  previous_close_native_price?: number | null;
  previous_close_at?: string | null;
};

type ChartPoint = {
  at: string;
  label: string;
  price: number;
  value: number;
  source: string;
};
type HoldingSeries = {
  holdingId: string;
  points: Array<{ at: string; value: number; price: number }>;
};

type MarketHistoryResult = {
  points: ChartPoint[];
  coveragePercent: number;
  selectedHoldings: number;
  totalHoldings: number;
  source: "stored_instrument_history" | "direct_market_history";
};

type HistoryStage = {
  key: "portfolio_snapshots" | "stored_instrument_history" | "direct_market_history" | "current_baseline";
  label: string;
  status: "used" | "available" | "missing" | "skipped";
  points: number;
  coveragePercent: number | null;
  note: string;
};

function sinceForRange(range: string) {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  if (range === "1d") return new Date(now.getTime() - dayMs).toISOString();
  if (range === "5d") return new Date(now.getTime() - 5 * dayMs).toISOString();
  if (range === "1m") return new Date(now.getTime() - 31 * dayMs).toISOString();
  if (range === "6m")
    return new Date(now.getTime() - 183 * dayMs).toISOString();
  if (range === "ytd")
    return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  if (range === "1y")
    return new Date(now.getTime() - 366 * dayMs).toISOString();
  if (range === "5y")
    return new Date(now.getTime() - 366 * 5 * dayMs).toISOString();
  if (range === "max") return "1970-01-01T00:00:00.000Z";
  return new Date(now.getTime() - 31 * dayMs).toISOString();
}

function yahooRange(range: string) {
  return yahooRangeForChart(range);
}

function yahooInterval(range: string) {
  return yahooIntervalForChart(range);
}

function isGbxHolding(holding: HoldingRow) {
  const ex = normaliseExchangeCode(holding.exchange);
  const native = String(
    holding.native_currency || holding.currency || "",
  ).toUpperCase();
  return ex === "LSE" || native === "GBX";
}
function latestPriceGbp(holding: HoldingRow) {
  const latest = Number(holding.latest_price || 0);
  if (!latest) return 0;
  if (isGbxHolding(holding)) {
    const imported = Number(holding.imported_current_value || 0);
    const units = Number(holding.units || 0);
    const rawPenceValue = units * latest;
    if (
      (imported > 0 &&
        Math.abs(imported - rawPenceValue) < Math.max(1, imported * 0.02)) ||
      latest > 20
    )
      return latest / 100;
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
      if (Math.abs(imported - rawPenceValue) < Math.max(1, imported * 0.02))
        return imported / 100;
    }
    return imported;
  }
  return Number(holding.units || 0) * latestPriceGbp(holding);
}

function labelFor(value: string, range = "1m") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (range === "1d")
    return date.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (range === "5d")
    return date.toLocaleString("en-GB", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short" });
}

function yahooSymbolsForHolding(holding: Pick<HoldingRow, "ticker" | "exchange" | "isin" | "asset_name">) {
  const clean = String(holding.ticker || holding.isin || "")
    .trim()
    .toUpperCase();
  if (!clean) return [] as string[];
  const fromVenue = yahooProviderSymbols(clean, holding.exchange);
  if (fromVenue.length) return fromVenue;
  if (clean.includes(".")) return [clean];
  const ex = normaliseExchangeCode(holding.exchange);
  if (ex === "LSE") return [`${clean}.L`];
  return [clean];
}

function downsample<T>(items: T[], max = 180) {
  if (items.length <= max) return items;
  const step = Math.ceil(items.length / max);
  return items.filter(
    (_, index) => index % step === 0 || index === items.length - 1,
  );
}

function maxPointsForRange(range: string) {
  if (range === "1d") return 520; // one trading day of 1-minute points plus extended sessions.
  if (range === "5d") return 520; // after retention this should be around 15-minute points.
  if (range === "1m") return 760;
  if (range === "6m") return 900;
  if (range === "ytd") return 1100;
  if (range === "1y") return 1300;
  if (range === "5y") return 1600;
  return 1800;
}

function compactNearDuplicatePoints(points: ChartPoint[]) {
  const map = new Map<string, ChartPoint>();
  for (const point of points) map.set(point.at, point);
  return Array.from(map.values()).sort((a, b) => a.at.localeCompare(b.at));
}

function median(values: number[]) {
  const clean = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!clean.length) return 0;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function stripBoundarySpikes(points: ChartPoint[]) {
  if (points.length < 8) return points;
  const values = points.map((point) => Number(point.value || 0));
  const mid = median(values.slice(1, -1));
  if (!mid || !Number.isFinite(mid)) return points;
  const cleaned = [...points];
  const first = values[0];
  const second = values[1];
  const last = values[values.length - 1];
  const penultimate = values[values.length - 2];
  const jumpLimit = Math.max(mid * 0.22, 5);
  if (
    Math.abs(first - second) > jumpLimit &&
    Math.abs(first - mid) > Math.abs(second - mid) * 2.2
  )
    cleaned.shift();
  if (cleaned.length >= 8) {
    const latestValues = cleaned.map((point) => Number(point.value || 0));
    const cleanedMid = median(latestValues.slice(1, -1));
    const lastNow = latestValues[latestValues.length - 1];
    const beforeLast = latestValues[latestValues.length - 2];
    const latestLimit = Math.max(cleanedMid * 0.22, 5);
    if (
      Math.abs(lastNow - beforeLast) > latestLimit &&
      Math.abs(lastNow - cleanedMid) > Math.abs(beforeLast - cleanedMid) * 2.2
    )
      cleaned.pop();
  }
  return cleaned;
}

function sanePoints(points: ChartPoint[], currentValue: number) {
  const deduped = stripBoundarySpikes(compactNearDuplicatePoints(points));
  if (!currentValue || currentValue <= 0)
    return deduped.filter((point) => Number(point.value || 0) > 0);
  const values = deduped
    .map((point) => Number(point.value || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const mid = median(values);
  const lowCut = Math.max(
    0.01,
    Math.min(currentValue, mid || currentValue) * 0.08,
  );
  const highCut = Math.max(currentValue, mid || currentValue) * 8;
  const filtered = deduped.filter((point) => {
    const value = Number(point.value || 0);
    return Number.isFinite(value) && value >= lowCut && value <= highCut;
  });
  return filtered.length >= 2
    ? stripBoundarySpikes(filtered)
    : deduped.filter((point) => Number(point.value || 0) > 0);
}

async function fetchHoldingHistory(
  holding: HoldingRow,
  range: string,
): Promise<HoldingSeries | null> {
  const symbols = yahooSymbolsForHolding(holding);
  const units = Number(holding.units || 0);
  if (!symbols.length || units <= 0) return null;
  for (const symbol of symbols) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(yahooRange(range))}&interval=${encodeURIComponent(yahooInterval(range))}`;
    try {
      const response = await fetch(url, {
        cache: "force-cache",
        next: { revalidate: range === "1d" ? 60 : range === "5d" ? 300 : 3600 },
        signal: AbortSignal.timeout(4_500),
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) continue;
      const result = payload?.chart?.result?.[0];
      const timestamps: number[] = Array.isArray(result?.timestamp)
        ? result.timestamp
        : [];
      const closes: Array<number | null> = Array.isArray(
        result?.indicators?.quote?.[0]?.close,
      )
        ? result.indicators.quote[0].close
        : [];
      if (!timestamps.length || !closes.length) continue;
      const ex = normaliseExchangeCode(
        holding.exchange || result?.meta?.exchangeName,
      );
      const nativeCurrency = String(
        result?.meta?.currency ||
          holding.native_currency ||
          currencyForExchange(ex, holding.currency),
      ).toUpperCase();
      const yahooFundCode = /^0P[0-9A-Z]+\.L$/i.test(symbol);
      const lseOrPence = !yahooFundCode && (
        ex === "LSE" ||
        (nativeCurrency === "GBP" && symbol.endsWith(".L")) ||
        nativeCurrency === "GBX" ||
        (String(result?.meta?.currency || "").toUpperCase() === "GBP" && symbol.endsWith(".L"))
      );
      const fx = await fxToGbp(lseOrPence ? "GBP" : nativeCurrency);
      let points = timestamps
        .map((stamp, index) => {
          const close = Number(closes[index] || 0);
          if (!Number.isFinite(close) || close <= 0) return null;
          const nativeGbp = lseOrPence ? close / 100 : close;
          const price = nativeGbp * fx.rate;
          return {
            at: new Date(stamp * 1000).toISOString(),
            price,
            value: price * units,
          };
        })
        .filter(Boolean) as Array<{ at: string; price: number; value: number }>;
      if (range === "1d" && points.length) {
        const latestSession = points.reduce((latest, point) => {
          const date = point.at.slice(0, 10);
          return date > latest ? date : latest;
        }, "");
        points = points.filter((point) => point.at.startsWith(latestSession));
      }
      if (points.length) return { holdingId: holding.id, points };
    } catch {
      continue;
    }
  }
  return null;
}

async function storedInstrumentMarketHistory(
  supabase: any,
  holdings: HoldingRow[],
  range: string,
  since: string,
) {
  const ranked = holdings
    .filter((holding) => holding.ticker && Number(holding.units || 0) > 0)
    .sort((a, b) => holdingValue(b) - holdingValue(a));
  const total = ranked.reduce((sum, holding) => sum + holdingValue(holding), 0);
  const selected: HoldingRow[] = [];
  let covered = 0;
  for (const holding of ranked) {
    selected.push(holding);
    covered += holdingValue(holding);
    if ((total > 0 && covered / total >= 0.92) || selected.length >= 40) break;
  }
  const listingIds = Array.from(
    new Set(selected.map((holding) => holding.listing_id).filter(Boolean)),
  ) as string[];
  const legacyTickers = Array.from(
    new Set(
      selected
        .filter((holding) => !holding.listing_id)
        .map((holding) => String(holding.ticker || "").toUpperCase())
        .filter(Boolean),
    ),
  );
  if (!listingIds.length && !legacyTickers.length)
    return {
      points: [],
      coveragePercent: 0,
      selectedHoldings: 0,
      totalHoldings: ranked.length,
      source: "stored_instrument_history",
    } satisfies MarketHistoryResult;

  const bucketInterval = bucketIntervalForRange(range);
  const data: any[] = [];
  const pageSize = 1000;
  const maxRows = Math.min(
    50_000,
    Math.max(5_000, selected.length * (range === "1d" ? 520 : 300)),
  );
  const filters: Array<{ column: "listing_id" | "ticker"; values: string[] }> =
    [];
  if (listingIds.length)
    filters.push({ column: "listing_id", values: listingIds });
  if (legacyTickers.length)
    filters.push({ column: "ticker", values: legacyTickers });
  for (const filter of filters) {
    for (let offset = 0; offset < maxRows; offset += pageSize) {
      const page = await supabase
        .from("investment_instrument_price_points")
        .select(
          "listing_id,ticker,exchange_code,gbp_price,price_gbp,native_price,native_currency,point_at,bucket_interval",
        )
        .eq("bucket_interval", bucketInterval)
        .gte("point_at", since)
        .in(filter.column, filter.values)
        .order("point_at", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (page.error)
        return {
          points: [],
          coveragePercent: 0,
          selectedHoldings: 0,
          totalHoldings: ranked.length,
          source: "stored_instrument_history",
        } satisfies MarketHistoryResult;
      const rows = page.data || [];
      data.push(...rows);
      if (rows.length < pageSize) break;
    }
  }
  if (!data.length)
    return {
      points: [],
      coveragePercent: 0,
      selectedHoldings: 0,
      totalHoldings: ranked.length,
      source: "stored_instrument_history",
    } satisfies MarketHistoryResult;

  const holdingsByListing = new Map<string, HoldingRow[]>();
  const holdingsByTicker = new Map<string, HoldingRow[]>();
  selected.forEach((holding) => {
    if (holding.listing_id) {
      if (!holdingsByListing.has(holding.listing_id))
        holdingsByListing.set(holding.listing_id, []);
      holdingsByListing.get(holding.listing_id)!.push(holding);
      return;
    }
    const ticker = String(holding.ticker || "").toUpperCase();
    if (!holdingsByTicker.has(ticker)) holdingsByTicker.set(ticker, []);
    holdingsByTicker.get(ticker)!.push(holding);
  });
  const seriesByAsset = new Map<
    string,
    Array<{ at: string; value: number; price: number }>
  >();
  for (const row of data as any[]) {
    const ticker = String(row.ticker || "").toUpperCase();
    const listingId = String(row.listing_id || "");
    const linked = listingId
      ? holdingsByListing.get(listingId) || []
      : holdingsByTicker.get(ticker) || [];
    if (!linked.length || !row.point_at) continue;
    const price = Number(row.gbp_price ?? row.price_gbp ?? 0);
    if (!Number.isFinite(price) || price <= 0) continue;
    const units = linked.reduce((sum, holding) => sum + Number(holding.units || 0), 0);
    const assetKey = listingId || `ticker:${ticker}`;
    if (!seriesByAsset.has(assetKey)) seriesByAsset.set(assetKey, []);
    seriesByAsset.get(assetKey)!.push({
      at: row.point_at,
      price,
      value: price * units,
    });
  }
  const series = Array.from(seriesByAsset.entries()).map(
    ([assetKey, points]) => ({ holdingId: assetKey, points }),
  );
  const evidencedAssets = new Set(series.map((item) => item.holdingId));
  const evidencedValue = selected
    .filter((holding) =>
      evidencedAssets.has(
        holding.listing_id ||
          `ticker:${String(holding.ticker || "").toUpperCase()}`,
      ),
    )
    .reduce((sum, holding) => sum + holdingValue(holding), 0);
  if (!series.length) return { points: [], coveragePercent: 0, selectedHoldings: 0, totalHoldings: ranked.length, source: "stored_instrument_history" } satisfies MarketHistoryResult;
  const times = Array.from(new Set(series.flatMap((item) => item.points.map((point) => point.at)))).sort();
  const indexes = series.map(() => 0);
  const minimum = Math.max(1, Math.ceil(series.length * 0.72));
  const result = times.map((at) => {
    let value = 0;
    let price = 0;
    let count = 0;
    series.forEach((item, index) => {
      while (indexes[index] < item.points.length - 1 && item.points[indexes[index] + 1].at <= at) indexes[index] += 1;
      const point = item.points[indexes[index]];
      if (point && point.at <= at) { value += point.value; price += point.price; count += 1; }
    });
    return { at, label: labelFor(at, range), price: count ? price / count : 0, value, source: "Stored direct instrument price history", coverage: count };
  }).filter((point) => point.value > 0 && point.coverage >= minimum).map(({ coverage: _coverage, ...point }) => point);
  return {
    points: downsample(result, range === "1d" ? 520 : 220),
    coveragePercent: total > 0 ? Math.min(100, (evidencedValue / total) * 100) : 0,
    selectedHoldings: series.length,
    totalHoldings: ranked.length,
    source: "stored_instrument_history",
  } satisfies MarketHistoryResult;
}

async function generatedMarketHistory(holdings: HoldingRow[], range: string) {
  const ranked = holdings.filter((holding) => holding.ticker && Number(holding.units || 0) > 0).sort((a, b) => holdingValue(b) - holdingValue(a));
  const total = ranked.reduce((sum, holding) => sum + holdingValue(holding), 0);
  const selected: HoldingRow[] = [];
  let covered = 0;
  for (const holding of ranked) {
    selected.push(holding);
    covered += holdingValue(holding);
    if ((total > 0 && covered / total >= 0.92) || selected.length >= 32) break;
  }
  const series = (
    await Promise.all(selected.map((holding) => fetchHoldingHistory(holding, range)))
  ).filter(Boolean) as HoldingSeries[];
  const evidencedHoldingIds = new Set(series.map((item) => item.holdingId));
  const evidencedValue = selected
    .filter((holding) => evidencedHoldingIds.has(holding.id))
    .reduce((sum, holding) => sum + holdingValue(holding), 0);
  if (!series.length) return { points: [], coveragePercent: 0, selectedHoldings: 0, totalHoldings: ranked.length, source: "direct_market_history" } satisfies MarketHistoryResult;
  const times = Array.from(
    new Set(series.flatMap((item) => item.points.map((point) => point.at))),
  ).sort();
  const indexBySeries = series.map(() => 0);
  const minCoverage = Math.max(1, Math.ceil(series.length * 0.78));
  const aggregated = times
    .map((at) => {
      let value = 0;
      let price = 0;
      let count = 0;
      series.forEach((item, seriesIndex) => {
        while (
          indexBySeries[seriesIndex] < item.points.length - 1 &&
          item.points[indexBySeries[seriesIndex] + 1].at <= at
        ) {
          indexBySeries[seriesIndex] += 1;
        }
        const point = item.points[indexBySeries[seriesIndex]];
        if (point && point.at <= at) {
          value += point.value;
          price += point.price;
          count += 1;
        }
      });
      return {
        at,
        label: labelFor(at, range),
        price: count ? price / count : 0,
        value,
        source: "Yahoo delayed historical market data",
        coverage: count,
      };
    })
    .filter((point) => point.value > 0 && point.coverage >= minCoverage)
    .map(({ coverage: _coverage, ...point }) => point);
  return {
    points: downsample(aggregated, range === "1d" ? 96 : 180),
    coveragePercent: total > 0 ? Math.min(100, (evidencedValue / total) * 100) : 0,
    selectedHoldings: series.length,
    totalHoldings: ranked.length,
    source: "direct_market_history",
  } satisfies MarketHistoryResult;
}


function movementAssetKey(holding: HoldingRow) {
  const normalise = (value?: string | null) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  const isin = normalise(holding.isin);
  if (isin) return `isin:${isin}`;
  const ticker = normalise(holding.ticker);
  const exchange = normalise(holding.exchange);
  if (ticker) return `ticker:${ticker}:${exchange || "ANY"}`;
  return `name:${normalise(holding.asset_name)}`;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return output;
}

async function buildHoldingMovements(
  supabase: any,
  userId: string,
  holdings: HoldingRow[],
  range: string,
  since: string,
  canUseMarketData: boolean,
) {
  const groups = new Map<string, HoldingRow[]>();
  holdings.forEach((holding) => {
    if (Number(holding.units || 0) <= 0 || holdingValue(holding) <= 0) return;
    const key = movementAssetKey(holding);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(holding);
  });

  const result: Record<string, { pct: number; change: number; has: boolean; source: string; points: number }> = {};
  const grouped = Array.from(groups.entries()).map(([key, rows]) => ({
    key,
    rows,
    value: rows.reduce((sum, row) => sum + holdingValue(row), 0),
    ticker: String(rows[0]?.ticker || rows[0]?.isin || "").trim().toUpperCase(),
  })).sort((a, b) => b.value - a.value);

  if (range === "1d") {
    for (const group of grouped) {
      let opening = 0;
      let current = 0;
      for (const row of group.rows) {
        const value = holdingValue(row);
        const units = Number(row.units || 0);
        const previousClose = Number(row.previous_close_price_gbp || 0);
        const pct = Number(row.day_change_percent ?? row.day_change_native_percent);
        current += value;
        if (previousClose > 0 && units > 0) opening += previousClose * units;
        else if (Number.isFinite(pct) && Math.abs(pct) < 99.9) opening += value / (1 + pct / 100);
      }
      if (opening > 0 && current > 0) {
        const change = current - opening;
        result[group.key] = { pct: (change / opening) * 100, change, has: true, source: "previous market close", points: 2 };
      }
    }
  }

  const tickers = Array.from(new Set(grouped.map((group) => group.ticker).filter(Boolean)));
  if (tickers.length) {
    const { data } = await supabase
      .from("investment_instrument_price_points")
      .select("ticker,exchange_code,gbp_price,price_gbp,point_at")
      .in("ticker", tickers)
      .gte("point_at", since)
      .order("point_at", { ascending: true })
      .limit(20000);
    const byTicker = new Map<string, Array<{ at: string; price: number }>>();
    for (const row of data || []) {
      const ticker = String(row.ticker || "").trim().toUpperCase();
      const price = Number(row.gbp_price ?? row.price_gbp ?? 0);
      if (!ticker || !row.point_at || !Number.isFinite(price) || price <= 0) continue;
      if (!byTicker.has(ticker)) byTicker.set(ticker, []);
      byTicker.get(ticker)!.push({ at: row.point_at, price });
    }
    for (const group of grouped) {
      if (result[group.key]?.has) continue;
      const points = byTicker.get(group.ticker) || [];
      if (points.length < 2) continue;
      const first = points[0].price;
      const last = points[points.length - 1].price;
      if (first <= 0 || last <= 0) continue;
      const pct = ((last - first) / first) * 100;
      const opening = group.value / (1 + pct / 100);
      result[group.key] = { pct, change: group.value - opening, has: true, source: "stored market history", points: points.length };
    }
  }

  if (canUseMarketData) {
    const missing = grouped.filter((group) => !result[group.key]?.has).slice(0, 48);
    const direct = await mapWithConcurrency(missing, 8, async (group) => {
      const firstRow = group.rows[0];
      const units = group.rows.reduce((sum, row) => sum + Number(row.units || 0), 0);
      const series = await fetchHoldingHistory({ ...firstRow, units }, range);
      if (!series || series.points.length < 2) return null;
      const first = Number(series.points[0]?.price || 0);
      const last = Number(series.points[series.points.length - 1]?.price || 0);
      if (first <= 0 || last <= 0) return null;
      const pct = ((last - first) / first) * 100;
      const opening = group.value / (1 + pct / 100);
      return { key: group.key, pct, change: group.value - opening, has: true, source: "direct delayed market history", points: series.points.length };
    });
    direct.filter(Boolean).forEach((row: any) => { result[row.key] = row; });
  }

  grouped.forEach((group) => {
    if (!result[group.key]) result[group.key] = { pct: 0, change: 0, has: false, source: "history pending", points: 0 };
  });
  return result;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const householdContext = await getActiveHouseholdContext(supabase, user);
  const dataOwnerUserId = householdContext.dataOwnerUserId || user.id;

  const holdingId = request.nextUrl.searchParams.get("holdingId");
  const holdingIds = request.nextUrl.searchParams.get("holdingIds")?.split(",").map((value) => value.trim()).filter(Boolean) || [];
  const isHoldingScope = Boolean(holdingId || holdingIds.length);
  const accountId = request.nextUrl.searchParams.get("accountId");
  const portfolio = request.nextUrl.searchParams.get("portfolio") === "1";
  const movements = request.nextUrl.searchParams.get("movements") === "1";
  const portfolioAccountIds = String(request.nextUrl.searchParams.get("accountIds") || "").split(",").map((value) => value.trim()).filter(Boolean);
  const range = request.nextUrl.searchParams.get("range") || "1m";
  const since = sinceForRange(range);

  const { data: profile } = await supabase
    .from("app_user_profiles")
    .select(
      "payment_tier, payment_tier_status, payment_tier_override, market_data_tier, market_data_tier_override, market_data_provider_status, market_data_realtime_enabled",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  const entitlement = investmentDataEntitlementForProfile(profile);

  if (!isHoldingScope && !accountId && !portfolio && !movements) {
    return NextResponse.json(
      { error: "Provide holdingId, accountId or portfolio=1" },
      { status: 400 },
    );
  }

  let holdingsQuery: any = supabase
    .from("investment_holdings")
    .select(
      "id, investment_account_id, listing_id, instrument_id, ticker, exchange, isin, latest_price, native_latest_price, units, imported_current_value, asset_name, source_url, currency, native_currency, price_polling_enabled, previous_close_price_gbp, previous_close_native_price, previous_close_at, day_change_percent, day_change_native_percent, day_change_gbp, day_change_native",
    )
    .eq("user_id", dataOwnerUserId);
  if (holdingId) holdingsQuery = holdingsQuery.eq("id", holdingId);
  if (holdingIds.length) holdingsQuery = holdingsQuery.in("id", holdingIds);
  if (accountId)
    holdingsQuery = holdingsQuery.eq("investment_account_id", accountId);
  if (portfolio && portfolioAccountIds.length) holdingsQuery = holdingsQuery.in("investment_account_id", portfolioAccountIds);
  const holdingsResult = await holdingsQuery;
  const currentHoldings = (holdingsResult.data || []) as HoldingRow[];
  const holdingsError = holdingsResult.error;
  if (holdingsError)
    return NextResponse.json({ error: holdingsError.message }, { status: 500 });

  if (movements) {
    const movementRows = await buildHoldingMovements(
      supabase,
      dataOwnerUserId,
      currentHoldings,
      range,
      since,
      entitlement.canUseDelayedPrices || entitlement.canUseRealtimePrices,
    );
    return NextResponse.json({ ok: true, range, movements: movementRows, generatedAt: new Date().toISOString() });
  }

  const data: SnapshotRow[] = [];
  const pageSize = 1000;
  const maxSnapshotRows = Math.min(
    25_000,
    Math.max(
      5_000,
      maxPointsForRange(range) * Math.max(currentHoldings.length, 1),
    ),
  );
  for (let offset = 0; offset < maxSnapshotRows; offset += pageSize) {
    let query: any = supabase
      .from("investment_price_snapshots")
      .select(
        "holding_id, snapshot_at, snapshot_date, snapshot_batch_id, price, units, value, native_price, native_value, native_currency, fx_rate_to_gbp, source, investment_holdings!inner(investment_account_id, asset_name)",
      )
      .eq("user_id", dataOwnerUserId)
      .gte("snapshot_at", since)
      .order("snapshot_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (holdingId) query = query.eq("holding_id", holdingId);
    if (holdingIds.length) query = query.in("holding_id", holdingIds);
    if (accountId) query = query.eq("investment_holdings.investment_account_id", accountId);
    if (portfolio && currentHoldings.length) query = query.in("holding_id", currentHoldings.map((holding) => holding.id));

    const snapshotPage = await query;
    if (snapshotPage.error)
      return NextResponse.json(
        { error: snapshotPage.error.message },
        { status: 500 },
      );
    const rows = (snapshotPage.data || []) as SnapshotRow[];
    data.push(...rows);
    if (rows.length < pageSize) break;
  }

  const currentValueWithoutCash = (currentHoldings || []).reduce(
    (sum, holding) => sum + holdingValue(holding),
    0,
  );
  let providerCashValue = 0;
  if (accountId) {
    const { data: account } = await supabase
      .from("investment_accounts")
      .select("provider_cash_value")
      .eq("id", accountId)
      .eq("user_id", dataOwnerUserId)
      .maybeSingle();
    providerCashValue = Number(account?.provider_cash_value || 0);
  } else if (portfolio) {
    let accountsQuery: any = supabase
      .from("investment_accounts")
      .select("provider_cash_value")
      .eq("user_id", dataOwnerUserId)
      .neq("record_status", "archived");
    if (portfolioAccountIds.length) accountsQuery = accountsQuery.in("id", portfolioAccountIds);
    const { data: accounts } = await accountsQuery;
    providerCashValue = (accounts || []).reduce((sum: number, account: any) => sum + Number(account.provider_cash_value || 0), 0);
  }
  const currentValue = currentValueWithoutCash + providerCashValue;
  const currentPrice =
    isHoldingScope && currentHoldings?.[0]
      ? latestPriceGbp(currentHoldings[0])
      : currentHoldings?.length
        ? currentHoldings.reduce(
            (sum, holding) => sum + latestPriceGbp(holding),
            0,
          ) / currentHoldings.length
        : 0;

  let points: ChartPoint[] = [];
  let quality: any = null;
  let sourceMode:
    | "stored"
    | "stored_portfolio_batches"
    | "fallback_yahoo"
    | "single_saved"
    | "market_performance_estimate"
    | "insufficient_portfolio_history" = "stored";
  let marketHistoryEvidence: MarketHistoryResult | null = null;

  if (accountId || portfolio) {
    const holdingIds = currentHoldings.map((holding) => holding.id);
    let baselineRows: SnapshotRow[] = [];
    if (holdingIds.length) {
      const baselineResult = await supabase
        .from("investment_price_snapshots")
        .select(
          "holding_id, snapshot_at, snapshot_date, snapshot_batch_id, price, units, value, native_price, native_value, native_currency, fx_rate_to_gbp, source",
        )
        .eq("user_id", dataOwnerUserId)
        .in("holding_id", holdingIds)
        .lt("snapshot_at", since)
        .order("snapshot_at", { ascending: false })
        .limit(Math.min(5000, Math.max(500, holdingIds.length * 160)));
      if (baselineResult.error)
        return NextResponse.json(
          { error: baselineResult.error.message },
          { status: 500 },
        );
      const newestByHolding = new Map<string, SnapshotRow>();
      for (const row of (baselineResult.data || []) as SnapshotRow[]) {
        if (!newestByHolding.has(row.holding_id))
          newestByHolding.set(row.holding_id, row);
      }
      baselineRows = Array.from(newestByHolding.values());
    }

    const built = buildPortfolioHistory({
      rows: data,
      baselineRows,
      holdings: currentHoldings.map((holding) => ({
        id: holding.id,
        ticker: holding.ticker,
        units: Number(holding.units || 0),
        currentValue: holdingValue(holding),
        staticValue: !holding.ticker || holding.price_polling_enabled === false,
      })),
      range,
      cashValue: providerCashValue,
      minimumCoverage: 0.95,
      currentValue,
    });
    quality = built.quality;
    points = built.points.map((point) => ({
      at: point.at,
      label: labelFor(point.at, range),
      price: point.price,
      value: point.value,
      source: point.source,
    }));
    const snapshotsCoverSelectedRange = historySpansSelectedRange(
      points,
      range,
      since,
    );
    if (built.quality.reliable && !snapshotsCoverSelectedRange) {
      quality = {
        ...built.quality,
        reliable: false,
        note:
          "Saved portfolio snapshots are complete but do not yet span the selected period. LOOP is using stored instrument history for this chart.",
      };
      points = [];
    }
    sourceMode = quality?.reliable
      ? "stored_portfolio_batches"
      : "insufficient_portfolio_history";

    // When complete cash-flow-aware portfolio snapshots do not yet exist, provide a clearly
    // labelled market-movement estimate. This uses current units solely to estimate market
    // performance and must never be presented as historic account value or contribution history.
    if (
      !historySpansSelectedRange(points, range, since) &&
      currentValue > 0 &&
      (entitlement.canUseDelayedPrices || entitlement.canUseRealtimePrices)
    ) {
      const storedEstimate = await storedInstrumentMarketHistory(
        supabase,
        currentHoldings,
        range,
        since,
      );
      const directEstimate = storedEstimate.points.length >= 2
        ? storedEstimate
        : await generatedMarketHistory(currentHoldings, range);
      if (directEstimate.points.length >= 2) {
        const generatedLast = Number(directEstimate.points[directEstimate.points.length - 1]?.value || 0);
        const scale = generatedLast > 0 ? currentValue / generatedLast : 1;
        // BUGFIX (investment pricing audit): this estimate only covers the subset of
        // holdings with resolvable price history (often missing recently-added or
        // unresolved holdings entirely). Rescaling the whole series so its endpoint
        // forcibly equals `currentValue` used to stretch that coverage gap into what
        // looked like a real, large intraday move once drawn. If the estimate's own
        // endpoint is too far from the true current value, coverage is too thin to
        // trust as a historical line — discard it and fall back to "insufficient
        // history" rather than stretching it into a misleading jump.
        const MIN_TRUSTED_SCALE = 0.7;
        const MAX_TRUSTED_SCALE = 1.3;
        if (Number.isFinite(scale) && scale >= MIN_TRUSTED_SCALE && scale <= MAX_TRUSTED_SCALE) {
          points = directEstimate.points.map((point) => ({
            ...point,
            value: point.value * scale,
            source: `${directEstimate.source === "stored_instrument_history" ? "Stored instrument history" : "Direct delayed market history"} · market-performance estimate · excludes purchases, sales and cash flows`,
          }));
          sourceMode = "market_performance_estimate";
          marketHistoryEvidence = directEstimate;
        }
      }
    }
    if (!points.length && currentValue > 0) sourceMode = "insufficient_portfolio_history";
  } else {
    const byTime = new Map<
      string,
      {
        at: string;
        priceTotal: number;
        valueTotal: number;
        count: number;
        sources: Set<string>;
      }
    >();
    for (const row of data || []) {
      const at = row.snapshot_at || row.snapshot_date || "";
      if (!at) continue;
      const item = byTime.get(at) || {
        at,
        priceTotal: 0,
        valueTotal: 0,
        count: 0,
        sources: new Set<string>(),
      };
      const gbpPrice = snapshotPriceGbp(row);
      const gbpValue = snapshotValueGbp(row);
      item.priceTotal += gbpPrice;
      item.valueTotal += gbpValue;
      item.count += 1;
      if (row.source) item.sources.add(row.source);
      byTime.set(at, item);
    }

    points = Array.from(byTime.values()).map((item) => ({
      at: item.at,
      label: labelFor(item.at, range),
      price: item.count > 0 ? item.priceTotal / item.count : 0,
      value: item.valueTotal,
      source: Array.from(item.sources).join(", "),
    }));

    const sanitized = sanePoints(points, currentValue);
    if (sanitized.length >= 2) {
      points = sanitized;
    } else {
      const generated =
        entitlement.canUseDelayedPrices || entitlement.canUseRealtimePrices
          ? await generatedMarketHistory(currentHoldings, range)
          : { points: [], coveragePercent: 0, selectedHoldings: 0, totalHoldings: currentHoldings.length, source: "direct_market_history" } satisfies MarketHistoryResult;
      if (generated.points.length >= 2) {
        points = sanePoints(generated.points, currentValue);
        sourceMode = "fallback_yahoo";
        marketHistoryEvidence = generated;
      } else if (currentHoldings?.length && currentValue > 0) {
        const nowIso = new Date().toISOString();
        points = [
          {
            at: nowIso,
            label: labelFor(nowIso, range),
            price: currentPrice,
            value: currentValue,
            source: "latest saved holding value",
          },
        ];
        sourceMode = "single_saved";
      } else {
        points = sanitized;
      }
    }
  }

  points = downsample(
    compactNearDuplicatePoints(points),
    maxPointsForRange(range),
  ).map((point) => ({ ...point, label: labelFor(point.at, range) }));

  const firstPointValue = Number(points[0]?.value || 0);
  const latestPointValue = Number(points[points.length - 1]?.value || currentValue || 0);
  let comparisonBasis = "first evidenced point in range";
  let comparisonStartValue = firstPointValue;
  // BUGFIX (investment pricing audit): previously this "previous market close"
  // basis — built from each holding's own previous_close_price_gbp, which the
  // daily price job tracks independently of the chart-history reconstruction
  // above — was only used for a single-holding view (isHoldingScope). The
  // whole-portfolio "1D" figure fell through to `firstPointValue`, which on a
  // thin-coverage estimate is exactly the value that produced the misleading
  // "up 31%" headline. Use the same real per-holding basis for portfolio/
  // account scope too whenever it's available; it doesn't depend on the
  // chart-history reconstruction at all.
  if (range === "1d") {
    const previousCloseHoldings = isHoldingScope
      ? currentHoldings
      : currentHoldings.filter((holding) => Number(holding.units || 0) > 0);
    const previousCloseValue = previousCloseHoldings.reduce((sum, holding) => {
      const previous = Number(holding.previous_close_price_gbp || 0);
      const units = Number(holding.units || 0);
      return previous > 0 && units > 0 ? sum + previous * units : sum;
    }, 0);
    const previousCloseCoverage = previousCloseHoldings.length
      ? previousCloseHoldings.filter((holding) => Number(holding.previous_close_price_gbp || 0) > 0).length / previousCloseHoldings.length
      : 0;
    // Require close to full coverage before trusting this as the day's basis —
    // a partial previous-close basis has exactly the same "stretch" problem as
    // the chart estimate above.
    if (previousCloseValue > 0 && previousCloseCoverage >= 0.9) {
      comparisonBasis = "previous market close";
      comparisonStartValue = previousCloseValue;
    }
  }
  const absoluteChange = comparisonStartValue > 0 ? currentValue - comparisonStartValue : points.length >= 2 ? latestPointValue - firstPointValue : 0;
  const percentChange = comparisonStartValue > 0 ? (absoluteChange / comparisonStartValue) * 100 : 0;
  const savedHistoryUsed = (sourceMode === "stored_portfolio_batches" || sourceMode === "stored") && points.length >= 2;
  // BUGFIX (investment pricing audit): flag when the change figure rests on
  // something other than a real previous-close or a genuine saved portfolio
  // snapshot batch, so the UI can show "estimated"/hide the number instead of
  // presenting a synthetic-history artifact as a hard daily P&L figure.
  const changeReliable = comparisonBasis === "previous market close" || savedHistoryUsed;
  const estimateOnly = sourceMode === "market_performance_estimate" || sourceMode === "fallback_yahoo" || sourceMode === "single_saved";
  const storedInstrumentUsed = sourceMode === "market_performance_estimate" && marketHistoryEvidence?.source === "stored_instrument_history";
  const directMarketUsed = sourceMode === "fallback_yahoo" || (sourceMode === "market_performance_estimate" && marketHistoryEvidence?.source === "direct_market_history");
  const historyStages: HistoryStage[] = [
    {
      key: "portfolio_snapshots",
      label: "Saved portfolio snapshots",
      status: savedHistoryUsed ? "used" : data.length ? "available" : "missing",
      points: savedHistoryUsed ? points.length : data.length,
      coveragePercent: quality?.latestCoverage ? Number(quality.latestCoverage) * 100 : null,
      note: savedHistoryUsed
        ? "Cash-flow-aware account history is being used."
        : "LOOP only uses this stage when a point represents at least 95% of the selected portfolio.",
    },
    {
      key: "stored_instrument_history",
      label: "Stored market history",
      status: savedHistoryUsed ? "skipped" : storedInstrumentUsed ? "used" : marketHistoryEvidence?.source === "stored_instrument_history" ? "available" : "missing",
      points: marketHistoryEvidence?.source === "stored_instrument_history" ? marketHistoryEvidence.points.length : 0,
      coveragePercent: marketHistoryEvidence?.source === "stored_instrument_history" ? marketHistoryEvidence.coveragePercent : null,
      note: "Shared price points already held by LOOP are checked before an external history request.",
    },
    {
      key: "direct_market_history",
      label: "Direct market history",
      status: savedHistoryUsed || storedInstrumentUsed ? "skipped" : directMarketUsed ? "used" : marketHistoryEvidence?.source === "direct_market_history" ? "available" : "missing",
      points: marketHistoryEvidence?.source === "direct_market_history" ? marketHistoryEvidence.points.length : 0,
      coveragePercent: marketHistoryEvidence?.source === "direct_market_history" ? marketHistoryEvidence.coveragePercent : null,
      note: "Recognised tickers and mapped funds fall back to delayed Yahoo market history. Google data is not scraped.",
    },
    {
      key: "current_baseline",
      label: "Current-value baseline",
      status: points.length < 2 ? "used" : "skipped",
      points: points.length < 2 ? points.length : 0,
      coveragePercent: currentValue > 0 ? 100 : null,
      note: "Used only when no reliable historical series can be evidenced; it never fabricates old portfolio values.",
    },
  ];

  return NextResponse.json({
    ok: true,
    range,
    mode: isHoldingScope ? "holding" : portfolio ? "portfolio" : "account",
    currentValue,
    points,
    entitlement,
    sourceMode,
    quality,
    historyStages,
    historyCoveragePercent: marketHistoryEvidence?.coveragePercent ?? (quality?.latestCoverage ? Number(quality.latestCoverage) * 100 : null),
    estimateOnly,
    change: {
      absolute: absoluteChange,
      percent: percentChange,
      firstValue: firstPointValue,
      latestValue: latestPointValue,
      pointCount: points.length,
      basis: comparisonBasis,
      startValue: comparisonStartValue,
      reliable: changeReliable,
    },
  }, {
    headers: {
      "Cache-Control": "private, max-age=45, stale-while-revalidate=300",
    },
  });
}
