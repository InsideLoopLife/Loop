import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchInvestmentQuote,
  isRoughMarketOpen,
  normaliseExchangeCode,
  type InvestmentQuote,
} from "@/lib/investments/market-data";
import { currencyForExchange, quotePriceToGbp } from "@/lib/investments/fx";
import { loadInvestmentSnapshotSettings } from "@/lib/investments/snapshot-settings";
import { investmentDataEntitlementForProfile } from "@/lib/wealth/user-tiers";
import { quoteUnitForVenue, venueFor } from "@/lib/investments/market-venues";
import { findMoneyboxAsset } from "@/lib/investments/moneybox-funds";
import { quoteObservationTime } from "@/lib/investments/market-data-quality";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type Holding = {
  id: string;
  user_id: string;
  investment_account_id?: string | null;
  ticker: string | null;
  exchange: string | null;
  units: number | null;
  average_buy_price?: number | null;
  latest_price?: number | null;
  price_polling_enabled: boolean | null;
  last_price_check_at?: string | null;
  import_source_type?: string | null;
  external_provider?: string | null;
  asset_name?: string | null;
  asset_kind?: string | null;
  isin?: string | null;
  listing_id?: string | null;
  instrument_id?: string | null;
  instrument_resolution_status?: string | null;
};

type UserProfileRow = {
  user_id: string;
  payment_tier?: string | null;
  payment_tier_status?: string | null;
  payment_tier_override?: string | null;
  market_data_tier?: string | null;
  market_data_tier_override?: string | null;
  market_data_provider_status?: string | null;
  market_data_realtime_enabled?: boolean | null;
};

type RunnerOptions = {
  force?: boolean;
  now?: Date;
  logger?: Pick<Console, "log" | "warn" | "error">;
  prune?: boolean;
};

type RunnerResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  groups: number;
  holdings: number;
  checked: number;
  inserted: number;
  skippedClosed: number;
  skippedRecent: number;
  skippedDisabled: number;
  pruned: number;
  failed: number;
  failures: Array<{ ticker: string; exchange: string | null; reason: string }>;
};

type CatalogueLink = {
  instrumentId: string | null;
  listingId: string | null;
  ticker: string;
  exchange: string | null;
  venueCode: string | null;
};

type GlobalPoint = {
  id?: string | null;
  listing_id?: string | null;
  instrument_id?: string | null;
  ticker?: string | null;
  exchange_code?: string | null;
  price_gbp?: number | null;
  gbp_price?: number | null;
  native_price?: number | null;
  native_currency?: string | null;
  quote_unit?: string | null;
  source?: string | null;
  point_at?: string | null;
  observed_at?: string | null;
  price_minute?: string | null;
  fx_rate_to_gbp?: number | null;
};

type GlobalPointContext = {
  listingId: string;
  latestPoint: GlobalPoint | null;
  previousClosePoint: GlobalPoint | null;
  openingPoint: GlobalPoint | null;
};

function workerPositiveInt(
  value: unknown,
  fallback: number,
  min = 1,
  max = 50,
) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function workerBool(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === "") return fallback;
  const clean = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(clean)) return true;
  if (["0", "false", "no", "n", "off"].includes(clean)) return false;
  return fallback;
}

const REALTIME_TARGET_MINUTES = workerPositiveInt(
  process.env.MARKET_DATA_WORKER_REALTIME_TARGET_MINUTES ||
    process.env.INVESTMENT_REALTIME_TARGET_MINUTES,
  1,
  1,
  15,
);
const PRICE_QUOTE_CONCURRENCY = workerPositiveInt(
  process.env.MARKET_DATA_WORKER_QUOTE_CONCURRENCY ||
    process.env.INVESTMENT_PRICE_WORKER_CONCURRENCY,
  12,
  1,
  24,
);
const PAUSE_ON_COVERAGE_REQUIRED = workerBool(
  process.env.MARKET_DATA_WORKER_PAUSE_ON_COVERAGE_REQUIRED,
  false,
);

async function mapLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        await worker(items[index], index);
      }
    },
  );
  await Promise.all(workers);
}

function normaliseSnapshotTicker(ticker: string | null | undefined) {
  return String(ticker || "")
    .trim()
    .toUpperCase()
    .replace(/\.UK$/i, ".L");
}

function normaliseSnapshotExchange(
  exchange: string | null | undefined,
  ticker?: string | null,
) {
  return normaliseExchangeCode(exchange, ticker) || null;
}

function keyFor(
  ticker: string | null | undefined,
  exchange: string | null | undefined,
) {
  return `${normaliseSnapshotTicker(ticker)}|${normaliseSnapshotExchange(exchange, ticker) || ""}`;
}

function floorMinuteIso(date: Date) {
  const d = new Date(date.getTime());
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

function floorCadenceIso(date: Date, cadenceMinutes: number) {
  const cadenceMs = Math.max(1, cadenceMinutes) * 60 * 1000;
  return new Date(Math.floor(date.getTime() / cadenceMs) * cadenceMs).toISOString();
}

function previousTradingCloseIso(
  now: Date,
  exchange?: string | null,
  ticker?: string | null,
) {
  const venue = venueFor(exchange, ticker);
  const closeMinutes = Number.isFinite(Number(venue?.closeUtcMinutes))
    ? Number(venue?.closeUtcMinutes)
    : 16 * 60 + 30;
  const closeHour = Math.floor(closeMinutes / 60);
  const closeMinute = closeMinutes % 60;
  // Store a deterministic synthetic previous-close point before today's trading session.
  // Exact local/UTC conversion is less important than giving daily P/L a reliable baseline
  // until the worker has real prior-day minute history for the instrument.
  let d = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      closeHour,
      closeMinute,
      0,
      0,
    ),
  );
  d = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d = new Date(d.getTime() - 24 * 60 * 60 * 1000);
  }
  return d.toISOString();
}

function userCadenceMinutes(
  profile: UserProfileRow | undefined,
  settings: Awaited<ReturnType<typeof loadInvestmentSnapshotSettings>>,
) {
  const tier = String(
    profile?.market_data_tier_override ||
      profile?.market_data_tier ||
      profile?.payment_tier_override ||
      profile?.payment_tier ||
      "free",
  ).toLowerCase();
  const realtime =
    investmentDataEntitlementForProfile((profile || {}) as any)
      .canUseRealtimePrices ||
    tier === "realtime" ||
    tier === "pro_realtime" ||
    tier === "enterprise" ||
    profile?.market_data_realtime_enabled === true;
  if (realtime)
    return Math.max(
      1,
      Math.min(
        Number(settings.realtimeMinutes || REALTIME_TARGET_MINUTES),
        REALTIME_TARGET_MINUTES,
      ),
    );
  if (["plus", "pro", "premium", "go"].includes(tier))
    return Math.max(1, settings.plusProMinutes);
  return Math.max(1, settings.freeMinutes);
}

function isDue(
  holding: Holding,
  profile: UserProfileRow | undefined,
  settings: Awaited<ReturnType<typeof loadInvestmentSnapshotSettings>>,
  now: Date,
  force?: boolean,
) {
  if (force) return true;
  const isProviderFund = String(holding.asset_kind || "").toLowerCase() === "fund" || /^GB00[A-Z0-9]{8}$/i.test(String(holding.ticker || "")) || /vanguard|fund/i.test(String(holding.exchange || ""));
  const cadence = isProviderFund ? 12 * 60 : userCadenceMinutes(profile, settings);
  const last = holding.last_price_check_at
    ? Date.parse(holding.last_price_check_at)
    : 0;
  if (!Number.isFinite(last) || last <= 0) return true;
  const cadenceMs = cadence * 60 * 1000;
  return Math.floor(last / cadenceMs) < Math.floor(now.getTime() / cadenceMs);
}

