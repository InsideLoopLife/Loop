import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { isAiFeatureEnabled, recordOpenAiUsageFromPayload } from "@/lib/ai/usage";
import { currencyForVenue, isMarketOpenForVenue, knownVenueCodes, marketSessionForVenue, normaliseVenueCode, quoteUnitForVenue, yahooProviderSymbols, stooqProviderSymbols } from "@/lib/investments/market-venues";

export type InvestmentQuote = {
  price: number;
  source: string;
  rawSymbol: string;
  assetName?: string;
  exchange?: string;
  currency?: string;
  priceQuoteUnit?: string;
  sourceUrl?: string | null;
  note?: string;
  assetType?: "share" | "etf" | "fund" | "crypto" | "other";
  isin?: string | null;
  annualAssetFeePercent?: number | null;
  confidence?: number | null;
  logoDomain?: string | null;
  previousClose?: number | null;
  previousCloseCurrency?: string | null;
  previousCloseQuoteUnit?: string | null;
  previousCloseAt?: string | null;
  observedAt?: string | null;
};

export function normaliseExchangeCode(exchange?: string | null, symbol?: string | null) {
  return normaliseVenueCode(exchange, symbol);
}

type CommonTicker = {
  assetName: string;
  exchange: string;
  symbol: string;
  sourceUrl?: string;
  assetType?: InvestmentQuote["assetType"];
  annualAssetFeePercent?: number | null;
  aliases?: string[];
  isin?: string | null;
};

