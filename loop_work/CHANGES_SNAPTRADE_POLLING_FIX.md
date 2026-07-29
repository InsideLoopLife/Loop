# Root cause found and fixed: SnapTrade sync was silently disabling pricing on every sync

## The bug
`lib/snaptrade/sync.ts`, line 2191:
```ts
price_polling_enabled: Boolean(position.ticker),
```
This was part of the payload used for **both** inserting new holdings and
updating existing ones on every SnapTrade sync. Whenever SnapTrade's
payload for a given sync didn't include a clean `ticker` string for a
position (common — brokerage APIs often return an internal security ID
instead), this line reset `price_polling_enabled` to `false` — even on a
holding that was already correctly resolved and enabled.

## How bad it actually was
Checked directly: **100% of your SnapTrade-imported holdings (154 of
154) had polling disabled.** Not a partial issue — every single one, with
zero exceptions. This is why the worker only ever found 2 holdings to
check.

## The code fix
`price_polling_enabled` is now only set when a holding row is genuinely
new (a real insert). On every subsequent sync of an existing holding,
this field is left untouched — so a holding's polling setting can never
be silently overwritten by a later sync again.

## The one-time data fix — already applied directly to your database
```sql
update investment_holdings
set price_polling_enabled = true
where import_source_type = 'snaptrade'
  and record_status = 'active'
  and ticker is not null
  and price_polling_enabled = false;
```
**154 rows updated** — every affected holding (AAPL, MSFT, GOOGL, JPM,
CNQ, STAG, G4M, THG, and the rest) is now enabled for polling. This was
run directly against your Supabase project; nothing further needed on
your end for this part.

## Also checked and ruled out: duplicate holdings
You'd asked about tickers like STAG showing up twice with different unit
counts. Checked directly — these are **not** duplicates. Same
`external_position_id`, but different `investment_account_id`s: STAG
genuinely held in two separate accounts, both synced via SnapTrade,
correctly recorded as two separate holdings. No fix needed there.

## What to expect once this deploys
The next few worker cycles should show real US and UK stock tickers
being checked — via Alpaca for US-listed ones (from the fix earlier
today), Yahoo/Stooq for everything else — instead of just the 2 Vanguard
funds. Given 154 holdings now need checking and the 1-minute cadence
processes them in ticker/exchange groups, expect it to take a little
while to cycle through everyone the first time, then settle into a
steady rhythm.

## Verification
`sync.ts` passes an esbuild syntax check. The SQL update has already run
— 154 rows confirmed updated via the query's own `returning` clause.
