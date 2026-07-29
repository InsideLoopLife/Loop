# v28.37 Market coverage dashboard + realtime hover polish

This update wires the investment admin market browser to the persisted market venue and alias tables, adds a searchable default-six market layout, surfaces paused coverage-required holdings, and improves investment card realtime status.

## Included

- `app/admin/investment-coverage/page.tsx` rebuilt to read `investment_market_venues`, `investment_market_aliases`, holdings, and coverage request queues.
- Markets show only 6 by default, with search and View all.
- `Manual/source coverage` is renamed conceptually to `Quote sources / pricing coverage`.
- Coverage-required holdings are surfaced for admin review instead of AI/web-search.
- Investment holding cards now show last checked status in the market pill tooltip.
- Mini history charts auto-refresh every minute.
- Restored/improved `/api/investments/history` route with global venue-aware Yahoo symbols for non-UK markets.
- SQL: `db/v28_37_market_coverage_ui_realtime_status.sql`.

## Expected behaviour

Known stocks update from deterministic quote providers. Unknown/unmapped holdings stay paused with `coverage_required` and appear in admin. No worker AI/web-search is required.
