-- v28.54: portfolio movement from market-open/first-point baseline, worker SnapTrade repair, LoopWatch mini-AI metadata.

alter table if exists public.investment_holdings
  add column if not exists day_open_price_gbp numeric,
  add column if not exists day_open_native_price numeric,
  add column if not exists day_open_at timestamptz,
  add column if not exists day_change_basis text default 'open';

alter table if exists public.investment_price_snapshots
  add column if not exists day_open_price_gbp numeric,
  add column if not exists day_open_native_price numeric,
  add column if not exists day_open_at timestamptz,
  add column if not exists day_change_basis text default 'open';

comment on column public.investment_holdings.day_change_basis is
  'v28.54: movement basis shown to users. open = market open / first stored point today. previous_close retained only as provider metadata.';
comment on column public.investment_price_snapshots.day_change_basis is
  'v28.54: movement basis for this snapshot. open = market open / first stored point today.';

create index if not exists idx_investment_price_points_listing_point_at_asc
  on public.investment_instrument_price_points(listing_id, point_at asc);

create index if not exists idx_investment_price_points_symbol_point_at_asc
  on public.investment_instrument_price_points(ticker, exchange_code, point_at asc);

-- Keep old rows understandable in the UI.
update public.investment_holdings
set day_change_basis = coalesce(day_change_basis, 'open')
where day_change_basis is null;

update public.investment_price_snapshots
set day_change_basis = coalesce(day_change_basis, 'open')
where day_change_basis is null;
