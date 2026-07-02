import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";

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

function normaliseExchangeCode(exchange?: string | null) {
  const ex = String(exchange || "").trim().toUpperCase();
  if (["XNAS", "XNCM", "XNGS", "NMS", "NGM", "NAS", "NASDAQGS", "NASDAQ"].includes(ex)) return "NASDAQ";
  if (["XNYS", "NYQ", "NYSE"].includes(ex)) return "NYSE";
  if (["XASE", "ASE", "AMEX", "NYSEAMERICAN"].includes(ex)) return "AMEX";
  if (["LON", "XLON", "XLSE", "LSE"].includes(ex)) return "LSE";
  return ex;
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
  const t = cleanTicker(ticker);
  const ex = normaliseExchangeCode(exchange);
  if (!t) return [];
  if (t.includes(".") && !t.includes(" ")) return [t];
  if (ex === "LSE") return [`${t}.L`, t];
  if (["NASDAQ", "NYSE", "AMEX", "US"].includes(ex)) return [t];
  const common = COMMON_INVESTMENTS[t];
  if (common?.exchange === "LSE") return [`${t}.L`, t];
  if (common?.exchange && common.exchange !== "LSE") return [t, `${t}.L`];
  return [t, `${t}.L`];
}

function yahooSymbols(ticker: string, exchange?: string | null) {
  const clean = cleanTicker(ticker);
  if (isYahooFundCode(clean)) return [clean];
  const t = clean.replace(/\.L$/i, "");
  const ex = normaliseExchangeCode(exchange);
  if (!t || t.includes(" ")) return [];
  if (ex === "LSE" || ticker.toUpperCase().endsWith(".L")) return [`${t}.L`];
  if (["NASDAQ", "NYSE", "AMEX", "US"].includes(ex)) return [t];
  const common = COMMON_INVESTMENTS[t];
  if (common?.exchange === "LSE") return [`${t}.L`, t];
  if (common?.exchange && common.exchange !== "LSE") return [t, `${t}.L`];
  return [t, `${t}.L`];
}

function stooqSymbols(ticker: string, exchange?: string | null) {
  const t = cleanTicker(ticker).toLowerCase().replace(/\.l$/i, "");
  const ex = normaliseExchangeCode(exchange);
  if (!t || t.includes(" ")) return [];
  if (ex === "LSE" || ticker.toUpperCase().endsWith(".L")) return [`${t}.uk`];
  if (["NASDAQ", "NYSE", "AMEX", "US"].includes(ex)) return [`${t}.us`, t];
  const common = COMMON_INVESTMENTS[t.toUpperCase()];
  if (common?.exchange === "LSE") return [`${t}.uk`, `${t}.us`, t];
  if (common?.exchange && common.exchange !== "LSE") return [`${t}.us`, t, `${t}.uk`];
  return [`${t}.us`, t, `${t}.uk`];
}

export function exchangeFromSymbol(symbol: string, exchange?: string | null) {
  const ex = normaliseExchangeCode(exchange);
  if (isYahooFundCode(symbol)) return "Yahoo Fund";
  if (ex) return ex;
  if (symbol.toUpperCase().endsWith(".L") || symbol.toLowerCase().endsWith(".uk")) return "LSE";
  if (symbol.toLowerCase().endsWith(".us")) return "US";
  return "";
}

export function normaliseMarketPrice(rawPrice: number, exchange?: string | null, symbol?: string | null) {
  if (symbol && isYahooFundCode(symbol)) return { price: rawPrice, priceQuoteUnit: "gbp", currency: "GBP" };
  const isUk = normaliseExchangeCode(exchange) === "LSE" || String(symbol || "").toUpperCase().endsWith(".L") || String(symbol || "").toLowerCase().endsWith(".uk");
  if (isUk) return { price: rawPrice, priceQuoteUnit: "gbx", currency: "GBX" };
  return { price: rawPrice, priceQuoteUnit: "usd", currency: "USD" };
}

function assetNameFor(ticker: string, symbol: string) {
  const base = cleanTicker(ticker).replace(/\.L$/i, "");
  return COMMON_INVESTMENTS[base]?.assetName || base || symbol;
}

