import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { isAiFeatureEnabled, recordOpenAiUsageFromPayload } from "@/lib/ai/usage";
import { currencyForVenue, isMarketOpenForVenue, knownVenueCodes, marketSessionForVenue, normaliseVenueCode, quoteUnitForVenue, yahooProviderSymbols, stooqProviderSymbols } from "@/lib/investments/market-venues";
import { fetchWithTimeout, runTiered } from "@/lib/investments/http";

// Per-quote overall budget: the sum of every provider tier we try for a single
// ticker is capped at this, regardless of how many tiers are configured. This
// keeps one hard-to-price holding from eating a large slice of a worker run.
const QUOTE_RESOLUTION_BUDGET_MS = Math.max(
  4000,
  Number.parseInt(process.env.MARKET_DATA_QUOTE_BUDGET_MS || "", 10) || 12000,
);

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
      const haystack = normaliseInvestmentSearch(`${key} ${item.symbol} ${item.isin || ""} ${item.assetName} ${(item.aliases || []).join(" ")}`);
      return key === clean || item.symbol.toUpperCase() === clean || haystack.includes(q) || q.split(/\s+/).filter(Boolean).some((term) => term.length > 1 && haystack.includes(term));
    })
    .map(([key, item]) => ({
      price: 0,
      source: "Built-in investment glossary",
      rawSymbol: item.symbol || key,
      assetName: item.assetName,
      exchange: item.exchange,
      currency: item.exchange === "LSE" || item.exchange === "Vanguard" ? "GBP" : "USD",
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
  return Array.from(new Set([...fromYahoo, ...fromStooq, cleanTicker(ticker)]));
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

async function yahooQuote(ticker: string, exchange?: string | null): Promise<InvestmentQuote | null> {
  for (const symbol of yahooSymbols(ticker, exchange)) {
    try {
      const response = await fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
      const data = await response.json().catch(() => ({}));
      const result = data?.chart?.result?.[0];
      const meta = result?.meta || {};
      const ex = exchangeFromSymbol(symbol, exchange);
      const session = marketSessionForVenue(ex, new Date(), symbol);
      const preMarketPrice = Number(meta.preMarketPrice || 0);
      const postMarketPrice = Number(meta.postMarketPrice || 0);
      const regularMarketPrice = Number(meta.regularMarketPrice || 0);
      const previousClose = Number(meta.previousClose || meta.chartPreviousClose || 0);
      let rawPrice = regularMarketPrice || previousClose || 0;
      let sourceLabel = "Yahoo delayed/EOD";
      if (session.session === "pre" && Number.isFinite(preMarketPrice) && preMarketPrice > 0) {
        rawPrice = preMarketPrice;
        sourceLabel = "Yahoo pre-market delayed";
      } else if (session.session === "after" && Number.isFinite(postMarketPrice) && postMarketPrice > 0) {
        rawPrice = postMarketPrice;
        sourceLabel = "Yahoo post-market delayed";
      } else if (session.session === "closed" && Number.isFinite(regularMarketPrice) && regularMarketPrice > 0) {
        sourceLabel = "Yahoo regular close/delayed";
      }
      if (!Number.isFinite(rawPrice) || rawPrice <= 0) continue;
      const normalised = normaliseMarketPrice(rawPrice, ex, symbol);
      const common = COMMON_INVESTMENTS[cleanTicker(ticker).replace(/\.L$/i, "")];
      const yahooFund = isYahooFundCode(symbol);
      const sessionNote = session.isExtended ? `Using ${session.label} price; regular close remains separate for daily movement.` : session.session === "closed" ? "Market is closed; using latest regular/close quote from provider." : "Live/delayed quote from active regular session where available.";
      return { price: normalised.price, source: sourceLabel, rawSymbol: symbol, assetName: meta.longName || meta.shortName || common?.assetName || assetNameFor(ticker, symbol), exchange: yahooFund ? "Yahoo Fund" : common?.exchange || ex || meta.exchangeName || "", currency: normalised.currency, priceQuoteUnit: normalised.priceQuoteUnit, assetType: yahooFund ? "fund" : common?.assetType || "share", annualAssetFeePercent: common?.annualAssetFeePercent ?? 0, sourceUrl: common?.sourceUrl || `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`, note: yahooFund ? "Yahoo Finance mutual-fund code. Price normally represents the fund/unit quote, not a stock-exchange pence quote." : sessionNote };
    } catch {}
  }
  return null;
}

// Finnhub: free tier is ~60 calls/min per key (vs Alpha Vantage's ~5/min), so it
// sits ahead of Alpha Vantage in the tier order below when a user has a key.
// Symbol format overlaps with Yahoo's exchange-suffix convention for most of the
// venues this app already supports (.L, .DE, .PA, etc.), so we reuse yahooSymbols()
// for candidates. Venues without a matching Finnhub listing will simply fall
// through to the next tier.
// Alpaca: covers only US-listed equities/ETFs, but the free "Basic" plan gives
// genuinely real-time trades from the IEX feed (not delayed like Yahoo/Stooq),
// with a far higher and more predictable rate limit than the other free
// providers here, and it's an officially supported/documented endpoint rather
// than scraping an unofficial page (which is why Yahoo intermittently breaks
// or rate-limits). For US tickers this should usually resolve before we ever
// need Yahoo/Stooq at all.
const ALPACA_US_VENUES = new Set(["NASDAQ", "NYSE", "AMEX", "ARCX", "BATS"]);

async function alpacaQuote(supabase: any, userId: string, ticker: string, exchange?: string | null): Promise<InvestmentQuote | null> {
  const ex = normaliseExchangeCode(exchange, ticker);
  if (ex && !ALPACA_US_VENUES.has(ex)) return null; // Alpaca only covers US-listed securities.

  const [keyId, secretKey] = await Promise.all([
    getActiveIntegrationSecret(supabase, userId, "alpaca_key_id"),
    getActiveIntegrationSecret(supabase, userId, "alpaca_secret_key"),
  ]);
  if (!keyId?.value || !secretKey?.value) return null;

  const symbol = cleanTicker(ticker).replace(/\.L$/i, "").replace(/\.[A-Z]+$/i, "");
  if (!symbol || !ex) return null; // don't guess a US venue for an ambiguous/unknown exchange

  try {
    const response = await fetchWithTimeout(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/trades/latest`, {
      cache: "no-store",
      headers: {
        "APCA-API-KEY-ID": keyId.value,
        "APCA-API-SECRET-KEY": secretKey.value,
      },
    });
    if (!response.ok) return null; // e.g. 403/422 for a symbol Alpaca doesn't carry
    const data = await response.json().catch(() => ({}));
    const rawPrice = Number(data?.trade?.p || 0);
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) return null;
    const normalised = normaliseMarketPrice(rawPrice, ex, symbol);
    const common = COMMON_INVESTMENTS[symbol];
    return {
      price: normalised.price,
      source: "Alpaca (IEX free feed)",
      rawSymbol: symbol,
      assetName: common?.assetName || assetNameFor(ticker, symbol),
      exchange: common?.exchange || ex,
      currency: normalised.currency,
      priceQuoteUnit: normalised.priceQuoteUnit,
      assetType: common?.assetType || "share",
      annualAssetFeePercent: common?.annualAssetFeePercent ?? 0,
      sourceUrl: common?.sourceUrl || `https://alpaca.markets/`,
      note: "Real-time last trade from Alpaca's free IEX feed (single-exchange volume, not full consolidated tape - fine for portfolio tracking).",
    };
  } catch {
    return null;
  }
}

async function finnhubQuote(supabase: any, userId: string, ticker: string, exchange?: string | null): Promise<InvestmentQuote | null> {
  const secret = await getActiveIntegrationSecret(supabase, userId, "finnhub");
  if (!secret?.value) return null;
  for (const symbol of yahooSymbols(ticker, exchange)) {
    try {
      const response = await fetchWithTimeout(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(secret.value)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      const rawPrice = Number(data?.c || 0);
      if (!Number.isFinite(rawPrice) || rawPrice <= 0) continue;
      const ex = exchangeFromSymbol(symbol, exchange);
      const normalised = normaliseMarketPrice(rawPrice, ex, symbol);
      const common = COMMON_INVESTMENTS[cleanTicker(ticker).replace(/\.L$/i, "")];
      return { price: normalised.price, source: "Finnhub", rawSymbol: symbol, assetName: common?.assetName || assetNameFor(ticker, symbol), exchange: common?.exchange || ex, currency: normalised.currency, priceQuoteUnit: normalised.priceQuoteUnit, assetType: common?.assetType || "share", annualAssetFeePercent: common?.annualAssetFeePercent ?? 0, sourceUrl: common?.sourceUrl || `https://finnhub.io/quote/${encodeURIComponent(symbol)}`, note: "Real-time/near-real-time quote from Finnhub." };
    } catch {
      continue;
    }
  }
  return null;
}

// Twelve Data: 800 calls/day free per key, widest exchange coverage of the free
// tiers (50+ venues), so it's a good fallback once Finnhub/Alpha Vantage are
// exhausted or don't cover a given international listing.
async function twelveDataQuote(supabase: any, userId: string, ticker: string, exchange?: string | null): Promise<InvestmentQuote | null> {
  const secret = await getActiveIntegrationSecret(supabase, userId, "twelve_data");
  if (!secret?.value) return null;
  const clean = cleanTicker(ticker).replace(/\.L$/i, "").replace(/\.[A-Z]+$/i, "");
  try {
    const response = await fetchWithTimeout(`https://api.twelvedata.com/price?symbol=${encodeURIComponent(clean)}&apikey=${encodeURIComponent(secret.value)}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    const rawPrice = Number(data?.price || 0);
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) return null;
    const ex = exchangeFromSymbol(clean, exchange);
    const normalised = normaliseMarketPrice(rawPrice, ex, clean);
    const common = COMMON_INVESTMENTS[clean];
    return { price: normalised.price, source: "Twelve Data", rawSymbol: clean, assetName: common?.assetName || assetNameFor(ticker, clean), exchange: common?.exchange || ex, currency: normalised.currency, priceQuoteUnit: normalised.priceQuoteUnit, assetType: common?.assetType || "share", annualAssetFeePercent: common?.annualAssetFeePercent ?? 0, sourceUrl: common?.sourceUrl || null, note: "Quote from Twelve Data (up to 4-hour delay on the free tier)." };
  } catch {
    return null;
  }
}

async function stooqQuote(ticker: string, exchange?: string | null): Promise<InvestmentQuote | null> {
  for (const symbol of stooqSymbols(ticker, exchange)) {
    try {
      const response = await fetchWithTimeout(`https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`, { cache: "no-store" });
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
  // The Vanguard LifeStrategy 80 accumulation NAV is a GBP OEIC unit price, not an LSE penny share quote.
  // Reject tiny extracted values such as 143.48p / £1.4348 from unrelated tables or bad market matches.
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
      const response = await fetchWithTimeout(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
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
    const response = await fetchWithTimeout(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
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
  // v28.36: OpenAI/web-search is never allowed from the Render market worker.
  // Unknown instruments should become admin coverage tasks, not paid web-search calls.
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

async function alphaVantageQuote(secretValue: string, symbolCandidates: string[], exchange: string | null | undefined, glossary: InvestmentQuote | undefined, query: string): Promise<InvestmentQuote | null> {
  for (const candidate of symbolCandidates) {
    try {
      const response = await fetchWithTimeout(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(candidate)}&apikey=${encodeURIComponent(secretValue)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      const q = data["Global Quote"] || {};
      const rawPrice = Number(q["05. price"] || 0);
      if (rawPrice > 0) {
        const ex = exchangeFromSymbol(candidate, exchange);
        const normalised = normaliseMarketPrice(rawPrice, ex, candidate);
        return { ...glossary, price: normalised.price, source: "Alpha Vantage", rawSymbol: q["01. symbol"] || candidate, assetName: glossary?.assetName || assetNameFor(query, candidate), exchange: ex, currency: normalised.currency, priceQuoteUnit: normalised.priceQuoteUnit };
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function fmpQuote(secretValue: string, symbolCandidates: string[], exchange: string | null | undefined, glossary: InvestmentQuote | undefined, query: string): Promise<InvestmentQuote | null> {
  for (const candidate of symbolCandidates) {
    try {
      const response = await fetchWithTimeout(`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(candidate)}&apikey=${encodeURIComponent(secretValue)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      const first = Array.isArray(data) ? data[0] : data?.[0] || data;
      const rawPrice = Number(first?.price || 0);
      if (rawPrice > 0) {
        const ex = exchangeFromSymbol(candidate, exchange);
        const normalised = normaliseMarketPrice(rawPrice, ex, candidate);
        return { ...glossary, price: normalised.price, source: "Financial Modeling Prep", rawSymbol: first?.symbol || candidate, assetName: first?.name || glossary?.assetName || assetNameFor(query, candidate), exchange: ex, currency: normalised.currency, priceQuoteUnit: normalised.priceQuoteUnit };
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Tiered quote resolution.
 *
 * Order (fastest/most-reliable-per-key first, no-key-required fallbacks last):
 *   1. Provider fund page   - only for provider funds/OEICs (Vanguard etc.), not exchange-traded
 *   2. Alpaca               - US-listed only; genuinely real-time (IEX feed), generous limits, official API
 *   3. Finnhub              - ~60 calls/min free tier, best free real-time-ish coverage for non-US venues
 *   4. Alpha Vantage        - reliable but tight ~5 calls/min free tier
 *   5. Twelve Data          - 800 calls/day free, widest free exchange coverage
 *   6. Financial Modeling Prep
 *   7. Yahoo Finance        - no key required, unofficial/can rate-limit or break
 *   8. Stooq                - no key required, delayed EOD-ish data, last resort
 *
 * Every tier is wrapped in a timeout (via fetchWithTimeout) and the whole chain
 * is capped by QUOTE_RESOLUTION_BUDGET_MS, so a ticker with no good coverage
 * fails fast into `coverage_required` instead of stalling the run.
 */
export async function fetchInvestmentQuote(supabase: any, userId: string, tickerOrQuery: string, exchange?: string | null): Promise<InvestmentQuote | null> {
  const query = tickerOrQuery.trim();
  if (!query) return null;
  const requestedExchange = normaliseExchangeCode(exchange);
  const wantsExchangeTraded = Boolean(requestedExchange && !["VANGUARD", "YAHOO FUND", "FUND", "PROVIDER", "REVIEW"].includes(requestedExchange));
  const glossary = candidateInvestments(query).find((item) => !(wantsExchangeTraded && item.assetType === "fund")) || candidateInvestments(query)[0];
  const symbol = glossary?.rawSymbol || query;
  const symbolCandidates = providerSymbols(symbol, exchange || glossary?.exchange);

  const [avSecret, fmpSecret] = await Promise.all([
    getActiveIntegrationSecret(supabase, userId, "alpha_vantage"),
    getActiveIntegrationSecret(supabase, userId, ["financial_modeling_prep", "fmp"]),
  ]);

  const { result } = await runTiered<InvestmentQuote>(
    [
      { name: "provider_fund_page", run: () => (wantsExchangeTraded ? Promise.resolve(null) : providerFundQuoteFromSource(glossary)) },
      { name: "alpaca", run: () => alpacaQuote(supabase, userId, symbol, exchange || glossary?.exchange) },
      { name: "finnhub", run: () => finnhubQuote(supabase, userId, symbol, exchange || glossary?.exchange) },
      { name: "alpha_vantage", run: () => (avSecret?.value ? alphaVantageQuote(avSecret.value, symbolCandidates, exchange || glossary?.exchange, glossary, query) : Promise.resolve(null)) },
      { name: "twelve_data", run: () => twelveDataQuote(supabase, userId, symbol, exchange || glossary?.exchange) },
      { name: "financial_modeling_prep", run: () => (fmpSecret?.value ? fmpQuote(fmpSecret.value, symbolCandidates, exchange || glossary?.exchange, glossary, query) : Promise.resolve(null)) },
      { name: "yahoo", run: () => yahooQuote(symbol, exchange || glossary?.exchange) },
      { name: "stooq", run: () => stooqQuote(symbol, exchange || glossary?.exchange) },
    ],
    {
      overallBudgetMs: QUOTE_RESOLUTION_BUDGET_MS,
      onTierResult: (name, ok, ms, error) => {
        if (ok) {
          console.log(`[investment-quote] ${symbol} resolved via ${name} in ${ms}ms`);
        } else if (error) {
          console.warn(`[investment-quote] ${symbol} tier ${name} failed after ${ms}ms: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    },
  );

  if (result) return result;
  // No deterministic quote from any tier. The caller marks the holding as
  // coverage_required rather than us silently falling back to AI/web-search
  // (that path is intentionally disabled from the worker - see v28.36 notes).
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
