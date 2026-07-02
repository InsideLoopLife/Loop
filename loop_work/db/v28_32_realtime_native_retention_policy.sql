-- v28.32 - Native market snapshots and market-open anchored retention
-- Safe to rerun after v28.31.

-- Holding-level snapshots keep GBP compatibility fields, but native_* is the source quote.
alter table if exists public.investment_holdings
  add column if not exists native_exchange text;

alter table if exists public.investment_price_snapshots
  add column if not exists native_price numeric(18,8),
  add column if not exists native_value numeric(18,4),
  add column if not exists native_currency text,
  add column if not exists fx_rate_to_gbp numeric(18,10),
  add column if not exists fx_source text,
  add column if not exists bucket_interval text not null default 'raw';

-- Backfill legacy rows as GBP-native so older charts still survive compaction.
update public.investment_price_snapshots
set native_price = coalesce(native_price, price),
    native_value = coalesce(native_value, value),
    native_currency = coalesce(nullif(native_currency, ''), 'GBP'),
    fx_rate_to_gbp = coalesce(fx_rate_to_gbp, 1),
    fx_source = coalesce(nullif(fx_source, ''), 'legacy GBP-compatible snapshot')
where native_price is null
   or native_value is null
   or native_currency is null
   or fx_rate_to_gbp is null;

-- SnapTrade/imported holdings with tickers should be eligible for market quote polling too.
-- Provider sync still updates units/accounts; market polling updates the native quoted price history.
update public.investment_holdings
set price_polling_enabled = true,
    updated_at = now()
where ticker is not null
  and coalesce(nullif(trim(ticker), ''), '') <> ''
  and coalesce(record_status, 'active') <> 'archived'
  and coalesce(price_polling_enabled, false) = false;

-- Every tier can be refreshed every minute; product tiering can still be changed later by Admin settings.
insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('investment_snapshots_enabled', 'true', 'Whether LOOP automatically stores investment price/value chart points.'),
  ('investment_global_raw_price_points', 'true', 'Store one native quote point per ticker/exchange so duplicate holdings reuse the same price.'),
  ('investment_snapshots_realtime_users_only', 'false', 'When true, only realtime-entitled users get automatic investment chart point storage.'),
  ('investment_realtime_minutes_between_points', '1', 'Minutes between points for realtime market-data users.'),
  ('investment_plus_pro_minutes_between_points', '1', 'Minutes between points for Plus/Pro users.'),
  ('investment_free_minutes_between_points', '1', 'Minutes between points for free/basic users.'),
  ('investment_retention_minute_days', '1', 'Keep raw minute-by-minute points for this many days.'),
  ('investment_retention_intraday_bucket_minutes', '15', 'After the raw minute window, keep one point every N market-open-anchored minutes. 15 means :00/:15/:30/:45 style buckets.'),
  ('investment_retention_intraday_days', '7', 'Keep intraday bucket points until this many days old.'),
  ('investment_retention_hourly_days', '30', 'After intraday buckets, keep one hourly point until this many days old.'),
  ('investment_retention_weekly_after_years', '5', 'After this many years, compact daily points to one weekly point.'),
  ('investment_snapshots_retain_days', '36500', 'Legacy cap only; v28.32 keeps old history compacted instead of deleting it by age.'),
  ('investment_snapshots_max_points_per_holding', '200000', 'Legacy emergency cap only; retention should compact points before this is needed.')
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    description = excluded.description;

