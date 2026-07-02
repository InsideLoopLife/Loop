-- v28.31 - Direct market-data worker hardening for manual holdings and retention
-- Safe to rerun after v28.30.

-- Manual holdings added before price polling existed should be treated as refreshable
-- when they have a ticker. SnapTrade/imported positions deliberately stay provider-led.
update public.investment_holdings
set price_polling_enabled = true,
    updated_at = coalesce(updated_at, now())
where ticker is not null
  and coalesce(nullif(trim(ticker), ''), '') <> ''
  and price_polling_enabled is null
  and coalesce(import_source_type, '') <> 'snaptrade'
  and coalesce(external_provider, '') <> 'snaptrade';

-- Helps the worker find manually-entered and refresh-enabled holdings quickly.
create index if not exists investment_holdings_market_worker_refresh_idx
on public.investment_holdings(user_id, ticker, exchange, last_price_check_at)
where ticker is not null
  and coalesce(price_polling_enabled, true) = true;

-- Settings used by the existing admin storage page / runner.
insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('investment_snapshots_enabled', 'true', 'Whether LOOP automatically stores investment price/value chart points.'),
  ('investment_global_raw_price_points', 'true', 'Store one global instrument quote point per ticker/exchange so duplicate user holdings reuse the same price.'),
  ('investment_snapshots_realtime_users_only', 'false', 'When true, only realtime-entitled users get automatic investment chart point storage.'),
  ('investment_realtime_minutes_between_points', '1', 'Minutes between points for realtime market-data users.'),
  ('investment_plus_pro_minutes_between_points', '15', 'Minutes between points for Plus/Pro users.'),
  ('investment_free_minutes_between_points', '30', 'Minutes between points for free/basic users.'),
  ('investment_snapshots_retain_days', '365', 'How many holding-level chart points to retain.'),
  ('investment_snapshots_max_points_per_holding', '5000', 'Maximum stored chart points to keep per holding after pruning.')
on conflict (setting_key) do update
set description = excluded.description;
