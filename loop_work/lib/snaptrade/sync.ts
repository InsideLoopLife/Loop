import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/security/secrets";
import { loopSnapTradeUserId, snapTradeRequest } from "@/lib/snaptrade/client";
import { quotePriceToGbp } from "@/lib/investments/fx";

export type SnapTradeAccountPreview = {
  externalAccountId: string;
  externalConnectionId: string | null;
  institutionAccountId: string | null;
  name: string;
  providerName: string;
  accountType: string;
  wrapperLabel: string;
  rawType: string | null;
  currency: string | null;
  balanceValue: number;
  holdingsValue: number;
  holdingsCount: number;
  syncStatus: string | null;
  alreadyImported: boolean;
  importGuidance: string;
  defaultArchiveManualAccountIds: string[];
  manualMatches?: SnapTradeManualMatch[];
  raw: any;
  positions?: SnapTradePositionPreview[];
};

export type SnapTradeManualMatch = {
  id: string;
  label: string;
  provider: string;
  accountType: string;
  wrapperLabel: string;
  score: number;
  matchStrength: "strong" | "medium" | "weak";
  defaultArchive: boolean;
  reason: string;
  recommendedAction: string;
  holdingsCount: number;
  estimatedValue: number;
};

export type SnapTradePositionPreview = {
  externalPositionId: string;
  name: string;
  ticker: string | null;
  exchange: string | null;
  groupLabel: string | null;
  assetKind: string;
  units: number;
  latestPrice: number;
  averageBuyPrice: number;
  costBasis: number;
  currency: string;
  value: number;
  raw: any;
};

type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

function asNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function firstText(...values: any[]) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function firstObject(...values: any[]) {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  }
  return null;
}

function currencyCode(value: any) {
  return firstText(value?.code, value?.currency?.code, value?.currency, value).toUpperCase();
}

function exchangeCode(value: any) {
  return firstText(value?.mic_code, value?.code, value?.exchange?.mic_code, value?.exchange?.code, value).toUpperCase();
}

function normaliseExchangeCodeForLoop(exchange?: string | null) {
  const ex = String(exchange || "").trim().toUpperCase();
  if (["XLON", "XLSE", "LON", "LSE"].includes(ex)) return "LSE";
  if (["XNAS", "XNCM", "XNGS", "NMS", "NGM", "NAS", "NASDAQ", "NASDAQGS"].includes(ex)) return "NASDAQ";
  if (["XNYS", "NYSE", "NYQ"].includes(ex)) return "NYSE";
  if (["XASE", "AMEX", "NYSEAMERICAN", "ASE"].includes(ex)) return "AMEX";
  if (["ARCX", "XARC", "BATS", "BATS-US"].includes(ex)) return "US";
  return ex || null;
}

function nested(value: any, path: string) {
  return path.split(".").reduce((current, part) => current?.[part], value);
}

function providerNameForAccount(account: any) {
  return firstText(
    account?.institution_name,
    account?.brokerage?.name,
    account?.brokerage_authorization?.brokerage?.name,
    account?.authorization?.brokerage?.name,
    account?.institution?.name,
    account?.connection?.brokerage?.name,
    account?.raw_brokerage_name,
    "Connected broker",
  );
}

function accountIdFor(account: any) {
  return firstText(
    account?.id,
    account?.accountId,
    account?.account_id,
    account?.number,
    account?.account_number,
    account?.name,
  );
}

function accountNameFor(account: any) {
  return firstText(
    account?.name,
    account?.nickname,
    account?.raw_type,
    account?.type,
    account?.number,
    account?.account_number,
    accountIdFor(account),
    "Brokerage account",
  );
}

function connectionIdForAccount(account: any) {
  return firstText(
    account?.brokerage_authorization,
    account?.brokerage_authorization_id,
    account?.brokerage_authorization?.id,
    account?.authorization?.id,
    account?.connection?.id,
    account?.connection_id,
  );
}

function institutionAccountIdFor(account: any) {
  return firstText(
    account?.institution_account_id,
    account?.institutionAccountId,
    account?.account_number,
    account?.number,
  );
}

function stableInstitutionAccountKey(account: {
  providerName?: string | null;
  provider?: string | null;
  accountType?: string | null;
  rawType?: string | null;
  raw?: any;
  currency?: string | null;
}) {
  const raw = account.raw || {};
  const institutionId = firstText(
    raw?.institution_account_id,
    raw?.institutionAccountId,
    raw?.account_number,
    raw?.number,
  );
  if (!institutionId) return "";
  const provider = normaliseProviderKey(account.providerName || account.provider || providerNameForAccount(raw));
  const wrapper = normaliseWrapperType(account.accountType || account.rawType || raw?.raw_type || raw?.type || raw?.account_type);
  return `${provider}|${wrapper}|${normaliseProviderKey(institutionId)}|${String(account.currency || raw?.currency?.code || raw?.currency || "").toUpperCase()}`;
}

function stableInstitutionAccountKeyFromDb(account: any) {
  const raw = account?.external_account_raw || {};
  return stableInstitutionAccountKey({
    provider: account?.provider || providerNameForAccount(raw),
    accountType: account?.account_type,
    rawType: firstText(raw?.raw_type, raw?.type, raw?.account_type),
    raw,
    currency: raw?.currency?.code || raw?.currency,
  });
}

function stableAccountLooseKey(account: {
  providerName?: string | null;
  provider?: string | null;
  name?: string | null;
  label?: string | null;
  accountType?: string | null;
  rawType?: string | null;
}) {
  const provider = normaliseProviderKey(account.providerName || account.provider);
  const wrapper = normaliseWrapperType(account.accountType || account.rawType);
  const name = normaliseProviderKey(account.name || account.label || account.rawType || "account");
  return `${provider}|${wrapper}|${name}`;
}

function stableAccountDisplayKey(account: {
  providerName?: string | null;
  name?: string | null;
  accountType?: string | null;
  rawType?: string | null;
  currency?: string | null;
  balanceValue?: number | null;
  holdingsValue?: number | null;
}) {
  const provider = normaliseProviderKey(account.providerName);
  const wrapper = normaliseWrapperType(account.accountType || account.rawType);
  const name = normaliseProviderKey(account.name || account.rawType || "account");
  const currency = String(account.currency || "").toUpperCase();
  const value = Math.round(
    Number(account.holdingsValue || account.balanceValue || 0) * 100,
  );
  return `${provider}|${wrapper}|${name}|${currency}|${value}`;
}

function stableAccountDisplayKeyFromDb(account: any) {
  const raw = account?.external_account_raw || {};
  const provider = account?.provider || providerNameForAccount(raw);
  const rawType = firstText(raw?.raw_type, raw?.type, raw?.account_type);
  const wrapper = normaliseWrapperType(account?.account_type || rawType);
  const name = normaliseProviderKey(
    String(account?.label || "").replace(`${provider} · `, "") ||
      accountNameFor(raw) ||
      rawType,
  );
  const value = Math.round(
    Number(
      raw?.balance?.total?.amount ??
        raw?.balance?.total ??
        raw?.total_value?.amount ??
        raw?.total_value ??
        raw?.market_value?.amount ??
        raw?.market_value ??
        0,
    ) * 100,
  );
  return `${normaliseProviderKey(provider)}|${wrapper}|${name}|${String(raw?.currency?.code || raw?.currency || "").toUpperCase()}|${value}`;
}

function stableAccountLooseKeyFromDb(account: any) {
  const raw = account?.external_account_raw || {};
  const provider = account?.provider || providerNameForAccount(raw);
  const rawType = firstText(raw?.raw_type, raw?.type, raw?.account_type);
  return stableAccountLooseKey({
    provider,
    label: String(account?.label || "").replace(`${provider} · `, ""),
    accountType: account?.account_type,
    rawType,
  });
}