export const COMMON_INVESTMENTS: Record<string, CommonTicker> = {
  G4M: { assetName: "Gear4music (Holdings) plc", exchange: "LSE", symbol: "G4M.L", sourceUrl: "https://www.londonstockexchange.com/stock/G4M/gear4music-holdings-plc/company-page", assetType: "share", aliases: ["gear4music"] },
  AAPL: { assetName: "Apple Inc.", exchange: "NASDAQ", symbol: "AAPL", assetType: "share", aliases: ["apple"] },
  GOOGL: { assetName: "Alphabet Inc. Class A", exchange: "NASDAQ", symbol: "GOOGL", assetType: "share", aliases: ["google", "alphabet"] },
  GOOG: { assetName: "Alphabet Inc. Class C", exchange: "NASDAQ", symbol: "GOOG", assetType: "share", aliases: ["google class c"] },
  MSFT: { assetName: "Microsoft Corporation", exchange: "NASDAQ", symbol: "MSFT", assetType: "share", aliases: ["microsoft"] },
  AMZN: { assetName: "Amazon.com, Inc.", exchange: "NASDAQ", symbol: "AMZN", assetType: "share", aliases: ["amazon"] },
  TSLA: { assetName: "Tesla, Inc.", exchange: "NASDAQ", symbol: "TSLA", assetType: "share", aliases: ["tesla"] },
  NIO: { assetName: "NIO Inc.", exchange: "NYSE", symbol: "NIO", assetType: "share", aliases: ["nio inc", "nio stock"] },
  NVDA: { assetName: "NVIDIA Corporation", exchange: "NASDAQ", symbol: "NVDA", assetType: "share", aliases: ["nvidia"] },
  META: { assetName: "Meta Platforms, Inc.", exchange: "NASDAQ", symbol: "META", assetType: "share", aliases: ["facebook", "meta"] },
  VWRP: { assetName: "Vanguard FTSE All-World UCITS ETF", exchange: "LSE", symbol: "VWRP.L", assetType: "etf", annualAssetFeePercent: 0.22, aliases: ["vanguard all world accumulating", "ftse all world"] },
  VWRL: { assetName: "Vanguard FTSE All-World UCITS ETF", exchange: "LSE", symbol: "VWRL.L", assetType: "etf", annualAssetFeePercent: 0.22, aliases: ["vanguard all world distributing"] },
  VUAG: { assetName: "Vanguard S&P 500 UCITS ETF", exchange: "LSE", symbol: "VUAG.L", assetType: "etf", annualAssetFeePercent: 0.07, aliases: ["vanguard s&p 500 accumulating"] },
  VUSA: { assetName: "Vanguard S&P 500 UCITS ETF", exchange: "LSE", symbol: "VUSA.L", assetType: "etf", annualAssetFeePercent: 0.07, aliases: ["vanguard s&p 500"] },
  VHVG: { assetName: "Vanguard FTSE Developed World UCITS ETF", exchange: "LSE", symbol: "VHVG.L", assetType: "etf", annualAssetFeePercent: 0.12, aliases: ["vanguard developed world", "developed world etf"] },
  VFEM: { assetName: "Vanguard FTSE Emerging Markets UCITS ETF", exchange: "LSE", symbol: "VFEM.L", assetType: "etf", annualAssetFeePercent: 0.22, aliases: ["vanguard emerging markets", "emerging markets etf"] },
  IUSA: { assetName: "iShares Core S&P 500 UCITS ETF", exchange: "LSE", symbol: "IUSA.L", assetType: "etf", annualAssetFeePercent: 0.07, aliases: ["ishares s&p 500", "core s&p 500 etf"] },
  CSP1: { assetName: "iShares Core S&P 500 UCITS ETF", exchange: "LSE", symbol: "CSP1.L", assetType: "etf", annualAssetFeePercent: 0.07, aliases: ["ishares core s&p 500 accumulating", "s&p 500 acc etf"] },
  EQQQ: { assetName: "Invesco EQQQ NASDAQ-100 UCITS ETF", exchange: "LSE", symbol: "EQQQ.L", assetType: "etf", annualAssetFeePercent: 0.30, aliases: ["invesco nasdaq 100", "nasdaq 100 etf"] },
  VUKG: { assetName: "Vanguard FTSE 100 UCITS ETF", exchange: "LSE", symbol: "VUKG.L", assetType: "etf", annualAssetFeePercent: 0.09, aliases: ["vanguard ftse 100 accumulating", "ftse 100 etf"] },
  VUKE: { assetName: "Vanguard FTSE 100 UCITS ETF", exchange: "LSE", symbol: "VUKE.L", assetType: "etf", annualAssetFeePercent: 0.09, aliases: ["vanguard ftse 100", "ftse 100 distributing"] },
  "VANGUARD-GLOBAL-ALL-CAP": { assetName: "Vanguard FTSE Global All Cap Index Fund", exchange: "Vanguard", symbol: "Vanguard FTSE Global All Cap", sourceUrl: "https://www.vanguardinvestor.co.uk/investments/vanguard-ftse-global-all-cap-index-fund-gbp-acc/overview", assetType: "fund", annualAssetFeePercent: 0.23, aliases: ["global all cap", "vanguard global all cap", "ftse global all cap"] },
  "VANGUARD-DEVELOPED-WORLD-EXUK": { assetName: "Vanguard FTSE Developed World ex-U.K. Equity Index Fund", exchange: "Vanguard", symbol: "Vanguard Developed World ex UK", assetType: "fund", annualAssetFeePercent: 0.14, aliases: ["developed world ex uk", "vanguard developed world ex uk"] },
  "VANGUARD-LIFESTRATEGY-20": { assetName: "Vanguard LifeStrategy® 20% Equity Fund - Accumulation", exchange: "Vanguard", symbol: "Vanguard LifeStrategy 20 Acc", sourceUrl: "https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-20-equity-fund-accumulation-shares/overview", assetType: "fund", annualAssetFeePercent: 0.20, aliases: ["lifestrategy 20", "vanguard lifestrategy 20", "lifestrategy 20 acc", "lifestrategy 20 accumulation", "vanguard lifestrategy 20% equity fund gbp acc", "VGLS20A"] },
  "VANGUARD-LIFESTRATEGY-40": { assetName: "Vanguard LifeStrategy® 40% Equity Fund - Accumulation", exchange: "Vanguard", symbol: "Vanguard LifeStrategy 40 Acc", sourceUrl: "https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-40-equity-fund-accumulation-shares/overview", assetType: "fund", annualAssetFeePercent: 0.20, aliases: ["lifestrategy 40", "vanguard lifestrategy 40", "lifestrategy 40 acc", "lifestrategy 40 accumulation", "vanguard lifestrategy 40% equity fund gbp acc", "VGLS40A"] },
  "VANGUARD-LIFESTRATEGY-60": { assetName: "Vanguard LifeStrategy® 60% Equity Fund - Accumulation", exchange: "Vanguard", symbol: "Vanguard LifeStrategy 60 Acc", sourceUrl: "https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-60-equity-fund-accumulation-shares/overview", assetType: "fund", annualAssetFeePercent: 0.20, aliases: ["lifestrategy 60", "vanguard lifestrategy 60", "lifestrategy 60 acc", "lifestrategy 60 accumulation", "vanguard lifestrategy 60% equity fund gbp acc", "VGLS60A"] },
  "VANGUARD-LIFESTRATEGY-80": { assetName: "Vanguard LifeStrategy® 80% Equity Fund - Accumulation", exchange: "Vanguard", symbol: "GB00B4PQW151", sourceUrl: "https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-80-equity-fund-accumulation-shares/overview", assetType: "fund", isin: "GB00B4PQW151", annualAssetFeePercent: 0.20, aliases: ["lifestrategy 80", "vanguard lifestrategy 80", "lifestrategy 80 acc", "lifestrategy 80 accumulation", "vanguard lifestrategy 80% equity fund gbp acc", "vanguard lifestrategy 80% equity fund accumulation", "VGLS80A", "Oakley Junior ISA"] },
  "VANGUARD-LIFESTRATEGY-100": { assetName: "Vanguard LifeStrategy® 100% Equity Fund - Accumulation", exchange: "Vanguard", symbol: "Vanguard LifeStrategy 100 Acc", sourceUrl: "https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-100-equity-fund-accumulation-shares/overview", assetType: "fund", annualAssetFeePercent: 0.20, aliases: ["lifestrategy 100", "vanguard lifestrategy 100", "vanguard lifestrategy", "lifestrategy 100 acc", "lifestrategy 100 accumulation", "VGLS100A"] },
  "VANGUARD-LIFESTRATEGY-GLOBAL-80-ACC": { assetName: "Vanguard LifeStrategy® Global 80% Equity Fund - Accumulation", exchange: "Vanguard", symbol: "Vanguard LifeStrategy Global 80 Acc", sourceUrl: "https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-global-80-equity-fund-a-gbp-accumulation-shares/overview", assetType: "fund", annualAssetFeePercent: 0.20, aliases: ["lifestrategy global 80", "lifestrategy global 80 acc", "lifestrategy global 80 accumulation", "VL80AGA"] },
};

// --- ISIN-FIRST RESOLUTION LAYER ---

export type AssetResolution = {
  quoteSymbol: string | null;
  provider: "yahoo" | "isin_lookup" | "native" | null;
  isFund: boolean;
};

const BROKER_WRAPPER_EXCHANGES = new Set([
  "MONEYBOX",
  "MONEYBOX FUND",
  "HARGREAVES LANSDOWN",
  "AJ BELL",
  "VANGUARD",
  "VANGUARD UK",
  "INTERACTIVE INVESTOR",
  "FREETRADE",
  "FIDELITY",
  "FIDELITY INTERNATIONAL",
]);

const ISIN_TO_YAHOO_MAP: Record<string, string> = {
  "GB00BJS8SJ34": "0P000125KV.L", // Fidelity Index World Fund P Acc
  "GB00B5BFJG71": "0P0000XUDF.L", // iShares Env & Low Carbon Real Estate Index Fund
  "GB00B84DSH94": "0P0000W38W.L", // L&G Corporate Bond ESG Fund
  "GB00B4PQW151": "0P0000TKZO.L", // Vanguard LifeStrategy 80% Equity Fund Acc
};

/**
 * Resolves a usable market quote symbol by prioritizing ISINs when retail brokers 
 * poison the exchange field, or when internal glossary names are passed.
 */
