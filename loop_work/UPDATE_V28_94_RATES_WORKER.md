# v28.94 — combined savings, mortgage and daily maintenance cron

- The standalone Render rates worker now ingests both savings and mortgage
  catalogues directly into Supabase.
- Savings validation requires a coherent product identity plus the fields
  appropriate to the product type. Regular savers require their monthly maximum
  and term before they can auto-publish.
- Savings deal cards display both monthly minimum and maximum allowances and
  continue to calculate the maximum modelled interest across the deal term.
- Mortgage auto-publication requires rate, initial term, LTV and product fee.
- Rates significantly outside the recent active mortgage catalogue are marked
  for review rather than entering user shortlists.
- A missing product becomes pending withdrawal first and expires only after
  three successful source observations in which it remains absent.
- Failed sources remain due for retry and no longer fail the entire Render run.
- User-specific scheduled work is called through protected app routes when
  `APP_BASE_URL` and `CRON_SECRET` are configured.
- The existing market-data worker remains responsible for investment prices,
  SnapTrade snapshots, coverage and retention so these high-frequency writes
  are not duplicated.

Apply `db/v28_94_rates_worker_mortgage_savings_cron.sql` before deploying the
new worker.
