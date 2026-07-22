// Shared network helpers for the investment price worker.
//
// Why this exists: every external quote/FX call in this module used to be a bare
// `fetch()` with no timeout. Node's default socket timeout is far longer than a
// worker "tick" (minutes, not seconds), so a single slow/rate-limited provider
// could stall an entire snapshot run - and because the worker only guards against
// *overlapping* runs (not slow ones), every subsequent tick would just skip until
// that one call finally resolved or errored. That's what produced holdings going
// stale for 70+ minutes even on a 1-minute schedule.
//
// Fix: every outbound call in this module goes through fetchWithTimeout, which
// aborts and throws quickly instead of hanging. Callers catch that and fall
// through to the next provider tier.

export const DEFAULT_QUOTE_TIMEOUT_MS = Math.max(
  1000,
  Number.parseInt(process.env.MARKET_DATA_QUOTE_TIMEOUT_MS || "", 10) || 6000,
);

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_QUOTE_TIMEOUT_MS,
): Promise<Response> {
  // AbortSignal.timeout is available in Node 18+; this repo already assumes a
  // modern Node runtime (see .node-version), so no polyfill is needed.
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

export class QuoteTimeoutBudgetExceeded extends Error {
  constructor(label: string) {
    super(`Quote resolution budget exceeded before trying ${label}`);
    this.name = "QuoteTimeoutBudgetExceeded";
  }
}

/**
 * Runs a list of async "tiers" in order, returning the first non-null result.
 * Each tier gets its own timeout (enforced by the tier itself via
 * fetchWithTimeout), and the whole chain is capped by `overallBudgetMs` so a
 * ticker with many fallback tiers can never consume more than a bounded slice
 * of a run, no matter how many providers are unavailable.
 */
export async function runTiered<T>(
  tiers: Array<{ name: string; run: () => Promise<T | null> }>,
  options: { overallBudgetMs?: number; onTierResult?: (name: string, ok: boolean, ms: number, error?: unknown) => void } = {},
): Promise<{ result: T | null; triedTiers: string[] }> {
  const overallBudgetMs = options.overallBudgetMs ?? 15000;
  const startedAt = Date.now();
  const triedTiers: string[] = [];

  for (const tier of tiers) {
    if (Date.now() - startedAt >= overallBudgetMs) {
      options.onTierResult?.(tier.name, false, 0, new QuoteTimeoutBudgetExceeded(tier.name));
      break;
    }
    const tierStartedAt = Date.now();
    triedTiers.push(tier.name);
    try {
      const result = await tier.run();
      const ms = Date.now() - tierStartedAt;
      if (result !== null && result !== undefined) {
        options.onTierResult?.(tier.name, true, ms);
        return { result, triedTiers };
      }
      options.onTierResult?.(tier.name, false, ms);
    } catch (error) {
      const ms = Date.now() - tierStartedAt;
      options.onTierResult?.(tier.name, false, ms, error);
    }
  }

  return { result: null, triedTiers };
}
