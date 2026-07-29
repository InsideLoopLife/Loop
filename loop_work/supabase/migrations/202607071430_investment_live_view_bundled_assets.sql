-- v28.64 Investment live-view polish and bundled asset UI
-- No schema changes required. This migration is a version marker for UI/worker-log changes:
-- - grouped duplicate holdings by ticker/ISIN/exchange in the live investment view
-- - weighted average cost basis display where present
-- - stronger logo resolution/fallbacks for instrument badges
-- - renamed command-centre labels to live-view/portfolio-view language
-- - clarified worker logs: one global quote can produce multiple holding-value snapshots
select 'v28_64_investment_live_view_bundled_assets_no_schema' as migration_marker;