export function resolveHoldingMarketSymbol(holding: {
  ticker?: string | null;
  exchange?: string | null;
  native_exchange?: string | null;
  isin?: string | null;
  asset_name?: string | null;
}): AssetResolution {
  const ticker = (holding.ticker || "").trim().toUpperCase();
  const exchange = (holding.exchange || holding.native_exchange || "").trim().toUpperCase();

  // 1. Check if the ticker matches an item in our COMMON_INVESTMENTS glossary that has an ISIN
  const cleanKey = cleanTicker(ticker).replace(/\.L$/i, "");
  const glossaryItem = COMMON_INVESTMENTS[cleanKey] || Object.values(COMMON_INVESTMENTS).find(
    (item) => item.symbol.toUpperCase() === ticker || item.isin === ticker
  );

  // 2. Grab the ISIN from explicit input, the glossary, or see if the ticker itself is an ISIN
  const isin = (holding.isin || glossaryItem?.isin || "").trim().toUpperCase();
  const looksLikeIsin = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(ticker);
  const isPoisonedBrokerExchange = BROKER_WRAPPER_EXCHANGES.has(exchange);

  // 3. ISIN PRIORITY: Map ISINs directly to Yahoo Fund codes (e.g. GB00B4PQW151 -> 0P0000TKZO.L)
  const targetIsin = isin || (looksLikeIsin ? ticker : "");
  if (targetIsin && ISIN_TO_YAHOO_MAP[targetIsin]) {
    return {
      quoteSymbol: ISIN_TO_YAHOO_MAP[targetIsin],
      provider: "yahoo",
      isFund: true,
    };
  }

  if (targetIsin) {
    return {
      quoteSymbol: `ISIN:${targetIsin}`,
      provider: "isin_lookup",
      isFund: true,
    };
  }

  // 4. STANDARD EQUITIES: If it has a standard ticker and a real exchange
  if (ticker && !isPoisonedBrokerExchange && !looksLikeIsin) {
    const suffix = ["LSE", "LON", "XLON"].includes(exchange) && !ticker.includes(".") ? ".L" : "";
    return {
      quoteSymbol: `${ticker}${suffix}`,
      provider: "yahoo",
      isFund: false,
    };
  }

  return { quoteSymbol: null, provider: null, isFund: false };
}

// -----------------------------------

function envBool(name: string, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  const clean = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(clean)) return true;
  if (["0", "false", "no", "n", "off"].includes(clean)) return false;
  return fallback;
}

function marketWorkerProcess() {
  return envBool("LOOP_MARKET_DATA_WORKER", false) || envBool("MARKET_DATA_WORKER_PROCESS", false);
}

export function cleanTicker(ticker: string) {
  return ticker.trim().toUpperCase().replace(/\s+/g, "");
}

export function isYahooFundCode(ticker: string) {
  return /^0P[0-9A-Z]+\.L$/i.test(cleanTicker(ticker));
}