function dedupeSnapTradePreviews(previews: SnapTradeAccountPreview[]) {
  const byKey = new Map<string, SnapTradeAccountPreview>();
  for (const preview of previews) {
    const institutionKey = stableInstitutionAccountKey({
      providerName: preview.providerName,
      accountType: preview.accountType,
      rawType: preview.rawType,
      raw: preview.raw,
      currency: preview.currency,
    });
    const key = institutionKey || stableAccountDisplayKey(preview) || stableAccountLooseKey(preview);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, preview);
      continue;
    }
    const existingRank =
      (existing.alreadyImported ? 1000000 : 0) +
      (existing.externalConnectionId ? 100000 : 0) +
      existing.holdingsCount * 1000 +
      Math.round(Number(existing.holdingsValue || existing.balanceValue || 0));
    const nextRank =
      (preview.alreadyImported ? 1000000 : 0) +
      (preview.externalConnectionId ? 100000 : 0) +
      preview.holdingsCount * 1000 +
      Math.round(Number(preview.holdingsValue || preview.balanceValue || 0));
    const winner = nextRank >= existingRank ? preview : existing;
    const loser = winner === preview ? existing : preview;
    winner.alreadyImported = existing.alreadyImported || preview.alreadyImported;
    winner.manualMatches = [
      ...(winner.manualMatches || []),
      ...(loser.manualMatches || []),
    ].filter(
      (match, index, list) =>
        list.findIndex((item) => item.id === match.id) === index,
    );
    winner.defaultArchiveManualAccountIds = Array.from(
      new Set([
        ...(winner.defaultArchiveManualAccountIds || []),
        ...(loser.defaultArchiveManualAccountIds || []),
      ]),
    );
    if (!winner.importGuidance && loser.importGuidance)
      winner.importGuidance = loser.importGuidance;
    byKey.set(key, winner);
  }
  return Array.from(byKey.values());
}

export function mapSnapTradeAccountType(account: any) {
  const raw = firstText(
    account?.raw_type,
    account?.type,
    account?.account_type,
    account?.name,
  ).toLowerCase();
  if (
    /stocks?\s*(and|&)\s*shares?\s*isa|s&s\s*isa|isa|tax[-\s]?free|tfsa/.test(
      raw,
    )
  )
    return "isa";
  if (/sipp|pension|retirement|rrsp|401/.test(raw)) return "sipp";
  if (/crypto/.test(raw)) return "crypto";
  if (/general|gia|invest|trading|margin|cash|brokerage|standard/.test(raw))
    return "gia";
  return "other";
}

function normaliseWrapperType(value?: string | null) {
  const text = String(value || "").toLowerCase();
  if (/stocks?\s*(and|&)\s*shares?\s*isa|s&s\s*isa|isa/.test(text))
    return "isa";
  if (/sipp|pension|retirement/.test(text)) return "sipp";
  if (/crypto/.test(text)) return "crypto";
  if (
    /gia|general|invest|investment|trading|share|brokerage|standard/.test(text)
  )
    return "gia";
  return text.trim() || "other";
}

export function wrapperLabelFor(type?: string | null) {
  const normalised = normaliseWrapperType(type);
  if (normalised === "isa") return "Stocks & Shares ISA";
  if (normalised === "gia") return "GIA / Invest account";
  if (normalised === "sipp") return "SIPP / Pension";
  if (normalised === "crypto") return "Crypto account";
  return "Investment account";
}

function wrapperCompatible(
  manualType?: string | null,
  importedType?: string | null,
) {
  const manual = normaliseWrapperType(manualType);
  const imported = normaliseWrapperType(importedType);
  if (!manual || !imported) return false;
  if (manual === imported) return true;
  // A manually-created "investment" account is usually a taxable GIA unless the user marked it otherwise.
  if (manual === "gia" && imported === "gia") return true;
  return false;
}

function currencyFrom(value: any) {
  return (
    firstText(
      value?.currency?.code,
      value?.currency,
      value?.currencyCode,
      value?.account_currency,
      value?.iso_currency_code,
    ).toUpperCase() || "GBP"
  );
}

async function saveProviderPositionSnapshot(
  supabase: SupabaseServer,
  args: {
    appUserId: string;
    holdingId: string;
    units: number;
    latestPrice: number;
    value: number;
    source: string;
    currency?: string | null;
    snapshotAt?: Date;
  },
) {
  const units = Number(args.units || 0);
  const nativeValue = Number(args.value || 0);
  const nativePrice = Number(args.latestPrice || (units ? nativeValue / units : nativeValue));
  const nativeCurrency = String(args.currency || "GBP").trim().toUpperCase() || "GBP";
  if (!args.holdingId || !Number.isFinite(nativeValue) || nativeValue <= 0) return;
  const snapshotAt = args.snapshotAt || new Date();
  const converted = await quotePriceToGbp(Number.isFinite(nativePrice) && nativePrice > 0 ? nativePrice : nativeValue, nativeCurrency).catch(() => ({ gbpPrice: nativePrice || nativeValue, fxRate: 1, fxSource: "provider native fallback" }));
  const fxRate = Number((converted as any).fxRate || 1);
  const gbpPrice = Number((converted as any).gbpPrice || nativePrice || nativeValue);
  await supabase
    .from("investment_price_snapshots")
    .insert({
      user_id: args.appUserId,
      holding_id: args.holdingId,
      // Backwards-compatible GBP fields for existing totals/charts.
      price: gbpPrice,
      units: Number.isFinite(units) && units > 0 ? units : 1,
      value: Number.isFinite(units) && units > 0 ? units * gbpPrice : nativeValue * fxRate,
      // Native provider/market fields retained for audit and front-end GBP conversion.
      native_price: Number.isFinite(nativePrice) && nativePrice > 0 ? nativePrice : nativeValue,
      native_value: nativeValue,
      native_currency: nativeCurrency,
      fx_rate_to_gbp: fxRate,
      fx_source: (converted as any).fxSource || null,
      snapshot_date: snapshotAt.toISOString().slice(0, 10),
      snapshot_at: snapshotAt.toISOString(),
      source: args.source,
      bucket_interval: "raw",
    })
    .then(
      () => null,
      () => null,
    );
}

function accountBalanceValue(account: any, holdingsPayload?: any) {
  const direct = asNumber(
    account?.balance?.total?.amount ??
      account?.balance?.total ??
      account?.total_value?.amount ??
      account?.total_value ??
      account?.market_value?.amount ??
      account?.market_value,
    NaN,
  );
  if (Number.isFinite(direct)) return direct;
  const balances = Array.isArray(holdingsPayload?.balances)
    ? holdingsPayload.balances
    : [];
  return balances.reduce(
    (sum: number, balance: any) =>
      sum +
      asNumber(
        balance?.cash ??
          balance?.amount ??
          balance?.value ??
          balance?.total?.amount ??
          balance?.total,
        0,
      ),
    0,
  );
}


function walkNumbersByKey(value: any, matcher: (keyPath: string, key: string) => boolean, prefix = "", depth = 0): number[] {
  if (!value || depth > 5) return [];
  if (Array.isArray(value)) return value.flatMap((item, index) => walkNumbersByKey(item, matcher, `${prefix}.${index}`, depth + 1));
  if (typeof value !== "object") return [];
  const found: number[] = [];
  for (const [key, raw] of Object.entries(value)) {
    const path = `${prefix}.${key}`.toLowerCase();
    if (matcher(path, key.toLowerCase())) {
      const amount = asNumber((raw as any)?.amount ?? (raw as any)?.value ?? raw, NaN);
      if (Number.isFinite(amount)) found.push(amount);
    }
    if (raw && typeof raw === "object") found.push(...walkNumbersByKey(raw, matcher, path, depth + 1));
  }
  return found;
}