function pointGbp(point: GlobalPoint | null | undefined) {
  return Number(point?.gbp_price ?? point?.price_gbp ?? 0);
}

function pointAt(point: GlobalPoint | null | undefined) {
  return String(
    point?.point_at || point?.observed_at || point?.price_minute || "",
  );
}

async function ensureCatalogueForGroup(
  supabase: SupabaseAdmin,
  args: {
    ticker: string;
    exchange: string | null;
    sample: Holding;
    nowIso: string;
  },
): Promise<CatalogueLink> {
  const ticker = normaliseSnapshotTicker(args.ticker);
  const exchange = normaliseSnapshotExchange(args.exchange, ticker);
  const venue = venueFor(exchange, ticker);
  const venueCode = venue?.venueCode || exchange || null;
  const assetName = args.sample.asset_name || ticker;
  const assetKind = args.sample.asset_kind || "share";
  const isin = args.sample.isin || null;

  let instrumentId = args.sample.instrument_id || null;
  let listingId = args.sample.listing_id || null;

  // Resolved holdings do not need their catalogue, alias and holding links
  // rewritten on every worker cycle.
  if (instrumentId && listingId) {
    return { instrumentId, listingId, ticker, exchange, venueCode };
  }

  if (!instrumentId) {
    const { data, error } = await supabase
      .from("investment_instruments")
      .upsert(
        {
          ticker,
          exchange_code: venueCode || "",
          exchange_name: venue?.name || venueCode || "",
          asset_name: assetName,
          asset_kind: assetKind,
          canonical_symbol: ticker,
          canonical_name: assetName,
          isin,
          currency_code: currencyForExchange(venueCode),
          quote_unit: quoteUnitForVenue(venueCode),
          coverage_status: "active",
          resolution_status: "resolved",
          confidence: 90,
          updated_at: args.nowIso,
          last_seen_at: args.nowIso,
        } as any,
        { onConflict: "ticker,exchange_code" },
      )
      .select("id")
      .maybeSingle();
    if (!error) instrumentId = data?.id || null;
  }

  if (!listingId) {
    const { data, error } = await supabase
      .from("investment_instrument_listings")
      .upsert(
        {
          instrument_id: instrumentId,
          symbol: ticker,
          display_symbol: ticker,
          broker_symbol: args.sample.ticker || ticker,
          broker_market_code: args.sample.exchange || venueCode,
          venue_code: venueCode || "UNKNOWN",
          venue_mic: venue?.mic || venueCode || null,
          operating_mic: venue?.mic || venueCode || null,
          data_provider: "market_worker",
          data_provider_symbol: ticker,
          data_provider_exchange: venueCode || "",
          quote_currency: currencyForExchange(venueCode),
          price_currency: currencyForExchange(venueCode),
          price_scale: venue?.priceScale ?? 1,
          timezone: venue?.timezone || null,
          market_open_time: null,
          market_close_time: null,
          active: true,
          resolution_status: "resolved",
          last_seen_at: args.nowIso,
          updated_at: args.nowIso,
        } as any,
        { onConflict: "data_provider,symbol,venue_code" },
      )
      .select("id")
      .maybeSingle();
    if (!error) listingId = data?.id || null;
  }

  if (listingId || instrumentId) {
    await supabase
      .from("investment_instrument_aliases")
      .upsert(
        {
          listing_id: listingId,
          instrument_id: instrumentId,
          alias_source:
            args.sample.import_source_type ||
            args.sample.external_provider ||
            "manual",
          alias_symbol: args.sample.ticker || ticker,
          alias_market_code: args.sample.exchange || venueCode || null,
          alias_isin: isin,
          confidence: 0.95,
          active: true,
        } as any,
        { onConflict: "alias_source,alias_symbol,alias_market_code" },
      )
      .select("id")
      .maybeSingle();

    await supabase
      .from("investment_holdings")
      .update({
        instrument_id: instrumentId,
        listing_id: listingId,
        instrument_resolution_status: "resolved",
        instrument_resolution_notes: venueCode
          ? `Linked to ${ticker} · ${venueCode}`
          : `Linked to ${ticker}`,
        updated_at: args.nowIso,
      } as any)
      .in("id", [args.sample.id]);
  }

  return { instrumentId, listingId, ticker, exchange, venueCode };
}

async function loadGlobalPointContexts(
  supabase: SupabaseAdmin,
  args: {
    listingIds: string[];
    snapshotDate: string;
    sinceIso: string;
  },
) {
  const listingIds = Array.from(new Set(args.listingIds.filter(Boolean)));
  const contexts = new Map<string, GlobalPointContext>();
  if (!listingIds.length) return contexts;

  const { data, error } = await supabase.rpc(
    "loop_worker_market_price_context",
    {
      p_listing_ids: listingIds,
      p_snapshot_date: args.snapshotDate,
      p_since: args.sinceIso,
    },
  );
  if (error) throw error;

  for (const row of (data || []) as any[]) {
    const listingId = String(row.listing_id || "");
    if (!listingId) continue;
    contexts.set(listingId, {
      listingId,
      latestPoint: (row.latest_point as GlobalPoint | null) || null,
      previousClosePoint:
        (row.previous_close_point as GlobalPoint | null) || null,
      openingPoint: (row.opening_point as GlobalPoint | null) || null,
    });
  }
  return contexts;
}

function globalPointIsFresh(point: GlobalPoint | null, sinceIso: string) {
  const timestamp = Date.parse(pointAt(point));
  return Number.isFinite(timestamp) && timestamp >= Date.parse(sinceIso);
}

