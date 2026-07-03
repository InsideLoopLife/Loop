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

function minutes(hour: number, minute = 0) {
  return hour * 60 + minute;
}

const US_OPEN = minutes(13, 30);
const US_CLOSE = minutes(21, 0);
const EU_OPEN = minutes(7, 0);
const EU_CLOSE = minutes(16, 30);

export const MARKET_VENUES: Record<string, MarketVenue> = {
  LSE: { venueCode: "LSE", aliases: ["XLON", "XLSE", "LON", "LSE", "LDN", "LONDON"], mic: "XLON", name: "London Stock Exchange", countryCode: "GB", currency: "GBX", quoteUnit: "gbx", priceScale: 0.01, timezone: "Europe/London", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".L", stooqSuffix: ".uk" },
  AIM: { venueCode: "AIM", aliases: ["AIM", "AIMX", "XLON-AIM", "LSE-AIM"], mic: "AIMX", name: "AIM", countryCode: "GB", currency: "GBX", quoteUnit: "gbx", priceScale: 0.01, timezone: "Europe/London", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".L", stooqSuffix: ".uk" },
  NASDAQ: { venueCode: "NASDAQ", aliases: ["XNAS", "XNCM", "XNGS", "NMS", "NGM", "NAS", "NASDAQGS", "NASDAQ", "NCM", "NDAQ"], mic: "XNAS", name: "NASDAQ", countryCode: "US", currency: "USD", quoteUnit: "usd", priceScale: 1, timezone: "America/New_York", openUtcMinutes: US_OPEN, closeUtcMinutes: US_CLOSE },
  NYSE: { venueCode: "NYSE", aliases: ["XNYS", "NYQ", "NYSE"], mic: "XNYS", name: "New York Stock Exchange", countryCode: "US", currency: "USD", quoteUnit: "usd", priceScale: 1, timezone: "America/New_York", openUtcMinutes: US_OPEN, closeUtcMinutes: US_CLOSE },
  AMEX: { venueCode: "AMEX", aliases: ["XASE", "ASE", "AMEX", "NYSEAMERICAN"], mic: "XASE", name: "NYSE American", countryCode: "US", currency: "USD", quoteUnit: "usd", priceScale: 1, timezone: "America/New_York", openUtcMinutes: US_OPEN, closeUtcMinutes: US_CLOSE },
  ARCX: { venueCode: "ARCX", aliases: ["ARCX", "XARC", "NYSEARCA", "ARCA"], mic: "ARCX", name: "NYSE Arca", countryCode: "US", currency: "USD", quoteUnit: "usd", priceScale: 1, timezone: "America/New_York", openUtcMinutes: US_OPEN, closeUtcMinutes: US_CLOSE },
  BATS: { venueCode: "BATS", aliases: ["BATS", "BATS-US", "CBOE", "XCBO", "EDGX", "BZX"], mic: "BATS", name: "Cboe BZX", countryCode: "US", currency: "USD", quoteUnit: "usd", priceScale: 1, timezone: "America/New_York", openUtcMinutes: US_OPEN, closeUtcMinutes: US_CLOSE },
  OTCM: { venueCode: "OTCM", aliases: ["OTCM", "OTC", "OOTC"], mic: "OTCM", name: "OTC Markets", countryCode: "US", currency: "USD", quoteUnit: "usd", priceScale: 1, timezone: "America/New_York", openUtcMinutes: US_OPEN, closeUtcMinutes: US_CLOSE },
  PINX: { venueCode: "PINX", aliases: ["PINX", "PINK", "OTC PINK", "OTCPK"], mic: "PINX", name: "OTC Pink", countryCode: "US", currency: "USD", quoteUnit: "usd", priceScale: 1, timezone: "America/New_York", openUtcMinutes: US_OPEN, closeUtcMinutes: US_CLOSE },
  XETR: { venueCode: "XETR", aliases: ["XETR", "ETR", "IBIS", "XETRA", "GER", "DE"], mic: "XETR", name: "Xetra", countryCode: "DE", currency: "EUR", quoteUnit: "eur", priceScale: 1, timezone: "Europe/Berlin", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".DE", stooqSuffix: ".de" },
  XFRA: { venueCode: "XFRA", aliases: ["XFRA", "FRA", "FRANKFURT", "F"], mic: "XFRA", name: "Frankfurt Stock Exchange", countryCode: "DE", currency: "EUR", quoteUnit: "eur", priceScale: 1, timezone: "Europe/Berlin", openUtcMinutes: EU_OPEN, closeUtcMinutes: minutes(20, 0), yahooSuffix: ".F", stooqSuffix: ".de" },
  XPAR: { venueCode: "XPAR", aliases: ["XPAR", "PAR", "EPA", "EURONEXT PARIS", "PARIS", "PA"], mic: "XPAR", name: "Euronext Paris", countryCode: "FR", currency: "EUR", quoteUnit: "eur", priceScale: 1, timezone: "Europe/Paris", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".PA", stooqSuffix: ".fr" },
  XAMS: { venueCode: "XAMS", aliases: ["XAMS", "AMS", "AS", "EURONEXT AMSTERDAM", "AMSTERDAM"], mic: "XAMS", name: "Euronext Amsterdam", countryCode: "NL", currency: "EUR", quoteUnit: "eur", priceScale: 1, timezone: "Europe/Amsterdam", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".AS", stooqSuffix: ".nl" },
  XMIL: { venueCode: "XMIL", aliases: ["XMIL", "MIL", "MI", "MILAN", "BIT"], mic: "XMIL", name: "Borsa Italiana", countryCode: "IT", currency: "EUR", quoteUnit: "eur", priceScale: 1, timezone: "Europe/Rome", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".MI", stooqSuffix: ".it" },
  XSWX: { venueCode: "XSWX", aliases: ["XSWX", "SWX", "SW", "SIX", "SWISS"], mic: "XSWX", name: "SIX Swiss Exchange", countryCode: "CH", currency: "CHF", quoteUnit: "chf", priceScale: 1, timezone: "Europe/Zurich", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".SW", stooqSuffix: ".ch" },
  XTSE: { venueCode: "XTSE", aliases: ["XTSE", "TSE", "TO", "TSX", "TORONTO"], mic: "XTSE", name: "Toronto Stock Exchange", countryCode: "CA", currency: "CAD", quoteUnit: "cad", priceScale: 1, timezone: "America/Toronto", openUtcMinutes: US_OPEN, closeUtcMinutes: US_CLOSE, yahooSuffix: ".TO", stooqSuffix: ".ca" },
  TSXV: { venueCode: "TSXV", aliases: ["TSXV", "V", "VENTURE", "TSXVENTURE"], mic: "XTSX", name: "TSX Venture Exchange", countryCode: "CA", currency: "CAD", quoteUnit: "cad", priceScale: 1, timezone: "America/Toronto", openUtcMinutes: US_OPEN, closeUtcMinutes: US_CLOSE, yahooSuffix: ".V", stooqSuffix: ".ca" },
  XSTO: { venueCode: "XSTO", aliases: ["XSTO", "STO", "ST", "STOCKHOLM"], mic: "XSTO", name: "Nasdaq Stockholm", countryCode: "SE", currency: "SEK", quoteUnit: "sek", priceScale: 1, timezone: "Europe/Stockholm", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".ST", stooqSuffix: ".se" },
  XCSE: { venueCode: "XCSE", aliases: ["XCSE", "CSE", "CO", "COPENHAGEN"], mic: "XCSE", name: "Nasdaq Copenhagen", countryCode: "DK", currency: "DKK", quoteUnit: "dkk", priceScale: 1, timezone: "Europe/Copenhagen", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".CO", stooqSuffix: ".dk" },
  XHEL: { venueCode: "XHEL", aliases: ["XHEL", "HEL", "HE", "HELSINKI"], mic: "XHEL", name: "Nasdaq Helsinki", countryCode: "FI", currency: "EUR", quoteUnit: "eur", priceScale: 1, timezone: "Europe/Helsinki", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".HE", stooqSuffix: ".fi" },
  XOSL: { venueCode: "XOSL", aliases: ["XOSL", "OSL", "OL", "OSLO"], mic: "XOSL", name: "Oslo Børs", countryCode: "NO", currency: "NOK", quoteUnit: "nok", priceScale: 1, timezone: "Europe/Oslo", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".OL", stooqSuffix: ".no" },
  XBRU: { venueCode: "XBRU", aliases: ["XBRU", "BRU", "BR", "BRUSSELS"], mic: "XBRU", name: "Euronext Brussels", countryCode: "BE", currency: "EUR", quoteUnit: "eur", priceScale: 1, timezone: "Europe/Brussels", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".BR", stooqSuffix: ".be" },
  XLIS: { venueCode: "XLIS", aliases: ["XLIS", "LIS", "LS", "LISBON"], mic: "XLIS", name: "Euronext Lisbon", countryCode: "PT", currency: "EUR", quoteUnit: "eur", priceScale: 1, timezone: "Europe/Lisbon", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".LS", stooqSuffix: ".pt" },
  XWBO: { venueCode: "XWBO", aliases: ["XWBO", "WBO", "VI", "VIENNA"], mic: "XWBO", name: "Vienna Stock Exchange", countryCode: "AT", currency: "EUR", quoteUnit: "eur", priceScale: 1, timezone: "Europe/Vienna", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".VI", stooqSuffix: ".at" },
  XWAR: { venueCode: "XWAR", aliases: ["XWAR", "WAR", "WA", "WARSAW"], mic: "XWAR", name: "Warsaw Stock Exchange", countryCode: "PL", currency: "PLN", quoteUnit: "pln", priceScale: 1, timezone: "Europe/Warsaw", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".WA", stooqSuffix: ".pl" },
  XHKG: { venueCode: "XHKG", aliases: ["XHKG", "HKG", "HK", "HONG KONG"], mic: "XHKG", name: "Hong Kong Exchange", countryCode: "HK", currency: "HKD", quoteUnit: "hkd", priceScale: 1, timezone: "Asia/Hong_Kong", openUtcMinutes: minutes(1, 30), closeUtcMinutes: minutes(8, 10), yahooSuffix: ".HK", stooqSuffix: ".hk" },
  XSES: { venueCode: "XSES", aliases: ["XSES", "SES", "SI", "SINGAPORE"], mic: "XSES", name: "Singapore Exchange", countryCode: "SG", currency: "SGD", quoteUnit: "sgd", priceScale: 1, timezone: "Asia/Singapore", openUtcMinutes: minutes(1, 0), closeUtcMinutes: minutes(9, 10), yahooSuffix: ".SI", stooqSuffix: ".sg" },
  XTKS: { venueCode: "XTKS", aliases: ["XTKS", "TYO", "T", "TOKYO"], mic: "XTKS", name: "Tokyo Stock Exchange", countryCode: "JP", currency: "JPY", quoteUnit: "jpy", priceScale: 1, timezone: "Asia/Tokyo", openUtcMinutes: minutes(0, 0), closeUtcMinutes: minutes(6, 10), yahooSuffix: ".T", stooqSuffix: ".jp" },
  XASX: { venueCode: "XASX", aliases: ["XASX", "ASX", "AX", "AUSTRALIA"], mic: "XASX", name: "Australian Securities Exchange", countryCode: "AU", currency: "AUD", quoteUnit: "aud", priceScale: 1, timezone: "Australia/Sydney", openUtcMinutes: minutes(0, 0), closeUtcMinutes: minutes(6, 10), yahooSuffix: ".AX", stooqSuffix: ".au" },
  XNZE: { venueCode: "XNZE", aliases: ["XNZE", "NZE", "NZ", "NZX"], mic: "XNZE", name: "New Zealand Exchange", countryCode: "NZ", currency: "NZD", quoteUnit: "nzd", priceScale: 1, timezone: "Pacific/Auckland", openUtcMinutes: minutes(22, 0), closeUtcMinutes: minutes(4, 50), yahooSuffix: ".NZ", stooqSuffix: ".nz" },
  XJSE: { venueCode: "XJSE", aliases: ["XJSE", "JSE", "JO", "JOHANNESBURG"], mic: "XJSE", name: "Johannesburg Stock Exchange", countryCode: "ZA", currency: "ZAR", quoteUnit: "zar", priceScale: 1, timezone: "Africa/Johannesburg", openUtcMinutes: EU_OPEN, closeUtcMinutes: EU_CLOSE, yahooSuffix: ".JO", stooqSuffix: ".za" },
  XMEX: { venueCode: "XMEX", aliases: ["XMEX", "MEX", "MX", "MEXICO"], mic: "XMEX", name: "Mexican Stock Exchange", countryCode: "MX", currency: "MXN", quoteUnit: "mxn", priceScale: 1, timezone: "America/Mexico_City", openUtcMinutes: minutes(14, 30), closeUtcMinutes: minutes(21, 10), yahooSuffix: ".MX", stooqSuffix: ".mx" },
  BVMF: { venueCode: "BVMF", aliases: ["BVMF", "SAO", "SA", "B3", "BRAZIL"], mic: "BVMF", name: "B3 Brazil", countryCode: "BR", currency: "BRL", quoteUnit: "brl", priceScale: 1, timezone: "America/Sao_Paulo", openUtcMinutes: minutes(13, 0), closeUtcMinutes: minutes(20, 10), yahooSuffix: ".SA", stooqSuffix: ".br" },
  VANGUARD: { venueCode: "VANGUARD", aliases: ["VANGUARD", "YAHOO FUND", "FUND", "PROVIDER"], name: "Provider fund", countryCode: "GB", currency: "GBP", quoteUnit: "gbp", priceScale: 1, timezone: "Europe/London", openUtcMinutes: 0, closeUtcMinutes: 23 * 60 + 59 },
};