function firstReasonableCash(candidates: number[], maxValue: number) {
  return candidates.find((n) => Number.isFinite(n) && Math.abs(n) > 0.009 && (!maxValue || Math.abs(n) <= Math.max(maxValue, 1) * 1.05)) || 0;
}

function accountCashBreakdownFromPayload(account: any, holdingsPayload: any, balanceValue: number, positionsValue: number) {
  const payload = { account, holdingsPayload };
  const dividendCandidates = walkNumbersByKey(payload, (path) =>
    /(dividend|reinvest|distribution|income|cash_interest)/i.test(path) &&
    /(cash|amount|value|balance|total)/i.test(path) &&
    !/(position|holding|market_value|total_value|invested|equity_value|portfolio_value)/i.test(path),
  );
  const freeCashCandidates = walkNumbersByKey(payload, (path) =>
    /(available|settled|uninvested|free_cash|cash_available|cash_balance|buying_power|cashbalance)/i.test(path) &&
    !/(margin|loan|requirement|fee|interest_rate|market_value|total_value|position|holding|portfolio_value|equity_value|invested)/i.test(path),
  );
  const totalCashCandidates = walkNumbersByKey(payload, (path) =>
    /(total_cash|cash_total|cash\.total|cash_amount|cash\.amount|cash\.value|cash_balance)/i.test(path) &&
    !/(market_value|total_value|portfolio_value|equity_value|position|holding|invested)/i.test(path),
  );

  const dividendCash = firstReasonableCash(dividendCandidates, balanceValue);
  const explicitTotal = firstReasonableCash(totalCashCandidates, balanceValue);
  const explicitFree = firstReasonableCash(freeCashCandidates, balanceValue);
  const inferred = balanceValue > 0 && positionsValue > 0 ? balanceValue - positionsValue : 0;

  // If provider exposes both free and dividend cash, trust the parts. Otherwise use explicit total,
  // then carefully fall back to balance minus positions. This avoids treating account/portfolio value as cash.
  const partsTotal = Math.max(0, explicitFree) + Math.max(0, dividendCash);
  const total = Math.abs(partsTotal) >= 0.01
    ? partsTotal
    : Math.abs(explicitTotal) >= 0.01
      ? explicitTotal
      : Math.abs(inferred) >= 0.5
        ? inferred
        : 0;
  const investable = Math.max(0, Math.abs(explicitFree) >= 0.01 ? explicitFree : total - Math.max(0, dividendCash || 0));
  return {
    total: Math.abs(total) >= 0.5 ? total : 0,
    investable: Math.abs(investable) >= 0.01 ? investable : 0,
    dividendCash: Math.abs(dividendCash) >= 0.01 ? dividendCash : 0,
    source: Math.abs(partsTotal) >= 0.01 ? "provider_cash_parts" : Math.abs(explicitTotal) >= 0.01 ? "provider_cash_total" : Math.abs(inferred) >= 0.5 ? "balance_minus_positions" : "none",
  };
}

function universalInstrumentFromPosition(position: any) {
  // SnapTrade has two shapes in active use:
  // 1) newer `/positions/all`: { instrument: { kind, symbol, raw_symbol, ... }, units, price, cost_basis }
  // 2) legacy `/positions` or `/holdings`: { symbol: { symbol: { symbol, raw_symbol, ... } }, units, price }
  const legacySymbol = position?.symbol || {};
  return firstObject(
    position?.instrument,
    legacySymbol?.symbol,
    position?.universal_symbol,
    position?.option_symbol,
    position?.security,
    legacySymbol,
  ) || {};
}

function symbolFromPosition(position: any) {
  const instrument = universalInstrumentFromPosition(position);
  const positionSymbol = position?.symbol || {};
  const ticker = firstText(
    instrument?.symbol,
    instrument?.raw_symbol,
    position?.ticker,
    positionSymbol?.symbol,
    positionSymbol?.raw_symbol,
  ).toUpperCase();
  const rawTicker = firstText(
    instrument?.raw_symbol,
    instrument?.symbol,
    position?.ticker,
    positionSymbol?.raw_symbol,
  ).toUpperCase();
  const exchange = exchangeCode(
    instrument?.exchange ||
      positionSymbol?.exchange ||
      position?.exchange ||
      position?.listing_exchange,
  );
  const type = firstText(
    instrument?.kind,
    instrument?.type?.code,
    instrument?.type?.description,
    positionSymbol?.type?.code,
    positionSymbol?.type?.description,
    position?.type?.code,
    position?.asset_type,
    position?.security_type,
  ).toLowerCase();
  return {
    ticker: ticker || null,
    rawTicker: rawTicker || ticker || null,
    name: firstText(
      instrument?.description,
      instrument?.name,
      position?.description,
      position?.name,
      position?.instrument?.name,
      positionSymbol?.description,
      ticker || rawTicker || "Holding",
    ),
    exchange: normaliseExchangeCodeForLoop(exchange) || exchange || null,
    type,
    symbolId: firstText(
      instrument?.id,
      instrument?.figi_code,
      instrument?.figi_instrument?.figi_code,
      positionSymbol?.id,
      positionSymbol?.figi_code,
      position?.id,
      position?.local_id,
    ),
  };
}

function assetKindFrom(position: any) {
  const symbol = symbolFromPosition(position);
  const text =
    `${symbol.type} ${position?.asset_type || ""} ${position?.security_type || ""} ${position?.instrument?.kind || ""}`.toLowerCase();
  if (/etf|exchange traded|\bet\b/.test(text)) return "etf";
  if (/fund|mutual|oef|mutualfund/.test(text)) return "fund";
  if (/crypto|coin|token/.test(text)) return "crypto";
  if (/cash/.test(text)) return "other";
  return "share";
}

function groupLabelFromPosition(position: any) {
  const label = firstText(
    position?.group_label,
    position?.groupLabel,
    position?.pie_name,
    position?.pie?.name,
    position?.portfolio?.name,
    position?.portfolio_name,
    position?.model_portfolio?.name,
    position?.bucket?.name,
    position?.account_group?.name,
    position?.group?.name,
    position?.group_name,
    position?.holding_group,
    position?.allocation_group,
    position?.collection?.name,
    nested(position, "account.pie.name"),
    nested(position, "account.group.name"),
    position?.raw_group,
  );
  return label || null;
}

function taxLotCurrentValue(position: any) {
  const lots = Array.isArray(position?.tax_lots) ? position.tax_lots : [];
  return lots.reduce((sum: number, lot: any) => sum + asNumber(lot?.current_value, 0), 0);
}

function taxLotCostBasis(position: any) {
  const lots = Array.isArray(position?.tax_lots) ? position.tax_lots : [];
  return lots.reduce((sum: number, lot: any) => sum + asNumber(lot?.cost_basis ?? lot?.original_value ?? lot?.book_value, 0), 0);
}

function looksLikeSnapTradePosition(value: any) {
  if (!value || typeof value !== "object") return false;
  const instrument = universalInstrumentFromPosition(value);
  const hasIdentity = Boolean(
    firstText(
      instrument?.symbol,
      instrument?.raw_symbol,
      instrument?.description,
      value?.ticker,
      value?.description,
      value?.name,
    ),
  );
  const hasPositionData = [
    value?.units,
    value?.quantity,
    value?.shares,
    value?.fractional_units,
    value?.market_value,
    value?.value,
    value?.current_value,
    value?.amount,
    value?.price,
    value?.cost_basis,
  ].some((item) => item !== undefined && item !== null && String(item) !== "");
  return hasIdentity && hasPositionData;
}