async function latestGlobalPricePoint(
  supabase: SupabaseAdmin,
  args: {
    listingId?: string | null;
    ticker: string;
    exchange: string | null;
    sinceIso: string;
  },
): Promise<GlobalPoint | null> {
  const select =
    "id,listing_id,instrument_id,ticker,exchange_code,price_gbp,gbp_price,native_price,native_currency,quote_unit,source,point_at,observed_at,price_minute,fx_rate_to_gbp";
  if (args.listingId) {
    const { data } = await supabase
      .from("investment_instrument_price_points")
      .select(select)
      .eq("listing_id", args.listingId)
      .gte("point_at", args.sinceIso)
      .order("point_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as GlobalPoint;
  }

  const { data } = await supabase
    .from("investment_instrument_price_points")
    .select(select)
    .eq("ticker", args.ticker)
    .eq("exchange_code", args.exchange || "")
    .gte("point_at", args.sinceIso)
    .order("point_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as GlobalPoint) || null;
}

async function previousCloseGlobalPoint(
  supabase: SupabaseAdmin,
  args: {
    listingId?: string | null;
    ticker: string;
    exchange: string | null;
    snapshotDate: string;
  },
): Promise<GlobalPoint | null> {
  const select =
    "id,listing_id,instrument_id,ticker,exchange_code,price_gbp,gbp_price,native_price,native_currency,quote_unit,source,point_at,observed_at,price_minute,fx_rate_to_gbp";
  const todayStartIso = `${args.snapshotDate}T00:00:00.000Z`;

  const base = () => {
    let query = supabase
      .from("investment_instrument_price_points")
      .select(select)
      .order("point_at", { ascending: false })
      .limit(1);
    if (args.listingId) query = query.eq("listing_id", args.listingId);
    else
      query = query
        .eq("ticker", args.ticker)
        .eq("exchange_code", args.exchange || "");
    return query;
  };

  // Prefer the last stored point from a prior trading date. Some older rows were missing point_date,
  // so fall back to point_at before today's UTC start instead of returning no previous close.
  const byDate = await base().lt("point_date", args.snapshotDate).maybeSingle();
  if (byDate.data) return byDate.data as GlobalPoint;

  const byTime = await base().lt("point_at", todayStartIso).maybeSingle();
  return (byTime.data as GlobalPoint) || null;
}

async function openingGlobalPoint(
  supabase: SupabaseAdmin,
  args: {
    listingId?: string | null;
    ticker: string;
    exchange: string | null;
    snapshotDate: string;
  },
): Promise<GlobalPoint | null> {
  const select =
    "id,listing_id,instrument_id,ticker,exchange_code,price_gbp,gbp_price,native_price,native_currency,quote_unit,source,point_at,observed_at,price_minute,fx_rate_to_gbp";
  const todayStartIso = `${args.snapshotDate}T00:00:00.000Z`;
  let query = supabase
    .from("investment_instrument_price_points")
    .select(select)
    .gte("point_at", todayStartIso)
    .order("point_at", { ascending: true })
    .limit(1);
  if (args.listingId) query = query.eq("listing_id", args.listingId);
  else
    query = query
      .eq("ticker", args.ticker)
      .eq("exchange_code", args.exchange || "");
  const { data } = await query.maybeSingle();
  return (data as GlobalPoint) || null;
}

async function seedProviderPreviousClosePoint(
  supabase: SupabaseAdmin,
  args: {
    link: CatalogueLink;
    quote: InvestmentQuote;
    ticker: string;
    exchange: string | null;
    sample: Holding;
    now: Date;
  },
): Promise<GlobalPoint | null> {
  const nativePrice = Number(args.quote.previousClose || 0);
  if (!Number.isFinite(nativePrice) || nativePrice <= 0) return null;
  const nativeCurrency = String(
    args.quote.previousCloseCurrency ||
      args.quote.currency ||
      currencyForExchange(args.exchange),
  ).toUpperCase();
  const converted = await quotePriceToGbp(nativePrice, nativeCurrency).catch(
    () => null as any,
  );
  const gbpPrice = Number(converted?.gbpPrice || 0);
  if (!Number.isFinite(gbpPrice) || gbpPrice <= 0) return null;
  const pointAt = previousTradingCloseIso(args.now, args.exchange, args.ticker);
  const pointMinute = floorMinuteIso(new Date(pointAt));
  const quoteUnit =
    args.quote.previousCloseQuoteUnit ||
    args.quote.priceQuoteUnit ||
    quoteUnitForVenue(args.exchange, nativeCurrency, args.ticker);
  const point: GlobalPoint = {
    listing_id: args.link.listingId,
    instrument_id: args.link.instrumentId,
    ticker: args.link.ticker,
    exchange_code: args.link.venueCode || args.link.exchange || "",
    price_gbp: gbpPrice,
    gbp_price: gbpPrice,
    native_price: nativePrice,
    native_currency: nativeCurrency,
    quote_unit: quoteUnit,
    fx_rate_to_gbp: Number(
      converted?.fxRate || (nativePrice > 0 ? gbpPrice / nativePrice : 1),
    ),
    source: `${args.quote.source || "provider"}; provider previous close`,
    point_at: pointAt,
    observed_at: pointAt,
    price_minute: pointMinute,
  };

  if (args.link.listingId) {
    await upsertGlobalPoint(supabase, {
      link: args.link,
      assetName: args.quote.assetName || args.sample.asset_name || args.ticker,
      assetKind: args.quote.assetType || args.sample.asset_kind || "share",
      isin: args.quote.isin || args.sample.isin || null,
      priceGbp: gbpPrice,
      nativePrice,
      nativeCurrency,
      quoteUnit,
      fxRateToGbp: point.fx_rate_to_gbp || 1,
      source: point.source || "provider previous close",
      sourceUrl: args.quote.sourceUrl || null,
      confidence: 80,
      pointAt,
      pointMinute,
    }).catch(() => null);
  }

  return point;
}

async function createCoverageRequiredAlert(
  supabase: SupabaseAdmin,
  args: {
    ticker: string;
    exchange: string | null;
    holdings: Holding[];
    reason: string;
    nowIso: string;
  },
) {
  const ticker = normaliseSnapshotTicker(args.ticker);
  const exchange = normaliseSnapshotExchange(args.exchange, ticker) || "";
  const holdingIds = args.holdings.map((holding) => holding.id);
  const userIds = Array.from(
    new Set(args.holdings.map((holding) => holding.user_id).filter(Boolean)),
  );
  const sample = args.holdings[0];
  const requestQuery = exchange ? `${ticker} · ${exchange}` : ticker;
  const progress = {
    ticker_found: false,
    investment_information_added: false,
    document_fee_information_added: false,
    starter_history_added: false,
    current_step:
      "Market worker skipped deterministic quote lookup; admin coverage required",
    worker_no_ai: true,
    reason: args.reason,
    holding_ids: holdingIds,
    user_ids: userIds,
  };

  try {
    const existing = await supabase
      .from("loop_investment_ai_market_requests")
      .select("id")
      .eq("request_query", requestQuery)
      .eq("exchange_hint", exchange || null)
      .in("status", [
        "planned",
        "queued",
        "needs_review",
        "in_progress",
      ])
      .limit(1)
      .maybeSingle();

    if (existing.data?.id) {
      await supabase
        .from("loop_investment_ai_market_requests")
        .update({
          status: "needs_review",
          progress,
          match_confidence: 0,
          updated_at: args.nowIso,
          inferred_market_code: exchange || null,
        } as any)
        .eq("id", existing.data.id);
      return existing.data.id as string;
    }

    const inserted = await supabase
      .from("loop_investment_ai_market_requests")
      .insert({
        prompt: `Coverage required for ${requestQuery}. The market worker does not use AI/web-search. Add or map the market/listing in Admin → Investment coverage, then re-enable polling for affected holdings.`,
        request_query: requestQuery,
        exchange_hint: exchange || null,
        inferred_market_code: exchange || null,
        status: "needs_review",
        created_by: sample?.user_id || null,
        match_confidence: 0,
        progress,
        updated_at: args.nowIso,
      } as any)
      .select("id")
      .maybeSingle();
    return inserted.data?.id || null;
  } catch {
    return null;
  }
}

async function upsertGlobalPoint(
  supabase: SupabaseAdmin,
  args: {
    link: CatalogueLink;
    assetName?: string | null;
    assetKind?: string | null;
    isin?: string | null;
    priceGbp: number;
    nativePrice: number;
    nativeCurrency: string;
    quoteUnit: string;
    fxRateToGbp: number;
    source: string;
    sourceUrl?: string | null;
    confidence?: number | null;
    pointAt: string;
    pointMinute: string;
  },
) {
  const exchangeCode = args.link.venueCode || args.link.exchange || "";
  const row = {
    listing_id: args.link.listingId,
    instrument_id: args.link.instrumentId,
    ticker: args.link.ticker,
    exchange_code: exchangeCode,
    price_gbp: args.priceGbp,
    gbp_price: args.priceGbp,
    native_price: args.nativePrice,
    native_currency: args.nativeCurrency,
    quote_unit: args.quoteUnit,
    fx_rate_to_gbp: args.fxRateToGbp,
    point_at: args.pointAt,
    observed_at: args.pointAt,
    price_minute: args.pointMinute,
    point_date: args.pointAt.slice(0, 10),
    source: args.source,
    source_url: args.sourceUrl || null,
    source_confidence: args.confidence ?? 85,
    quality: "live",
    bucket_interval: "raw",
  } as any;

  if (args.link.listingId) {
    await supabase
      .from("investment_instrument_price_points")
      .upsert(row, { onConflict: "listing_id,price_minute" });
    return;
  }

  await supabase.from("investment_instrument_price_points").insert(row);
}

export async function runInvestmentPriceSnapshotJob(
  options: RunnerOptions = {},
): Promise<RunnerResult> {
  const logger = options.logger || console;
  const supabase = createAdminClient();
  const now = options.now || new Date();
  const startedAt = now.toISOString();
  const snapshotBatchId = randomUUID();
  const pointMinute = floorMinuteIso(now);
  const settings = await loadInvestmentSnapshotSettings(supabase);
  const snapshotDate = now.toISOString().slice(0, 10);

  const result: RunnerResult = {
    ok: true,
    startedAt,
    finishedAt: startedAt,
    groups: 0,
    holdings: 0,
    checked: 0,
    inserted: 0,
    skippedClosed: 0,
    skippedRecent: 0,
    skippedDisabled: 0,
    pruned: 0,
    failed: 0,
    failures: [],
  };

  logger.log(
    `[investment-price-job] start ${startedAt} batch=${snapshotBatchId}`,
  );

  if (!settings.enabled && !options.force) {
    result.skippedDisabled = 1;
    result.finishedAt = new Date().toISOString();
    logger.log(
      `[investment-price-job] skipped: investment snapshot storage disabled`,
    );
    return result;
  }

  try {
    const { data: holdings, error } = await supabase
      .from("investment_holdings")
      .select(
        "id, user_id, investment_account_id, ticker, exchange, units, average_buy_price, latest_price, price_polling_enabled, last_price_check_at, import_source_type, external_provider, asset_name, asset_kind, isin, listing_id, instrument_id, instrument_resolution_status",
      )
      .not("ticker", "is", null)
      .neq("record_status", "archived")
      .order("ticker")
      .returns<Holding[]>();

    if (error) throw error;

    let activeHoldings = (holdings || []).filter(
      (holding) =>
        normaliseSnapshotTicker(holding.ticker) &&
        holding.price_polling_enabled !== false,
    );

    const userIds = Array.from(
      new Set(activeHoldings.map((holding) => holding.user_id).filter(Boolean)),
    );
    const { data: profiles } = userIds.length
      ? await supabase
          .from("app_user_profiles")
          .select(
            "user_id, payment_tier, payment_tier_status, payment_tier_override, market_data_tier, market_data_tier_override, market_data_provider_status, market_data_realtime_enabled",
          )
          .in("user_id", userIds)
      : { data: [] as UserProfileRow[] };
    const profileByUser = new Map<string, UserProfileRow>(
      (profiles || []).map((profile: any) => [
        profile.user_id,
        profile as UserProfileRow,
      ]),
    );

    if (settings.realtimeUsersOnly && !options.force && activeHoldings.length) {
      const realtimeUsers = new Set(
        (profiles || [])
          .filter(
            (profile: any) =>
              investmentDataEntitlementForProfile(profile)
                .canUseRealtimePrices ||
              profile.market_data_realtime_enabled === true,
          )
          .map((profile: any) => profile.user_id),
      );
      const before = activeHoldings.length;
      activeHoldings = activeHoldings.filter((holding) =>
        realtimeUsers.has(holding.user_id),
      );
      result.skippedDisabled += before - activeHoldings.length;
    }

    result.holdings = activeHoldings.length;
    logger.log(
      `[investment-price-job] loaded ${activeHoldings.length} polling-enabled holdings`,
    );

    const groups = new Map<string, Holding[]>();
    activeHoldings.forEach((holding) => {
      const key = keyFor(holding.ticker, holding.exchange);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(holding);
    });
    result.groups = groups.size;
    logger.log(
      `[investment-price-job] distinct ticker/exchange groups: ${groups.size}`,
    );

    const contextLookbackMinutes = Math.max(
      12 * 60,
      Number(settings.freeMinutes || 0),
      Number(settings.plusProMinutes || 0),
      Number(settings.realtimeMinutes || 0),
    );
    const contextSinceIso = new Date(
      now.getTime() - contextLookbackMinutes * 60 * 1000,
    ).toISOString();
    let contextByListing = new Map<string, GlobalPointContext>();
    if (settings.globalRawPricePoints) {
      try {
        contextByListing = await loadGlobalPointContexts(supabase, {
          listingIds: activeHoldings
            .map((holding) => holding.listing_id || "")
            .filter(Boolean),
          snapshotDate,
          sinceIso: contextSinceIso,
        });
        logger.log(
          `[investment-price-job] prefetched price context for ${contextByListing.size} listing(s) in one database call`,
        );
      } catch (caught) {
        logger.warn(
          `[investment-price-job] bulk price context unavailable; using per-listing fallback`,
          caught,
        );
      }
    }

    const touchedUserIds = new Set<string>();
    const groupEntries = Array.from(groups.entries());
    await mapLimit(
      groupEntries,
      PRICE_QUOTE_CONCURRENCY,
      async ([groupKey, groupHoldings]) => {
        const first = groupHoldings[0];
        const ticker = normaliseSnapshotTicker(first.ticker);
        const exchange = normaliseSnapshotExchange(
          first.exchange,
          first.ticker,
        );
        const venue = venueFor(exchange, ticker);

        const isProviderFund = String(first.asset_kind || "").toLowerCase() === "fund" || /^GB00[A-Z0-9]{8}$/i.test(ticker) || /vanguard|fund/i.test(String(exchange || ""));
        if (
          !options.force &&
          settings.marketHoursOnly &&
          !isProviderFund &&
          !isRoughMarketOpen(exchange, now, ticker)
        ) {
          result.skippedClosed += groupHoldings.length;
          logger.log(`[investment-price-job] skip closed ${groupKey}`);
          return;
        }

        const dueHoldings = groupHoldings.filter((holding) =>
          isDue(
            holding,
            profileByUser.get(holding.user_id),
            settings,
            now,
            options.force,
          ),
        );
        if (!dueHoldings.length) {
          result.skippedRecent += groupHoldings.length;
          logger.log(`[investment-price-job] skip recent ${groupKey}`);
          return;
        }

        result.checked += dueHoldings.length;
        logger.log(
          `[investment-price-job] fetching one market quote for ${ticker} ${exchange || ""}; ${dueHoldings.length} holding value snapshot(s) depend on it`,
        );

        const link = await ensureCatalogueForGroup(supabase, {
          ticker,
          exchange,
          sample: first,
          nowIso: startedAt,
        });
        const fastestCadence = Math.min(
          ...dueHoldings.map((holding) =>
            userCadenceMinutes(profileByUser.get(holding.user_id), settings),
          ),
        );
        const globalSince = new Date(
          now.getTime() - fastestCadence * 60 * 1000,
        ).toISOString();
        const prefetchedContext = link.listingId
          ? contextByListing.get(link.listingId)
          : undefined;
        const prefetchedLatest = prefetchedContext?.latestPoint || null;
        const cachedCandidate =
          settings.globalRawPricePoints && !options.force
            ? prefetchedContext
              ? prefetchedLatest
              : await latestGlobalPricePoint(supabase, {
                  listingId: link.listingId,
                  ticker,
                  exchange,
                  sinceIso: globalSince,
                })
            : null;
        // A one-minute entitlement means one provider check in every new clock
        // minute. A rolling "you checked 59 seconds ago" cache could otherwise
        // skip alternate minute buckets when worker start times drift slightly.
        const cachedCandidateMinute = cachedCandidate
          ? cachedCandidate.price_minute ||
            floorMinuteIso(new Date(pointAt(cachedCandidate)))
          : null;
        const cachedPoint = cachedCandidate &&
          (fastestCadence <= 1
            ? cachedCandidateMinute === pointMinute
            : globalPointIsFresh(cachedCandidate, globalSince))
          ? cachedCandidate
          : null;

        const quote = cachedPoint
          ? null
          : await fetchInvestmentQuote(
              supabase,
              first.user_id,
              ticker,
              exchange,
            ).catch((caught) => {
              logger.error(
                `[investment-price-job] quote error ${ticker}`,
                caught,
              );
              return null;
            });

        if (
          !cachedPoint &&
          (!quote ||
            !Number.isFinite(Number(quote.price)) ||
            Number(quote.price) <= 0)
        ) {
          result.failed += dueHoldings.length;
          result.failures.push({
            ticker,
            exchange,
            reason: "coverage_required_quote_not_found",
          });
          logger.warn(
            `[investment-price-job] coverage required ${ticker} ${exchange || ""}; AI/web-search is disabled in worker. Polling will ${PAUSE_ON_COVERAGE_REQUIRED ? "pause" : "retry on the next cycle"} for affected holdings`,
          );
          const requestId = await createCoverageRequiredAlert(supabase, {
            ticker,
            exchange,
            holdings: dueHoldings,
            reason: "quote_not_found",
            nowIso: startedAt,
          });
          await supabase
            .from("investment_holdings")
            .update({
              last_price_check_at: startedAt,
              price_check_status: PAUSE_ON_COVERAGE_REQUIRED
                ? "coverage_required"
                : "coverage_retry",
              price_polling_enabled: PAUSE_ON_COVERAGE_REQUIRED ? false : true,
              instrument_resolution_status: "coverage_required",
              instrument_resolution_notes: requestId
                ? `No deterministic quote found. Admin coverage request ${requestId} created; ${PAUSE_ON_COVERAGE_REQUIRED ? "polling paused" : "polling will retry each worker cycle"}.`
                : `No deterministic quote found. Admin coverage required; ${PAUSE_ON_COVERAGE_REQUIRED ? "polling paused" : "polling will retry each worker cycle"}.`,
              updated_at: startedAt,
            } as any)
            .in(
              "id",
              dueHoldings.map((holding) => holding.id),
            );
          return;
        }

        const nativeCurrency = cachedPoint
          ? String(
              cachedPoint.native_currency || currencyForExchange(exchange),
            ).toUpperCase()
          : String(quote!.priceQuoteUnit || "").toLowerCase() === "gbx"
            ? "GBX"
            : String(
                quote!.currency ||
                  currencyForExchange(quote!.exchange || exchange),
              ).toUpperCase();
        const nativePrice = cachedPoint
          ? Number(cachedPoint.native_price || 0)
          : Number(quote!.price || 0);
        const converted = cachedPoint
          ? {
              gbpPrice: pointGbp(cachedPoint),
              fxRate:
                nativePrice > 0
                  ? pointGbp(cachedPoint) / nativePrice
                  : Number(cachedPoint.fx_rate_to_gbp || 1),
              fxSource: "global price point",
            }
          : await quotePriceToGbp(nativePrice, nativeCurrency);
        const quoteUnit =
          cachedPoint?.quote_unit ||
          quote?.priceQuoteUnit ||
          quoteUnitForVenue(exchange, nativeCurrency, ticker);
        const pointSource = cachedPoint
          ? `${cachedPoint.source || "global price point"}; reused`
          : `${quote!.source}; ${converted.fxSource}`;
        const quotePointAt = cachedPoint
          ? String(cachedPoint.observed_at || cachedPoint.point_at || startedAt)
          : quoteObservationTime(quote!.observedAt, startedAt);
        const quotePointMinute = floorMinuteIso(new Date(quotePointAt));

        if (!cachedPoint && settings.globalRawPricePoints) {
          await upsertGlobalPoint(supabase, {
            link,
            assetName: quote!.assetName || first.asset_name || ticker,
            assetKind: quote!.assetType || first.asset_kind || "share",
            isin: quote!.isin || first.isin || null,
            priceGbp: Number(converted.gbpPrice),
            nativePrice: Number(quote!.price || 0),
            nativeCurrency,
            quoteUnit,
            fxRateToGbp: Number((converted as any).fxRate || 1),
            source: `${quote!.source}; ${converted.fxSource}`,
            sourceUrl: quote!.sourceUrl || null,
            confidence: 85,
            pointAt: quotePointAt,
            pointMinute: quotePointMinute,
          });
        }

        let previousClose = prefetchedContext
          ? prefetchedContext.previousClosePoint
          : await previousCloseGlobalPoint(supabase, {
              listingId: link.listingId,
              ticker,
              exchange,
              snapshotDate,
            });
        if (!previousClose && !cachedPoint && quote?.previousClose) {
          previousClose = await seedProviderPreviousClosePoint(supabase, {
            link,
            quote,
            ticker,
            exchange,
            sample: first,
            now,
          });
          if (previousClose)
            logger.log(
              `[investment-price-job] seeded provider previous close for ${ticker} @ ${pointGbp(previousClose)} GBP`,
            );
        }
        const previousCloseGbp = pointGbp(previousClose);
        const previousCloseNative = Number(previousClose?.native_price || 0);
        const previousCloseAt = pointAt(previousClose) || null;

        // v28.54: user-facing daily movement now tracks movement since market open / first
        // stored point today. Previous close is retained where providers give it, but it is
        // no longer required for cards to show movement during the current session.
        const currentPoint: GlobalPoint =
          cachedPoint || {
            listing_id: link.listingId,
            instrument_id: link.instrumentId,
            ticker: link.ticker,
            exchange_code: link.venueCode || link.exchange || "",
            price_gbp: Number(converted.gbpPrice),
            gbp_price: Number(converted.gbpPrice),
            native_price: nativePrice,
            native_currency: nativeCurrency,
            quote_unit: quoteUnit,
            source: pointSource,
            point_at: startedAt,
            observed_at: startedAt,
            price_minute: pointMinute,
            fx_rate_to_gbp: Number((converted as any).fxRate || 1),
          };
        let openingPoint = prefetchedContext
          ? prefetchedContext.openingPoint
          : await openingGlobalPoint(supabase, {
              listingId: link.listingId,
              ticker,
              exchange,
              snapshotDate,
            });
        if (!openingPoint && pointAt(currentPoint).slice(0, 10) === snapshotDate) {
          openingPoint = currentPoint;
        }
        let openingGbp = pointGbp(openingPoint) || Number(converted.gbpPrice);
        let openingNative =
          Number(openingPoint?.native_price || 0) || nativePrice;
        let openingAt = pointAt(openingPoint) || startedAt;

        // The stored "opening point" is only ever written once per day (the first successful
        // check), so if that single write happened to catch a bad/stale tick — not uncommon for
        // thinly-traded stocks on free-tier data — every comparison for the rest of the day
        // inherits that bad anchor, and the wrong number keeps reappearing on every refresh even
        // though the *current* price is fine. quote.previousClose, by contrast, comes from the
        // exact same live API response as today's current price on every single call, so it can't
        // go stale the same way. Use it to validate (and if needed, override) the stored point.
        if (quote?.previousClose && quote.previousClose > 0) {
          const freshPreviousClose = await quotePriceToGbp(
            quote.previousClose,
            quote.previousCloseCurrency || nativeCurrency,
          );
          const freshPreviousCloseGbp = Number(freshPreviousClose.gbpPrice || 0);
          const agreesWithStored =
            openingGbp > 0 &&
            freshPreviousCloseGbp > 0 &&
            freshPreviousCloseGbp / openingGbp > 0.85 &&
            freshPreviousCloseGbp / openingGbp < 1.15;
          if (freshPreviousCloseGbp > 0 && !agreesWithStored) {
            logger.log(
              `[investment-price-job] ${ticker}: stored opening reference (${openingGbp} GBP) disagreed with fresh previous-close (${freshPreviousCloseGbp} GBP) — trusting the fresh value.`,
            );
            openingGbp = freshPreviousCloseGbp;
            openingNative = Number(quote.previousClose || 0);
            openingAt = startedAt;
          }
        }

        // Sanity guard: an opening reference that's wildly different from today's price (more
        // than 10x either way) almost always means the reference point is stale/broken data
        // rather than a genuine 10x move in a day — null it out rather than store a spurious
        // four-figure swing that would surface as a spike in the UI.
        const openingIsSane = openingGbp > 0 && Number(converted.gbpPrice) / openingGbp > 0.5 && Number(converted.gbpPrice) / openingGbp < 2;
        const openingNativeIsSane = openingNative > 0 && nativePrice / openingNative > 0.5 && nativePrice / openingNative < 2;
        const dayChangeGbp =
          openingIsSane ? Number(converted.gbpPrice) - openingGbp : null;
        const dayChangePercent =
          openingIsSane
            ? ((Number(converted.gbpPrice) - openingGbp) / openingGbp) * 100
            : null;
        const dayChangeNative =
          openingNativeIsSane ? nativePrice - openingNative : null;
        const dayChangeNativePercent =
          openingNativeIsSane
            ? ((nativePrice - openingNative) / openingNative) * 100
            : null;

        // Rebase units for any holding transitioning from a placeholder/manual price basis to a
        // real, instrument-resolved market price for the first time. Without this, a holding
        // whose units were sized under a "1 unit = £1 of value" convention (Moneybox wrapper
        // positions, or any manually-entered holding with no real share count) would have its
        // displayed value balloon the moment a real per-unit price attaches, since
        // value = units * price and units was never sized for a real price. This preserves the
        // holding's value at the moment of transition instead of multiplying it by accident.
        const transitioningHoldingIds = new Set<string>();
        for (const holding of dueHoldings) {
          if (holding.instrument_resolution_status === "resolved") continue;
          const priorUnits = Number(holding.units || 0);
          const priorPrice = Number(holding.latest_price || 0);
          const priorValue = priorUnits * priorPrice;
          if (priorValue > 0 && Number(converted.gbpPrice) > 0) {
            holding.units = priorValue / Number(converted.gbpPrice);
            transitioningHoldingIds.add(holding.id);
          }
        }

        // Per-holding rows are now a daily/event ledger. Intraday chart history comes
        // from the shared listing series plus one aggregate value row per user scope.
        const dailyHoldings = dueHoldings.filter(
          (holding) =>
            !holding.last_price_check_at ||
            holding.last_price_check_at.slice(0, 10) !== snapshotDate,
        );
        const dailySnapshotAt = `${snapshotDate}T00:00:00.000Z`;
        const rows = dailyHoldings.map((holding) => {
          const units = Number(holding.units || 0);
          const nativeValue = units * Number(nativePrice || 0);
          const gbpValue = nativeValue * Number((converted as any).fxRate || 1);
          return {
            user_id: holding.user_id,
            holding_id: holding.id,
            instrument_id: link.instrumentId,
            listing_id: link.listingId,
            price: converted.gbpPrice,
            units,
            value: gbpValue,
            native_price: nativePrice,
            native_value: nativeValue,
            native_currency: nativeCurrency,
            fx_rate_to_gbp: Number((converted as any).fxRate || 1),
            fx_source: (converted as any).fxSource || null,
            previous_close_price_gbp: previousCloseGbp || null,
            previous_close_native_price: previousCloseNative || null,
            previous_close_at: previousCloseAt,
            day_open_price_gbp: openingGbp || null,
            day_open_native_price: openingNative || null,
            day_open_at: openingAt,
            day_change_basis: "open",
            day_change_gbp: dayChangeGbp,
            day_change_percent: dayChangePercent,
            day_change_native: dayChangeNative,
            day_change_native_percent: dayChangeNativePercent,
            snapshot_date: snapshotDate,
            snapshot_at: dailySnapshotAt,
            snapshot_minute: dailySnapshotAt,
            snapshot_batch_id: snapshotBatchId,
            source: pointSource,
            bucket_interval: "1d",
          } as any;
        });

        if (rows.length) {
          const insert = await supabase
            .from("investment_price_snapshots")
            .upsert(rows, { onConflict: "user_id,holding_id,snapshot_minute" });
          if (insert.error) {
            result.failures.push({
              ticker,
              exchange,
              reason: `daily_holding_snapshot_failed: ${insert.error.message}`,
            });
            logger.warn(
              `[investment-price-job] daily holding snapshot failed ${ticker}: ${insert.error.message}`,
            );
          } else {
            result.inserted += rows.length;
          }
        }
        logger.log(
          `[investment-price-job] stored ${cachedPoint ? "reused" : "new"} global quote for ${ticker}; daily holding rows=${rows.length} @ ${converted.gbpPrice} GBP (${cachedPoint ? "cached" : quote!.price} ${nativeCurrency}) cadence=${fastestCadence}m listing=${link.listingId || "legacy"}`,
        );

        for (const holding of dueHoldings) touchedUserIds.add(holding.user_id);

        const steadyHoldings = dueHoldings.filter((holding) => !transitioningHoldingIds.has(holding.id));
        const transitioningHoldings = dueHoldings.filter((holding) => transitioningHoldingIds.has(holding.id));

        if (steadyHoldings.length) {
          const update = await supabase
            .from("investment_holdings")
            .update({
              instrument_id: link.instrumentId,
              listing_id: link.listingId,
              instrument_resolution_status: "resolved",
              instrument_resolution_notes: venue?.name
                ? `Priced from ${venue.name}`
                : `Priced from ${exchange || "market data"}`,
              latest_price: converted.gbpPrice,
              latest_price_date: snapshotDate,
              currency: "GBP",
              native_latest_price: nativePrice,
              native_currency: nativeCurrency,
              native_exchange: link.venueCode || exchange,
              latest_fx_rate_to_gbp: Number((converted as any).fxRate || 1),
              latest_fx_source: (converted as any).fxSource || null,
              previous_close_price_gbp: previousCloseGbp || null,
              previous_close_native_price: previousCloseNative || null,
              previous_close_native_currency:
                previousClose?.native_currency || nativeCurrency,
              previous_close_at: previousCloseAt,
              day_open_price_gbp: openingGbp || null,
              day_open_native_price: openingNative || null,
              day_open_at: openingAt,
              day_change_basis: "open",
              day_change_gbp: dayChangeGbp,
              day_change_percent: dayChangePercent,
              day_change_native: dayChangeNative,
              day_change_native_percent: dayChangeNativePercent,
              source_url: cachedPoint
                ? `market-data:${cachedPoint.source || "global"}:${ticker}`
                : `market-data:${quote!.source}:${quote!.rawSymbol}${quote!.sourceUrl ? `|${quote!.sourceUrl}` : ""}`,
              last_price_check_at: startedAt,
              price_check_status: "ok",
              updated_at: startedAt,
            } as any)
            .in(
              "id",
              steadyHoldings.map((holding) => holding.id),
            );

          if (update.error) {
            result.failures.push({
              ticker,
              exchange,
              reason: `holding_update_failed: ${update.error.message}`,
            });
            logger.warn(
              `[investment-price-job] holding update failed ${ticker}: ${update.error.message}`,
            );
          }
        }

        // Transitioning holdings get their own update, one at a time, because each needs its
        // own rebased unit count. Day-change fields are deliberately left flat/null: comparing
        // today's real price against yesterday's placeholder price isn't a valid comparison,
        // so we suppress it for this one snapshot rather than show a spurious spike. Normal
        // day-change reporting resumes from the next snapshot onward, once latest_price and
        // day_open_price_gbp are both on the same real-price basis.
        for (const holding of transitioningHoldings) {
          const update = await supabase
            .from("investment_holdings")
            .update({
              instrument_id: link.instrumentId,
              listing_id: link.listingId,
              instrument_resolution_status: "resolved",
              instrument_resolution_notes: `${venue?.name ? `Priced from ${venue.name}` : `Priced from ${exchange || "market data"}`} — units rebased from £${Number(holding.average_buy_price || 0) || "1"}-per-unit placeholder to preserve prior value.`,
              latest_price: converted.gbpPrice,
              latest_price_date: snapshotDate,
              currency: "GBP",
              units: holding.units,
              native_latest_price: nativePrice,
              native_currency: nativeCurrency,
              native_exchange: link.venueCode || exchange,
              latest_fx_rate_to_gbp: Number((converted as any).fxRate || 1),
              latest_fx_source: (converted as any).fxSource || null,
              previous_close_price_gbp: null,
              previous_close_native_price: null,
              previous_close_native_currency: null,
              previous_close_at: null,
              day_open_price_gbp: converted.gbpPrice,
              day_open_native_price: nativePrice,
              day_open_at: startedAt,
              day_change_basis: "open",
              day_change_gbp: 0,
              day_change_percent: 0,
              day_change_native: 0,
              day_change_native_percent: 0,
              source_url: cachedPoint
                ? `market-data:${cachedPoint.source || "global"}:${ticker}`
                : `market-data:${quote!.source}:${quote!.rawSymbol}${quote!.sourceUrl ? `|${quote!.sourceUrl}` : ""}`,
              last_price_check_at: startedAt,
              price_check_status: "ok",
              updated_at: startedAt,
            } as any)
            .eq("id", holding.id);

          if (update.error) {
            result.failures.push({
              ticker,
              exchange,
              reason: `holding_rebase_failed: ${update.error.message}`,
            });
            logger.warn(
              `[investment-price-job] holding rebase failed ${ticker} (${holding.id}): ${update.error.message}`,
            );
          } else {
            logger.log(
              `[investment-price-job] rebased ${ticker} holding ${holding.id} from placeholder to real price @ ${converted.gbpPrice} GBP/unit (${holding.units} units)`,
            );
          }
        }
      },
    );

    // One value point per user/account cadence replaces minute-by-minute rows for
    // every holding. This is deliberately one pair of bulk reads and one bulk write,
    // independent of the number of ticker groups processed above.
    if (touchedUserIds.size) {
      const touched = Array.from(touchedUserIds);
      const [{ data: valueHoldings, error: valueHoldingsError }, { data: valueAccounts, error: valueAccountsError }] =
        await Promise.all([
          supabase
            .from("investment_holdings")
            .select("id, user_id, investment_account_id, units, latest_price, imported_current_value")
            .in("user_id", touched)
            .neq("record_status", "archived"),
          supabase
            .from("investment_accounts")
            .select("id, user_id, provider_cash_value")
            .in("user_id", touched)
            .neq("record_status", "archived"),
        ]);

      if (valueHoldingsError || valueAccountsError) {
        result.failures.push({
          ticker: "portfolio",
          exchange: null,
          reason: `aggregate_snapshot_inputs_failed: ${valueHoldingsError?.message || valueAccountsError?.message}`,
        });
      } else {
        const holdingsByUser = new Map<string, any[]>();
        for (const holding of valueHoldings || []) {
          const rows = holdingsByUser.get(holding.user_id) || [];
          rows.push(holding);
          holdingsByUser.set(holding.user_id, rows);
        }
        const accountsByUser = new Map<string, any[]>();
        for (const account of valueAccounts || []) {
          const rows = accountsByUser.get(account.user_id) || [];
          rows.push(account);
          accountsByUser.set(account.user_id, rows);
        }

        const aggregateRows: any[] = [];
        for (const userId of touched) {
          const cadence = userCadenceMinutes(profileByUser.get(userId), settings);
          const bucketAt = floorCadenceIso(now, cadence);
          const userHoldings = holdingsByUser.get(userId) || [];
          const userAccounts = accountsByUser.get(userId) || [];
          const accountCash = new Map(
            userAccounts.map((account) => [account.id, Number(account.provider_cash_value || 0)]),
          );
          const accountIds = new Set<string>([
            ...userAccounts.map((account) => account.id),
            ...userHoldings.map((holding) => holding.investment_account_id).filter(Boolean),
          ]);
          const holdingValue = (holding: any) => {
            const marketValue = Number(holding.units || 0) * Number(holding.latest_price || 0);
            return marketValue > 0 ? marketValue : Number(holding.imported_current_value || 0);
          };
          const portfolioHoldingsValue = userHoldings.reduce(
            (sum, holding) => sum + holdingValue(holding),
            0,
          );
          const portfolioCash = Array.from(accountCash.values()).reduce((sum, value) => sum + value, 0);
          aggregateRows.push({
            user_id: userId,
            investment_account_id: null,
            scope_key: "portfolio",
            snapshot_at: startedAt,
            snapshot_minute: bucketAt,
            total_value_gbp: portfolioHoldingsValue + portfolioCash,
            holdings_value_gbp: portfolioHoldingsValue,
            cash_value_gbp: portfolioCash,
            holdings_count: userHoldings.length,
            source: "market worker aggregate",
            bucket_interval: `${cadence}m`,
          });
          for (const accountId of accountIds) {
            const accountHoldings = userHoldings.filter(
              (holding) => holding.investment_account_id === accountId,
            );
            const holdingsValue = accountHoldings.reduce(
              (sum, holding) => sum + holdingValue(holding),
              0,
            );
            const cashValue = Number(accountCash.get(accountId) || 0);
            aggregateRows.push({
              user_id: userId,
              investment_account_id: accountId,
              scope_key: `account:${accountId}`,
              snapshot_at: startedAt,
              snapshot_minute: bucketAt,
              total_value_gbp: holdingsValue + cashValue,
              holdings_value_gbp: holdingsValue,
              cash_value_gbp: cashValue,
              holdings_count: accountHoldings.length,
              source: "market worker aggregate",
              bucket_interval: `${cadence}m`,
            });
          }
        }

        const aggregateInsert = await supabase
          .from("investment_portfolio_value_snapshots")
          .upsert(aggregateRows, { onConflict: "user_id,scope_key,snapshot_minute" });
        if (aggregateInsert.error) {
          result.failures.push({
            ticker: "portfolio",
            exchange: null,
            reason: `aggregate_snapshot_failed: ${aggregateInsert.error.message}`,
          });
        } else {
          result.inserted += aggregateRows.length;
          logger.log(`[investment-price-job] wrote ${aggregateRows.length} aligned portfolio/account aggregate snapshot(s)`);
        }
      }
    }

    // Retention is database-scheduled. Only explicit admin/maintenance calls
    // should run it here; the minute-level price endpoint must not compact the
    // same tables on every cycle.
    if (options.prune === true) {
      const maintenance = await runInvestmentSnapshotMaintenance(supabase, {
        logger,
        now,
      });
      result.pruned += maintenance.pruned;
      for (const failure of maintenance.failures) result.failures.push(failure);
    } else {
      logger.log(
        `[investment-price-job] retention maintenance skipped for this run; worker maintenance handles it separately`,
      );
    }
  } catch (caught) {
    result.ok = false;
    result.failed += 1;
    const message = caught instanceof Error ? caught.message : String(caught);
    result.failures.push({ ticker: "job", exchange: null, reason: message });
    logger.error(`[investment-price-job] fatal`, caught);
  }

  result.finishedAt = new Date().toISOString();
  logger.log(
    `[investment-price-job] done inserted=${result.inserted} checked=${result.checked} failed=${result.failed}`,
  );
  return result;
}

export async function runInvestmentSnapshotMaintenance(
  supabase: SupabaseAdmin,
  options: {
    now?: Date;
    logger?: Pick<Console, "log" | "warn" | "error">;
  } = {},
): Promise<{
  ok: boolean;
  pruned: number;
  global: any;
  snapshots: any;
  failures: Array<{ ticker: string; exchange: string | null; reason: string }>;
}> {
  const logger = options.logger || console;
  const now = options.now || new Date();
  const failures: Array<{
    ticker: string;
    exchange: string | null;
    reason: string;
  }> = [];
  let pruned = 0;

  logger.log(`[investment-maintenance] start ${now.toISOString()}`);

  let retention: { data: any; error: any };
  try {
    retention = (await supabase.rpc(
      "loop_downsample_instrument_prices",
    )) as any;
  } catch (error: any) {
    retention = { data: null, error };
  }
  if (retention.error) {
    failures.push({
      ticker: "retention",
      exchange: null,
      reason: retention.error.message || String(retention.error),
    });
    logger.warn(
      `[investment-maintenance] unified retention failed: ${retention.error.message || retention.error}`,
    );
  } else {
    pruned += Number(retention.data?.rows_removed || 0);
  }

  logger.log(
    `[investment-maintenance] done pruned=${pruned} failures=${failures.length}`,
  );
  return {
    ok: failures.length === 0,
    pruned,
    global: retention.data || null,
    snapshots: retention.data || null,
    failures,
  };
}

// One-time (safely re-runnable) repair for holdings whose STORED day-change figures predate
// the sanity guards in this file (e.g. a previous_close/day_open reference that was written with
// a currency-scale bug, like pence vs pounds). Rather than guess at the exact historical cause,
// this simply nulls out any implausible stored day-change so the next successful price check
// recomputes it cleanly through the current, guarded logic — it never touches units or price.
export async function repairImplausibleDayChanges(
  supabase: SupabaseAdmin,
  options: { thresholdPercent?: number; logger?: { log: (...args: unknown[]) => void; warn: (...args: unknown[]) => void } } = {},
): Promise<{ checked: number; repaired: number; failures: { id: string; reason: string }[] }> {
  const logger = options.logger || console;
  const threshold = Math.abs(options.thresholdPercent ?? 20);
  const result = { checked: 0, repaired: 0, failures: [] as { id: string; reason: string }[] };

  const { data: holdings, error } = await supabase
    .from("investment_holdings")
    .select("id, day_change_percent")
    .neq("record_status", "archived")
    .not("day_change_percent", "is", null);

  if (error) throw error;

  const implausible = (holdings || []).filter((holding) => Math.abs(Number(holding.day_change_percent || 0)) > threshold);
  result.checked = (holdings || []).length;

  for (const holding of implausible) {
    const { error: updateError } = await supabase
      .from("investment_holdings")
      .update({
        day_change_gbp: null,
        day_change_percent: null,
        day_change_native: null,
        day_change_native_percent: null,
        previous_close_price_gbp: null,
        previous_close_native_price: null,
        previous_close_at: null,
        day_open_price_gbp: null,
        day_open_native_price: null,
        day_open_at: null,
      } as any)
      .eq("id", holding.id);

    if (updateError) {
      result.failures.push({ id: holding.id, reason: updateError.message });
      logger.warn(`[day-change-repair] failed for holding ${holding.id}: ${updateError.message}`);
    } else {
      result.repaired += 1;
    }
  }

  logger.log(`[day-change-repair] checked=${result.checked} repaired=${result.repaired} (threshold ±${threshold}%) failures=${result.failures.length}`);
  return result;
}

// One-time (safely re-runnable) backfill for Moneybox-sourced holdings created before the
// catalogue carried real ISINs. This ONLY ever writes the `isin` column — it never touches
// units, price, or any valuation field.
export async function backfillMoneyboxHoldingIsins(
  supabase: SupabaseAdmin,
  options: { logger?: { log: (...args: unknown[]) => void; warn: (...args: unknown[]) => void } } = {},
): Promise<{ checked: number; updated: number; skipped: number; failures: { id: string; reason: string }[] }> {
  const logger = options.logger || console;
  const result = { checked: 0, updated: 0, skipped: 0, failures: [] as { id: string; reason: string }[] };

  const { data: holdings, error } = await supabase
    .from("investment_holdings")
    .select("id, asset_name, isin")
    .eq("group_label", "Moneybox allocation")
    .is("isin", null)
    .neq("record_status", "archived");

  if (error) throw error;

  for (const holding of holdings || []) {
    result.checked += 1;
    const asset = findMoneyboxAsset(holding.asset_name || "");
    if (!asset?.isin) {
      result.skipped += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from("investment_holdings")
      .update({ isin: asset.isin, updated_at: new Date().toISOString() } as any)
      .eq("id", holding.id);

    if (updateError) {
      result.failures.push({ id: holding.id, reason: updateError.message });
      logger.warn(
        `[moneybox-isin-backfill] failed for holding ${holding.id}: ${updateError.message}`,
      );
    } else {
      result.updated += 1;
    }
  }

  logger.log(
    `[moneybox-isin-backfill] checked=${result.checked} updated=${result.updated} skipped=${result.skipped} failures=${result.failures.length}`,
  );
  return result;
}