async function yahooQuote(ticker: string, exchange?: string | null): Promise<InvestmentQuote | null> {
  for (const symbol of yahooSymbols(ticker, exchange)) {
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
      const data = await response.json().catch(() => ({}));
      const result = data?.chart?.result?.[0];
      const meta = result?.meta || {};
      const rawPrice = Number(meta.regularMarketPrice || meta.previousClose || 0);
      if (!Number.isFinite(rawPrice) || rawPrice <= 0) continue;
      const ex = exchangeFromSymbol(symbol, exchange);
      const normalised = normaliseMarketPrice(rawPrice, ex, symbol);
      const common = COMMON_INVESTMENTS[cleanTicker(ticker).replace(/\.L$/i, "")];
      const yahooFund = isYahooFundCode(symbol);
      return { price: normalised.price, source: "Yahoo delayed/EOD", rawSymbol: symbol, assetName: meta.longName || meta.shortName || common?.assetName || assetNameFor(ticker, symbol), exchange: yahooFund ? "Yahoo Fund" : common?.exchange || ex || meta.exchangeName || "", currency: normalised.currency, priceQuoteUnit: normalised.priceQuoteUnit, assetType: yahooFund ? "fund" : common?.assetType || "share", annualAssetFeePercent: common?.annualAssetFeePercent ?? 0, sourceUrl: common?.sourceUrl || `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`, note: yahooFund ? "Yahoo Finance mutual-fund code. Price normally represents the fund/unit quote, not a stock-exchange pence quote." : "Delayed/end-of-day quote fallback. Confirm exchange/currency before relying on it." };
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
  const exchange = String(item?.exchange || item?.exchDisp || "").toUpperCase();
  if (symbol.endsWith(".L") || exchange === "LSE" || exchange.includes("LONDON")) return "LSE";
  if (["NMS", "NGM", "NASDAQ"].includes(exchange) || exchange.includes("NASDAQ")) return "NASDAQ";
  if (exchange.includes("NYSE") || exchange === "NYQ") return "NYSE";
  if (exchange.includes("AMEX") || exchange === "ASE") return "AMEX";
  return exchange || "Review";
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
  const secret = await getActiveIntegrationSecret(supabase, userId, "openai");
  if (!secret?.value) return [];
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
      body: JSON.stringify({
        model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
        tools: [{ type: "web_search_preview" }],
        input: `Find likely investment instruments or provider funds matching: "${query}". Exchange if known: "${exchange || "unknown"}". Return JSON array only. Each item: {"rawSymbol":"", "assetName":"", "exchange":"LSE|NASDAQ|NYSE|Vanguard|Other", "assetType":"share|etf|fund|crypto|other", "price":0, "price_quote_unit":"gbx|gbp|usd|eur", "currency":"GBP|USD|EUR", "isin":null, "annualAssetFeePercent":0, "sourceUrl":null, "note":"", "confidence":0}. For UK/LSE quoted shares/ETFs use GBX and pence if returning a display price; mark true exchange-traded funds as assetType etf, not share. For provider funds/OEICs such as Vanguard LifeStrategy or funds identified by an ISIN, do not return LSE unless it is genuinely exchange-traded; return exchange Vanguard/Provider, price_quote_unit gbp for GBP NAV, and fee/OCF where found; price can be 0 if not reliably available.`,
      }),
    });
    const payload = await response.json().catch(() => ({}));
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
  const requestedExchange = normaliseExchangeCode(exchange);
  const wantsExchangeTraded = Boolean(requestedExchange && ["LSE", "NASDAQ", "NYSE", "AMEX", "US"].includes(requestedExchange));
  const glossary = candidateInvestments(query).find((item) => !(wantsExchangeTraded && item.assetType === "fund")) || candidateInvestments(query)[0];
  const symbol = glossary?.rawSymbol || query;
  const secret = await getActiveIntegrationSecret(supabase, userId, ["alpha_vantage", "financial_modeling_prep", "fmp"]);

  const providerFund = wantsExchangeTraded ? null : await providerFundQuoteFromSource(glossary);
  if (providerFund) return providerFund;

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
          return { ...glossary, price: normalised.price, source: "Alpha Vantage", rawSymbol: q["01. symbol"] || candidate, assetName: glossary?.assetName || assetNameFor(query, candidate), exchange: ex, currency: normalised.currency, priceQuoteUnit: normalised.priceQuoteUnit };
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
          return { ...glossary, price: normalised.price, source: "Financial Modeling Prep", rawSymbol: first?.symbol || candidate, assetName: first?.name || glossary?.assetName || assetNameFor(query, candidate), exchange: ex, currency: normalised.currency, priceQuoteUnit: normalised.priceQuoteUnit };
        }
      } catch {}
    }
  }

  const yahoo = await yahooQuote(symbol, exchange || glossary?.exchange);
  if (yahoo) return yahoo;
  const stooq = await stooqQuote(symbol, exchange || glossary?.exchange);
  if (stooq) return stooq;
  return glossary || (await openAiInvestmentSearch(supabase, userId, query, exchange))[0] || null;
}

export async function searchInvestments(supabase: any, userId: string, query: string, exchange?: string | null) {
  const quote = await fetchInvestmentQuote(supabase, userId, query, exchange);
  const local = candidateInvestments(query);
  const yahooSearch = await yahooSearchCandidates(query, exchange);
  const ai = quote && quote.source !== "OpenAI investment search" ? [] : await openAiInvestmentSearch(supabase, userId, query, exchange);
  const merged = [quote, ...local, ...yahooSearch, ...ai].filter(Boolean) as InvestmentQuote[];
  const seen = new Set<string>();
  return merged.filter((item) => {
    const key = `${item.rawSymbol}|${item.assetName}|${item.exchange}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

export function isRoughMarketOpen(exchange?: string | null, now = new Date()) {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const ex = normaliseExchangeCode(exchange);
  if (ex === "LSE") return minutes >= 8 * 60 && minutes <= 16 * 60 + 45;
  if (["NASDAQ", "NYSE", "AMEX", "US"].includes(ex)) return minutes >= 14 * 60 + 20 && minutes <= 21 * 60 + 10;
  // Unknown/global holdings are allowed only during a broad weekday window.
  return minutes >= 8 * 60 && minutes <= 21 * 60 + 10;
}
