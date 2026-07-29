-- v28.24 - Global raw investment price points, tier cadence/compaction, ticker coverage requests and savings flow backfill
-- Safe to rerun.

create extension if not exists pgcrypto;

create table if not exists public.investment_instruments (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  exchange_code text not null default '',
  exchange_name text,
  isin text,
  asset_name text not null,
  asset_kind text not null default 'share',
  currency_code text not null default 'GBP',
  quote_unit text not null default 'gbp',
  logo_domain text,
  source_url text,
  coverage_status text not null default 'needs_review',
  confidence numeric(5,2),
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investment_instruments_unique unique (ticker, exchange_code)
);

create index if not exists investment_instruments_status_idx on public.investment_instruments(coverage_status, updated_at desc);
create index if not exists investment_instruments_isin_idx on public.investment_instruments(isin) where isin is not null;

create table if not exists public.investment_instrument_price_points (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid references public.investment_instruments(id) on delete set null,
  ticker text not null,
  exchange_code text not null default '',
  price_gbp numeric(18,8) not null default 0,
  native_price numeric(18,8),
  native_currency text,
  quote_unit text,
  point_date date not null default current_date,
  point_at timestamptz not null default now(),
  bucket_interval text not null default 'raw',
  source text,
  source_url text,
  source_confidence numeric(5,2),
  created_at timestamptz not null default now()
);

create index if not exists investment_instrument_price_points_key_time_idx
  on public.investment_instrument_price_points(ticker, exchange_code, point_at desc);
create index if not exists investment_instrument_price_points_instrument_time_idx
  on public.investment_instrument_price_points(instrument_id, point_at desc);
create index if not exists investment_instrument_price_points_bucket_idx
  on public.investment_instrument_price_points(bucket_interval, point_at desc);

alter table public.investment_instruments enable row level security;
alter table public.investment_instrument_price_points enable row level security;

drop policy if exists "investment instruments authenticated read" on public.investment_instruments;
create policy "investment instruments authenticated read" on public.investment_instruments
for select to authenticated using (true);

drop policy if exists "investment price points authenticated read" on public.investment_instrument_price_points;
create policy "investment price points authenticated read" on public.investment_instrument_price_points
for select to authenticated using (true);

-- Writes are server-side only with service role. Do not grant user insert/update policies.

insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('investment_global_raw_price_points', 'true', 'Store one shared raw share-price point per ticker/exchange, not one independent market point per user holding.'),
  ('investment_realtime_minutes_between_points', '1', 'Realtime/paid market-data users can trigger one-minute shared price points.'),
  ('investment_plus_pro_minutes_between_points', '15', 'Plus/Pro users use 15-minute shared price points.'),
  ('investment_free_minutes_between_points', '30', 'Free users use 30-minute shared price points and manual refresh may reuse a current global point.'),
  ('investment_manual_refresh_uses_latest_global', 'true', 'Manual refresh can reuse the latest global raw-price point where available instead of re-fetching.'),
  ('investment_point_retention_ladder', '15m_31d__30m_180d__1h_365d__12h_730d__1d_older', 'Automatic compaction ladder for global investment price points.')
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    description = excluded.description;

create or replace function public.loop_admin_investment_price_point_usage()
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
      count(distinct (ticker || '|' || exchange_code))::bigint as holdings,
      0::bigint as users,
      max(point_at) as newest,
      min(point_at) as oldest
    from public.investment_instrument_price_points
  )
  select
    stats.rows,
    stats.holdings,
    stats.users,
    coalesce(pg_total_relation_size('public.investment_instrument_price_points'),0)::bigint as total_bytes,
    coalesce(pg_relation_size('public.investment_instrument_price_points'),0)::bigint as table_bytes,
    (coalesce(pg_total_relation_size('public.investment_instrument_price_points'),0) - coalesce(pg_relation_size('public.investment_instrument_price_points'),0))::bigint as index_bytes,
    stats.newest,
    stats.oldest,
    case when stats.holdings > 0 then round(stats.rows::numeric / stats.holdings::numeric, 2) else 0 end as avg_rows_per_holding
  from stats;
$$;

create or replace function public.loop_admin_compact_investment_instrument_price_points()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_30m int := 0;
  deleted_1h int := 0;
  deleted_12h int := 0;
  deleted_1d int := 0;
  deleted_old int := 0;
