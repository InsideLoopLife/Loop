-- v28.06 - Admin controlled investment chart point storage and DB usage reporting
-- Safe to rerun after v28.05.

insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('investment_snapshots_enabled', 'true', 'Whether LOOP automatically stores investment price/value chart points.'),
  ('investment_snapshots_min_minutes', '15', 'Minimum minutes between automatic stored points for a holding.'),
  ('investment_snapshots_retain_days', '365', 'How many days of investment chart points to retain.'),
  ('investment_snapshots_max_points_per_holding', '5000', 'Maximum stored chart points to keep per holding after pruning.'),
  ('investment_snapshots_market_hours_only', 'true', 'Whether automatic market quote snapshots only run during rough market hours.'),
  ('investment_snapshots_realtime_users_only', 'false', 'Whether automatic chart point storage is limited to realtime-entitled users.')
on conflict (setting_key) do update
set description = excluded.description;

create or replace function public.loop_admin_investment_snapshot_usage()
returns table (
  rows bigint,
  holdings bigint,
  users bigint,
  total_bytes bigint,
  table_bytes bigint,
  index_bytes bigint,
  newest timestamptz,
  oldest timestamptz,
  avg_rows_per_holding numeric
)
language sql
security definer
set search_path = public
as $$
  with stats as (
    select
      count(*)::bigint as rows,
      count(distinct holding_id)::bigint as holdings,
      count(distinct user_id)::bigint as users,
      max(snapshot_at) as newest,
      min(snapshot_at) as oldest
    from public.investment_price_snapshots
  )
  select
    stats.rows,
    stats.holdings,
    stats.users,
    pg_total_relation_size('public.investment_price_snapshots')::bigint as total_bytes,
    pg_relation_size('public.investment_price_snapshots')::bigint as table_bytes,
    (pg_total_relation_size('public.investment_price_snapshots') - pg_relation_size('public.investment_price_snapshots'))::bigint as index_bytes,
    stats.newest,
    stats.oldest,
    case when stats.holdings > 0 then round(stats.rows::numeric / stats.holdings::numeric, 2) else 0 end as avg_rows_per_holding
  from stats;
$$;

create or replace function public.loop_admin_prune_investment_price_snapshots()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  retain_days int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_snapshots_retain_days'), 365);
  max_points int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_snapshots_max_points_per_holding'), 5000);
  deleted_by_age int := 0;
  deleted_by_cap int := 0;
begin
  with deleted as (
    delete from public.investment_price_snapshots
    where snapshot_at < now() - make_interval(days => greatest(retain_days, 1))
    returning id
  ) select count(*) into deleted_by_age from deleted;

  with ranked as (
    select id, row_number() over (partition by holding_id order by snapshot_at desc, created_at desc) as rn
    from public.investment_price_snapshots
  ), deleted as (
    delete from public.investment_price_snapshots s
    using ranked r
    where s.id = r.id and r.rn > greatest(max_points, 10)
    returning s.id
  ) select count(*) into deleted_by_cap from deleted;

  return jsonb_build_object(
    'ok', true,
    'retain_days', retain_days,
    'max_points_per_holding', max_points,
    'deleted_by_age', deleted_by_age,
    'deleted_by_cap', deleted_by_cap
  );
end;
$$;
