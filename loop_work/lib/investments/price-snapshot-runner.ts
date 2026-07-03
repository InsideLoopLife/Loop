import { createAdminClient } from "@/lib/supabase/admin";
import { fetchInvestmentQuote, isRoughMarketOpen, normaliseExchangeCode } from "@/lib/investments/market-data";
import { currencyForExchange, quotePriceToGbp } from "@/lib/investments/fx";
import { loadInvestmentSnapshotSettings } from "@/lib/investments/snapshot-settings";
import { investmentDataEntitlementForProfile } from "@/lib/wealth/user-tiers";
import { quoteUnitForVenue, venueFor } from "@/lib/investments/market-venues";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type Holding = {
  id: string;
  user_id: string;
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

function normaliseSnapshotTicker(ticker: string | null | undefined) {
  return String(ticker || "").trim().toUpperCase().replace(/\.UK$/i, ".L");
}

function normaliseSnapshotExchange(exchange: string | null | undefined, ticker?: string | null) {
  return normaliseExchangeCode(exchange, ticker) || null;
}

function keyFor(ticker: string | null | undefined, exchange: string | null | undefined) {
  return `${normaliseSnapshotTicker(ticker)}|${normaliseSnapshotExchange(exchange, ticker) || ""}`;
}

function floorMinuteIso(date: Date) {
  const d = new Date(date.getTime());
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

function userCadenceMinutes(profile: UserProfileRow | undefined, settings: Awaited<ReturnType<typeof loadInvestmentSnapshotSettings>>) {
  const tier = String(profile?.market_data_tier_override || profile?.market_data_tier || profile?.payment_tier_override || profile?.payment_tier || "free").toLowerCase();
  const realtime = investmentDataEntitlementForProfile((profile || {}) as any).canUseRealtimePrices || tier === "realtime" || tier === "pro_realtime" || tier === "enterprise" || profile?.market_data_realtime_enabled === true;
  if (realtime) return Math.max(1, settings.realtimeMinutes);
  if (["plus", "pro", "premium", "go"].includes(tier)) return Math.max(1, settings.plusProMinutes);
  return Math.max(1, settings.freeMinutes);
}

function isDue(holding: Holding, profile: UserProfileRow | undefined, settings: Awaited<ReturnType<typeof loadInvestmentSnapshotSettings>>, now: Date, force?: boolean) {
  if (force) return true;
  const cadence = userCadenceMinutes(profile, settings);
  const last = holding.last_price_check_at ? Date.parse(holding.last_price_check_at) : 0;
  if (!Number.isFinite(last) || last <= 0) return true;
  return now.getTime() - last >= cadence * 60 * 1000;
}

function pointGbp(point: GlobalPoint | null | undefined) {
  return Number(point?.gbp_price ?? point?.price_gbp ?? 0);
}

function pointAt(point: GlobalPoint | null | undefined) {
  return String(point?.point_at || point?.observed_at || point?.price_minute || "");
}

async function ensureCatalogueForGroup(
  supabase: SupabaseAdmin,
  args: { ticker: string; exchange: string | null; sample: Holding; nowIso: string },
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

  if (!instrumentId) {
    const { data, error } = await supabase
      .from("investment_instruments")
      .upsert({
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
      } as any, { onConflict: "ticker,exchange_code" })
      .select("id")
      .maybeSingle();
    if (!error) instrumentId = data?.id || null;
  }

  if (!listingId) {
    const { data, error } = await supabase
      .from("investment_instrument_listings")
      .upsert({
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
      } as any, { onConflict: "data_provider,symbol,venue_code" })
      .select("id")
      .maybeSingle();
    if (!error) listingId = data?.id || null;
  }

  if (listingId || instrumentId) {
    await supabase
      .from("investment_instrument_aliases")
      .upsert({
        listing_id: listingId,
        instrument_id: instrumentId,
        alias_source: args.sample.import_source_type || args.sample.external_provider || "manual",
        alias_symbol: args.sample.ticker || ticker,
        alias_market_code: args.sample.exchange || venueCode || null,
        alias_isin: isin,
        confidence: 0.95,
        active: true,
      } as any, { onConflict: "alias_source,alias_symbol,alias_market_code" })
      .select("id")
      .maybeSingle();

    await supabase
      .from("investment_holdings")
      .update({
        instrument_id: instrumentId,
        listing_id: listingId,
        instrument_resolution_status: "resolved",
        instrument_resolution_notes: venueCode ? `Linked to ${ticker} · ${venueCode}` : `Linked to ${ticker}`,
        updated_at: args.nowIso,
      } as any)
      .in("id", [args.sample.id]);
  }

  return { instrumentId, listingId, ticker, exchange, venueCode };
}

async function latestGlobalPricePoint(
  supabase: SupabaseAdmin,
  args: { listingId?: string | null; ticker: string; exchange: string | null; sinceIso: string },
): Promise<GlobalPoint | null> {
  const select = "id,listing_id,instrument_id,ticker,exchange_code,price_gbp,gbp_price,native_price,native_currency,quote_unit,source,point_at,observed_at,price_minute,fx_rate_to_gbp";
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
  args: { listingId?: string | null; ticker: string; exchange: string | null; snapshotDate: string },
): Promise<GlobalPoint | null> {
  const select = "id,listing_id,instrument_id,ticker,exchange_code,price_gbp,gbp_price,native_price,native_currency,quote_unit,source,point_at,observed_at,price_minute,fx_rate_to_gbp";
  const todayStartIso = `${args.snapshotDate}T00:00:00.000Z`;

  const base = () => {
    let query = supabase
      .from("investment_instrument_price_points")
      .select(select)
      .order("point_at", { ascending: false })
      .limit(1);
    if (args.listingId) query = query.eq("listing_id", args.listingId);
    else query = query.eq("ticker", args.ticker).eq("exchange_code", args.exchange || "");
    return query;
  };

  // Prefer the last stored point from a prior trading date. Some older rows were missing point_date,
  // so fall back to point_at before today's UTC start instead of returning no previous close.
  const byDate = await base().lt("point_date", args.snapshotDate).maybeSingle();
  if (byDate.data) return byDate.data as GlobalPoint;

  const byTime = await base().lt("point_at", todayStartIso).maybeSingle();
  return (byTime.data as GlobalPoint) || null;
}

async function createCoverageRequiredAlert(
  supabase: SupabaseAdmin,
  args: { ticker: string; exchange: string | null; holdings: Holding[]; reason: string; nowIso: string },
) {
  const ticker = normaliseSnapshotTicker(args.ticker);
  const exchange = normaliseSnapshotExchange(args.exchange, ticker) || "";
  const holdingIds = args.holdings.map((holding) => holding.id);
  const userIds = Array.from(new Set(args.holdings.map((holding) => holding.user_id).filter(Boolean)));
  const sample = args.holdings[0];
  const requestQuery = exchange ? `${ticker} · ${exchange}` : ticker;
  const progress = {
    ticker_found: false,
    investment_information_added: false,
    document_fee_information_added: false,
    starter_history_added: false,
    current_step: "Market worker skipped deterministic quote lookup; admin coverage required",
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
      .in("status", ["planned", "queued", "needs_review", "coverage_required", "in_progress"])
      .limit(1)
      .maybeSingle();

    if (existing.data?.id) {
      await supabase
        .from("loop_investment_ai_market_requests")
        .update({
          status: "coverage_required",
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
        status: "coverage_required",
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

export async function runInvestmentPriceSnapshotJob(options: RunnerOptions = {}): Promise<RunnerResult> {
  const logger = options.logger || console;
  const supabase = createAdminClient();
  const now = options.now || new Date();
  const startedAt = now.toISOString();
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

  logger.log(`[investment-price-job] start ${startedAt}`);

  if (!settings.enabled && !options.force) {
    result.skippedDisabled = 1;
    result.finishedAt = new Date().toISOString();
    logger.log(`[investment-price-job] skipped: investment snapshot storage disabled`);
    return result;
  }

  try {
    const { data: holdings, error } = await supabase
      .from("investment_holdings")
      .select("id, user_id, ticker, exchange, units, average_buy_price, latest_price, price_polling_enabled, last_price_check_at, import_source_type, external_provider, asset_name, asset_kind, isin, listing_id, instrument_id")
      .not("ticker", "is", null)
      .neq("record_status", "archived")
      .order("ticker")
      .returns<Holding[]>();

    if (error) throw error;

    let activeHoldings = (holdings || []).filter((holding) => normaliseSnapshotTicker(holding.ticker) && holding.price_polling_enabled !== false);

    const userIds = Array.from(new Set(activeHoldings.map((holding) => holding.user_id).filter(Boolean)));
    const { data: profiles } = userIds.length
      ? await supabase
          .from("app_user_profiles")
          .select("user_id, payment_tier, payment_tier_status, payment_tier_override, market_data_tier, market_data_tier_override, market_data_provider_status, market_data_realtime_enabled")
          .in("user_id", userIds)
      : { data: [] as UserProfileRow[] };
    const profileByUser = new Map<string, UserProfileRow>((profiles || []).map((profile: any) => [profile.user_id, profile as UserProfileRow]));

    if (settings.realtimeUsersOnly && !options.force && activeHoldings.length) {
      const realtimeUsers = new Set((profiles || [])
        .filter((profile: any) => investmentDataEntitlementForProfile(profile).canUseRealtimePrices || profile.market_data_realtime_enabled === true)
        .map((profile: any) => profile.user_id));
      const before = activeHoldings.length;
      activeHoldings = activeHoldings.filter((holding) => realtimeUsers.has(holding.user_id));
      result.skippedDisabled += before - activeHoldings.length;
    }

    result.holdings = activeHoldings.length;
    logger.log(`[investment-price-job] loaded ${activeHoldings.length} polling-enabled holdings`);

    const groups = new Map<string, Holding[]>();
    activeHoldings.forEach((holding) => {
      const key = keyFor(holding.ticker, holding.exchange);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(holding);
    });
    result.groups = groups.size;
    logger.log(`[investment-price-job] distinct ticker/exchange groups: ${groups.size}`);

    for (const [groupKey, groupHoldings] of groups.entries()) {
      const first = groupHoldings[0];
      const ticker = normaliseSnapshotTicker(first.ticker);
      const exchange = normaliseSnapshotExchange(first.exchange, first.ticker);
      const venue = venueFor(exchange, ticker);

      if (!options.force && settings.marketHoursOnly && !isRoughMarketOpen(exchange, now, ticker)) {
        result.skippedClosed += groupHoldings.length;
        logger.log(`[investment-price-job] skip closed ${groupKey}`);
        continue;
      }

      const dueHoldings = groupHoldings.filter((holding) => isDue(holding, profileByUser.get(holding.user_id), settings, now, options.force));
      if (!dueHoldings.length) {
        result.skippedRecent += groupHoldings.length;
        logger.log(`[investment-price-job] skip recent ${groupKey}`);
        continue;
      }

      result.checked += dueHoldings.length;
      logger.log(`[investment-price-job] fetching ${ticker} ${exchange || ""} for ${dueHoldings.length} holding(s)`);

      const link = await ensureCatalogueForGroup(supabase, { ticker, exchange, sample: first, nowIso: startedAt });
      const fastestCadence = Math.min(...dueHoldings.map((holding) => userCadenceMinutes(profileByUser.get(holding.user_id), settings)));
      const globalSince = new Date(now.getTime() - fastestCadence * 60 * 1000).toISOString();
      const cachedPoint = settings.globalRawPricePoints && !options.force ? await latestGlobalPricePoint(supabase, { listingId: link.listingId, ticker, exchange, sinceIso: globalSince }) : null;

      const quote = cachedPoint
        ? null
        : await fetchInvestmentQuote(supabase, first.user_id, ticker, exchange).catch((caught) => {
            logger.error(`[investment-price-job] quote error ${ticker}`, caught);
            return null;
          });

      if (!cachedPoint && (!quote || !Number.isFinite(Number(quote.price)) || Number(quote.price) <= 0)) {
        result.failed += dueHoldings.length;
        result.failures.push({ ticker, exchange, reason: "coverage_required_quote_not_found" });
        logger.warn(`[investment-price-job] coverage required ${ticker} ${exchange || ""}; AI/web-search is disabled in worker and polling is paused for affected holdings`);
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
            price_check_status: "coverage_required",
            price_polling_enabled: false,
            instrument_resolution_status: "coverage_required",
            instrument_resolution_notes: requestId
              ? `No deterministic quote found. Admin coverage request ${requestId} created; polling paused to avoid AI/web-search spend.`
              : "No deterministic quote found. Admin coverage required; polling paused to avoid AI/web-search spend.",
            updated_at: startedAt,
          } as any)
          .in("id", dueHoldings.map((holding) => holding.id));
        continue;
      }

      const nativeCurrency = cachedPoint
        ? String(cachedPoint.native_currency || currencyForExchange(exchange)).toUpperCase()
        : String(quote!.priceQuoteUnit || "").toLowerCase() === "gbx" ? "GBX" : String(quote!.currency || currencyForExchange(quote!.exchange || exchange)).toUpperCase();
      const nativePrice = cachedPoint ? Number(cachedPoint.native_price || 0) : Number(quote!.price || 0);
      const converted = cachedPoint
        ? { gbpPrice: pointGbp(cachedPoint), fxRate: nativePrice > 0 ? pointGbp(cachedPoint) / nativePrice : Number(cachedPoint.fx_rate_to_gbp || 1), fxSource: "global price point" }
        : await quotePriceToGbp(nativePrice, nativeCurrency);
      const quoteUnit = cachedPoint?.quote_unit || quote?.priceQuoteUnit || quoteUnitForVenue(exchange, nativeCurrency, ticker);
      const pointSource = cachedPoint ? `${cachedPoint.source || "global price point"}; reused` : `${quote!.source}; ${converted.fxSource}`;

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
          pointAt: startedAt,
          pointMinute,
        });
      }

      const previousClose = await previousCloseGlobalPoint(supabase, { listingId: link.listingId, ticker, exchange, snapshotDate });
      const previousCloseGbp = pointGbp(previousClose);
      const previousCloseNative = Number(previousClose?.native_price || 0);
      const previousCloseAt = pointAt(previousClose) || null;
      const dayChangeGbp = previousCloseGbp > 0 ? Number(converted.gbpPrice) - previousCloseGbp : null;
      const dayChangePercent = previousCloseGbp > 0 ? (Number(converted.gbpPrice) - previousCloseGbp) / previousCloseGbp * 100 : null;
      const dayChangeNative = previousCloseNative > 0 ? nativePrice - previousCloseNative : null;
      const dayChangeNativePercent = previousCloseNative > 0 ? (nativePrice - previousCloseNative) / previousCloseNative * 100 : null;

      const rows = dueHoldings.map((holding) => {
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
          day_change_gbp: dayChangeGbp,
          day_change_percent: dayChangePercent,
          day_change_native: dayChangeNative,
          day_change_native_percent: dayChangeNativePercent,
          snapshot_date: snapshotDate,
          snapshot_at: startedAt,
          snapshot_minute: pointMinute,
          source: pointSource,
          bucket_interval: "raw",
        } as any;
      });

      const insert = await supabase.from("investment_price_snapshots").upsert(rows, { onConflict: "user_id,holding_id,snapshot_minute" });
      if (insert.error) {
        result.failed += dueHoldings.length;
        result.failures.push({ ticker, exchange, reason: insert.error.message });
        logger.error(`[investment-price-job] insert failed ${ticker}: ${insert.error.message}`);
        continue;
      }

      result.inserted += rows.length;
      logger.log(`[investment-price-job] inserted ${rows.length} snapshot(s) for ${ticker} @ ${converted.gbpPrice} GBP (${cachedPoint ? "cached" : quote!.price} ${nativeCurrency}) cadence=${fastestCadence}m listing=${link.listingId || "legacy"}`);

      const update = await supabase
        .from("investment_holdings")
        .update({
          instrument_id: link.instrumentId,
          listing_id: link.listingId,
          instrument_resolution_status: "resolved",
          instrument_resolution_notes: venue?.name ? `Priced from ${venue.name}` : `Priced from ${exchange || "market data"}`,
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
          previous_close_native_currency: previousClose?.native_currency || nativeCurrency,
          previous_close_at: previousCloseAt,
          day_change_gbp: dayChangeGbp,
          day_change_percent: dayChangePercent,
          day_change_native: dayChangeNative,
          day_change_native_percent: dayChangeNativePercent,
          source_url: cachedPoint ? `market-data:${cachedPoint.source || "global"}:${ticker}` : quote!.sourceUrl || `market-data:${quote!.source}:${quote!.rawSymbol}`,
          last_price_check_at: startedAt,
          price_check_status: "ok",
          updated_at: startedAt,
        } as any)
        .in("id", dueHoldings.map((holding) => holding.id));

      if (update.error) {
        result.failures.push({ ticker, exchange, reason: `holding_update_failed: ${update.error.message}` });
        logger.warn(`[investment-price-job] holding update failed ${ticker}: ${update.error.message}`);
      }
    }

    if (options.prune !== false) {
      const maintenance = await runInvestmentSnapshotMaintenance(supabase, { logger, now });
      result.pruned += maintenance.pruned;
      for (const failure of maintenance.failures) result.failures.push(failure);
    } else {
      logger.log(`[investment-price-job] retention maintenance skipped for this run; worker maintenance handles it separately`);
    }
  } catch (caught) {
    result.ok = false;
    result.failed += 1;
    const message = caught instanceof Error ? caught.message : String(caught);
    result.failures.push({ ticker: "job", exchange: null, reason: message });
    logger.error(`[investment-price-job] fatal`, caught);
  }

  result.finishedAt = new Date().toISOString();
  logger.log(`[investment-price-job] done inserted=${result.inserted} checked=${result.checked} failed=${result.failed}`);
  return result;
}

export async function runInvestmentSnapshotMaintenance(
  supabase: SupabaseAdmin,
  options: { now?: Date; logger?: Pick<Console, "log" | "warn" | "error"> } = {},
): Promise<{ ok: boolean; pruned: number; global: any; snapshots: any; failures: Array<{ ticker: string; exchange: string | null; reason: string }> }> {
  const logger = options.logger || console;
  const now = options.now || new Date();
  const settings = await loadInvestmentSnapshotSettings(supabase);
  const failures: Array<{ ticker: string; exchange: string | null; reason: string }> = [];
  let pruned = 0;

  logger.log(`[investment-maintenance] start ${now.toISOString()}`);

  let compactGlobal: { data: any; error: any };
  try {
    compactGlobal = await supabase.rpc("loop_admin_compact_investment_instrument_price_points") as any;
  } catch (error: any) {
    compactGlobal = { data: null, error };
  }
  if (compactGlobal.error) {
    failures.push({ ticker: "global-prune", exchange: null, reason: compactGlobal.error.message || String(compactGlobal.error) });
    logger.warn(`[investment-maintenance] global point compaction failed: ${compactGlobal.error.message || compactGlobal.error}`);
  }

  let prune: { data: any; error: any };
  try {
    prune = await supabase.rpc("loop_admin_prune_investment_price_snapshots") as any;
  } catch (error: any) {
    prune = { data: null, error };
  }

  if (prune.error) {
    const cutoff = new Date(now.getTime() - settings.retainDays * 24 * 60 * 60 * 1000).toISOString();
    const { count, error: pruneError } = await supabase
      .from("investment_price_snapshots")
      .delete({ count: "exact" })
      .lt("snapshot_at", cutoff);
    if (pruneError) {
      failures.push({ ticker: "prune", exchange: null, reason: pruneError.message });
      logger.warn(`[investment-maintenance] snapshot prune failed: ${pruneError.message}`);
    } else {
      pruned += count || 0;
    }
  } else {
    const data: any = prune.data || {};
    pruned += Number(data.deleted_by_age || 0) + Number(data.deleted_by_cap || 0) + Number(data.deleted || 0);
  }

  logger.log(`[investment-maintenance] done pruned=${pruned} failures=${failures.length}`);
  return {
    ok: failures.length === 0,
    pruned,
    global: compactGlobal.data || null,
    snapshots: prune.data || null,
    failures,
  };
}