function normaliseInvestmentSearch(value: string) {
  return value
    .toLowerCase()
    .replace(/[®™]/g, "")
    .replace(/&/g, " and ")
    .replace(/accumulating|accumulation|accumulator/g, " acc ")
    .replace(/income|distributing|distribution/g, " inc ")
    .replace(/u\.?k\.?/g, "uk")
    .replace(/[^a-z0-9%]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function candidateInvestments(query: string) {
  const q = normaliseInvestmentSearch(query);
  const clean = cleanTicker(query).replace(/\.L$/i, "");
  if (!q) return [] as InvestmentQuote[];
  if (isYahooFundCode(query)) {
    return [{
      price: 0,
      source: "Yahoo Finance fund code",
      rawSymbol: cleanTicker(query),
      assetName: cleanTicker(query),
      exchange: "Yahoo Fund",
      currency: "GBP",
      priceQuoteUnit: "gbp",
      sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(cleanTicker(query))}`,
      note: "Yahoo Finance mutual-fund code accepted. These are often provider/OEIC funds rather than standard stock tickers.",
      assetType: "fund",
      annualAssetFeePercent: 0,
    } satisfies InvestmentQuote];
  }

  const rows = Object.entries(COMMON_INVESTMENTS)
    .filter(([key, item]) => {
      const isExactMatch = key === clean || item.symbol.toUpperCase() === clean;
      if (isExactMatch) return true;
      // BUGFIX (investment pricing audit): a bare `haystack.includes(q)` with no
      // minimum length meant single-letter tickers like "O" (Realty Income) or
      // "C" (Citigroup) matched almost every entry in this glossary, since
      // nearly every company name contains the letter "o" or "c" somewhere.
      // That caused fetchInvestmentQuote() to silently substitute a totally
      // unrelated symbol for the live quote fetch. Require at least 2
      // characters before allowing the loose substring match.
      if (q.length < 2) return false;
      const haystack = normaliseInvestmentSearch(`${key} ${item.symbol} ${item.isin || ""} ${item.assetName} ${(item.aliases || []).join(" ")}`);
      return haystack.includes(q) || q.split(/\s+/).filter(Boolean).some((term) => term.length > 1 && haystack.includes(term));
    })
    .map(([key, item]) => ({
      price: 0,
      source: "Built-in investment glossary",
      rawSymbol: item.symbol || key,
      assetName: item.assetName,
      exchange: item.exchange,
      currency: item.exchange === "LSE" ? "GBX" : item.exchange === "Vanguard" ? "GBP" : "USD",
      priceQuoteUnit: item.exchange === "LSE" ? "gbx" : item.exchange === "Vanguard" ? "gbp" : "usd",
      sourceUrl: item.sourceUrl || null,
      note: item.assetType === "fund" ? "Provider fund candidate. Add latest unit price/current value from the provider portal if no live quote exists." : "Known instrument candidate. Price can be checked where market data is available.",
      assetType: item.assetType || "share",
      isin: item.isin || null,
      annualAssetFeePercent: item.annualAssetFeePercent ?? 0,
      confidence: key === clean || item.symbol.toUpperCase() === clean ? 98 : undefined,
      logoDomain: item.sourceUrl ? null : null,
    } satisfies InvestmentQuote));
  return rows.slice(0, 12);
}

function providerSymbols(ticker: string, exchange?: string | null) {
  const fromYahoo = yahooProviderSymbols(ticker, exchange);
  const fromStooq = stooqProviderSymbols(ticker, exchange).map((symbol) => symbol.toUpperCase());
  // BUGFIX (real ticker collisions confirmed: THG plc/LSE vs Hanover
  // Insurance Group/NYSE, GFIN plc/LSE vs an unrelated NYSE Arca
  // security): the bare, unqualified ticker used to always be appended
  // as a final fallback candidate, regardless of what exchange was
  // actually requested. When a specific non-US exchange is known, that
  // bare candidate is genuinely dangerous — it's exactly what let
  // US-centric providers (Alpha Vantage, FMP) match a completely
  // different, unrelated company sharing the same ticker letters. Only
  // include it when no specific exchange was requested at all, where a
  // broader search is the intended behaviour.
  const requestedExchange = normaliseExchangeCode(exchange);
  const isKnownNonUsExchange = Boolean(requestedExchange) && !isUsExchange(requestedExchange);
  const candidates = isKnownNonUsExchange ? [...fromYahoo, ...fromStooq] : [...fromYahoo, ...fromStooq, cleanTicker(ticker)];
  return Array.from(new Set(candidates));
}

function yahooSymbols(ticker: string, exchange?: string | null) {
  const clean = cleanTicker(ticker);
  if (isYahooFundCode(clean)) return [clean];
  return yahooProviderSymbols(ticker, exchange);
}

function stooqSymbols(ticker: string, exchange?: string | null) {
  return stooqProviderSymbols(ticker, exchange);
}

export function exchangeFromSymbol(symbol: string, exchange?: string | null) {
  const ex = normaliseExchangeCode(exchange, symbol);
  if (isYahooFundCode(symbol)) return "Yahoo Fund";
  if (ex) return ex;
  return normaliseExchangeCode(null, symbol) || "";
}

export function normaliseMarketPrice(rawPrice: number, exchange?: string | null, symbol?: string | null) {
  const ex = normaliseExchangeCode(exchange, symbol);
  const currency = currencyForVenue(ex, undefined, symbol);
  const priceQuoteUnit = quoteUnitForVenue(ex, undefined, symbol);
  return { price: rawPrice, priceQuoteUnit, currency };
}

function assetNameFor(ticker: string, symbol: string) {
  const base = cleanTicker(ticker).replace(/\.L$/i, "");
  return COMMON_INVESTMENTS[base]?.assetName || base || symbol;
}

// US-listed venues Alpaca actually covers. Anything else (LSE, XETR, XPAR,
// etc.) skips Alpaca entirely and goes straight to Yahoo/Stooq — Alpaca's
// market data API only serves US equities.
const ALPACA_VENUE_CODES = new Set(["NASDAQ", "NYSE", "AMEX", "ARCX", "BATS", "OTCM", "PINX"]);

function isUsExchange(exchange?: string | null) {
  return ALPACA_VENUE_CODES.has(normaliseVenueCode(exchange));
}

function alpacaCredentials() {
  const keyId = process.env.ALPACA_KEY_ID || process.env.ALPACA_API_KEY_ID || process.env.ALPACAKEYID;
  const secretKey = process.env.ALPACA_SECRET_KEY || process.env.ALPACA_API_SECRET_KEY || process.env.ALPACASECRETKEY;
  if (!keyId || !secretKey) return null;
  return { keyId, secretKey };
}

// Alpaca Market Data API (US equities only). Tried first for US-listed
// tickers, ahead of Yahoo/Stooq — this is the "paid API key" source referred
// to for US stocks; everything international still goes through Yahoo/Stooq
// as before, unchanged.
async function alpacaQuote(ticker: string, exchange?: string | null): Promise<InvestmentQuote | null> {
  const creds = alpacaCredentials();
  if (!creds) return null;
  const symbol = String(ticker || "").trim().toUpperCase().replace(/\.[A-Z]+$/i, "");
  if (!symbol) return null;
  try {
    const response = await fetch(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/snapshot?feed=iex`, {
      cache: "no-store",
      headers: {
        "APCA-API-KEY-ID": creds.keyId,
        "APCA-API-SECRET-KEY": creds.secretKey,
      },
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    const rawPrice = Number(data?.latestTrade?.p || data?.dailyBar?.c || 0);
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) return null;
    const previousClose = Number(data?.prevDailyBar?.c || 0);
    const ex = exchangeFromSymbol(symbol, exchange) || exchange || "NYSE";
    const normalised = normaliseMarketPrice(rawPrice, ex, symbol);
    const previousNormalised = Number.isFinite(previousClose) && previousClose > 0 ? normaliseMarketPrice(previousClose, ex, symbol) : null;
    const common = COMMON_INVESTMENTS[cleanTicker(ticker).replace(/\.L$/i, "")];
    return {
      price: normalised.price,
      source: "Alpaca",
      rawSymbol: symbol,
      assetName: common?.assetName || assetNameFor(ticker, symbol),
      exchange: common?.exchange || ex,
      currency: normalised.currency,
      priceQuoteUnit: normalised.priceQuoteUnit,
      assetType: common?.assetType || "share",
      annualAssetFeePercent: common?.annualAssetFeePercent ?? 0,
      sourceUrl: common?.sourceUrl || `https://app.alpaca.markets/`,
      note: "US equity quote from Alpaca (IEX feed).",
      previousClose: previousNormalised?.price || null,
      previousCloseCurrency: previousNormalised?.currency || null,
      previousCloseQuoteUnit: previousNormalised?.priceQuoteUnit || null,
      previousCloseAt: null,
      observedAt: data?.latestTrade?.t || data?.dailyBar?.t || null,
    };
  } catch {
    return null;
  }
}

async function yahooQuote(ticker: string, exchange?: string | null): Promise<InvestmentQuote | null> {
  for (const symbol of yahooSymbols(ticker, exchange)) {
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
      const data = await response.json().catch(() => ({}));
      const result = data?.chart?.result?.[0];
      const meta = result?.meta || {};
      const ex = exchangeFromSymbol(symbol, exchange);
      const session = marketSessionForVenue(ex, new Date(), symbol);
      const preMarketPrice = Number(meta.preMarketPrice || 0);
      const postMarketPrice = Number(meta.postMarketPrice || 0);
      const regularMarketPrice = Number(meta.regularMarketPrice || 0);
      const previousClose = Number(meta.previousClose || meta.chartPreviousClose || 0);
      const declaredDelayMinutes = Number(meta.exchangeDataDelayedBy);
      const delaySuffix = Number.isFinite(declaredDelayMinutes) && declaredDelayMinutes > 0
        ? ` · ${declaredDelayMinutes}m exchange delay`
        : "";
      let rawPrice = regularMarketPrice || previousClose || 0;
      let sourceLabel = `Yahoo 1-minute market feed${delaySuffix}`;
      if (session.session === "pre" && Number.isFinite(preMarketPrice) && preMarketPrice > 0) {
        rawPrice = preMarketPrice;
        sourceLabel = `Yahoo pre-market 1-minute feed${delaySuffix}`;
      } else if (session.session === "after" && Number.isFinite(postMarketPrice) && postMarketPrice > 0) {
        rawPrice = postMarketPrice;
        sourceLabel = `Yahoo post-market 1-minute feed${delaySuffix}`;
      } else if (session.session === "closed" && Number.isFinite(regularMarketPrice) && regularMarketPrice > 0) {
        sourceLabel = `Yahoo regular close${delaySuffix}`;
      }
      if (!Number.isFinite(rawPrice) || rawPrice <= 0) continue;
      const normalised = normaliseMarketPrice(rawPrice, ex, symbol);
      const previousNormalised = Number.isFinite(previousClose) && previousClose > 0 ? normaliseMarketPrice(previousClose, ex, symbol) : null;
      const common = COMMON_INVESTMENTS[cleanTicker(ticker).replace(/\.L$/i, "")];
      const yahooFund = isYahooFundCode(symbol);
      if (yahooFund) sourceLabel = "Yahoo daily fund quote";
      const lastTimestamp = Array.isArray(result?.timestamp) && result.timestamp.length
        ? Number(result.timestamp[result.timestamp.length - 1])
        : Number(meta.regularMarketTime || 0);
      const sessionNote = session.isExtended ? `Using ${session.label} price; regular close remains separate for daily movement.` : session.session === "closed" ? "Market is closed; using latest regular/close quote from provider." : "Live/delayed quote from active regular session where available.";
      return {
        price: normalised.price,
        source: sourceLabel,
        rawSymbol: symbol,
        assetName: meta.longName || meta.shortName || common?.assetName || assetNameFor(ticker, symbol),
        exchange: yahooFund ? "Yahoo Fund" : common?.exchange || ex || meta.exchangeName || "",
        currency: normalised.currency,
        priceQuoteUnit: normalised.priceQuoteUnit,
        assetType: yahooFund ? "fund" : common?.assetType || "share",
        annualAssetFeePercent: common?.annualAssetFeePercent ?? 0,
        sourceUrl: common?.sourceUrl || `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
        note: yahooFund ? "Yahoo Finance mutual-fund code. Price normally represents the fund/unit quote, not a stock-exchange pence quote." : sessionNote,
        previousClose: previousNormalised?.price || null,
        previousCloseCurrency: previousNormalised?.currency || null,
        previousCloseQuoteUnit: previousNormalised?.priceQuoteUnit || null,
        previousCloseAt: meta.regularMarketTime ? new Date(Number(meta.regularMarketTime) * 1000).toISOString() : null,
        observedAt: lastTimestamp > 0 ? new Date(lastTimestamp * 1000).toISOString() : null,
      };
    } catch {}
  }
  return null;
}

async function stooqQuote(ticker: string, exchange?: string | null): Promise<InvestmentQuote | null> {
  for (const symbol of stooqSymbols(ticker, exchange)) {
    try {
      const response = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`, { cache: "no-store" });
      const csv = await response.text();
      const values = csv.trim().split(/\r?\n/)[1]?.split(",") || [];
      if (!values.length || /N\/D/i.test(values.join(""))) continue;
      const close = Number(values[6] || values[3] || 0);
      if (!Number.isFinite(close) || close <= 0) continue;
      const ex = exchangeFromSymbol(symbol, exchange);
      const normalised = normaliseMarketPrice(close, ex, symbol);
      const common = COMMON_INVESTMENTS[cleanTicker(ticker).replace(/\.L$/i, "")];
      return { price: normalised.price, source: "Stooq delayed/EOD", rawSymbol: symbol, assetName: common?.assetName || assetNameFor(ticker, symbol), exchange: common?.exchange || ex, currency: normalised.currency, priceQuoteUnit: normalised.priceQuoteUnit, assetType: common?.assetType || "share", annualAssetFeePercent: common?.annualAssetFeePercent ?? 0, sourceUrl: common?.sourceUrl || null, note: "Delayed/end-of-day quote. Fine for portfolio tracking; confirm before trading." };
    } catch {}
  }
  return null;
}

function safeJsonFromText(text: string) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

const REVIEWED_PROVIDER_FUND_QUOTES: Record<string, { price: number; priceDate: string; fee: number; sourceUrl: string; source: string; sourceUrls: string[] }> = {
  GB00B4PQW151: {
    price: 389.0662,
    priceDate: "2026-06-18",
    fee: 0.20,
    source: "Reviewed provider fund fallback",
    sourceUrl: "https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-80-equity-fund-accumulation-shares/overview",
    sourceUrls: [
      "https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-80-equity-fund-accumulation-shares/overview",
      "https://www.fidelity.co.uk/factsheet-data/factsheet/GB00B4PQW151-vanguard-lifestrategy-80-equity-acc/key-statistics",
      "https://www.hl.co.uk/funds/fund-discounts%2C-prices--and--factsheets/search-results/v/vanguard-lifestrategy-80-equity-accumulation",
      "https://markets.ft.com/data/funds/tearsheet/summary?s=GB00B4PQW151:GBP",
    ],
  },
};

function providerFundKey(glossary?: InvestmentQuote | null) {
  const haystack = `${glossary?.isin || ""} ${glossary?.rawSymbol || ""} ${glossary?.assetName || ""}`.toUpperCase();
  if (haystack.includes("GB00B4PQW151") || (haystack.includes("LIFESTRATEGY") && haystack.includes("80") && haystack.includes("ACC"))) return "GB00B4PQW151";
  return null;
}

function htmlToReadableText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/&pound;/gi, "£")
    .replace(/&#163;/gi, "£")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function boundedFundPrice(glossary: InvestmentQuote | undefined | null, price: number | null) {
  if (!price || !Number.isFinite(price) || price <= 0) return null;
  const key = providerFundKey(glossary);
  if (key === "GB00B4PQW151" && (price < 100 || price > 1000)) return null;
  return price;
}

function extractProviderFundPriceAndFee(html: string, glossary?: InvestmentQuote | null) {
  const text = htmlToReadableText(html);
  const priceMatchers = [
    /Last buy\/sell price\s*£\s*([0-9,]+(?:\.[0-9]+)?)/i,
    /NAV price\s*\(GBP\)[^£]{0,160}£\s*([0-9,]+(?:\.[0-9]+)?)/i,
    /(?:NAV price|NAV value|Fund price|Price \(GBP\)|Price)[^£]{0,120}£\s*([0-9,]+(?:\.[0-9]+)?)/i,
    /£\s*([0-9,]+(?:\.[0-9]+)?)[^£]{0,100}(?:one-day change|asset allocation|ongoing charge|OCF|Prices updated|Change)/i,
  ];
  const penceMatchers = [
    /(?:Sell|Buy):\s*([0-9,]+(?:\.[0-9]+)?)p/i,
    /([0-9,]+(?:\.[0-9]+)?)p\s*(?:Buy|Sell|Prices as at|As at)/i,
  ];
  let price: number | null = null;
  for (const matcher of priceMatchers) {
    const match = text.match(matcher);
    const value = match ? Number(match[1].replace(/,/g, "")) : null;
    const bounded = boundedFundPrice(glossary, value);
    if (bounded) { price = bounded; break; }
  }
  if (!price) {
    for (const matcher of penceMatchers) {
      const match = text.match(matcher);
      const rawPence = match ? Number(match[1].replace(/,/g, "")) : null;
      const value = rawPence && Number.isFinite(rawPence) ? rawPence / 100 : null;
      const bounded = boundedFundPrice(glossary, value);
      if (bounded) { price = bounded; break; }
    }
  }
  const ocfMatch = text.match(/(?:OCF\/TER|OCF|ongoing charge|ongoing charges|annual management charge)[^0-9%]{0,120}([0-9]+(?:\.[0-9]+)?)\s*%/i);
  const fee = ocfMatch ? Number(ocfMatch[1]) : null;
  return { price, fee: fee && Number.isFinite(fee) ? fee : null };
}

function providerFundSourceUrls(glossary: InvestmentQuote) {
  const reviewed = providerFundKey(glossary) ? REVIEWED_PROVIDER_FUND_QUOTES[providerFundKey(glossary)!] : null;
  const urls = [glossary.sourceUrl || null, ...(reviewed?.sourceUrls || [])].filter(Boolean) as string[];
  return Array.from(new Set(urls.map((url) => url.includes("vanguardinvestor.co.uk") && !url.endsWith("/overview") ? `${url.replace(/\/$/, "")}/overview` : url)));
}

async function providerFundQuoteFromSource(glossary: InvestmentQuote | undefined | null): Promise<InvestmentQuote | null> {
  if (!glossary?.sourceUrl || glossary.assetType !== "fund") return null;
  const reviewedKey = providerFundKey(glossary);
  const reviewed = reviewedKey ? REVIEWED_PROVIDER_FUND_QUOTES[reviewedKey] : null;
  for (const url of providerFundSourceUrls(glossary)) {
    try {
      const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await response.text();
      const parsed = extractProviderFundPriceAndFee(html, glossary);
      if (!parsed.price) continue;
      return {
        ...glossary,
        price: parsed.price,
        source: "Provider fund page",
        exchange: glossary.exchange || "Vanguard",
        currency: "GBP",
        priceQuoteUnit: "gbp",
        sourceUrl: url,
        annualAssetFeePercent: parsed.fee ?? reviewed?.fee ?? glossary.annualAssetFeePercent ?? 0,
        note: `${glossary.note || "Provider fund candidate."} Latest GBP NAV/unit price was parsed from a provider/platform fund page; keep the provider/account screen as the source of truth.`,
      };
    } catch {
      continue;
    }
  }
  if (reviewed) {
    return {
      ...glossary,
      price: reviewed.price,
      source: reviewed.source,
      exchange: glossary.exchange || "Vanguard",
      currency: "GBP",
      priceQuoteUnit: "gbp",
      sourceUrl: reviewed.sourceUrl,
      annualAssetFeePercent: reviewed.fee ?? glossary.annualAssetFeePercent ?? 0,
      note: `${glossary.note || "Provider fund candidate."} Using reviewed GBP NAV fallback from ${reviewed.priceDate}; refresh from Vanguard/provider screen when available.`,
    };
  }
  return null;
}

function quoteTypeToAssetKind(value: string | undefined | null): InvestmentQuote["assetType"] {
  const type = String(value || "").toUpperCase();
  if (type === "ETF") return "etf";
  if (type.includes("FUND") || type === "MUTUALFUND") return "fund";
  if (type === "CRYPTOCURRENCY") return "crypto";
  if (type === "EQUITY") return "share";
  return "other";
}

function exchangeFromYahooSearch(item: any) {
  const symbol = String(item?.symbol || "").toUpperCase();
  const exchange = String(item?.exchange || item?.exchDisp || item?.exchangeName || "").toUpperCase();
  return normaliseExchangeCode(exchange, symbol) || "Review";
}

async function yahooSearchCandidates(query: string, exchange?: string | null): Promise<InvestmentQuote[]> {
  const q = query.trim();
  if (!q || q.length < 2) return [];
  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    const data = await response.json().catch(() => ({}));
    const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
    const requestedExchange = String(exchange || "").toUpperCase();
    return quotes
      .filter((item: any) => item?.symbol && (item?.shortname || item?.longname))
      .map((item: any) => {
        const ex = exchangeFromYahooSearch(item);
        const symbol = String(item.symbol || "");
        const assetType = quoteTypeToAssetKind(item.quoteType);
        const isUk = ex === "LSE" || symbol.toUpperCase().endsWith(".L");
        return {
          price: 0,
          source: "Yahoo search match",
          rawSymbol: symbol,
          assetName: String(item.longname || item.shortname || symbol),
          exchange: ex,
          currency: isUk ? "GBP" : ex === "NASDAQ" || ex === "NYSE" || ex === "AMEX" ? "USD" : "GBP",
          priceQuoteUnit: isUk ? "gbx" : ex === "NASDAQ" || ex === "NYSE" || ex === "AMEX" ? "usd" : "gbp",
          sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`,
          note: assetType === "etf" ? "ETF candidate found from online quote search. UK/LSE ETFs are normally quoted in pence/GBX and stored as GBP equivalent for totals." : "Online quote-search candidate. Confirm exact exchange/currency before saving.",
          assetType,
          annualAssetFeePercent: null,
        } satisfies InvestmentQuote;
      })
      .filter((item: InvestmentQuote) => !requestedExchange || requestedExchange === "REVIEW" || item.exchange === requestedExchange || (requestedExchange === "US" && ["NASDAQ", "NYSE", "AMEX"].includes(String(item.exchange))))
      .slice(0, 8);
  } catch {
    return [];
  }
}

async function openAiInvestmentSearch(supabase: any, userId: string, query: string, exchange?: string | null): Promise<InvestmentQuote[]> {
  if (marketWorkerProcess()) {
    console.log(`[investment-ai] OpenAI market search blocked in market worker for ${query} ${exchange || ""}`);
    return [];
  }
  const guard = isAiFeatureEnabled({ scope: "investment_market_search", requiresWebSearch: true, worker: false });
  if (!guard.allowed) {
    console.log(`[investment-ai] OpenAI market search skipped: ${guard.reason}`);
    return [];
  }

  const secret = await getActiveIntegrationSecret(supabase, userId, "openai");
  if (!secret?.value) return [];
  const model = process.env.LOOP_INVESTMENT_AI_MODEL || process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
      body: JSON.stringify({
        model,
        tools: [{ type: "web_search_preview" }],
        input: `Find likely investment instruments or provider funds matching: "${query}". Exchange if known: "${exchange || "unknown"}". Search globally, not only UK/US. Return JSON array only. Each item: {"rawSymbol":"", "assetName":"", "exchange":"MIC/venue code such as LSE,NASDAQ,NYSE,AMEX,OTCM,PINX,XETR,XFRA,XPAR,XAMS,XMIL,XSWX,XTSE,XSTO,XCSE,XHEL,XOSL,XHKG,XTKS,XASX or Provider", "assetType":"share|etf|fund|crypto|other", "price":0, "price_quote_unit":"gbx|gbp|usd|eur|chf|cad|aud|jpy|hkd", "currency":"GBP|GBX|USD|EUR|CHF|CAD|AUD|JPY|HKD", "isin":null, "annualAssetFeePercent":0, "sourceUrl":null, "note":"", "confidence":0}. Known venue codes in LOOP include ${knownVenueCodes().join(", ")}. For LSE shares/ETFs use GBX/pence; for XETR/XFRA/XPAR/XAMS/XMIL use EUR; for OTCM/PINX/NASDAQ/NYSE use USD. Do not force European listings into LSE/GBX. For provider funds/OEICs such as Vanguard LifeStrategy or funds identified by an ISIN, do not return LSE unless genuinely exchange-traded; return exchange VANGUARD/Provider, price_quote_unit gbp for GBP NAV, and fee/OCF where found; price can be 0 if not reliably available.`,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    await recordOpenAiUsageFromPayload(supabase, payload, {
      model,
      scope: "investment_market_search",
      component: "investment_quote_lookup",
      userId,
      usedWebSearch: true,
      metadata: { query, exchange, ok: response.ok, status: response.status },
    });
    if (!response.ok) return [];
    const text = String(payload.output_text || payload.output?.flatMap?.((item: { content?: { text?: string }[] }) => item.content?.map((c) => c.text) || []).join("\n") || "");
    const parsed = safeJsonFromText(text);
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    return rows.slice(0, 8).map((row: any) => {
      const unit = String(row.price_quote_unit || "").toLowerCase();
      const rawPrice = Number(row.price || 0);
      return {
        price: rawPrice,
        source: "OpenAI investment search",
        rawSymbol: String(row.rawSymbol || row.ticker || query),
        assetName: String(row.assetName || row.name || query),
        exchange: normaliseExchangeCode(row.exchange || exchange) || "Review",
        currency: String(row.currency || (unit === "gbx" ? "GBP" : "USD")),
        priceQuoteUnit: unit === "gbx" ? "gbx" : unit === "usd" ? "usd" : unit === "eur" ? "eur" : (String(row.currency || "").toUpperCase() === "USD" ? "usd" : "gbp"),
        sourceUrl: row.sourceUrl || null,
        note: String(row.note || "AI-suggested match. Check the exact instrument/fund before saving."),
        assetType: ["share", "etf", "fund", "crypto", "other"].includes(String(row.assetType)) ? row.assetType : "other",
        isin: row.isin || null,
        annualAssetFeePercent: row.annualAssetFeePercent === null || row.annualAssetFeePercent === undefined ? null : Number(row.annualAssetFeePercent),
        confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : undefined,
        logoDomain: row.logoDomain || row.logo_domain || null,
      } satisfies InvestmentQuote;
    });
  } catch {
    return [];
  }
}

export async function fetchInvestmentQuote(supabase: any, userId: string, tickerOrQuery: string, exchange?: string | null): Promise<InvestmentQuote | null> {
  const query = tickerOrQuery.trim();
  if (!query) return null;

  // --- ISIN-FIRST INTERCEPTION ---
  // If the query is an ISIN or passes an exchange like "MONEYBOX FUND", resolve to real Yahoo symbol
  const resolution = resolveHoldingMarketSymbol({
    ticker: query,
    exchange: exchange,
    isin: /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(query) ? query : undefined,
  });

  // If we found a mapped live Yahoo code (e.g., 0P000125KV.L for GB00BJS8SJ34), use it instead!
  const effectiveQuery = resolution.quoteSymbol && resolution.provider === "yahoo"
    ? resolution.quoteSymbol
    : query;
  // -------------------------------

  const requestedExchange = normaliseExchangeCode(exchange);
  const wantsExchangeTraded = Boolean(requestedExchange && !["VANGUARD", "YAHOO FUND", "FUND", "PROVIDER", "REVIEW"].includes(requestedExchange));
  const glossary = candidateInvestments(effectiveQuery).find((item) => !(wantsExchangeTraded && item.assetType === "fund")) || candidateInvestments(effectiveQuery)[0];
  // BUGFIX (investment pricing audit): when the caller already told us this is a
  // known exchange-traded instrument (wantsExchangeTraded), we already have a
  // real, reliable ticker in `effectiveQuery` — never let a fuzzy glossary
  // match silently replace it with a different symbol. The glossary is only
  // safe to use as the *fetch* symbol for genuine free-text lookups where we
  // don't already have a trustworthy ticker. It's still used below for
  // supplementary metadata (asset name, fee %, source URL) either way.
  const symbol = wantsExchangeTraded ? effectiveQuery : glossary?.rawSymbol || effectiveQuery;
  const providerFund = wantsExchangeTraded ? null : await providerFundQuoteFromSource(glossary);
  if (providerFund) return providerFund;

  // BUGFIX (market data audit): Alpaca credentials were configured (as
  // Render env vars) but never actually referenced anywhere in the
  // quote-fetching chain — US tickers were silently going through the same
  // Yahoo/Stooq path as everything else. Alpaca only covers US equities, so
  // it's only attempted for US-listed venues; everything else is unchanged.
  if (wantsExchangeTraded && isUsExchange(exchange || glossary?.exchange)) {
    for (const candidate of providerSymbols(symbol, exchange || glossary?.exchange)) {
      const alpaca = await alpacaQuote(candidate, exchange || glossary?.exchange);
      if (alpaca) return { ...glossary, ...alpaca };
    }
  }

  // User-managed fallbacks require a database secret lookup. Keep that lookup
  // behind the shared provider/fund and Alpaca paths so the normal minute loop
  // does not generate one Supabase read per user before every ticker quote.
  const secret = await getActiveIntegrationSecret(supabase, userId, ["alpha_vantage", "financial_modeling_prep", "fmp"]);

  if (secret?.value && secret.provider === "alpha_vantage") {
    for (const candidate of providerSymbols(symbol, exchange || glossary?.exchange)) {
      try {
        const response = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(candidate)}&apikey=${encodeURIComponent(secret.value)}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        const q = data["Global Quote"] || {};
        const rawPrice = Number(q["05. price"] || 0);
        if (rawPrice > 0) {
          const ex = exchangeFromSymbol(candidate, exchange || glossary?.exchange);
          const normalised = normaliseMarketPrice(rawPrice, ex, candidate);
          return { ...glossary, price: normalised.price, source: "Alpha Vantage", rawSymbol: q["01. symbol"] || candidate, assetName: glossary?.assetName || assetNameFor(effectiveQuery, candidate), exchange: ex, currency: normalised.currency, priceQuoteUnit: normalised.priceQuoteUnit };
        }
      } catch {}
    }
  }

  if (secret?.value) {
    for (const candidate of providerSymbols(symbol, exchange || glossary?.exchange)) {
      try {
        const response = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(candidate)}&apikey=${encodeURIComponent(secret.value)}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        const first = Array.isArray(data) ? data[0] : data?.[0] || data;
        const rawPrice = Number(first?.price || 0);
        if (rawPrice > 0) {
          const ex = exchangeFromSymbol(candidate, exchange || glossary?.exchange);
          const normalised = normaliseMarketPrice(rawPrice, ex, candidate);
          return { ...glossary, price: normalised.price, source: "Financial Modeling Prep", rawSymbol: first?.symbol || candidate, assetName: first?.name || glossary?.assetName || assetNameFor(effectiveQuery, candidate), exchange: ex, currency: normalised.currency, priceQuoteUnit: normalised.priceQuoteUnit };
        }
      } catch {}
    }
  }

  const yahoo = await yahooQuote(symbol, exchange || glossary?.exchange);
  if (yahoo) return yahoo;
  const stooq = await stooqQuote(symbol, exchange || glossary?.exchange);
  if (stooq) return stooq;
  return glossary || null;
}

export async function searchInvestments(supabase: any, userId: string, query: string, exchange?: string | null) {
  const quote = await fetchInvestmentQuote(supabase, userId, query, exchange);
  const local = candidateInvestments(query);
  const yahooSearch = await yahooSearchCandidates(query, exchange);
  const ai = envBool("LOOP_ENABLE_AI_MARKET_SEARCH", false) && envBool("LOOP_ENABLE_WEB_SEARCH_MARKET_LOOKUP", false)
    ? await openAiInvestmentSearch(supabase, userId, query, exchange)
    : [];
  const merged = [quote, ...local, ...yahooSearch, ...ai].filter(Boolean) as InvestmentQuote[];
  const seen = new Set<string>();
  return merged.filter((item) => {
    const key = `${item.rawSymbol}|${item.assetName}|${item.exchange}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

export function isRoughMarketOpen(exchange?: string | null, now = new Date(), symbol?: string | null) {
  return isMarketOpenForVenue(exchange, now, symbol);
}
