export type FxResult = {
  rate: number;
  source: string;
};

const FALLBACK_TO_GBP: Record<string, number> = {
  GBP: 1,
  GBX: 0.01,
  USD: 0.79,
  EUR: 0.85,
};

export function normaliseExchangeCode(exchange?: string | null) {
  const ex = String(exchange || "").trim().toUpperCase();
  if (["NMS", "NGM", "NAS", "NASDAQGS", "NASDAQ"].includes(ex)) return "NASDAQ";
  if (["NYQ", "NYSE"].includes(ex)) return "NYSE";
  if (["ASE", "AMEX", "NYSEAMERICAN"].includes(ex)) return "AMEX";
  if (["LON", "XLON", "LSE"].includes(ex)) return "LSE";
  return ex;
}

export function currencyForExchange(exchange?: string | null, fallback?: string | null) {
  const ex = normaliseExchangeCode(exchange);
  const fb = String(fallback || "").trim().toUpperCase();
  if (ex === "LSE") return "GBX";
  if (ex === "YAHOO FUND" || ex === "VANGUARD") return "GBP";
  if (["NASDAQ", "NYSE", "AMEX", "US"].includes(ex)) return "USD";
  if (["GBP", "USD", "EUR"].includes(fb)) return fb;
  return "GBP";
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
