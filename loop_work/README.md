# Daily pension pricing, real management charges, forward accuracy

## What this actually does

1. **Real daily price snapshots.** `pension_fund_price_snapshots` (migration
   already applied live to your Supabase project — this file is just for
   your repo history) stores one row per fund per day, same pattern as
   `investment_instrument_price_points` for stocks. Never overwritten.
   Every purchase from today onward can be priced against the exact day it
   happened, because that day's price is now actually on record.

2. **A parser that doesn't guess.** The old `extractPriceAndFeeFromText`
   took the first "Price ####p" match anywhere on the page — but L&G's
   fund-centre pages routinely show 2-4 share-class prices stacked
   together, confirmed by hand tonight. The new version
   (`lib/investments/pension-provider-fetch.ts`) only auto-applies a price
   when either (a) there's genuinely only one price on the page, or (b) it
   can match the exact configured fund name against the page's heading
   list. Anything ambiguous is reported as `needsReview`, not silently
   picked.

   **Honest caveat:** the heading-matching logic was written to work
   against raw HTML tag boundaries (`>text<`), based on how these pages'
   markdown-rendered structure looked when I fetched them by hand tonight
   — but I've never seen L&G's actual raw HTML directly, only that
   rendered view. It should work; it hasn't been proven against a live
   fetch. First real cron run's `needsReview` count is the thing to check.

3. **Monthly management charges, modelled for real.**
   `lib/investments/pension-management-charges.ts` — confirmed via your own
   L&G statement that a charge (~£22-26/month in your case) lands on the
   1st, sized off fund value, not a flat fee. Was completely unmodeled
   before. Now: `(annual_fee_percent / 12) × fund value`, applied by
   cancelling units at current price, recorded as a negative row in the
   same `pension_contribution_events` ledger real contributions use.
   Idempotent — checks for an existing charge this calendar month before
   applying another.

4. **Units are now always derived, never patched.** Both new jobs
   recompute `pension_funds.units` by re-summing every event for that
   fund, every time — contributions minus charges. This is the fix for
   the actual root cause of tonight's discrepancy: units had become a
   separately-stored number that could silently drift from what the
   ledger justified. That's now structurally impossible for anything this
   job touches.

## What's wired where

- `app/api/cron/pensions-daily/route.ts` — now runs, in order: price
  snapshot → provider refresh → contribution projection → management
  charges. Same cron you still need to actually deploy in Render (see the
  earlier `loop-pensions-daily` service spec from earlier tonight — this
  package doesn't change that requirement, it's what runs once that cron
  exists).
- `app/api/investments/fund-research/route.ts` — the "AI check" button
  now uses the same shared, improved parser instead of its own
  duplicate copy. Confidence scoring is now honest about ambiguous
  multi-share-class pages instead of a flat 76.

## Deliberately not built tonight

- **The editable-purchase-point UI** (click a specific row to edit
  date/amount/price rather than a sequential flow) — this is a real,
  separate frontend build, not something to rush in alongside a database
  migration and three new backend jobs in one pass. The data model is
  ready for it (`pension_contribution_events` already has everything an
  edit form needs); the actual component is next.
- **Historical backfill** for dates before today — deliberately
  deprioritised per your steer: forward accuracy matters, historical is
  nice-to-have. The snapshot table starts capturing from today; nothing
  retroactively fills in April/May/earlier.
- Extending this to PensionBee or any non-L&G provider — the fetch module
  only knows how to read L&G's fund-centre pages right now.