const ALIAS_TO_VENUE = Object.values(MARKET_VENUES).reduce<Record<string, string>>((acc, venue) => {
  acc[venue.venueCode] = venue.venueCode;
  for (const alias of venue.aliases) acc[alias.toUpperCase()] = venue.venueCode;
  return acc;
}, {});

const SUFFIX_TO_VENUE: Record<string, string> = Object.values(MARKET_VENUES).reduce<Record<string, string>>((acc, venue) => {
  if (venue.yahooSuffix) acc[venue.yahooSuffix.toUpperCase()] = venue.venueCode;
  return acc;
}, {});


export type MarketSessionState = {
  session: "regular" | "pre" | "after" | "closed" | "weekend" | "daily";
  label: string;
  isMarketOpen: boolean;
  isExtended: boolean;
  localTimeLabel: string;
  openLabel: string;
  closeLabel: string;
  nextStateLabel: string;
  venue: MarketVenue | null;
};

type LocalSchedule = {
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
  preOpenHour?: number;
  preOpenMinute?: number;
  afterCloseHour?: number;
  afterCloseMinute?: number;
};

function two(value: number) {
  return String(value).padStart(2, "0");
}

function localPartsFor(timezone: string, now: Date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const weekday = get("weekday");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    weekday,
    dayNumber: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday),
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
    label: `${two(Number.isFinite(hour) ? hour : 0)}:${two(Number.isFinite(minute) ? minute : 0)} ${timezone}`,
  };
}