create or replace function public.loop_investment_market_timezone(p_exchange text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when upper(coalesce(p_exchange, '')) in ('NASDAQ','NYSE','AMEX','XNAS','XNYS','XASE','US') then 'America/New_York'
    when upper(coalesce(p_exchange, '')) in ('LSE','XLON','XLSE','LON') then 'Europe/London'
    else 'UTC'
  end;
$$;

create or replace function public.loop_investment_market_open_anchor(p_exchange text, p_at timestamptz)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  tz text := public.loop_investment_market_timezone(p_exchange);
  local_day date := (p_at at time zone public.loop_investment_market_timezone(p_exchange))::date;
  open_time time;
  local_open timestamp;
begin
  open_time := case
    when upper(coalesce(p_exchange, '')) in ('NASDAQ','NYSE','AMEX','XNAS','XNYS','XASE','US') then time '09:30'
    when upper(coalesce(p_exchange, '')) in ('LSE','XLON','XLSE','LON') then time '08:00'
    else time '09:00'
  end;
  local_open := local_day + open_time;
  return local_open at time zone tz;
end;
$$;

create index if not exists investment_price_snapshots_retention_idx
  on public.investment_price_snapshots(holding_id, snapshot_at desc, bucket_interval);

create index if not exists investment_instrument_price_points_retention_idx
  on public.investment_instrument_price_points(ticker, exchange_code, point_at desc, bucket_interval);

create or replace function public.loop_admin_compact_investment_instrument_price_points()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  minute_days int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_minute_days'), 1);
  intraday_bucket_minutes int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_intraday_bucket_minutes'), 15);
  intraday_days int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_intraday_days'), 7);
  hourly_days int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_hourly_days'), 30);
  weekly_after_years int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_weekly_after_years'), 5);
  deleted_intraday int := 0;
  deleted_hourly int := 0;
  deleted_daily int := 0;
  deleted_weekly int := 0;
begin
  intraday_bucket_minutes := greatest(1, least(intraday_bucket_minutes, 60));
  minute_days := greatest(1, minute_days);
  intraday_days := greatest(minute_days + 1, intraday_days);
  hourly_days := greatest(intraday_days + 1, hourly_days);
  weekly_after_years := greatest(1, weekly_after_years);

  -- >1d to <=7d: keep one point per 15-minute bucket anchored to that market's open.
  with ranked as (
    select id,
           row_number() over (
             partition by ticker,
                          exchange_code,
                          (point_at at time zone public.loop_investment_market_timezone(exchange_code))::date,
                          floor(extract(epoch from (point_at - public.loop_investment_market_open_anchor(exchange_code, point_at))) / (intraday_bucket_minutes * 60))
             order by point_at desc, created_at desc
           ) as rn
    from public.investment_instrument_price_points
    where point_at < now() - make_interval(days => minute_days)
      and point_at >= now() - make_interval(days => intraday_days)
  ), deleted as (
    delete from public.investment_instrument_price_points p
    using ranked r
    where p.id = r.id and r.rn > 1
    returning p.id
  ) select count(*) into deleted_intraday from deleted;

  update public.investment_instrument_price_points
  set bucket_interval = intraday_bucket_minutes::text || 'm'
  where point_at < now() - make_interval(days => minute_days)
    and point_at >= now() - make_interval(days => intraday_days)
    and bucket_interval <> intraday_bucket_minutes::text || 'm';

  -- >7d to <=30d: keep one point per market-open-anchored hour.
  with ranked as (
    select id,
           row_number() over (
             partition by ticker,
                          exchange_code,
                          (point_at at time zone public.loop_investment_market_timezone(exchange_code))::date,
                          floor(extract(epoch from (point_at - public.loop_investment_market_open_anchor(exchange_code, point_at))) / (60 * 60))
             order by point_at desc, created_at desc
           ) as rn
    from public.investment_instrument_price_points
    where point_at < now() - make_interval(days => intraday_days)
      and point_at >= now() - make_interval(days => hourly_days)
  ), deleted as (
    delete from public.investment_instrument_price_points p
    using ranked r
    where p.id = r.id and r.rn > 1
    returning p.id
  ) select count(*) into deleted_hourly from deleted;

  update public.investment_instrument_price_points
  set bucket_interval = '1h'
  where point_at < now() - make_interval(days => intraday_days)
    and point_at >= now() - make_interval(days => hourly_days)
    and bucket_interval <> '1h';

  -- >30d to <5y: keep one daily close/latest point per local market day.
  with ranked as (
    select id,
           row_number() over (
             partition by ticker,
                          exchange_code,
                          (point_at at time zone public.loop_investment_market_timezone(exchange_code))::date
             order by point_at desc, created_at desc
           ) as rn
    from public.investment_instrument_price_points
    where point_at < now() - make_interval(days => hourly_days)
      and point_at >= now() - make_interval(years => weekly_after_years)
  ), deleted as (
    delete from public.investment_instrument_price_points p
    using ranked r
    where p.id = r.id and r.rn > 1
    returning p.id
  ) select count(*) into deleted_daily from deleted;

  update public.investment_instrument_price_points
  set bucket_interval = '1d'
  where point_at < now() - make_interval(days => hourly_days)
    and point_at >= now() - make_interval(years => weekly_after_years)
    and bucket_interval <> '1d';

  -- 5y+: keep one point per local market week; do not delete the whole history.
  with ranked as (
    select id,
           row_number() over (
             partition by ticker,
                          exchange_code,
                          date_trunc('week', point_at at time zone public.loop_investment_market_timezone(exchange_code))::date
             order by point_at desc, created_at desc
           ) as rn
    from public.investment_instrument_price_points
    where point_at < now() - make_interval(years => weekly_after_years)
  ), deleted as (
    delete from public.investment_instrument_price_points p
    using ranked r
    where p.id = r.id and r.rn > 1
    returning p.id
  ) select count(*) into deleted_weekly from deleted;

  update public.investment_instrument_price_points
  set bucket_interval = '1w'
  where point_at < now() - make_interval(years => weekly_after_years)
    and bucket_interval <> '1w';

  return jsonb_build_object(
    'ok', true,
    'policy', 'raw minute points for 1 day; 15m market-open buckets to 7 days; 1h to 30 days; 1d to 5 years; 1w after 5 years',
    'minute_days', minute_days,
    'intraday_bucket_minutes', intraday_bucket_minutes,
    'intraday_days', intraday_days,
    'hourly_days', hourly_days,
    'weekly_after_years', weekly_after_years,
    'deleted_intraday_duplicates', deleted_intraday,
    'deleted_hourly_duplicates', deleted_hourly,
    'deleted_daily_duplicates', deleted_daily,
    'deleted_weekly_duplicates', deleted_weekly
  );
end;
$$;

create or replace function public.loop_admin_prune_investment_price_snapshots()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  minute_days int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_minute_days'), 1);
  intraday_bucket_minutes int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_intraday_bucket_minutes'), 15);
  intraday_days int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_intraday_days'), 7);
  hourly_days int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_hourly_days'), 30);
  weekly_after_years int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_weekly_after_years'), 5);
  deleted_intraday int := 0;
  deleted_hourly int := 0;
  deleted_daily int := 0;
  deleted_weekly int := 0;
begin
  intraday_bucket_minutes := greatest(1, least(intraday_bucket_minutes, 60));
  minute_days := greatest(1, minute_days);
  intraday_days := greatest(minute_days + 1, intraday_days);
  hourly_days := greatest(intraday_days + 1, hourly_days);
  weekly_after_years := greatest(1, weekly_after_years);

  -- >1d to <=7d: keep one point per 15-minute bucket anchored to that market's open.
  with ranked as (
    select s.id,
           row_number() over (
             partition by s.holding_id,
                          (s.snapshot_at at time zone public.loop_investment_market_timezone(coalesce(h.exchange, h.native_exchange, '')))::date,
                          floor(extract(epoch from (s.snapshot_at - public.loop_investment_market_open_anchor(coalesce(h.exchange, h.native_exchange, ''), s.snapshot_at))) / (intraday_bucket_minutes * 60))
             order by s.snapshot_at desc, s.created_at desc
           ) as rn
    from public.investment_price_snapshots s
    left join public.investment_holdings h on h.id = s.holding_id
    where s.snapshot_at < now() - make_interval(days => minute_days)
      and s.snapshot_at >= now() - make_interval(days => intraday_days)
  ), deleted as (
    delete from public.investment_price_snapshots s
    using ranked r
    where s.id = r.id and r.rn > 1
    returning s.id
  ) select count(*) into deleted_intraday from deleted;

  update public.investment_price_snapshots s
  set bucket_interval = intraday_bucket_minutes::text || 'm'
  where s.snapshot_at < now() - make_interval(days => minute_days)
    and s.snapshot_at >= now() - make_interval(days => intraday_days)
    and s.bucket_interval <> intraday_bucket_minutes::text || 'm';

  -- >7d to <=30d: keep one point per market-open-anchored hour.
  with ranked as (
    select s.id,
           row_number() over (
             partition by s.holding_id,
                          (s.snapshot_at at time zone public.loop_investment_market_timezone(coalesce(h.exchange, h.native_exchange, '')))::date,
                          floor(extract(epoch from (s.snapshot_at - public.loop_investment_market_open_anchor(coalesce(h.exchange, h.native_exchange, ''), s.snapshot_at))) / (60 * 60))
             order by s.snapshot_at desc, s.created_at desc
           ) as rn
    from public.investment_price_snapshots s
    left join public.investment_holdings h on h.id = s.holding_id
    where s.snapshot_at < now() - make_interval(days => intraday_days)
      and s.snapshot_at >= now() - make_interval(days => hourly_days)
  ), deleted as (
    delete from public.investment_price_snapshots s
    using ranked r
    where s.id = r.id and r.rn > 1
    returning s.id
  ) select count(*) into deleted_hourly from deleted;

  update public.investment_price_snapshots s
  set bucket_interval = '1h'
  where s.snapshot_at < now() - make_interval(days => intraday_days)
    and s.snapshot_at >= now() - make_interval(days => hourly_days)
    and s.bucket_interval <> '1h';

  -- >30d to <5y: keep one daily point per local market day.
  with ranked as (
    select s.id,
           row_number() over (
             partition by s.holding_id,
                          (s.snapshot_at at time zone public.loop_investment_market_timezone(coalesce(h.exchange, h.native_exchange, '')))::date
             order by s.snapshot_at desc, s.created_at desc
           ) as rn
    from public.investment_price_snapshots s
    left join public.investment_holdings h on h.id = s.holding_id
    where s.snapshot_at < now() - make_interval(days => hourly_days)
      and s.snapshot_at >= now() - make_interval(years => weekly_after_years)
  ), deleted as (
    delete from public.investment_price_snapshots s
    using ranked r
    where s.id = r.id and r.rn > 1
    returning s.id
  ) select count(*) into deleted_daily from deleted;

  update public.investment_price_snapshots s
  set bucket_interval = '1d'
  where s.snapshot_at < now() - make_interval(days => hourly_days)
    and s.snapshot_at >= now() - make_interval(years => weekly_after_years)
    and s.bucket_interval <> '1d';

  -- 5y+: keep one point per local market week; no age-based delete.
  with ranked as (
    select s.id,
           row_number() over (
             partition by s.holding_id,
                          date_trunc('week', s.snapshot_at at time zone public.loop_investment_market_timezone(coalesce(h.exchange, h.native_exchange, '')))::date
             order by s.snapshot_at desc, s.created_at desc
           ) as rn
    from public.investment_price_snapshots s
    left join public.investment_holdings h on h.id = s.holding_id
    where s.snapshot_at < now() - make_interval(years => weekly_after_years)
  ), deleted as (
    delete from public.investment_price_snapshots s
    using ranked r
    where s.id = r.id and r.rn > 1
    returning s.id
  ) select count(*) into deleted_weekly from deleted;

  update public.investment_price_snapshots s
  set bucket_interval = '1w'
  where s.snapshot_at < now() - make_interval(years => weekly_after_years)
    and s.bucket_interval <> '1w';

  return jsonb_build_object(
    'ok', true,
    'policy', 'raw minute points for 1 day; 15m market-open buckets to 7 days; 1h to 30 days; 1d to 5 years; 1w after 5 years',
    'minute_days', minute_days,
    'intraday_bucket_minutes', intraday_bucket_minutes,
    'intraday_days', intraday_days,
    'hourly_days', hourly_days,
    'weekly_after_years', weekly_after_years,
    'deleted_intraday_duplicates', deleted_intraday,
    'deleted_hourly_duplicates', deleted_hourly,
    'deleted_daily_duplicates', deleted_daily,
    'deleted_weekly_duplicates', deleted_weekly,
    'deleted_by_age', 0,
    'deleted_by_cap', 0
  );
end;
$$;

notify pgrst, 'reload schema';
