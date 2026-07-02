export type MarketVenue = {
  venueCode: string;
  aliases: string[];
  mic?: string;
  name: string;
  countryCode: string;
  currency: string;
  quoteUnit: string;
  priceScale: number;
  timezone: string;
  openUtcMinutes: number;
  closeUtcMinutes: number;
  yahooSuffix?: string;
  stooqSuffix?: string;
};

export const MARKET_VENUES: Record<string, MarketVenue> = {
  LSE: { venueCode: "LSE", aliases: ["XLON", "XLSE", "LON", "LSE", "LDN", "LONDON"], mic: "XLON", name: "London Stock Exchange", countryCode: "GB", currency: "GBX", quoteUnit: "gbx", priceScale: 0.01, timezone: "Europe/London", openUtcMinutes: 7 * 60, closeUtcMinutes: 16 * 60 + 45, yahooSuffix: ".L", stooqSuffix: ".uk" },
  NASDAQ: { venueCode: "NASDAQ", aliases: ["XNAS", "XNCM", "XNGS", "NMS", "NGM", "NAS", "NASDAQGS", "NASDAQ", "NCM"], mic: "XNAS", name: "NASDAQ", countryCode: "US", currency: "USD", quoteUnit: "usd", priceScale: 1, timezone: "America/New_York", openUtcMinutes: 13 * 60 + 30, closeUtcMinutes: 21 * 60 + 10 },
  NYSE: { venueCode: "NYSE", aliases: ["XNYS", "NYQ", "NYSE"], mic: "XNYS", name: "New York Stock Exchange", countryCode: "US", currency: "USD", quoteUnit: "usd", priceScale: 1, timezone: "America/New_York", openUtcMinutes: 13 * 60 + 30, closeUtcMinutes: 21 * 60 + 10 },
  AMEX: { venueCode: "AMEX", aliases: ["XASE", "ASE", "AMEX", "NYSEAMERICAN"], mic: "XASE", name: "NYSE American", countryCode: "US", currency: "USD", quoteUnit: "usd", priceScale: 1, timezone: "America/New_York", openUtcMinutes: 13 * 60 + 30, closeUtcMinutes: 21 * 60 + 10 },
  OTCM: { venueCode: "OTCM", aliases: ["OTCM", "OTC", "OOTC"], mic: "OTCM", name: "OTC Markets", countryCode: "US", currency: "USD", quoteUnit: "usd", priceScale: 1, timezone: "America/New_York", openUtcMinutes: 13 * 60 + 30, closeUtcMinutes: 21 * 60 + 10 },
  PINX: { venueCode: "PINX", aliases: ["PINX", "PINK", "OTC PINK", "OTCPK"], mic: "PINX", name: "OTC Pink", countryCode: "US", currency: "USD", quoteUnit: "usd", priceScale: 1, timezone: "America/New_York", openUtcMinutes: 13 * 60 + 30, closeUtcMinutes: 21 * 60 + 10 },
  XETR: { venueCode: "XETR", aliases: ["XETR", "ETR", "IBIS", "XETRA"], mic: "XETR", name: "Xetra", countryCode: "DE", currency: "EUR", quoteUnit: "eur", priceScale: 1, timezone: "Europe/Berlin", openUtcMinutes: 7 * 60, closeUtcMinutes: 16 * 60 + 45, yahooSuffix: ".DE", stooqSuffix: ".de" },
  XFRA: { venueCode: "XFRA", aliases: ["XFRA", "FRA", "FRANKFURT"], mic: "XFRA", name: "Frankfurt Stock Exchange", countryCode: "DE", currency: "EUR", quoteUnit: "eur", priceScale: 1, timezone: "Europe/Berlin", openUtcMinutes: 7 * 60, closeUtcMinutes: 20 * 60, yahooSuffix: ".F", stooqSuffix: ".de" },
  XPAR: { venueCode: "XPAR", aliases: ["XPAR", "PAR", "EPA", "EURONEXT PARIS", "PARIS"], mic: "XPAR", name: "Euronext Paris", countryCode: "FR", currency: "EUR", quoteUnit: "eur", priceScale: 1, timezone: "Europe/Paris", openUtcMinutes: 7 * 60, closeUtcMinutes: 16 * 60 + 45, yahooSuffix: ".PA", stooqSuffix: ".fr" },
  XAMS: { venueCode: "XAMS", aliases: ["XAMS", "AMS", "AS", "EURONEXT AMSTERDAM"], mic: "XAMS", name: "Euronext Amsterdam", countryCode: "NL", currency: "EUR", quoteUnit: "eur", priceScale: 1, timezone: "Europe/Amsterdam", openUtcMinutes: 7 * 60, closeUtcMinutes: 16 * 60 + 45, yahooSuffix: ".AS", stooqSuffix: ".nl" },
  XMIL: { venueCode: "XMIL", aliases: ["XMIL", "MIL", "MI", "MILAN"], mic: "XMIL", name: "Borsa Italiana", countryCode: "IT", currency: "EUR", quoteUnit: "eur", priceScale: 1, timezone: "Europe/Rome", openUtcMinutes: 7 * 60, closeUtcMinutes: 16 * 60 + 45, yahooSuffix: ".MI", stooqSuffix: ".it" },
  XSWX: { venueCode: "XSWX", aliases: ["XSWX", "SWX", "SW", "SIX", "SWISS"], mic: "XSWX", name: "SIX Swiss Exchange", countryCode: "CH", currency: "CHF", quoteUnit: "chf", priceScale: 1, timezone: "Europe/Zurich", openUtcMinutes: 7 * 60, closeUtcMinutes: 16 * 60 + 45, yahooSuffix: ".SW", stooqSuffix: ".ch" },
  XTSE: { venueCode: "XTSE", aliases: ["XTSE", "TSE", "TO", "TSX"], mic: "XTSE", name: "Toronto Stock Exchange", countryCode: "CA", currency: "CAD", quoteUnit: "cad", priceScale: 1, timezone: "America/Toronto", openUtcMinutes: 13 * 60 + 30, closeUtcMinutes: 21 * 60 + 10, yahooSuffix: ".TO", stooqSuffix: ".ca" },
  VANGUARD: { venueCode: "VANGUARD", aliases: ["VANGUARD", "YAHOO FUND", "FUND"], name: "Provider fund", countryCode: "GB", currency: "GBP", quoteUnit: "gbp", priceScale: 1, timezone: "Europe/London", openUtcMinutes: 0, closeUtcMinutes: 23 * 60 + 59 },
};