begin
  -- Keep raw/15-minute style points untouched for the first month.
  -- 1-6 months: keep one point per 30 minute bucket.
  with ranked as (
    select id,
           row_number() over (partition by ticker, exchange_code, floor(extract(epoch from (point_at - (date_trunc('day', point_at) + case when exchange_code in ('NASDAQ','NYSE','AMEX') then interval '14 hours 30 minutes' else interval '8 hours' end))) / (30*60)) order by point_at desc, created_at desc) as rn
    from public.investment_instrument_price_points
    where point_at < now() - interval '31 days'
      and point_at >= now() - interval '180 days'
  ), deleted as (
    delete from public.investment_instrument_price_points p
    using ranked r
    where p.id = r.id and r.rn > 1
    returning p.id
  ) select count(*) into deleted_30m from deleted;

  update public.investment_instrument_price_points
  set bucket_interval = '30m'
  where point_at < now() - interval '31 days'
    and point_at >= now() - interval '180 days'
    and bucket_interval = 'raw';

  -- 6-12 months: keep one point per hour.
  with ranked as (
    select id,
           row_number() over (partition by ticker, exchange_code, floor(extract(epoch from (point_at - (date_trunc('day', point_at) + case when exchange_code in ('NASDAQ','NYSE','AMEX') then interval '14 hours 30 minutes' else interval '8 hours' end))) / (60*60)) order by point_at desc, created_at desc) as rn
    from public.investment_instrument_price_points
    where point_at < now() - interval '180 days'
      and point_at >= now() - interval '365 days'
  ), deleted as (
    delete from public.investment_instrument_price_points p
    using ranked r
    where p.id = r.id and r.rn > 1
    returning p.id
  ) select count(*) into deleted_1h from deleted;

  update public.investment_instrument_price_points
  set bucket_interval = '1h'
  where point_at < now() - interval '180 days'
    and point_at >= now() - interval '365 days'
    and bucket_interval in ('raw','30m');

  -- 1-2 years: keep one point per half day.
  with ranked as (
    select id,
           row_number() over (partition by ticker, exchange_code, floor(extract(epoch from (point_at - (date_trunc('day', point_at) + case when exchange_code in ('NASDAQ','NYSE','AMEX') then interval '14 hours 30 minutes' else interval '8 hours' end))) / (12*60*60)) order by point_at desc, created_at desc) as rn
    from public.investment_instrument_price_points
    where point_at < now() - interval '365 days'
      and point_at >= now() - interval '730 days'
  ), deleted as (
    delete from public.investment_instrument_price_points p
    using ranked r
    where p.id = r.id and r.rn > 1
    returning p.id
  ) select count(*) into deleted_12h from deleted;

  update public.investment_instrument_price_points
  set bucket_interval = '12h'
  where point_at < now() - interval '365 days'
    and point_at >= now() - interval '730 days'
    and bucket_interval in ('raw','30m','1h');

  -- 2 years+: keep one point per day.
  with ranked as (
    select id,
           row_number() over (partition by ticker, exchange_code, point_date order by point_at desc, created_at desc) as rn
    from public.investment_instrument_price_points
    where point_at < now() - interval '730 days'
      and point_at >= now() - interval '5 years'
  ), deleted as (
    delete from public.investment_instrument_price_points p
    using ranked r
    where p.id = r.id and r.rn > 1
    returning p.id
  ) select count(*) into deleted_1d from deleted;

  update public.investment_instrument_price_points
  set bucket_interval = '1d'
  where point_at < now() - interval '730 days'
    and point_at >= now() - interval '5 years'
    and bucket_interval in ('raw','30m','1h','12h');

  with deleted as (
    delete from public.investment_instrument_price_points
    where point_at < now() - interval '5 years'
    returning id
  ) select count(*) into deleted_old from deleted;

  return jsonb_build_object(
    'ok', true,
    'retention', '15m first 31d, 30m to 180d, 1h to 365d, 12h to 730d, 1d after 2y; buckets anchored to market-open baseline',
    'deleted_30m', deleted_30m,
    'deleted_1h', deleted_1h,
    'deleted_12h', deleted_12h,
    'deleted_1d', deleted_1d,
    'deleted_old', deleted_old
  );
end;
$$;

