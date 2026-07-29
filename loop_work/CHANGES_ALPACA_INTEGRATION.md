# Wire up Alpaca for US stocks

## What was wrong
Your `alpaca_key_id`/`alpaca_secret_key` were set as Render env vars, but
nothing in the codebase ever referenced "alpaca" anywhere — confirmed via
a full search. US tickers were going through the exact same Yahoo/Stooq
path as every other exchange, with your live Alpaca credentials sitting
unused.

## What changed
`lib/investments/market-data.ts`:
- New `alpacaQuote()` — calls Alpaca's Market Data API
  (`/v2/stocks/{symbol}/snapshot`), auth via the two required headers
  (`APCA-API-KEY-ID` / `APCA-API-SECRET-KEY`), IEX feed (works on
  Alpaca's free tier — no paid data plan required).
- New `isUsExchange()` — checks the ticker's venue against
  NASDAQ/NYSE/AMEX/ARCX/BATS/OTCM/PINX.
- In `fetchInvestmentQuote`, Alpaca is now tried **first** for US-listed
  tickers only, ahead of Alpha Vantage/FMP/Yahoo. Falls through to the
  existing chain if Alpaca fails or returns nothing. Non-US tickers
  (LSE, XETR, XPAR, etc.) never call Alpaca at all — unchanged, straight
  to Yahoo/Stooq as before.

`scripts/market-data-direct-worker.ts`:
- Added `hasAlpacaKeys` to the worker's boot-log diagnostics, same pattern
  as the existing SnapTrade/OpenAI key checks — so you can confirm at a
  glance in the Render logs that the env vars are actually being picked
  up, rather than guessing.

## Env var names it checks (in order)
```
ALPACA_KEY_ID / ALPACA_API_KEY_ID
ALPACA_SECRET_KEY / ALPACA_API_SECRET_KEY
```
If your Render env vars are named differently, either rename them to
match one of these, or tell me the exact names and I'll adjust the code
instead.

## Verification once deployed
Check the worker boot log for `hasAlpacaKeys: true`. Then in the price
job logs, a successful US-stock quote should show `source: 'Alpaca'`
rather than `Yahoo delayed/EOD`.

## Not changed
Everything about UK/European quote fetching (Yahoo, Stooq, provider
funds, ISIN resolution) is untouched — this only adds a new first-choice
path for US-listed tickers specifically.

## Verification
Both files pass an esbuild syntax check. Not a full `tsc`/build, and I
haven't been able to test a live Alpaca API call from here (no network
access to Alpaca's endpoint) — worth watching the first live price run
closely after this deploys.
