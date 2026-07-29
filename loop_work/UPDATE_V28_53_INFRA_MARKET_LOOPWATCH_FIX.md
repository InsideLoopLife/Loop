# v28.53 - Infra, market worker, previous close and LoopWatch school-date fix

## Why this exists
This release targets the issues seen during private beta/local testing:

- Supabase was still logging repeated `42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification` errors.
- The market-data worker was still logging an optional SnapTrade module import failure in Render.
- Realtime investment cards were showing stale too aggressively while the worker was still sweeping the portfolio.
- New holdings did not always have a previous-close baseline, so same-day movement could show `£0.00 / 0.00%` until a full prior day of snapshots existed.
- LoopWatch misclassified school term dates as a general contract and produced a hydration error on the opportunity dismiss button.

## Code changes

### Market worker
- Changed the optional SnapTrade dynamic import from `@/lib/snaptrade/sync` to a relative worker-safe import.
- Prices continue to run even if SnapTrade credentials are missing or SnapTrade fails.

### Investment pricing
- Added provider previous-close support to quote objects where Yahoo supplies `previousClose` / `chartPreviousClose`.
- If no historical previous-close point exists for a listing, the price snapshot runner seeds a provider previous-close point before creating the first live snapshot.
- Holdings and snapshots now receive previous-close movement on the first successful price import where the provider exposes it.
- UI stale threshold increased to avoid false stale badges during an active worker sweep.

### LoopWatch
- Improved school/term-date detection with stronger school calendar signals.
- LoopWatch now treats term dates, INSET days, academic year, autumn/spring/summer terms and school holidays as school-calendar evidence before falling back to general contract logic.
- School calendar and school agenda cards no longer pick up random small money values as monthly costs.
- Short provider hits such as `LV` are ignored unless the text really looks like insurance/provider content.
- Improved school-calendar parser for common `Autumn Term / Spring Term / Summer Term` tables.
- Fixed the hydration mismatch caused by the opportunity dismiss server-action button inside the main edit form.

## SQL added

Run:

```sql
-- db/v28_53_infra_market_loopwatch_repair.sql
```

Optional, after checking avatar/household image public URLs still load:

```sql
-- db/v28_53_optional_storage_listing_hardening.sql
```

## Validation performed

- `npm ci` completed.
- Targeted imports passed for the changed LoopWatch, market-data, price-runner and worker files.
- The worker boot test no longer shows the `Cannot find package '@/lib'` SnapTrade dynamic import error.
- `next build` compiled successfully, then timed out during the full TypeScript stage in this sandbox. No new changed-file import/syntax errors were found.
