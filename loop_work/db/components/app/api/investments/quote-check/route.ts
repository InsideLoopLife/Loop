import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";

type Quote = {
  price: number;
  source: string;
  rawSymbol: string;
  assetName?: string;
  exchange?: string;
  currency?: string;
  priceQuoteUnit?: string;
  note?: string;
};

const COMMON_TICKERS: Record<string, { assetName: string; exchange: string; symbol: string; sourceUrl?: string }> = {
  G4M: { assetName: "Gear4music (Holdings) plc", exchange: "LSE", symbol: "G4M.L", sourceUrl: "https://www.londonstockexchange.com/stock/G4M/gear4music-holdings-plc/company-page" },
  VWRP: { assetName: "Vanguard FTSE All-World UCITS ETF", exchange: "LSE", symbol: "VWRP.L" },
  VUAG: { assetName: "Vanguard S&P 500 UCITS ETF", exchange: "LSE", symbol: "VUAG.L" },
  VUSA: { assetName: "Vanguard S&P 500 UCITS ETF", exchange: "LSE", symbol: "VUSA.L" },
};

function cleanTicker(ticker: string) {
  return ticker.trim().toUpperCase().replace(/\s+/g, "");
}

function providerSymbols(ticker: string, exchange?: string | null) {
  const t = cleanTicker(ticker);
  const ex = String(exchange || "").trim().toUpperCase();
  if (!t) return [];
  if (t.includes(".")) return [t];
  if (ex === "LSE") return [`${t}.L`, t];
  if (["NASDAQ", "NYSE", "AMEX", "US"].includes(ex)) return [t];
  // No exchange supplied: try the most likely UK suffix first, then US/plain.
  return [`${t}.L`, t];
}

function stooqSymbols(ticker: string, exchange?: string | null) {
  const t = cleanTicker(ticker).toLowerCase().replace(/\.l$/i, "");
  const ex = String(exchange || "").trim().toUpperCase();
  if (!t) return [];
  if (ex === "LSE" || ticker.toUpperCase().endsWith(".L")) return [`${t}.uk`];
  if (["NASDAQ", "NYSE", "AMEX", "US"].includes(ex)) return [`${t}.us`, t];
  // User should not need to know the exchange. Try UK first for UK-style tickers, then US/plain.
  return [`${t}.uk`, `${t}.us`, t];
}

function exchangeFromSymbol(symbol: string, exchange?: string | null) {
  const ex = String(exchange || "").trim().toUpperCase();
  if (ex) return ex;
  if (symbol.toUpperCase().endsWith(".L") || symbol.toLowerCase().endsWith(".uk")) return "LSE";
  if (symbol.toLowerCase().endsWith(".us")) return "US";
  return "";
}

function normaliseMarketPrice(rawPrice: number, exchange?: string | null, symbol?: string | null) {
  const isUk = String(exchange || "").toUpperCase() === "LSE" || String(symbol || "").toUpperCase().endsWith(".L") || String(symbol || "").toLowerCase().endsWith(".uk");
  if (isUk && rawPrice > 50) return { price: rawPrice / 100, priceQuoteUnit: "gbx", currency: "GBP" };
  return { price: rawPrice, priceQuoteUnit: isUk ? "gbx" : "gbp", currency: isUk ? "GBP" : "USD" };
}

function assetNameFor(ticker: string, symbol: string) {
  const base = cleanTicker(ticker).replace(/\.L$/i, "");
  return COMMON_TICKERS[base]?.assetName || base;
}