function localMinutes(hour: number, minute = 0) {
  return hour * 60 + minute;
}

function scheduleForVenue(venue: MarketVenue | null): LocalSchedule {
  const code = venue?.venueCode || "";
  if (["NASDAQ", "NYSE", "AMEX", "ARCX", "BATS", "OTCM", "PINX", "XTSE", "TSXV"].includes(code)) {
    return { openHour: 9, openMinute: 30, closeHour: 16, closeMinute: 0, preOpenHour: 4, preOpenMinute: 0, afterCloseHour: 20, afterCloseMinute: 0 };
  }
  if (["LSE", "AIM"].includes(code)) return { openHour: 8, openMinute: 0, closeHour: 16, closeMinute: 30 };
  if (code === "XFRA") return { openHour: 8, openMinute: 0, closeHour: 22, closeMinute: 0 };
  if (["XETR", "XPAR", "XAMS", "XMIL", "XSWX", "XSTO", "XCSE", "XHEL", "XOSL", "XBRU", "XLIS", "XWBO", "XWAR"].includes(code)) {
    return { openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 30 };
  }
  if (code === "XHKG") return { openHour: 9, openMinute: 30, closeHour: 16, closeMinute: 10 };
  if (code === "XSES") return { openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 10 };
  if (code === "XTKS") return { openHour: 9, openMinute: 0, closeHour: 15, closeMinute: 10 };
  if (code === "XASX") return { openHour: 10, openMinute: 0, closeHour: 16, closeMinute: 10 };
  if (code === "XNZE") return { openHour: 10, openMinute: 0, closeHour: 16, closeMinute: 50 };
  if (code === "XJSE") return { openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 0 };
  if (code === "XMEX") return { openHour: 8, openMinute: 30, closeHour: 15, closeMinute: 0 };
  if (code === "BVMF") return { openHour: 10, openMinute: 0, closeHour: 17, closeMinute: 10 };
  return { openHour: 8, openMinute: 0, closeHour: 16, closeMinute: 30 };
}

