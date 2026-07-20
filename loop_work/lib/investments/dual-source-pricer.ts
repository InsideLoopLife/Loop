/**
 * ============================================================================
 * DUAL-SOURCE PRICE WORKER & VALIDATOR
 * Automatically fetches from Yahoo and Google, normalizes symbols, compares 
 * timestamps, and returns the freshest (least-delayed) market price.
 * ============================================================================
 */

export interface PriceQuote {
  symbol: string;
  price: number;
  currency: string;
  timestamp: number;
  source: 'yahoo' | 'google';
  isDelayed: boolean;
  delayMinutes: number;
}

interface FetchOptions {
  timeoutMs?: number;
}

/**
 * Normalizes stock symbols for different financial providers.
 * e.g., "G4M.L" -> Yahoo: "G4M.L" | Google: "LON:G4M"
 */
function formatSymbolForProvider(symbol: string, provider: 'yahoo' | 'google'): string {
  const cleanSymbol = symbol.trim().toUpperCase();
  
  if (provider === 'google') {
    if (cleanSymbol.endsWith('.L') || cleanSymbol.endsWith('.LN')) {
      return `LON:${cleanSymbol.replace(/\.L(N)?$/, '')}`;
    }
    return cleanSymbol;
  }

  if (cleanSymbol.includes(':')) {
    const [exchange, ticker] = cleanSymbol.split(':');
    if (exchange === 'LON' || exchange === 'LSE') return `${ticker}.L`;
    return ticker;
  }
  
  return cleanSymbol;
}

/**
 * Fetch with automatic timeout to prevent hanging worker threads.
 */
async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/html, */*',
      }
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * SOURCE 1: Yahoo Finance API Fetcher
 */
async function fetchYahooQuote(symbol: string, timeoutMs: number): Promise<PriceQuote> {
  const yahooSymbol = formatSymbolForProvider(symbol, 'yahoo');
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=1d`;
  
  const res = await fetchWithTimeout(url, timeoutMs);
  if (!res.ok) throw new Error(`Yahoo API returned status: ${res.status}`);
  
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  
  if (!result) throw new Error(`No Yahoo price data found for ${yahooSymbol}`);
  
  const meta = result.meta;
  const price = meta.regularMarketPrice;
  const timestamp = (meta.regularMarketTime || Math.floor(Date.now() / 1000)) * 1000;
  
  if (typeof price !== 'number' || isNaN(price)) {
    throw new Error(`Invalid price returned from Yahoo for ${yahooSymbol}`);
  }

  const ageMinutes = Math.floor((Date.now() - timestamp) / 60000);

  return {
    symbol: yahooSymbol,
    price,
    currency: meta.currency || 'GBP',
    timestamp,
    source: 'yahoo',
    isDelayed: ageMinutes >= 15,
    delayMinutes: Math.max(0, ageMinutes)
  };
}

/**
 * SOURCE 2: Google Finance Scraper/Endpoint Fetcher
 */
async function fetchGoogleQuote(symbol: string, timeoutMs: number): Promise<PriceQuote> {
  const googleSymbol = formatSymbolForProvider(symbol, 'google');
  const url = `https://www.google.com/finance/quote/${encodeURIComponent(googleSymbol)}`;
  
  const res = await fetchWithTimeout(url, timeoutMs);
  if (!res.ok) throw new Error(`Google Finance returned status: ${res.status}`);
  
  const html = await res.text();
  
  const priceMatch = html.match(/data-last-price="([^"]+)"/i) || html.match(/class="YMlKec fxKbKc">[^0-9]*([0-9.,]+)/i);
  const currencyMatch = html.match(/data-currency-code="([^"]+)"/i);
  
  if (!priceMatch || !priceMatch[1]) {
    throw new Error(`Could not parse price from Google Finance for ${googleSymbol}`);
  }

  const cleanPriceStr = priceMatch[1].replace(/,/g, '');
  const price = parseFloat(cleanPriceStr);
  
  if (isNaN(price)) {
    throw new Error(`Parsed Google price is NaN for ${googleSymbol}`);
  }

  const timestamp = Date.now(); 

  return {
    symbol: googleSymbol,
    price,
    currency: currencyMatch ? currencyMatch[1] : 'GBP',
    timestamp,
    source: 'google',
    isDelayed: false,
    delayMinutes: 0
  };
}

/**
 * CORE WORKER FUNCTION: Fetches both sources concurrently and selects the freshest.
 */
export async function getFreshestQuote(symbol: string, options: FetchOptions = {}): Promise<PriceQuote> {
  const { timeoutMs = 6000 } = options;

  const results = await Promise.allSettled([
    fetchGoogleQuote(symbol, timeoutMs),
    fetchYahooQuote(symbol, timeoutMs)
  ]);

  const validQuotes: PriceQuote[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    const providerName = index === 0 ? 'Google' : 'Yahoo';
    if (result.status === 'fulfilled' && result.value) {
      validQuotes.push(result.value);
    } else if (result.status === 'rejected') {
      errors.push(`${providerName}: ${result.reason?.message || result.reason}`);
    }
  });

  if (validQuotes.length === 0) {
    throw new Error(`All price sources failed for [${symbol}]. Reasons:\n- ${errors.join('\n- ')}`);
  }

  validQuotes.sort((a, b) => {
    const timeDiff = b.timestamp - a.timestamp;
    if (Math.abs(timeDiff) < 60000) {
      if (!a.isDelayed && b.isDelayed) return -1;
      if (a.isDelayed && !b.isDelayed) return 1;
    }
    return timeDiff;
  });

  return validQuotes[0];
}
