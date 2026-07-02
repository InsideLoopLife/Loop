import { createAdminClient } from "@/lib/supabase/admin";
import { fetchInvestmentQuote, isRoughMarketOpen } from "@/lib/investments/market-data";
import { currencyForExchange, quotePriceToGbp } from "@/lib/investments/fx";
import { loadInvestmentSnapshotSettings } from "@/lib/investments/snapshot-settings";
import { investmentDataEntitlementForProfile } from "@/lib/wealth/user-tiers";

type Holding = {
  id: string;
  user_id: string;
  ticker: string | null;
  exchange: string | null;
  units: number | null;
  price_polling_enabled: boolean | null;
  last_price_check_at?: string | null;
  import_source_type?: string | null;
  external_provider?: string | null;
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
  /**
   * When false, skip retention/compaction inside the price loop.
   * The direct Render worker runs maintenance on its own slower interval so
   * 1-minute price polling does not rank/delete large tables every minute.
   */
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

function normaliseSnapshotTicker(ticker: string | null | undefined) {
  return String(ticker || "").trim().toUpperCase().replace(/\.UK$/i, ".L");
}

function normaliseSnapshotExchange(exchange: string | null | undefined, ticker?: string | null) {
  const ex = String(exchange || "").trim().toUpperCase();
  if (["XLON", "XLSE", "LON", "LSE"].includes(ex) || String(ticker || "").toUpperCase().endsWith(".L")) return "LSE";
  if (["XNAS", "XNCM", "XNGS", "NMS", "NGM", "NAS", "NASDAQGS", "NASDAQ"].includes(ex)) return "NASDAQ";
  if (["XNYS", "NYQ", "NYSE"].includes(ex)) return "NYSE";
  if (["XASE", "ASE", "AMEX", "NYSEAMERICAN"].includes(ex)) return "AMEX";
  return ex || null;
}

function keyFor(holding: Holding) {
  return `${normaliseSnapshotTicker(holding.ticker)}|${normaliseSnapshotExchange(holding.exchange, holding.ticker) || ""}`;
}

function userCadenceMinutes(profile: UserProfileRow | undefined, settings: Awaited<ReturnType<typeof loadInvestmentSnapshotSettings>>) {
  const tier = String(profile?.market_data_tier_override || profile?.market_data_tier || profile?.payment_tier_override || profile?.payment_tier || "free").toLowerCase();
  const realtime = investmentDataEntitlementForProfile((profile || {}) as any).canUseRealtimePrices || tier === "realtime" || tier === "pro_realtime" || profile?.market_data_realtime_enabled === true;
  if (realtime) return Math.max(1, settings.realtimeMinutes);
  if (["plus", "pro", "premium"].includes(tier)) return Math.max(1, settings.plusProMinutes);
  return Math.max(1, settings.freeMinutes);
}

async function getRecentHoldingIds(supabase: ReturnType<typeof createAdminClient>, sinceIso: string) {
  const recent = new Set<string>();
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from("investment_price_snapshots")
      .select("holding_id")
      .gte("snapshot_at", sinceIso)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    (data || []).forEach((row) => row.holding_id && recent.add(row.holding_id));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return recent;
}

async function latestGlobalPricePoint(supabase: ReturnType<typeof createAdminClient>, ticker: string, exchange: string | null, sinceIso: string) {
  const { data } = await supabase
    .from("investment_instrument_price_points")
    .select("price_gbp,native_price,native_currency,quote_unit,source,point_at")
    .eq("ticker", ticker)
    .eq("exchange_code", exchange || "")
    .gte("point_at", sinceIso)
    .order("point_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function upsertInstrumentAndGlobalPoint(supabase: ReturnType<typeof createAdminClient>, args: { ticker: string; exchange: string | null; assetName?: string | null; assetKind?: string | null; isin?: string | null; priceGbp: number; nativePrice: number; nativeCurrency: string; quoteUnit: string; source: string; sourceUrl?: string | null; confidence?: number | null; pointAt: string; }) {
  const exchangeCode = args.exchange || "";
  const { data: instrument } = await supabase
    .from("investment_instruments")
    .upsert({
      ticker: args.ticker,
      exchange_code: exchangeCode,
      exchange_name: exchangeCode,
      isin: args.isin || null,
      asset_name: args.assetName || args.ticker,
      asset_kind: args.assetKind || "share",
      currency_code: "GBP",
      quote_unit: args.quoteUnit || "gbp",
      source_url: args.sourceUrl || null,
      coverage_status: "active",
      confidence: args.confidence ?? 80,
      updated_at: args.pointAt,
    }, { onConflict: "ticker,exchange_code" })
    .select("id")
    .maybeSingle();

  await supabase.from("investment_instrument_price_points").insert({
    instrument_id: instrument?.id || null,
    ticker: args.ticker,
    exchange_code: exchangeCode,
    price_gbp: args.priceGbp,
    native_price: args.nativePrice,
    native_currency: args.nativeCurrency,
    quote_unit: args.quoteUnit || "gbp",
    point_at: args.pointAt,
    point_date: args.pointAt.slice(0, 10),
    source: args.source,
    source_url: args.sourceUrl || null,
    source_confidence: args.confidence ?? 80,
    bucket_interval: "raw",
  } as any);
}

export async function runInvestmentPriceSnapshotJob(options: RunnerOptions = {}): Promise<RunnerResult> {
  const logger = options.logger || console;
  const supabase = createAdminClient();
  const now = options.now || new Date();
  const startedAt = now.toISOString();
  const settings = await loadInvestmentSnapshotSettings(supabase);
  const since = new Date(now.getTime() - settings.minMinutesBetweenPoints * 60 * 1000).toISOString();
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
    result.ok = true;
    result.skippedDisabled = 1;
    result.finishedAt = new Date().toISOString();
    logger.log(`[investment-price-job] skipped: investment snapshot storage disabled`);
    return result;
  }

  try {
    const { data: holdings, error } = await supabase
      .from("investment_holdings")
      .select("id, user_id, ticker, exchange, units, price_polling_enabled, last_price_check_at, import_source_type, external_provider")
      .not("ticker", "is", null)
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
        .filter((profile: any) => investmentDataEntitlementForProfile(profile).canUseRealtimePrices)
        .map((profile: any) => profile.user_id));
      const before = activeHoldings.length;
      activeHoldings = activeHoldings.filter((holding) => realtimeUsers.has(holding.user_id));
      result.skippedDisabled += before - activeHoldings.length;
    }
    result.holdings = activeHoldings.length;
    logger.log(`[investment-price-job] loaded ${activeHoldings.length} polling-enabled holdings`);

    const recentHoldingIds = options.force ? new Set<string>() : await getRecentHoldingIds(supabase, new Date(now.getTime() - Math.max(settings.freeMinutes, settings.plusProMinutes, settings.realtimeMinutes) * 60 * 1000).toISOString());
    const groups = new Map<string, Holding[]>();
    activeHoldings.forEach((holding) => {
      const key = keyFor(holding);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(holding);
    });
    result.groups = groups.size;
    logger.log(`[investment-price-job] distinct ticker/exchange groups: ${groups.size}`);

    for (const [groupKey, groupHoldings] of groups.entries()) {
      const first = groupHoldings[0];
      const ticker = normaliseSnapshotTicker(first.ticker);
      const exchange = normaliseSnapshotExchange(first.exchange, first.ticker);

      if (!options.force && settings.marketHoursOnly && !isRoughMarketOpen(exchange, now)) {
        result.skippedClosed += groupHoldings.length;
        logger.log(`[investment-price-job] skip closed ${groupKey}`);
        continue;
      }

      const dueHoldings = groupHoldings.filter((holding) => {
        if (options.force) return true;
        const cadence = userCadenceMinutes(profileByUser.get(holding.user_id), settings);
        const recentCutoff = new Date(now.getTime() - cadence * 60 * 1000).toISOString();
        // Fast path: if the broad recent set does not contain the holding, it is definitely due.
        if (!recentHoldingIds.has(holding.id)) return true;
        // Conservative path: holdings in the broad recent set are skipped until their own cadence expires.
        return String((holding as any).last_price_check_at || "") < recentCutoff;
      });
      if (!dueHoldings.length) {
        result.skippedRecent += groupHoldings.length;
        logger.log(`[investment-price-job] skip recent ${groupKey}`);
        continue;
      }

      result.checked += dueHoldings.length;
      logger.log(`[investment-price-job] fetching ${ticker} ${exchange || ""} for ${dueHoldings.length} holding(s)`);

      const fastestCadence = Math.min(...dueHoldings.map((holding) => userCadenceMinutes(profileByUser.get(holding.user_id), settings)));
      const globalSince = new Date(now.getTime() - fastestCadence * 60 * 1000).toISOString();
      const cachedPoint = settings.globalRawPricePoints && !options.force ? await latestGlobalPricePoint(supabase, ticker, exchange, globalSince) : null;

      const quote = cachedPoint
        ? null
        : await fetchInvestmentQuote(supabase, first.user_id, ticker, exchange).catch((caught) => {
            logger.error(`[investment-price-job] quote error ${ticker}`, caught);
            return null;
          });

      if (!cachedPoint && (!quote || !Number.isFinite(Number(quote.price)) || Number(quote.price) <= 0)) {
        result.failed += dueHoldings.length;
        result.failures.push({ ticker, exchange, reason: "quote_not_found" });
        logger.warn(`[investment-price-job] quote not found ${ticker} ${exchange || ""}`);
        await supabase
          .from("investment_holdings")
          .update({ last_price_check_at: now.toISOString(), price_check_status: "quote_not_found", updated_at: now.toISOString() })
          .in("id", dueHoldings.map((holding) => holding.id));
        continue;
      }

      const nativeCurrency = cachedPoint
        ? String(cachedPoint.native_currency || "GBP").toUpperCase()
        : String(quote!.priceQuoteUnit || "").toLowerCase() === "gbx" ? "GBX" : String(quote!.currency || currencyForExchange(quote!.exchange || exchange)).toUpperCase();
      const nativePrice = cachedPoint ? Number(cachedPoint.native_price || 0) : Number(quote!.price || 0);
      const converted = cachedPoint ? { gbpPrice: Number(cachedPoint.price_gbp || 0), fxRate: nativePrice > 0 ? Number(cachedPoint.price_gbp || 0) / nativePrice : 1, fxSource: "global price point" } : await quotePriceToGbp(nativePrice, nativeCurrency);
      const pointSource = cachedPoint ? `${cachedPoint.source || "global price point"}; reused` : `${quote!.source}; ${converted.fxSource}`;

      if (!cachedPoint && settings.globalRawPricePoints) {
        await upsertInstrumentAndGlobalPoint(supabase, {
          ticker,
          exchange,
          assetName: quote!.assetName || ticker,
          assetKind: quote!.assetType || "share",
          isin: quote!.isin || null,
          priceGbp: Number(converted.gbpPrice),
          nativePrice: Number(quote!.price || 0),
          nativeCurrency,
          quoteUnit: quote!.priceQuoteUnit || (nativeCurrency === "GBX" ? "gbx" : nativeCurrency.toLowerCase()),
          source: `${quote!.source}; ${converted.fxSource}`,
          sourceUrl: quote!.sourceUrl || null,
          confidence: 85,
          pointAt: now.toISOString(),
        });
      }

      const rows = dueHoldings.map((holding) => {
        const units = Number(holding.units || 0);
        const nativeValue = units * Number(nativePrice || 0);
        const gbpValue = nativeValue * Number((converted as any).fxRate || 1);
        return {
          user_id: holding.user_id,
          holding_id: holding.id,
          // Backwards-compatible GBP fields used by existing totals/charts.
          price: converted.gbpPrice,
          units,
          value: gbpValue,
          // Native market quote fields are the source-of-truth for refreshed points.
          native_price: nativePrice,
          native_value: nativeValue,
          native_currency: nativeCurrency,
          fx_rate_to_gbp: Number((converted as any).fxRate || 1),
          fx_source: (converted as any).fxSource || null,
          snapshot_date: snapshotDate,
          snapshot_at: now.toISOString(),
          source: pointSource,
          bucket_interval: "raw",
        };
      });

      const insert = await supabase.from("investment_price_snapshots").insert(rows);
      if (insert.error) {
        result.failed += dueHoldings.length;
        result.failures.push({ ticker, exchange, reason: insert.error.message });
        logger.error(`[investment-price-job] insert failed ${ticker}: ${insert.error.message}`);
        continue;
      }

      result.inserted += rows.length;
      logger.log(`[investment-price-job] inserted ${rows.length} snapshot(s) for ${ticker} @ ${converted.gbpPrice} GBP (${cachedPoint ? "cached" : quote!.price} ${nativeCurrency})`);

      const update = await supabase
        .from("investment_holdings")
        .update({
          latest_price: converted.gbpPrice,
          latest_price_date: snapshotDate,
          currency: "GBP",
          native_latest_price: nativePrice,
          native_currency: nativeCurrency,
          native_exchange: cachedPoint ? exchange : quote!.exchange || exchange,
          source_url: cachedPoint ? `market-data:${cachedPoint.source || "global"}:${ticker}` : quote!.sourceUrl || `market-data:${quote!.source}:${quote!.rawSymbol}`,
          last_price_check_at: now.toISOString(),
          price_check_status: "ok",
          updated_at: now.toISOString(),
        })
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
  supabase: ReturnType<typeof createAdminClient>,
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
    pruned += Number(data.deleted_by_age || 0) + Number(data.deleted_by_cap || 0);
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