async function stooqQuote(ticker: string, exchange?: string | null): Promise<Quote | null> {
  for (const symbol of stooqSymbols(ticker, exchange)) {
    try {
      const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`;
      const response = await fetch(url, { cache: "no-store" });
      const csv = await response.text();
      const lines = csv.trim().split(/\r?\n/);
      const values = lines[1]?.split(",") || [];
      if (!values.length || /N\/D/i.test(values.join(""))) continue;
      const close = Number(values[6] || values[3] || 0);
      if (!Number.isFinite(close) || close <= 0) continue;
      const ex = exchangeFromSymbol(symbol, exchange);
      const normalised = normaliseMarketPrice(close, ex, symbol);
      const common = COMMON_TICKERS[cleanTicker(ticker).replace(/\.L$/i, "")];
      return {
        price: normalised.price,
        source: "Stooq delayed/EOD",
        rawSymbol: symbol,
        assetName: common?.assetName || assetNameFor(ticker, symbol),
        exchange: common?.exchange || ex,
        currency: normalised.currency,
        priceQuoteUnit: normalised.priceQuoteUnit,
        note: "Delayed/end-of-day quote fallback. Confirm before relying on it for trading decisions.",
      };
    } catch {
      // try next symbol
    }
  }
  return null;
}

function fallbackMatches(ticker: string, exchange?: string | null, quote?: Quote | null) {
  const base = cleanTicker(ticker).replace(/\.L$/i, "");
  const common = COMMON_TICKERS[base];
  const primary = quote || (common ? {
    price: 0,
    source: "Ticker glossary",
    rawSymbol: common.symbol,
    assetName: common.assetName,
    exchange: common.exchange,
    currency: common.exchange === "LSE" ? "GBP" : "USD",
    priceQuoteUnit: common.exchange === "LSE" ? "gbx" : "usd",
    note: "Ticker identified from built-in glossary. Price still needs a market-data result or manual entry.",
  } : null);
  const items = [] as Quote[];
  if (primary) items.push(primary);
  if (!common && base) {
    items.push({
      price: 0,
      source: "Manual review",
      rawSymbol: exchange?.toUpperCase() === "LSE" ? `${base}.L` : base,
      assetName: base,
      exchange: exchange?.toUpperCase() || "Review",
      currency: exchange?.toUpperCase() === "LSE" ? "GBP" : "USD",
      priceQuoteUnit: exchange?.toUpperCase() === "LSE" ? "gbx" : "gbp",
      note: "No quote match found. Select this to continue manually, or add a market-data token for better matching.",
    });
  }
  return items;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ticker = cleanTicker(String(body.ticker || ""));
  const exchange = String(body.exchange || "").trim().toUpperCase();
  if (!ticker) return NextResponse.json({ error: "Ticker is required" }, { status: 400 });

  const secret = await getActiveIntegrationSecret(supabase, user.id, ["alpha_vantage", "financial_modeling_prep", "fmp"]);

  try {
    if (secret?.value && secret.provider === "alpha_vantage") {
      for (const symbol of providerSymbols(ticker, exchange)) {
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(secret.value)}`;
        const response = await fetch(url, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        const q = data["Global Quote"] || {};
        const rawPrice = Number(q["05. price"] || 0);
        if (rawPrice > 0) {
          const ex = exchangeFromSymbol(symbol, exchange);
          const normalised = normaliseMarketPrice(rawPrice, ex, symbol);
          const quote = { price: normalised.price, source: "Alpha Vantage", rawSymbol: q["01. symbol"] || symbol, assetName: assetNameFor(ticker, symbol), exchange: ex, currency: normalised.currency, priceQuoteUnit: normalised.priceQuoteUnit };
          return NextResponse.json({ ticker, quote, matches: fallbackMatches(ticker, exchange, quote), note: "Quote found. Check currency/exchange before saving." });
        }
      }
    }

    if (secret?.value) {
      for (const symbol of providerSymbols(ticker, exchange)) {
        const url = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(secret.value)}`;
        const response = await fetch(url, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        const first = Array.isArray(data) ? data[0] : data?.[0] || data;
        const rawPrice = Number(first?.price || 0);
        if (rawPrice > 0) {
          const ex = exchangeFromSymbol(symbol, exchange);
          const normalised = normaliseMarketPrice(rawPrice, ex, symbol);
          const quote = { price: normalised.price, source: "Financial Modeling Prep", rawSymbol: first?.symbol || symbol, assetName: first?.name || assetNameFor(ticker, symbol), exchange: ex, currency: normalised.currency, priceQuoteUnit: normalised.priceQuoteUnit };
          return NextResponse.json({ ticker, quote, matches: fallbackMatches(ticker, exchange, quote), note: "Quote found. Check currency/exchange before saving." });
        }
      }
    }

    const fallback = await stooqQuote(ticker, exchange);
    if (fallback) return NextResponse.json({ ticker, quote: fallback, matches: fallbackMatches(ticker, exchange, fallback), note: fallback.note });

    const matches = fallbackMatches(ticker, exchange, null);
    return NextResponse.json({ ticker, quote: matches[0] || null, matches, note: "No delayed/EOD quote result found. Suggested ticker metadata is shown so you can continue manually." });
  } catch (error) {
    const fallback = await stooqQuote(ticker, exchange).catch(() => null);
    const matches = fallbackMatches(ticker, exchange, fallback);
    return NextResponse.json({ ticker, quote: fallback || matches[0] || null, matches, note: error instanceof Error ? error.message : "Quote check failed" }, { status: 200 });
  }
}
