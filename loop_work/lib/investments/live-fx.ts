// lib/investments/live-fx.ts

type FxCache = {
  rates: Record<string, number>;
  fetchedAt: number;
};

let memoryCache: FxCache | null = null;
const CACHE_TTL_MS = 30 * 1000; // 30 seconds cache

export async function fetchLiveFxRates(base = "GBP"): Promise<Record<string, number>> {
  const now = Date.now();
  if (memoryCache && now - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.rates;
  }

  try {
    const response = await fetch(`https://api.frankfurter.app/latest?from=${base}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (response.ok && data?.rates) {
      const rates = { ...data.rates, [base]: 1, GBX: 100 }; // Include base and pence (GBX)
      memoryCache = { rates, fetchedAt: now };
      return rates;
    }
  } catch (error) {
    console.warn("Failed to fetch live FX rates, falling back to cached or default rates:", error);
  }

  return memoryCache?.rates || { GBP: 1, GBX: 100, USD: 1.27, EUR: 1.18 };
}

/**
 * Synchronous local converter using the latest cached FX rates
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency = "GBP",
  rates: Record<string, number> = {}
): number {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === to) return amount;
  if (from === "GBX") return (amount / 100) * (rates[to] || (to === "GBP" ? 1 : 1));
  if (to === "GBX") return (amount * (rates[from] || 1)) * 100;

  // Convert via GBP base if needed
  const amountInGbp = from === "GBP" ? amount : amount / (rates[from] || 1);
  return to === "GBP" ? amountInGbp : amountInGbp * (rates[to] || 1);
}