function collectSnapTradePositionCandidates(payload: any, depth = 0): any[] {
  if (!payload || depth > 5) return [];
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => collectSnapTradePositionCandidates(item, depth + 1));
  }
  if (typeof payload !== "object") return [];
  if (looksLikeSnapTradePosition(payload)) return [payload];
  const keys = [
    "results",
    "positions",
    "holdings",
    "securities",
    "account_holdings",
    "accountHoldings",
    "data",
    "items",
    "accounts",
  ];
  return keys.flatMap((key) => collectSnapTradePositionCandidates(payload?.[key], depth + 1));
}


function isLondonPencePosition(exchange?: string | null, currency?: string | null) {
  const ex = String(exchange || "").trim().toUpperCase();
  const cur = String(currency || "").trim().toUpperCase();
  return ["LSE", "LON", "XLON"].includes(ex) || cur === "GBX";
}

function normaliseSnapTradePriceAndValue(args: { exchange?: string | null; currency?: string | null; units: number; latestPrice: number; averageBuyPrice: number; value: number }) {
  const units = Number(args.units || 0);
  let latestPrice = Number(args.latestPrice || 0);
  let averageBuyPrice = Number(args.averageBuyPrice || 0);
  let value = Number(args.value || 0);
  if (isLondonPencePosition(args.exchange, args.currency)) {
    const rawPenceValue = units * latestPrice;
    const valueLooksLikePence = String(args.currency || "").toUpperCase() === "GBX" && value > 0 && rawPenceValue > 0 && Math.abs(value - rawPenceValue) < Math.max(1, value * 0.02);
    const latestLooksLikePence = String(args.currency || "").toUpperCase() === "GBX" || latestPrice > 20;
    if (latestLooksLikePence) latestPrice = latestPrice / 100;
    if (averageBuyPrice > 20 || String(args.currency || "").toUpperCase() === "GBX") averageBuyPrice = averageBuyPrice / 100;
    if (valueLooksLikePence) value = value / 100;
  }
  return { latestPrice, averageBuyPrice, value };
}

export function normaliseSnapTradePositions(
  holdingsPayload: any,
): SnapTradePositionPreview[] {
  const sourcePositions = collectSnapTradePositionCandidates(holdingsPayload);

  return sourcePositions
    .map((position: any, index: number) => {
      const symbol = symbolFromPosition(position);
      const units = asNumber(
        position?.units ??
          position?.quantity ??
          position?.shares ??
          position?.fractional_units,
        0,
      );
      const rawLatestPrice = asNumber(
        position?.price ??
          position?.market_price ??
          position?.last_price ??
          position?.symbol?.price,
        0,
      );
      const rawValue = asNumber(
        position?.market_value ??
          position?.value ??
          position?.current_value ??
          position?.amount,
        taxLotCurrentValue(position) || units * rawLatestPrice,
      );
      const impliedLatestPrice = units ? rawValue / units : 0;
      const latestPrice = rawLatestPrice || impliedLatestPrice;
      const costBasis = asNumber(
        position?.total_cost ??
          position?.cost_basis?.total?.amount ??
          position?.cost_basis?.total ??
          position?.book_value ??
          position?.original_value ??
          position?.opening_value,
        taxLotCostBasis(position) || NaN,
      );
      const averageBuyPrice = asNumber(
        position?.average_purchase_price ??
          position?.average_buy_price ??
          position?.cost_basis?.average_price ??
          position?.book_price,
        Number.isFinite(costBasis) && costBasis > 0 && units ? costBasis / units : 0,
      );
      const value = rawValue || units * latestPrice;
      const currency =
        currencyFrom(position) ||
        currencyCode(universalInstrumentFromPosition(position)?.currency) ||
        currencyFrom(position?.symbol) ||
        "GBP";
      const id = firstText(
        position?.id,
        position?.position_id,
        position?.local_id,
        symbol.symbolId,
        `${symbol.ticker || symbol.name}-${index}`,
      );
      const normalised = normaliseSnapTradePriceAndValue({
        exchange: symbol.exchange,
        currency,
        units,
        latestPrice,
        averageBuyPrice,
        value,
      });
      const normalisedCostBasis = Number.isFinite(costBasis) && costBasis > 0
        ? normaliseSnapTradePriceAndValue({
            exchange: symbol.exchange,
            currency,
            units,
            latestPrice: 0,
            averageBuyPrice: units ? costBasis / units : 0,
            value: costBasis,
          }).value
        : 0;
      return {
        externalPositionId: id,
        name: symbol.name,
        ticker: symbol.rawTicker || symbol.ticker,
        exchange: symbol.exchange,
        groupLabel: groupLabelFromPosition(position),
        assetKind: assetKindFrom(position),
        units,
        latestPrice: normalised.latestPrice || impliedLatestPrice,
        averageBuyPrice: normalised.averageBuyPrice,
        costBasis: normalisedCostBasis,
        currency: isLondonPencePosition(symbol.exchange, currency) ? "GBP" : currency,
        value: normalised.value,
        raw: {
          ...position,
          loop_cost_basis_verified: false,
        },
      };
    })
    .filter(
      (position) =>
        position.units !== 0 ||
        position.value !== 0 ||
        position.ticker ||
        position.name,
    );
}


function providerLotsFromSnapTradePosition(position: SnapTradePositionPreview) {
  const rawLots = Array.isArray(position.raw?.tax_lots)
    ? position.raw.tax_lots
    : Array.isArray(position.raw?.lots)
      ? position.raw.lots
      : [];
  return rawLots
    .map((lot: any, index: number) => {
      const units = asNumber(lot?.units ?? lot?.quantity ?? lot?.shares, 0);
      const rawPrice = asNumber(
        lot?.price ?? lot?.purchase_price ?? lot?.average_price ?? lot?.cost_basis?.average_price,
        0,
      );
      const totalCost = asNumber(
        lot?.total_cost ?? lot?.cost_basis ?? lot?.original_value ?? lot?.book_value,
        units * rawPrice,
      );
      const purchasePrice = units > 0 && totalCost > 0 ? totalCost / units : rawPrice;
      const purchaseDate = firstText(
        lot?.purchase_date,
        lot?.date,
        lot?.trade_date,
        lot?.settlement_date,
        new Date().toISOString().slice(0, 10),
      ).slice(0, 10);
      const externalTransactionId = firstText(
        lot?.id,
        lot?.lot_id,
        lot?.transaction_id,
        `${position.externalPositionId}:tax-lot:${index}`,
      );
      return {
        externalTransactionId,
        purchaseDate,
        units,
        purchasePrice,
        totalCost,
        fees: Math.max(0, totalCost - units * purchasePrice),
        notes: "Imported from provider tax-lot/cost-basis data. Review if the broker later changes lot detail.",
      };
    })
    .filter((lot: any) => lot.units > 0 && lot.purchasePrice >= 0);
}

async function saveProviderPurchaseLots(supabase: SupabaseServer, args: { appUserId: string; holdingId: string; position: SnapTradePositionPreview }) {
  const lots = providerLotsFromSnapTradePosition(args.position);
  if (!lots.length) return;
  await supabase
    .from("investment_purchase_lots")
    .delete()
    .eq("user_id", args.appUserId)
    .eq("holding_id", args.holdingId)
    .eq("external_source", "snaptrade")
    .then(() => null, () => null);
  await supabase
    .from("investment_purchase_lots")
    .insert(lots.map((lot: any) => ({
      user_id: args.appUserId,
      holding_id: args.holdingId,
      purchase_date: lot.purchaseDate,
      units: lot.units,
      purchase_price: lot.purchasePrice,
      total_cost: lot.totalCost,
      fees: lot.fees,
      price_quote_unit: String(args.position.currency || "GBP").toUpperCase() === "GBX" ? "gbx" : "gbp",
      external_transaction_id: lot.externalTransactionId,
      external_source: "snaptrade",
      notes: lot.notes,
    })))
    .then(() => null, () => null);
}

