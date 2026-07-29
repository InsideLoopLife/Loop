# Combined update: investment pricing fixes + pension layout redesign

Applied against your latest uploaded codebase (LOOPING.zip) — verified
byte-identical on all six files before patching, so nothing here needed
reworking.

## 1. Investment pricing fixes
- `lib/investments/market-data.ts` — single-letter tickers (O, C, etc.) can
  no longer fuzzy-match an unrelated glossary entry; a known exchange-traded
  ticker can never be silently swapped for a different fetch symbol.
- `app/api/investments/history/route.ts` — the synthetic history estimate
  is discarded (not stretched) when its own coverage is too thin; a genuine
  previous-close basis is used for whole-portfolio "1D" change, not just
  single holdings; response now carries `change.reliable` / `estimateOnly`.
- `components/investments/AmplifiedInvestmentsDashboard.tsx` — the headline
  badge only trusts the chart estimate when the server says it's reliable,
  and raises the bar for its own per-holding move calc (20%+ swings need
  ~97% coverage, not 55%).

No Supabase migration needed for this half — already applied directly to
your `vuqlgderfszguttdnxsr` project earlier in this thread.

## 2. Pension layout redesign
- `components/investments/PensionPerformanceOverview.tsx` (new) — the
  stocks-style header, clickable fund ticker/detail cards, provider
  allocation bars, and honest "not enough history yet" chart placeholder.
- `components/investments/PensionsInvestmentsClient.tsx` — swaps the old
  3-card grid for the new component; adds `glossary_id` to `PensionFund`
  and a new optional `pensionFundPriceChanges` prop.
- `app/investments/page.tsx` — selects `glossary_id` on pension_funds,
  looks up each fund's latest applied row in
  `provider_fund_price_change_log`, passes it down.

Nothing here is wired to your upcoming cron backfill script yet — the
chart stays in its honest empty state until that lands. Once you share it,
next step is wiring a real chart into the placeholder using whatever shape
that backfill produces.

## Verification
All six files pass an esbuild syntax check. Not a full `tsc`/build — run
your normal build before deploying.