const ALIAS_TO_VENUE = Object.values(MARKET_VENUES).reduce<Record<string, string>>((acc, venue) => {
  acc[venue.venueCode] = venue.venueCode;
  for (const alias of venue.aliases) acc[alias.toUpperCase()] = venue.venueCode;
  return acc;
}, {});

export function normaliseVenueCode(exchange?: string | null, symbol?: string | null) {
  const raw = String(exchange || "").trim().toUpperCase();
  if (raw && ALIAS_TO_VENUE[raw]) return ALIAS_TO_VENUE[raw];
  const s = String(symbol || "").trim().toUpperCase();
  if (s.endsWith(".L") || s.endsWith(".UK")) return "LSE";
  if (s.endsWith(".DE")) return "XETR";
  if (s.endsWith(".F")) return "XFRA";
  if (s.endsWith(".PA")) return "XPAR";
  if (s.endsWith(".AS")) return "XAMS";
  if (s.endsWith(".MI")) return "XMIL";
  if (s.endsWith(".SW")) return "XSWX";
  if (s.endsWith(".TO")) return "XTSE";
  return raw || "";
}

export function venueFor(exchange?: string | null, symbol?: string | null): MarketVenue | null {
  const code = normaliseVenueCode(exchange, symbol);
  return code ? MARKET_VENUES[code] || null : null;
}

export function currencyForVenue(exchange?: string | null, fallback?: string | null, symbol?: string | null) {
  const venue = venueFor(exchange, symbol);
  const fb = String(fallback || "").trim().toUpperCase();
  if (venue?.currency) return venue.currency;
  if (["GBP", "GBX", "USD", "EUR", "CHF", "CAD"].includes(fb)) return fb;
  return "GBP";
}

export function quoteUnitForVenue(exchange?: string | null, fallback?: string | null, symbol?: string | null) {
  const venue = venueFor(exchange, symbol);
  const fb = String(fallback || "").trim().toLowerCase();
  if (venue?.quoteUnit) return venue.quoteUnit;
  if (["gbp", "gbx", "usd", "eur", "chf", "cad"].includes(fb)) return fb;
  return currencyForVenue(exchange, fallback, symbol).toLowerCase();
}

export function priceScaleForVenue(exchange?: string | null, symbol?: string | null) {
  return venueFor(exchange, symbol)?.priceScale ?? 1;
}

export function isMarketOpenForVenue(exchange?: string | null, now = new Date(), symbol?: string | null) {
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  const venue = venueFor(exchange, symbol);
  if (!venue) {
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    return minutes >= 7 * 60 && minutes <= 21 * 60 + 10;
  }
  if (venue.venueCode === "VANGUARD") return true;
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return minutes >= venue.openUtcMinutes && minutes <= venue.closeUtcMinutes;
}

export function yahooProviderSymbols(ticker: string, exchange?: string | null) {
  const clean = String(ticker || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!clean) return [];
  if (/^0P[0-9A-Z]+\.L$/i.test(clean)) return [clean];
  if (clean.includes(".") && !clean.endsWith(".UK")) return [clean];
  const base = clean.replace(/\.L$/i, "").replace(/\.UK$/i, "");
  const venue = venueFor(exchange, clean);
  const symbols: string[] = [];
  if (venue?.yahooSuffix) symbols.push(`${base}${venue.yahooSuffix}`);
  if (["NASDAQ", "NYSE", "AMEX", "OTCM", "PINX"].includes(venue?.venueCode || "")) symbols.push(base);
  if (!symbols.length) symbols.push(base, `${base}.L`);
  return Array.from(new Set(symbols));
}

export function stooqProviderSymbols(ticker: string, exchange?: string | null) {
  const clean = String(ticker || "").trim().toLowerCase().replace(/\s+/g, "").replace(/\.l$/i, "").replace(/\.uk$/i, "");
  if (!clean) return [];
  const venue = venueFor(exchange, clean);
  const symbols: string[] = [];
  if (venue?.stooqSuffix) symbols.push(`${clean}${venue.stooqSuffix}`);
  if (["NASDAQ", "NYSE", "AMEX", "OTCM", "PINX"].includes(venue?.venueCode || "")) symbols.push(`${clean}.us`, clean);
  if (!symbols.length) symbols.push(clean, `${clean}.uk`, `${clean}.us`);
  return Array.from(new Set(symbols));
}