export async function getSnapTradeSecretForUser(
  supabase: SupabaseServer,
  appUserId: string,
) {
  const { data: secretRow, error } = await supabase
    .from("integration_secrets")
    .select("secret_ciphertext, secret_iv, secret_auth_tag")
    .eq("user_id", appUserId)
    .eq("provider", "snaptrade_user_secret")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!secretRow)
    throw new Error("SnapTrade user is not registered for this LOOP account.");
  const userSecret = decryptSecret(secretRow);
  if (!userSecret)
    throw new Error("Stored SnapTrade user secret could not be decrypted.");
  return userSecret;
}

async function fetchSnapTradeAccountPositionPayloads(
  externalAccountId: string,
  snapUserId: string,
  userSecret: string,
) {
  const authQuery = `userId=${encodeURIComponent(snapUserId)}&userSecret=${encodeURIComponent(userSecret)}`;
  const attempts = [
    { source: "positions_all", path: `/accounts/${encodeURIComponent(externalAccountId)}/positions/all?${authQuery}` },
    { source: "positions", path: `/accounts/${encodeURIComponent(externalAccountId)}/positions?${authQuery}` },
    { source: "holdings", path: `/accounts/${encodeURIComponent(externalAccountId)}/holdings?${authQuery}` },
  ];
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const payload = await snapTradeRequest<any>("GET", attempt.path);
      const positions = normaliseSnapTradePositions(payload);
      if (positions.length > 0) {
        return { payload, positions, source: attempt.source, errors };
      }
      // Keep the first successful payload because it can still contain balances/sync info.
      if (attempt.source === "holdings") {
        return { payload, positions, source: attempt.source, errors };
      }
    } catch (error) {
      errors.push(
        `${attempt.source}: ${error instanceof Error ? error.message : "failed"}`,
      );
    }
  }
  return { payload: null, positions: [] as SnapTradePositionPreview[], source: "none", errors };
}

export async function fetchSnapTradeAccountsForUser(
  supabase: SupabaseServer,
  appUserId: string,
): Promise<SnapTradeAccountPreview[]> {
  const userSecret = await getSnapTradeSecretForUser(supabase, appUserId);
  const snapUserId = loopSnapTradeUserId(appUserId);
  const accountsPayload = await snapTradeRequest<any[]>(
    "GET",
    `/accounts?userId=${encodeURIComponent(snapUserId)}&userSecret=${encodeURIComponent(userSecret)}`,
  );
  const accounts = Array.isArray(accountsPayload) ? accountsPayload : [];

  const { data: existingAccounts } = await supabase
    .from("investment_accounts")
    .select("id, label, provider, account_type, external_account_id, external_connection_id, external_account_raw, record_status")
    .eq("user_id", appUserId)
    .eq("external_provider", "snaptrade")
    .neq("record_status", "archived");
  const importedIds = new Set(
    (existingAccounts || [])
      .map((item: any) => String(item.external_account_id || ""))
      .filter(Boolean),
  );
  const importedDisplayKeys = new Set(
    (existingAccounts || [])
      .map((item: any) => stableAccountDisplayKeyFromDb(item))
      .filter(Boolean),
  );
  const importedLooseKeys = new Set(
    (existingAccounts || [])
      .map((item: any) => stableAccountLooseKeyFromDb(item))
      .filter(Boolean),
  );

  const importedInstitutionKeys = new Set(
    (existingAccounts || [])
      .map((item: any) => stableInstitutionAccountKeyFromDb(item))
      .filter(Boolean),
  );

  const { data: inactiveConnections } = await supabase
    .from("integration_connections")
    .select("external_connection_id, status, review_status")
    .eq("user_id", appUserId)
    .eq("provider", "SnapTrade")
    .in("status", ["archived", "disconnected", "deleted", "removing", "removed"]);
  const inactiveConnectionIds = new Set(
    (inactiveConnections || [])
      .map((item: any) => String(item.external_connection_id || ""))
      .filter(Boolean),
  );

  const activeAccounts = accounts.filter((account: any) => {
    const connectionId = connectionIdForAccount(account);
    return !connectionId || !inactiveConnectionIds.has(connectionId);
  });

  const previews = await Promise.all(
    activeAccounts.map(async (account: any) => {
      const externalAccountId = accountIdFor(account);
      let holdingsPayload: any = null;
      let positions: SnapTradePositionPreview[] = [];
      let positionsSource = "none";
      let positionFetchErrors: string[] = [];
      if (externalAccountId) {
        const fetched = await fetchSnapTradeAccountPositionPayloads(
          externalAccountId,
          snapUserId,
          userSecret,
        );
        holdingsPayload = fetched.payload;
        positions = fetched.positions;
        positionsSource = fetched.source;
        positionFetchErrors = fetched.errors;
      }
      const balanceValue = accountBalanceValue(account, holdingsPayload);
      const positionsValue = positions.reduce(
        (sum, position) => sum + Number(position.value || 0),
        0,
      );
      const cashBreakdown = accountCashBreakdownFromPayload(account, holdingsPayload, balanceValue, positionsValue);
      const cashValue = cashBreakdown.total;
      const previewBase = {
        externalAccountId,
        externalConnectionId: connectionIdForAccount(account) || null,
        institutionAccountId: institutionAccountIdFor(account) || null,
        name: accountNameFor(account),
        providerName: providerNameForAccount(account),
        accountType: mapSnapTradeAccountType(account),
        wrapperLabel: wrapperLabelFor(mapSnapTradeAccountType(account)),
        rawType:
          firstText(account?.raw_type, account?.type, account?.account_type) ||
          null,
        currency: currencyFrom(account),
        balanceValue,
        holdingsValue: positionsValue || balanceValue,
        holdingsCount: positions.length,
      };
      return {
        ...previewBase,
        syncStatus:
          firstText(
            account?.sync_status?.holdings?.status,
            account?.syncStatus,
            nested(account, "sync_status.holdings.initial_sync_completed"),
          ) || null,
        alreadyImported:
          importedIds.has(externalAccountId) ||
          importedDisplayKeys.has(stableAccountDisplayKey(previewBase)) ||
          importedLooseKeys.has(stableAccountLooseKey(previewBase)) ||
          importedInstitutionKeys.has(stableInstitutionAccountKey({ ...previewBase, raw: account })),
        importGuidance:
          "Review any possible manual duplicate before importing.",
        defaultArchiveManualAccountIds: [],
        raw: {
          ...account,
          loop_balance_value: balanceValue,
          loop_holdings_value: positionsValue || balanceValue,
          loop_cash_value: Math.abs(cashValue) >= 0.5 ? cashValue : 0,
          loop_investable_cash_value: cashBreakdown.investable,
          loop_dividend_cash_value: cashBreakdown.dividendCash,
          loop_cash_source: cashBreakdown.source,
          loop_position_fetch_source: positionsSource,
          loop_position_fetch_errors: positionFetchErrors,
          loop_positions_payload: holdingsPayload,
        },
        positions,
      } satisfies SnapTradeAccountPreview;
    }),
  );

  const filtered = dedupeSnapTradePreviews(
    previews.filter((account) => account.externalAccountId),
  );
  await manualMatchesForAccounts(supabase, appUserId, filtered);
  return filtered;
}

function normaliseProviderKey(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^the/, "");
}