function inWindow(minutesNow: number, start: number, end: number) {
  if (start <= end) return minutesNow >= start && minutesNow <= end;
  return minutesNow >= start || minutesNow <= end;
}

export function marketSessionForVenue(exchange?: string | null, now = new Date(), symbol?: string | null): MarketSessionState {
  const venue = venueFor(exchange, symbol);
  if (venue?.venueCode === "VANGUARD") {
    return {
      session: "daily",
      label: "priced daily",
      isMarketOpen: false,
      isExtended: false,
      localTimeLabel: localPartsFor(venue.timezone, now).label,
      openLabel: "Daily NAV",
      closeLabel: "Daily NAV",
      nextStateLabel: "Next provider NAV update",
      venue,
    };
  }

  const timezone = venue?.timezone || "Europe/London";
  const local = localPartsFor(timezone, now);
  const isWeekend = local.dayNumber === 0 || local.dayNumber === 6;
  const schedule = scheduleForVenue(venue);
  const open = localMinutes(schedule.openHour, schedule.openMinute);
  const close = localMinutes(schedule.closeHour, schedule.closeMinute);
  const preOpen = schedule.preOpenHour !== undefined ? localMinutes(schedule.preOpenHour, schedule.preOpenMinute || 0) : null;
  const afterClose = schedule.afterCloseHour !== undefined ? localMinutes(schedule.afterCloseHour, schedule.afterCloseMinute || 0) : null;
  const minutesNow = localMinutes(local.hour, local.minute);
  const openLabel = `${two(schedule.openHour)}:${two(schedule.openMinute)}`;
  const closeLabel = `${two(schedule.closeHour)}:${two(schedule.closeMinute)}`;

  if (isWeekend) return { session: "weekend", label: "closed", isMarketOpen: false, isExtended: false, localTimeLabel: local.label, openLabel, closeLabel, nextStateLabel: `Opens ${openLabel}`, venue };
  if (inWindow(minutesNow, open, close)) return { session: "regular", label: "live market", isMarketOpen: true, isExtended: false, localTimeLabel: local.label, openLabel, closeLabel, nextStateLabel: `Closes ${closeLabel}`, venue };
  if (preOpen !== null && inWindow(minutesNow, preOpen, open - 1)) return { session: "pre", label: "early market", isMarketOpen: true, isExtended: true, localTimeLabel: local.label, openLabel, closeLabel, nextStateLabel: `Opens ${openLabel}`, venue };
  if (afterClose !== null && inWindow(minutesNow, close + 1, afterClose)) return { session: "after", label: "sunset market", isMarketOpen: true, isExtended: true, localTimeLabel: local.label, openLabel, closeLabel, nextStateLabel: `Extended closes ${two(schedule.afterCloseHour || 0)}:${two(schedule.afterCloseMinute || 0)}`, venue };
  return { session: "closed", label: "closed", isMarketOpen: false, isExtended: false, localTimeLabel: local.label, openLabel, closeLabel, nextStateLabel: `Opens ${openLabel}`, venue };
}

