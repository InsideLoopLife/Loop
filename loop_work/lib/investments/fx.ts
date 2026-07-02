import { currencyForVenue, normaliseVenueCode } from "@/lib/investments/market-venues";

export type FxResult = {
  rate: number;
  source: string;
};

const FALLBACK_TO_GBP: Record<string, number> = {
  GBP: 1,
  GBX: 0.01,
  USD: 0.79,
  EUR: 0.85,
  CHF: 0.89,
  CAD: 0.58,
  AUD: 0.52,
  NZD: 0.47,
  JPY: 0.005,
  HKD: 0.10,
  SGD: 0.59,
  SEK: 0.073,
  NOK: 0.073,
  DKK: 0.114,
  PLN: 0.20,
  ZAR: 0.043,
  BRL: 0.15,
  MXN: 0.043,
};

export function normaliseExchangeCode(exchange?: string | null) {
  return normaliseVenueCode(exchange);
}

export function currencyForExchange(exchange?: string | null, fallback?: string | null) {
  return currencyForVenue(exchange, fallback);
}

export async function fxToGbp(currency?: string | null): Promise<FxResult> {
  const code = String(currency || "GBP").trim().toUpperCase();
  if (!code || code === "GBP") return { rate: 1, source: "native GBP" };
  if (code === "GBX") return { rate: 0.01, source: "GBX pence to GBP" };

  try {
    const response = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(code)}&to=GBP`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    const rate = Number(data?.rates?.GBP || 0);
    if (response.ok && Number.isFinite(rate) && rate > 0) return { rate, source: "Frankfurter FX" };
  } catch {
    // fall through to conservative fallback
  }

  return { rate: FALLBACK_TO_GBP[code] ?? 1, source: `fallback ${code}/GBP` };
}

export async function quotePriceToGbp(price: number, currency?: string | null) {
  const { rate, source } = await fxToGbp(currency);
  return { gbpPrice: Number(price || 0) * rate, fxRate: rate, fxSource: source };
}
