# LOOP v28.91 — Investment history, logos, activity threads and UI integrity

## Visible investment UI changes

- Portfolio and asset charts now use padded axes, internal labels and contained date/value ticks.
- Diversification movement percentages sit inside the green/red bars to prevent overlaps.
- The side-panel Other view has an expand control; the full view uses the available screen.
- The missing-cost-basis editor is now a full-screen native LOOP surface rather than a narrow contrasting drawer.
- Cost basis is entered in the instrument's native quote convention (for example GBX/pence, USD, EUR or GBP) and converted to GBP internally for consolidated reporting.
- History evidence is collapsed into a compact disclosure instead of four large grey status cards.
- Holding logos use a server-side provider/company resolver with a generated initials fallback.
- Each holding detail includes an activity thread for provider purchases, sales, dividends and reinvestments plus manually stored lots.

## History waterfall

For 1D, 5D, 1M, 6M, YTD, 1Y, 5Y and MAX, LOOP checks:

1. Complete cash-flow-aware portfolio snapshots.
2. Shared instrument history already stored in LOOP.
3. Direct delayed market history for recognised symbols/funds.
4. A labelled current-value baseline only when a defensible history cannot be evidenced.

History responses and browser requests are cached briefly, common holding ranges are prefetched, and the old timestamp cache-buster has been removed.

## Daily percentage basis

One-day movement now prefers the previous market close. It no longer compares the latest price with the first intraday/opening point when previous-close evidence exists.

## Manual refresh integrity

Manual Refresh prices now:

- refreshes holdings concurrently rather than serially;
- records price-check status and timestamp;
- stores native and GBP prices;
- gives all snapshots from the run one shared batch ID so complete portfolio history can be recognised.

## SnapTrade activity

The activity import paginates up to 5,000 provider activities per account and deduplicates by provider activity ID. BUY, REI/reinvestment and stock-dividend events can materialise auditable purchase lots when the broker supplies enough information.

## Database

No new migration is required. This release uses fields introduced by the v28.65-v28.88 investment migrations.