export function knownVenueCodes() {
  return Object.keys(MARKET_VENUES).sort();
}

export function normaliseVenueCode(exchange?: string | null, symbol?: string | null) {
  const raw = String(exchange || "").trim().toUpperCase();
  const cleanedRaw = raw.replace(/^\./, "");
  if (raw && ALIAS_TO_VENUE[raw]) return ALIAS_TO_VENUE[raw];
  if (cleanedRaw && ALIAS_TO_VENUE[cleanedRaw]) return ALIAS_TO_VENUE[cleanedRaw];
  const s = String(symbol || "").trim().toUpperCase();
  for (const [suffix, venue] of Object.entries(SUFFIX_TO_VENUE)) {
    if (s.endsWith(suffix)) return venue;
  }
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
  if (["GBP", "GBX", "USD", "EUR", "CHF", "CAD", "AUD", "NZD", "JPY", "HKD", "SGD", "SEK", "NOK", "DKK", "PLN", "ZAR", "BRL", "MXN"].includes(fb)) return fb;
  return "GBP";
}

export function quoteUnitForVenue(exchange?: string | null, fallback?: string | null, symbol?: string | null) {
  const venue = venueFor(exchange, symbol);
  const fb = String(fallback || "").trim().toLowerCase();
  if (venue?.quoteUnit) return venue.quoteUnit;
  if (["gbp", "gbx", "usd", "eur", "chf", "cad", "aud", "nzd", "jpy", "hkd", "sgd", "sek", "nok", "dkk", "pln", "zar", "brl", "mxn"].includes(fb)) return fb;
  return currencyForVenue(exchange, fallback, symbol).toLowerCase();
}

