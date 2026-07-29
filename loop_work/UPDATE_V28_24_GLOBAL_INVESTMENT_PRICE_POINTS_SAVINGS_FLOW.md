# v28.24 — Global investment price points, tiered cadence and savings flow colour

## Why this update exists

The old investment chart storage could make the admin screen look like it was storing a user's holding value. That is the wrong base model for shared market data.

This update separates:

- **global raw price points** — one price for a ticker/exchange at a point in time, shared by all users
- **user holding value snapshots** — derived from the raw price point multiplied by that user's units, kept for compatibility with the existing user charts

This means LOOP can build one good price history for `G4M · LSE`, `AAPL · NASDAQ`, etc. and reuse it for every user who holds that instrument.

## Investment storage changes

New shared table:

- `investment_instruments`
- `investment_instrument_price_points`

The runner now:

1. Normalises ticker and market codes, e.g. `XLON` → `LSE`, `XNAS` → `NASDAQ`, `XNYS` → `NYSE`.
2. Groups due holdings by ticker/exchange.
3. Checks whether a fresh global raw price point already exists.
4. Reuses that point when available.
5. Fetches a new quote only when the shared point is stale for the fastest entitled user tier.
6. Stores one shared price point.
7. Derives user holding value snapshots from `price × units` so existing charts keep rendering.

## Tier cadence

Admin storage settings now expose:

- realtime users: 1-minute automatic shared points
- Plus/Pro/Premium users: 15-minute automatic shared points
- free users: 30-minute automatic shared points
- manual refresh can reuse the latest global point

## Automatic compaction / pruning

The new DB function `loop_admin_compact_investment_instrument_price_points()` compacts shared raw points into market-open anchored buckets. For UK markets the bucket baseline starts from 08:00 UTC; for US markets it starts from 14:30 UTC, so interval buckets work forward from opening time rather than a random row time.

- raw/15-minute style points for the first 31 days
- 30-minute buckets from 31 to 180 days
- 1-hour buckets from 180 to 365 days
- 12-hour buckets from 365 to 730 days
- 1-day buckets after 2 years
- deletes points older than 5 years

The snapshot runner calls this automatically after each run.

## User ticker search changes

If search confidence is below 50%, LOOP no longer shows irrelevant matches.

Users now see:

- No confident market match found
- Add to database
- Continue manually

When the user requests database coverage, LOOP queues an AI/admin workflow with progress fields for:

- ticker/instrument search
- investment profile and logo lookup
- document/fee information
- starter history, at least 1 month

## Savings / spending flow changes

Recurring savings top-ups are backfilled into `planned_items` as `saving_investment` transfers.

The spending timeline now displays these differently from normal spending:

- income: green
- ordinary bills/spend: red
- savings/investment transfers: blue with an upward arrow

This makes regular saving visible in cashflow without making it look like lost spending.

## SQL

Run:

```sql
 db/v28_24_global_investment_price_points_savings_flow.sql
```

## Operational note

This update does not remove the old `investment_price_snapshots` table yet. It continues to write derived user snapshots for existing charts, but admin storage and future charting should move to the shared raw price point model.
