-- v27.5 - Affordability lab, investment pot ownership editing, funds-as-holdings and 15 minute price history.

alter table if exists investment_holdings
  add column if not exists asset_kind text not null default 'share',
  add column if not exists isin text,
  add column if not exists price_polling_enabled boolean not null default true,
  add column if not exists last_price_check_at timestamptz,
  add column if not exists price_check_status text;

alter table if exists investment_holdings
  drop constraint if exists investment_holdings_asset_kind_check;

alter table if exists investment_holdings
  add constraint investment_holdings_asset_kind_check
  check (asset_kind in ('share', 'etf', 'fund', 'crypto', 'other'));

alter table if exists investment_price_snapshots
  add column if not exists snapshot_at timestamptz not null default now();

alter table if exists investment_price_snapshots
  drop constraint if exists investment_price_snapshots_user_id_holding_id_snapshot_date_key;

create index if not exists investment_price_snapshots_user_holding_at_idx
  on investment_price_snapshots(user_id, holding_id, snapshot_at desc);

create unique index if not exists investment_price_snapshots_user_holding_at_unique
  on investment_price_snapshots(user_id, holding_id, snapshot_at);

create index if not exists investment_holdings_price_polling_idx
  on investment_holdings(user_id, price_polling_enabled, ticker)
  where price_polling_enabled = true and ticker is not null;

alter table if exists affordability_scenarios
  add column if not exists request_text text,
  add column if not exists scenario_kind text,
  add column if not exists assistant_summary text,
  add column if not exists questions_json jsonb not null default '[]'::jsonb,
  add column if not exists assumptions_json jsonb not null default '[]'::jsonb,
  add column if not exists answer_log jsonb not null default '{}'::jsonb;
