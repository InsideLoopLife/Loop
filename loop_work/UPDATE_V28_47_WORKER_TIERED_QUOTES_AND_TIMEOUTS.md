# v28.47 Worker Failsafes: Timeouts, Concurrency, Tiered Quote Providers

## Problem this fixes

Some holdings were going stale for 70+ minutes despite a 1-minute worker
schedule. Root cause: every external call (Yahoo, Stooq, provider fund pages,
Frankfurter FX) was a bare `fetch()` with no timeout, and ticker groups were
processed strictly one-at-a-time. A single slow/rate-limited provider could
stall an entire run; because the worker only guards against *overlapping*
runs (not slow ones), every following 1-minute tick just logged "previous run
still active" and did nothing until the stuck call finally resolved.

## What changed

**`lib/investments/http.ts` (new)**
- `fetchWithTimeout()` - every outbound call now aborts after
  `MARKET_DATA_QUOTE_TIMEOUT_MS` (default 6s) instead of relying on Node's
  default socket timeout.
- `runTiered()` - runs an ordered list of provider "tiers", stopping at the
  first success, logging every attempt, and enforcing an overall budget so a
  ticker with no coverage fails fast instead of trying every tier at full cost.

**`lib/investments/market-data.ts`**
- Added two new provider tiers: **Finnhub** and **Twelve Data** (see table
  below for why).
- `fetchInvestmentQuote()` rebuilt around `runTiered()` with an explicit,
  documented tier order (was: ad-hoc if/else chain).
- Every provider fetch now goes through `fetchWithTimeout`.
- New env var: `MARKET_DATA_QUOTE_BUDGET_MS` (default 12000) - total time
  budget for resolving a single quote across all tiers.

**`lib/investments/fx.ts`**
- Frankfurter FX call now uses `fetchWithTimeout` (5s). Fallback static rates
  were already in place; they now actually get used promptly instead of after
  a long hang.

**`lib/investments/price-snapshot-runner.ts`**
- Per-ticker-group work extracted into `processGroup()`.
- Groups are now processed in concurrent batches (`MARKET_DATA_GROUP_CONCURRENCY`,
  default 6) instead of strictly sequentially.
- The whole job run is capped by `MARKET_DATA_JOB_BUDGET_MS` (default 45000).
  Groups not reached before the budget expires are left for the next
  scheduled tick (their `last_price_check_at` is untouched, so `isDue` still
  picks them up).
- Per-group duration is now logged, so slow tickers/providers are visible in
  worker logs instead of being invisible.

**`scripts/investment-price-worker.mjs`**
- The worker's own call into the Next.js app now has a timeout
  (`MARKET_DATA_WORKER_CALL_TIMEOUT_MS`, default 90s) as a second layer of
  defence.
- Added a watchdog (`MARKET_DATA_WORKER_WATCHDOG_MS`, default 5 min): if the
  "running" lock is ever still set past this window (meaning something hung
  despite the above), it force-clears itself and logs an error, instead of
  silently skipping every tick forever.

## New tiered quote provider order

1. **Provider fund page** - fund/OEIC only (Vanguard etc.), unchanged.
2. **Alpaca** (new) - US-listed only. Genuinely real-time IEX-feed data on the
   free "Basic" plan (not delayed like Yahoo/Stooq), an officially documented
   endpoint (not scraping), and a far higher/more predictable free rate limit
   than any other provider here. For US tickers this should resolve before
   Yahoo/Stooq are ever needed.
3. **Finnhub** - best free-tier throughput (~60 calls/min per key) for
   non-US venues; new.
4. **Alpha Vantage** - reliable, but a tight free tier (~5 calls/min).
5. **Twelve Data** - widest free exchange coverage (50+ venues), 800
   calls/day free; new.
6. **Financial Modeling Prep**
7. **Yahoo Finance** - no key required; unofficial, can rate-limit or break.
8. **Stooq** - no key required; delayed data; last resort before
   `coverage_required`.

Finnhub, Twelve Data, and Alpaca use the same per-user `integration_secrets`
pattern as Alpha Vantage/FMP, so each user's key has its own rate limit rather
than sharing one worker-wide key - this is what lets it scale with your user
base instead of hitting a shared ceiling.

### Alpaca setup

Alpaca authenticates with **two** values (key ID + secret key, not a single
API key), so it's stored as two `integration_secrets` rows per user:

- provider `"alpaca_key_id"`
- provider `"alpaca_secret_key"`

Both come from the user's Alpaca account (paper or live trading account both
work - market data access isn't limited to funded/live accounts). No env var
is needed; it follows the existing per-user secret flow.

Alpaca is only attempted for US-listed venues (`NASDAQ`, `NYSE`, `AMEX`,
`ARCX`, `BATS`) - it's skipped immediately (no wasted request) for anything
else, including OTC/pink-sheet tickers, which Alpaca's market data doesn't
reliably cover.

## New env vars (all optional, sensible defaults)

```env
MARKET_DATA_QUOTE_TIMEOUT_MS=6000      # per-request timeout for any single provider call
MARKET_DATA_QUOTE_BUDGET_MS=12000      # total time budget to resolve one quote across all tiers
MARKET_DATA_GROUP_CONCURRENCY=6        # how many ticker groups to process at once
MARKET_DATA_JOB_BUDGET_MS=45000        # hard cap on a single job run
MARKET_DATA_WORKER_CALL_TIMEOUT_MS=90000  # worker -> app HTTP call timeout
MARKET_DATA_WORKER_WATCHDOG_MS=300000     # force-clear a stuck run lock after this long
```

## Nothing else changes

- AI/web-search remains disabled in the worker (v28.36 behaviour unchanged).
- `coverage_required` handling for holdings with no deterministic quote is
  unchanged - it just now happens on a bounded budget instead of after an
  unbounded chain of slow attempts.