function roughlySameProvider(left?: string | null, right?: string | null) {
  const a = normaliseProviderKey(left);
  const b = normaliseProviderKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function overlapScore(
  importedPositions: SnapTradePositionPreview[],
  manualHoldings: any[],
) {
  const importedTickers = new Set(
    importedPositions
      .map((position) => String(position.ticker || "").toUpperCase())
      .filter(Boolean),
  );
  if (!importedTickers.size || !manualHoldings.length) return 0;
  const manualTickers = new Set(
    manualHoldings
      .map((holding) => String(holding.ticker || "").toUpperCase())
      .filter(Boolean),
  );
  if (!manualTickers.size) return 0;
  let overlap = 0;
  importedTickers.forEach((ticker) => {
    if (manualTickers.has(ticker)) overlap += 1;
  });
  return Math.min(
    25,
    Math.round(
      (overlap /
        Math.max(1, Math.min(importedTickers.size, manualTickers.size))) *
        25,
    ),
  );
}

function valueForManualHolding(holding: any) {
  const imported = asNumber(holding?.imported_current_value, NaN);
  if (Number.isFinite(imported)) return imported;
  return asNumber(holding?.units, 0) * asNumber(holding?.latest_price, 0);
}

async function manualMatchesForAccounts(
  supabase: SupabaseServer,
  appUserId: string,
  previews: SnapTradeAccountPreview[],
) {
  const { data: manualAccounts } = await supabase
    .from("investment_accounts")
    .select(
      "id, label, provider, account_type, record_status, external_provider",
    )
    .eq("user_id", appUserId)
    .neq("record_status", "archived")
    .or("external_provider.is.null,external_provider.neq.snaptrade");

  const manualIds = (manualAccounts || [])
    .map((account: any) => account.id)
    .filter(Boolean);
  const { data: manualHoldings } = manualIds.length
    ? await supabase
        .from("investment_holdings")
        .select(
          "id, investment_account_id, asset_name, ticker, units, latest_price, imported_current_value, record_status, external_provider",
        )
        .eq("user_id", appUserId)
        .in("investment_account_id", manualIds)
        .neq("record_status", "archived")
    : { data: [] as any[] };

  const holdingsByAccount = new Map<string, any[]>();
  for (const holding of manualHoldings || []) {
    const list = holdingsByAccount.get(holding.investment_account_id) || [];
    list.push(holding);
    holdingsByAccount.set(holding.investment_account_id, list);
  }

  for (const preview of previews) {
    const matches: SnapTradeManualMatch[] = [];
    for (const manual of manualAccounts || []) {
      const accountHoldings = holdingsByAccount.get(manual.id) || [];
      let score = 0;
      const reasons: string[] = [];
      if (
        roughlySameProvider(manual.provider, preview.providerName) ||
        roughlySameProvider(manual.label, preview.providerName)
      ) {
        score += 45;
        reasons.push("same provider");
      }
      const providerMatch =
        roughlySameProvider(manual.provider, preview.providerName) ||
        roughlySameProvider(manual.label, preview.providerName);
      const wrapperMatch = wrapperCompatible(
        manual.account_type,
        preview.accountType,
      );
      if (wrapperMatch) {
        score += 30;
        reasons.push(`same wrapper (${wrapperLabelFor(preview.accountType)})`);
      }
      const labelText =
        `${manual.label || ""} ${manual.provider || ""} ${manual.account_type || ""}`.toLowerCase();
      const rawType =
        `${preview.rawType || ""} ${preview.name || ""} ${preview.accountType || ""} ${preview.wrapperLabel || ""}`.toLowerCase();
      if (
        rawType &&
        rawType
          .split(/\s+/)
          .some((term) => term.length > 3 && labelText.includes(term))
      ) {
        score += 10;
        reasons.push("similar account label");
      }
      const overlap = overlapScore(preview.positions || [], accountHoldings);
      if (overlap) {
        score += overlap;
        reasons.push("matching holdings/tickers");
      }
      if (providerMatch && wrapperMatch) {
        // Provider + wrapper is the key user-facing duplicate guard. Holdings then increases confidence,
        // but a GIA with Trading 212 should still be treated as a likely replacement even before full holdings arrive.
        score = Math.max(score, 75);
      }
      const estimatedValue = accountHoldings.reduce(
        (sum, holding) => sum + valueForManualHolding(holding),
        0,
      );
      if (estimatedValue && preview.holdingsValue) {
        const delta =
          Math.abs(estimatedValue - preview.holdingsValue) /
          Math.max(1, Math.max(estimatedValue, preview.holdingsValue));
        if (delta < 0.08) {
          score += 15;
          reasons.push("similar value");
        } else if (delta < 0.2) {
          score += 8;
          reasons.push("roughly similar value");
        }
      }
      if (score >= 45) {
        const safeScore = Math.min(100, score);
        const matchStrength: "strong" | "medium" | "weak" =
          safeScore >= 75 ? "strong" : safeScore >= 58 ? "medium" : "weak";
        matches.push({
          id: manual.id,
          label: manual.label || "Manual investment account",
          provider: manual.provider || "Manual",
          accountType: normaliseWrapperType(manual.account_type),
          wrapperLabel: wrapperLabelFor(manual.account_type),
          score: safeScore,
          matchStrength,
          defaultArchive: false,
          reason: reasons.join(" · ") || "possible provider/account match",
          recommendedAction:
            matchStrength === "strong"
              ? "Archive this manual input when importing the SnapTrade account to avoid double-counting."
              : "Review this possible duplicate before deciding whether to archive it.",
          holdingsCount: accountHoldings.length,
          estimatedValue,
        });
      }
    }
    const sorted = matches.sort((a, b) => b.score - a.score).slice(0, 6);
    const strongMatches = sorted.filter(
      (match) => match.matchStrength === "strong",
    );
    const defaultIds = strongMatches.length === 1 ? [strongMatches[0].id] : [];
    preview.manualMatches = sorted.map((match) => ({
      ...match,
      defaultArchive: defaultIds.includes(match.id),
    }));
    preview.defaultArchiveManualAccountIds = defaultIds;
    if (defaultIds.length === 1) {
      const match = sorted.find((item) => item.id === defaultIds[0]);
      preview.importGuidance = `LOOP found one likely manual ${preview.wrapperLabel} for ${preview.providerName}. Importing this SnapTrade account will archive ${match?.label || "the manual account"} so totals are not double-counted.`;
    } else if (strongMatches.length > 1) {
      preview.importGuidance = `LOOP found multiple possible manual ${preview.wrapperLabel} accounts for ${preview.providerName}. Choose which, if any, this SnapTrade account replaces.`;
    } else if (sorted.length) {
      preview.importGuidance = `LOOP found possible manual accounts. They are not selected by default because the match is not strong enough.`;
    } else {
      preview.importGuidance = `No likely manual duplicate was found. Importing this creates a new active ${preview.wrapperLabel}.`;
    }
  }
}

function labelForAccount(account: SnapTradeAccountPreview) {
  const provider =
    account.providerName && account.providerName !== "Connected broker"
      ? account.providerName
      : "Broker";
  const name =
    account.name && account.name !== account.externalAccountId
      ? account.name
      : account.rawType || account.accountType.toUpperCase();
  const wrapper = account.wrapperLabel && account.wrapperLabel !== "Unknown wrapper" ? account.wrapperLabel : account.accountType.toUpperCase();
  return `${provider} · ${wrapper} · ${name}`;
}

export async function importSnapTradeAccountsForUser(
  supabase: SupabaseServer,
  appUserId: string,
  accountIds: string[],
  options?: { archiveManualAccountIds?: Record<string, string[]> },
) {
  const accounts = await fetchSnapTradeAccountsForUser(supabase, appUserId);
  const wanted = new Set(accountIds.filter(Boolean));
  const selected = wanted.size
    ? accounts.filter((account) => wanted.has(account.externalAccountId))
    : accounts;
  const imported: Array<{
    accountId: string;
    localAccountId: string;
    holdings: number;
  }> = [];

  for (const account of selected) {
    const existing = await supabase
      .from("investment_accounts")
      .select("id, provider_cash_value, provider_investable_cash_value, provider_dividend_cash_value, provider_cash_source")
      .eq("user_id", appUserId)
      .eq("external_provider", "snaptrade")
      .eq("external_account_id", account.externalAccountId)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);

    const rawCashSource = firstText(account.raw?.loop_cash_source, null) || null;
    const hasProviderCashParts = rawCashSource === "provider_cash_parts" || rawCashSource === "provider_cash_total";
    const previousCashSource = firstText(existing.data?.provider_cash_source, null) || null;
    const preserveManualCash = Boolean(
      existing.data?.id &&
        !hasProviderCashParts &&
        previousCashSource &&
        /manual|override|user/i.test(previousCashSource),
    );

    const accountPayload = {
      user_id: appUserId,
      label: labelForAccount(account),
      provider: account.providerName || "SnapTrade",
      account_type: account.accountType,
      annual_platform_fee_percent: 0,
      fixed_monthly_fee: 0,
      notes: `Synced from SnapTrade. Manage broker imports under Integrations. Wrapper: ${account.wrapperLabel}.`,
      external_provider: "snaptrade",
      external_connection_id: account.externalConnectionId || String(
        account.raw?.brokerage_authorization?.id ||
          account.raw?.brokerage_authorization ||
          account.raw?.authorization?.id ||
          account.raw?.connection?.id ||
          "",
      ),
      external_account_id: account.externalAccountId,
      external_institution_account_id: account.institutionAccountId || null,
      external_account_raw: account.raw,
      provider_import_enabled: true,
      provider_cash_value: preserveManualCash
        ? existing.data?.provider_cash_value ?? null
        : Math.abs(Number(account.raw?.loop_cash_value || 0)) >= 0.5
          ? Number(account.raw?.loop_cash_value || 0)
          : null,
      provider_investable_cash_value: preserveManualCash
        ? existing.data?.provider_investable_cash_value ?? null
        : Math.abs(Number(account.raw?.loop_investable_cash_value || 0)) >= 0.01
          ? Number(account.raw?.loop_investable_cash_value || 0)
          : null,
      provider_dividend_cash_value: preserveManualCash
        ? existing.data?.provider_dividend_cash_value ?? null
        : Math.abs(Number(account.raw?.loop_dividend_cash_value || 0)) >= 0.01
          ? Number(account.raw?.loop_dividend_cash_value || 0)
          : null,
      provider_cash_source: preserveManualCash ? previousCashSource : rawCashSource,
      provider_isa_subscribed_amount: Number(account.raw?.loop_isa_subscribed_amount || account.raw?.isa?.subscribed_amount || 0) || null,
      provider_isa_remaining_amount: Number(account.raw?.loop_isa_remaining_amount || account.raw?.isa?.remaining_amount || 0) || null,
      provider_isa_allowance_year: firstText(account.raw?.loop_isa_allowance_year, account.raw?.isa?.allowance_year, null) || null,
      provider_last_transactions_sync_at: new Date().toISOString(),
      sync_status: account.syncStatus || "connected",
      last_provider_sync_at: new Date().toISOString(),
    } as Record<string, any>;

    const writeAccount = existing.data?.id
      ? await supabase
          .from("investment_accounts")
          .update(accountPayload)
          .eq("id", existing.data.id)
          .eq("user_id", appUserId)
          .select("id")
          .single()
      : await supabase
          .from("investment_accounts")
          .insert(accountPayload)
          .select("id")
          .single();
    if (writeAccount.error) throw new Error(writeAccount.error.message);
    const localAccountId = writeAccount.data.id;

    const manualIdsToArchive = (
      options?.archiveManualAccountIds?.[account.externalAccountId] || []
    )
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    for (const manualAccountId of manualIdsToArchive) {
      const manualAccount = await supabase
        .from("investment_accounts")
        .select("id, label, provider, account_type")
        .eq("user_id", appUserId)
        .eq("id", manualAccountId)
        .neq("record_status", "archived")
        .or("external_provider.is.null,external_provider.neq.snaptrade")
        .maybeSingle();
      if (manualAccount.error) throw new Error(manualAccount.error.message);
      if (!manualAccount.data) continue;

      await supabase
        .from("investment_holdings")
        .update({
          record_status: "archived",
          archive_reason: "superseded_by_snaptrade_import",
          archived_at: new Date().toISOString(),
          superseded_by_account_id: localAccountId,
          provider_migration_status: "manual_archived_after_snaptrade_import",
        })
        .eq("user_id", appUserId)
        .eq("investment_account_id", manualAccountId)
        .neq("record_status", "archived");

      await supabase
        .from("investment_accounts")
        .update({
          record_status: "archived",
          archive_reason: "superseded_by_snaptrade_import",
          archived_at: new Date().toISOString(),
          superseded_by_account_id: localAccountId,
          provider_import_enabled: false,
          provider_migration_status: "manual_archived_after_snaptrade_import",
        })
        .eq("user_id", appUserId)
        .eq("id", manualAccountId);

      await supabase
        .from("investment_provider_migrations")
        .insert({
          user_id: appUserId,
          provider: "snaptrade",
          wrapper_type: account.accountType,
          external_account_id: account.externalAccountId,
          snaptrade_account_id: localAccountId,
          manual_account_id: manualAccountId,
          migration_status: "manual_archived",
          match_strength:
            (account.manualMatches || []).find(
              (match) => match.id === manualAccountId,
            )?.matchStrength || "user_selected",
          user_confirmed_archive: true,
          match_score:
            (account.manualMatches || []).find(
              (match) => match.id === manualAccountId,
            )?.score || 0,
          match_reason:
            (account.manualMatches || []).find(
              (match) => match.id === manualAccountId,
            )?.reason || "selected by user during SnapTrade import",
          archived_at: new Date().toISOString(),
          notes: `Manual account archived when importing ${labelForAccount(account)}. It can be restored if provider access is removed.`,
        })
        .then(
          () => null,
          () => null,
        );
    }

    const { data: existingActiveProviderHoldings } = await supabase
      .from("investment_holdings")
      .select("id, external_position_id, external_provider")
      .eq("user_id", appUserId)
      .eq("investment_account_id", localAccountId)
      .eq("external_provider", "snaptrade")
      .neq("record_status", "archived");
    const hasExistingRealSnapTradePositions = (existingActiveProviderHoldings || []).some(
      (holding: any) =>
        String(holding.external_position_id || "") !==
        `${account.externalAccountId}:account-value`,
    );
    const realPositions = account.positions || [];
    if (realPositions.length > 0) {
      await supabase
        .from("investment_holdings")
        .update({
          record_status: "archived",
          archive_reason: "snaptrade_positions_available",
          archived_at: new Date().toISOString(),
          provider_migration_status: "placeholder_replaced_by_positions",
        })
        .eq("user_id", appUserId)
        .eq("investment_account_id", localAccountId)
        .eq("external_position_id", `${account.externalAccountId}:account-value`)
        .neq("record_status", "archived")
        .then(
          () => null,
          () => null,
        );
    }
    const shouldUseAccountValuePlaceholder =
      realPositions.length === 0 &&
      !hasExistingRealSnapTradePositions &&
      Number(account.holdingsValue || account.balanceValue || 0) > 0;
    const positionsToImport = realPositions.length
      ? realPositions
      : shouldUseAccountValuePlaceholder
        ? [
            {
              externalPositionId: `${account.externalAccountId}:account-value`,
              name: `${account.wrapperLabel} account value`,
              ticker: null,
              exchange: null,
              groupLabel: "Account value placeholder",
              assetKind: "other",
              units: 1,
              latestPrice: Number(account.holdingsValue || account.balanceValue || 0),
              averageBuyPrice: Number(account.holdingsValue || account.balanceValue || 0),
              costBasis: Number(account.holdingsValue || account.balanceValue || 0),
              currency: account.currency || "GBP",
              value: Number(account.holdingsValue || account.balanceValue || 0),
              raw: {
                synthetic: true,
                reason:
                  "SnapTrade returned an account value but no position-level holdings yet.",
                account: account.raw,
              },
            } satisfies SnapTradePositionPreview,
          ]
        : [];

    if (realPositions.length > 0) {
      const currentPositionIds = new Set(
        realPositions.map((position) => position.externalPositionId).filter(Boolean),
      );
      const { data: staleHoldings } = await supabase
        .from("investment_holdings")
        .select("id, external_position_id")
        .eq("user_id", appUserId)
        .eq("investment_account_id", localAccountId)
        .eq("external_provider", "snaptrade")
        .neq("record_status", "archived");
      const staleIds = (staleHoldings || [])
        .filter((holding: any) => {
          const externalPositionId = String(holding.external_position_id || "");
          return externalPositionId && !currentPositionIds.has(externalPositionId);
        })
        .map((holding: any) => holding.id);
      if (staleIds.length) {
        await supabase
          .from("investment_holdings")
          .update({
            record_status: "archived",
            archive_reason: "snaptrade_position_missing_on_latest_sync",
            archived_at: new Date().toISOString(),
            provider_migration_status: "provider_position_no_longer_returned",
          })
          .eq("user_id", appUserId)
          .in("id", staleIds)
          .then(
            () => null,
            () => null,
          );
      }
    }

    let importedHoldings = 0;
    for (const position of positionsToImport) {
      const existingHolding = await supabase
        .from("investment_holdings")
        .select("id")
        .eq("user_id", appUserId)
        .eq("investment_account_id", localAccountId)
        .eq("external_provider", "snaptrade")
        .eq("external_position_id", position.externalPositionId)
        .maybeSingle();
      if (existingHolding.error) throw new Error(existingHolding.error.message);
      const providerResultValue = asNumber(position.raw?.profit_loss ?? position.raw?.p_l ?? position.raw?.unrealized_pnl ?? position.raw?.unrealized_profit_loss ?? position.raw?.day_pnl ?? position.raw?.daily_pnl, NaN);
      const holdingPayload = {
        user_id: appUserId,
        investment_account_id: localAccountId,
        asset_name: position.name || position.ticker || "Imported holding",
        ticker: position.ticker,
        exchange: normaliseExchangeCodeForLoop(position.exchange),
        asset_kind: position.assetKind,
        group_label:
          position.groupLabel ||
          (position.raw?.synthetic ? "Account value placeholder" : null),
        units: position.units,
        average_buy_price: position.averageBuyPrice,
        latest_price: position.latestPrice,
        latest_price_date: new Date().toISOString().slice(0, 10),
        currency: position.currency || account.currency || "GBP",
        price_polling_enabled: Boolean(position.ticker),
        source_url: null,
        notes: position.raw?.synthetic
          ? "Imported from SnapTrade account-level value because the provider did not return position-level holdings yet. Refresh this account later to replace this placeholder with real positions."
          : "Imported from SnapTrade. Units/provider metadata are refreshed by SnapTrade; live prices are refreshed by the market worker when the ticker/exchange is mapped.",
        external_provider: "snaptrade",
        external_account_id: account.externalAccountId,
        external_position_id: position.externalPositionId,
        external_position_raw: position.raw,
        imported_current_value: position.value,
        imported_invested_value: position.costBasis && position.costBasis > 0 ? position.costBasis : null,
        imported_result_value: Number.isFinite(providerResultValue) ? providerResultValue : null,
        imported_account_currency:
          position.currency || account.currency || "GBP",
        import_source_type: "snaptrade",
        last_provider_sync_at: new Date().toISOString(),
      } as Record<string, any>;
      let localHoldingId = existingHolding.data?.id || "";
      const writeHolding = existingHolding.data?.id
        ? await supabase
            .from("investment_holdings")
            .update(holdingPayload)
            .eq("id", existingHolding.data.id)
            .eq("user_id", appUserId)
            .select("id")
            .single()
        : await supabase
            .from("investment_holdings")
            .insert(holdingPayload)
            .select("id")
            .single();
      if (writeHolding.error) throw new Error(writeHolding.error.message);
      localHoldingId = writeHolding.data?.id || localHoldingId;
      await saveProviderPositionSnapshot(supabase, {
        appUserId,
        holdingId: localHoldingId,
        units: Number(position.units || 0),
        latestPrice: Number(position.latestPrice || 0),
        value: Number(position.value || 0),
        currency: position.currency || account.currency || "GBP",
        source: `snaptrade:${account.raw?.loop_position_fetch_source || "positions"}`,
      });
      await saveProviderPurchaseLots(supabase, {
        appUserId,
        holdingId: localHoldingId,
        position,
      });
      importedHoldings += 1;
    }

    imported.push({
      accountId: account.externalAccountId,
      localAccountId,
      holdings: importedHoldings,
    });
  }

  await supabase
    .from("integration_connections")
    .update({ last_synced_at: new Date().toISOString(), status: "connected" })
    .eq("user_id", appUserId)
    .eq("provider", "SnapTrade")
    .then(
      () => null,
      () => null,
    );
  await supabase
    .from("app_user_profiles")
    .update({ market_data_provider_status: "connected" })
    .eq("user_id", appUserId)
    .then(
      () => null,
      () => null,
    );

  return { imported, available: accounts.length };
}

