# v28.33 Instrument catalogue, tier cadence and daily change baseline

This update changes the market data pipeline from raw holding-level pricing into a catalogue-aware model.

## What changed

- Adds a market venue catalogue for LSE, NASDAQ, NYSE, AMEX, OTCM, PINX, XETR, XFRA, XPAR, XAMS, XMIL, XSWX, XTSE and provider funds.
- Resolves holdings into `investment_instruments` and `investment_instrument_listings`.
- Stores one global price point per listing/minute in `investment_instrument_price_points`.
- Fans out the latest listing price to user-specific `investment_price_snapshots` based on each user's tier cadence.
- Realtime users can receive 1-minute points; Plus/Pro defaults to 10 minutes; Free defaults to 30 minutes. Admin settings still control these values.
- Manual holdings and SnapTrade/Trading 212-style holdings are treated the same once a ticker/exchange is mapped.
- Native price/currency is stored and GBP is calculated using FX at the point of pricing.
- Daily movement is calculated from the final stored price point from the previous trading day, not an arbitrary previous snapshot.
- Holdings now store latest FX and previous-close/day-change fields for the UI.

## SQL

Run:

`db/v28_33_instrument_catalogue_tier_daily_change.sql`

## Render worker

Keep using:

`npm run worker:market-data`

Recommended env:

- `MARKET_DATA_WORKER_PRICE_INTERVAL_MINUTES=1`
- `MARKET_DATA_WORKER_SNAPTRADE_INTERVAL_MINUTES=1`
- `MARKET_DATA_WORKER_SNAPTRADE_REALTIME_ONLY=false`
- `MARKET_DATA_WORKER_MAINTENANCE_INTERVAL_MINUTES=60`
- `MARKET_DATA_WORKER_FORCE_PRICE=false`
