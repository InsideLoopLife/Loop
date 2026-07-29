-- V27.32 - Investment 15-minute price snapshots, Yahoo fund code support and chart compatibility

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

create index if not exists investment_holdings_polling_ticker_exchange_idx
  on public.investment_holdings(ticker, exchange)
  where price_polling_enabled = true and ticker is not null;

create table if not exists public.investment_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  holding_id uuid not null references public.investment_holdings(id) on delete cascade,
  price numeric(14,6) not null default 0,
  units numeric(16,8) not null default 0,
  value numeric(18,4) not null default 0,
  snapshot_date date not null default current_date,
  snapshot_at timestamptz not null default now(),
  source text,
  created_at timestamptz not null default now()
);


-- Compatibility for databases where the table already existed before snapshot_at was added.
alter table if exists public.investment_price_snapshots
  add column if not exists snapshot_at timestamptz;

update public.investment_price_snapshots
set snapshot_at = coalesce(created_at, snapshot_date::timestamptz, now())
where snapshot_at is null;

alter table if exists public.investment_price_snapshots
  alter column snapshot_at set default now();

alter table if exists public.investment_price_snapshots
  alter column snapshot_at set not null;

alter table public.investment_price_snapshots enable row level security;

do $$
begin
  create policy investment_price_snapshots_select_own on public.investment_price_snapshots for select using ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy investment_price_snapshots_insert_own on public.investment_price_snapshots for insert with check ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

create index if not exists investment_price_snapshots_user_holding_at_idx
  on public.investment_price_snapshots(user_id, holding_id, snapshot_at desc);

create index if not exists investment_price_snapshots_holding_at_idx
  on public.investment_price_snapshots(holding_id, snapshot_at desc);

-- Compatibility view for wording used in some planning notes / Gemini snippets.
-- The app writes to investment_price_snapshots, and this view exposes the same history as stock_price_history.
create or replace view public.stock_price_history as
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