export async function runSnapTradeProviderSnapshotJob({
  supabase,
  realtimeOnly = true,
  maxUsers = 50,
}: {
  supabase: SupabaseServer;
  realtimeOnly?: boolean;
  maxUsers?: number;
}) {
  const startedAt = new Date().toISOString();
  const result = {
    ok: true,
    startedAt,
    finishedAt: startedAt,
    checkedUsers: 0,
    skippedUsers: 0,
    syncedUsers: 0,
    syncedAccounts: 0,
    syncedHoldings: 0,
    failures: [] as Array<{ userId: string; reason: string }>,
  };

  const { data: profiles, error } = await supabase
    .from("app_user_profiles")
    .select("user_id, payment_tier, payment_tier_status, payment_tier_override, market_data_tier, market_data_tier_override, market_data_provider_status, market_data_realtime_enabled")
    .or("market_data_provider_status.eq.connected,market_data_realtime_enabled.eq.true")
    .limit(maxUsers);
  if (error) throw new Error(error.message);

  const { investmentDataEntitlementForProfile } = await import("@/lib/wealth/user-tiers");

  for (const profile of profiles || []) {
    const userId = String((profile as any).user_id || "");
    if (!userId) continue;
    result.checkedUsers += 1;
    const entitlement = investmentDataEntitlementForProfile(profile as any);
    if (realtimeOnly && !entitlement.canUseRealtimePrices) {
      result.skippedUsers += 1;
      continue;
    }

    const { count } = await supabase
      .from("investment_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("external_provider", "snaptrade")
      .neq("record_status", "archived");
    if (!count) {
      result.skippedUsers += 1;
      continue;
    }

    try {
      const synced = await importSnapTradeAccountsForUser(supabase, userId, []);
      result.syncedUsers += 1;
      result.syncedAccounts += synced.imported.length;
      result.syncedHoldings += synced.imported.reduce((sum, item) => sum + Number(item.holdings || 0), 0);
    } catch (error) {
      result.failures.push({ userId, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  result.ok = result.failures.length === 0;
  result.finishedAt = new Date().toISOString();
  return result;
}