export function priceScaleForVenue(exchange?: string | null, symbol?: string | null) {
  return venueFor(exchange, symbol)?.priceScale ?? 1;
}

export function isMarketOpenForVenue(exchange?: string | null, now = new Date(), symbol?: string | null) {
  const session = marketSessionForVenue(exchange, now, symbol);
  // Treat US/Canada extended sessions as update windows for realtime users.
  // UK/EU and most international venues remain regular-hours only unless explicitly scheduled above.
  return session.isMarketOpen;
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
  if (["NASDAQ", "NYSE", "AMEX", "ARCX", "BATS", "OTCM", "PINX"].includes(venue?.venueCode || "")) symbols.push(base);
  if (!symbols.length) symbols.push(base, `${base}.L`, `${base}.DE`, `${base}.PA`, `${base}.F`, `${base}.AS`, `${base}.MI`, `${base}.SW`, `${base}.TO`);
  return Array.from(new Set(symbols));
}

export function stooqProviderSymbols(ticker: string, exchange?: string | null) {
  const clean = String(ticker || "").trim().toLowerCase().replace(/\s+/g, "").replace(/\.l$/i, "").replace(/\.uk$/i, "");
  if (!clean) return [];
  const venue = venueFor(exchange, clean);
  const symbols: string[] = [];
  if (venue?.stooqSuffix) symbols.push(`${clean}${venue.stooqSuffix}`);
  if (["NASDAQ", "NYSE", "AMEX", "ARCX", "BATS", "OTCM", "PINX"].includes(venue?.venueCode || "")) symbols.push(`${clean}.us`, clean);
  if (!symbols.length) symbols.push(clean, `${clean}.uk`, `${clean}.us`, `${clean}.de`, `${clean}.fr`, `${clean}.nl`, `${clean}.it`, `${clean}.ch`, `${clean}.ca`);
  return Array.from(new Set(symbols));
}
