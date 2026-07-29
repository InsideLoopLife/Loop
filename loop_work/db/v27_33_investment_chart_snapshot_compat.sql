-- V27.33 - Investment chart/snapshot compatibility fix
-- Fixes DBs where investment_price_snapshots already exists but is missing snapshot_at.

alter table if exists public.investment_holdings
  add column if not exists asset_kind text default 'share',
  add column if not exists isin text,
  add column if not exists price_polling_enabled boolean default true,
  add column if not exists last_price_check_at timestamptz,
  add column if not exists price_check_status text,
  add column if not exists native_latest_price numeric,
  add column if not exists native_currency text,
  add column if not exists native_exchange text,
  add column if not exists price_quote_unit text default 'gbp';

create table if not exists public.investment_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  holding_id uuid not null references public.investment_holdings(id) on delete cascade,
  price numeric(14,6) not null default 0,
  units numeric(16,8) not null default 0,
  value numeric(18,4) not null default 0,
  snapshot_date date not null default current_date,
  source text,
  created_at timestamptz not null default now()
);

alter table if exists public.investment_price_snapshots
  add column if not exists snapshot_at timestamptz;

update public.investment_price_snapshots
set snapshot_at = coalesce(created_at, snapshot_date::timestamptz, now())
where snapshot_at is null;

alter table if exists public.investment_price_snapshots
  alter column snapshot_at set default now();

alter table if exists public.investment_price_snapshots
  alter column snapshot_at set not null;

alter table if exists public.investment_price_snapshots
  add column if not exists source text,
  add column if not exists created_at timestamptz not null default now();

alter table if exists public.investment_price_snapshots enable row level security;

do $$
begin
  create policy investment_price_snapshots_select_own on public.investment_price_snapshots
    for select using ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy investment_price_snapshots_insert_own on public.investment_price_snapshots
    for insert with check ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

create index if not exists investment_holdings_polling_ticker_exchange_idx
  on public.investment_holdings(ticker, exchange)
  where price_polling_enabled = true and ticker is not null;

create index if not exists investment_price_snapshots_user_holding_at_idx
  on public.investment_price_snapshots(user_id, holding_id, snapshot_at desc);

create index if not exists investment_price_snapshots_holding_at_idx
  on public.investment_price_snapshots(holding_id, snapshot_at desc);

drop view if exists public.stock_price_history;
create view public.stock_price_history as
select
  id,
  user_id,
  holding_id,
  price,
  units,
  value,
  snapshot_date,
  snapshot_at,
  source,
  created_at
from public.investment_price_snapshots;
