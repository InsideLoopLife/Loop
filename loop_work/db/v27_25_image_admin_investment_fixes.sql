-- V27.25 - Image, admin setup and investment holding compatibility fixes

-- Some deployments already use this field in the investment UI/actions. Add it idempotently so
-- older databases do not throw: "Could not find the 'asset_kind' column".
alter table if exists public.investment_holdings
  add column if not exists asset_kind text default 'share';

alter table if exists public.investment_holdings
  add column if not exists native_latest_price numeric,
  add column if not exists native_currency text,
  add column if not exists native_exchange text,
  add column if not exists price_quote_unit text default 'gbp',
  add column if not exists price_polling_enabled boolean default true,
  add column if not exists import_source_type text,
  add column if not exists isin text,
  add column if not exists target_allocation_percent numeric default 0;

create index if not exists investment_holdings_asset_kind_idx
  on public.investment_holdings(asset_kind);

comment on column public.investment_holdings.asset_kind is
  'share, fund, etf, trust, bond, cash or other. Added for investment pot holding editing and search.';