-- Ensure newer planner fields exist before savings-linked planned items are backfilled.
alter table if exists public.planned_items
  add column if not exists payment_timing text,
  add column if not exists payment_adjustment text,
  add column if not exists end_behavior text,
  add column if not exists renewal_notice_days integer,
  add column if not exists brand_name text,
  add column if not exists brand_logo_url text,
  add column if not exists brand_logo_source text,
  add column if not exists brand_logo_checked_at timestamptz;

-- Allow savings/investment planned transfers in older installs that still have the original item_type constraint.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'planned_items_item_type_check') then
    alter table public.planned_items drop constraint planned_items_item_type_check;
  end if;
  alter table public.planned_items add constraint planned_items_item_type_check
  check (item_type in ('salary_topup','child_benefit','dividend','bonus','interest','subscription','utilities','mobile_phone','insurance','mortgage_rent','childcare','school_activity','grocery','transport','healthcare','debt_payment','saving_investment','monthly_cost','bill','one_off','manual_income','transfer'));
end $$;

-- Backfill recurring savings top-ups into financial flow.
alter table if exists public.spending_categories
  add column if not exists category_icon text;

insert into public.spending_categories(user_id, name, type, category_icon, monthly_budget)
select distinct fa.user_id, 'Savings', 'saving', '💰', 0
from public.financial_accounts fa
where coalesce(fa.is_liability,false) = false
  and coalesce(fa.monthly_top_up_amount,0) > 0
  and not exists (
    select 1 from public.spending_categories c
    where c.user_id = fa.user_id and lower(c.name) = 'savings'
  );

insert into public.planned_items(
  user_id, person_id, category_id, direction, item_type, label, amount, recurrence,
  start_date, end_date, day_of_month, payment_timing, payment_adjustment,
  brand_name, brand_logo_source, notes, created_at, updated_at
)
select
  fa.user_id,
  null,
  c.id,
  'outgoing',
  'saving_investment',
  left('Savings transfer: ' || coalesce(nullif(fa.name,''), nullif(fa.savings_product_name,''), nullif(fa.provider,''), 'Savings account'), 140),
  fa.monthly_top_up_amount,
  'monthly',
  coalesce(fa.start_date, current_date),
  coalesce(fa.end_date, fa.interest_rate_end_date),
  least(28, greatest(1, coalesce(fa.top_up_day, 1))),
  'fixed_day',
  'previous_workday',
  coalesce(nullif(fa.provider,''), 'Savings'),
  'savings_link',
  '[linked_savings_account:' || fa.id || '] Planned monthly transfer created from savings account top-up settings.',
  now(),
  now()
from public.financial_accounts fa
left join public.spending_categories c on c.user_id = fa.user_id and lower(c.name) = 'savings'
where coalesce(fa.is_liability,false) = false
  and coalesce(fa.monthly_top_up_amount,0) > 0
  and not exists (
    select 1 from public.planned_items p
    where p.user_id = fa.user_id
      and p.notes ilike '%[linked_savings_account:' || fa.id || ']%'
  );

-- Expand AI market request workflow metadata so the UI can show progress.
alter table if exists public.loop_investment_ai_market_requests
  add column if not exists request_query text,
  add column if not exists exchange_hint text,
  add column if not exists progress jsonb not null default '{}'::jsonb,
  add column if not exists match_confidence numeric(5,2);

insert into public.app_future_integration_tasks(product_key, task_key, section, title, description, priority, status, metadata)
values
  ('investments', 'global-raw-price-point-store', 'chart-storage', 'Store raw ticker prices globally', 'Use investment_instrument_price_points for one raw ticker/exchange price history shared by all users. User holdings multiply units by these shared points.', 130, 'todo', '{"release":"v28.24"}'::jsonb),
  ('investments', 'tiered-investment-cadence', 'chart-storage', 'Tiered investment refresh cadence', 'Realtime users: 1 minute. Plus/Pro: 15 minutes. Free: 30 minutes plus manual latest-point refresh. Compaction runs automatically.', 131, 'todo', '{"release":"v28.24"}'::jsonb),
  ('savings', 'savings-topups-blue-flow', 'planner-sync', 'Show savings top-ups as blue flow transfers', 'Recurring savings top-ups should appear in Financial Flow as saving/investment transfers, not red spending.', 132, 'todo', '{"release":"v28.24"}'::jsonb)
on conflict (product_key, task_key) do update
set description = excluded.description,
    priority = excluded.priority,
    metadata = public.app_future_integration_tasks.metadata || excluded.metadata,
    updated_at = now();

notify pgrst, 'reload schema';
