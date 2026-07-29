-- v28.56 Realtime market sweep + logo/source badge repair
-- Safe to run more than once.

-- Re-enable holdings that older market-worker versions paused after a temporary quote miss.
-- v28.56 keeps retrying deterministic quote coverage instead of permanently switching polling off.
update public.investment_holdings
set
  price_polling_enabled = true,
  price_check_status = case
    when price_check_status = 'coverage_required' then 'coverage_retry'
    else coalesce(price_check_status, 'queued')
  end,
  instrument_resolution_notes = trim(coalesce(instrument_resolution_notes, '') || case
    when coalesce(instrument_resolution_notes, '') ilike '%v28.56%' then ''
    else ' v28.56: polling re-enabled so realtime workers can retry deterministic coverage.'
  end),
  updated_at = now()
where ticker is not null
  and coalesce(record_status, 'active') <> 'archived'
  and price_polling_enabled is false
  and (
    price_check_status in ('coverage_required', 'coverage_retry')
    or instrument_resolution_status = 'coverage_required'
  );

-- Ensure the beta realtime tier has a 1-minute target in the database settings too.
create table if not exists public.wealth_watch_settings (
  setting_key text primary key,
  setting_value text,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.wealth_watch_settings
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now();

insert into public.wealth_watch_settings(setting_key, setting_value, description, updated_at)
values
  ('investment_snapshots_enabled', 'true', 'Stores investment price/value points for charts and daily movement.', now()),
  ('investment_realtime_minutes_between_points', '1', 'Target minutes between points for realtime-enabled users.', now()),
  ('investment_global_raw_price_points', 'true', 'Stores one global price point per listing/minute, then fans out to user holdings.', now()),
  ('investment_snapshots_market_hours_only', 'true', 'Avoids logging closed-market flat lines except when forced manually.', now()),
  ('investment_snapshots_min_minutes', '1', 'Allows realtime tiers to keep one-minute points.', now())
on conflict (setting_key) do update set
  setting_value = excluded.setting_value,
  description = excluded.description,
  updated_at = now();
