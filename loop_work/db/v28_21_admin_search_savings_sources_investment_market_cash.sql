-- LOOP v28.21 - Admin search, savings source universe, investment cash/market guardrails
-- Run after v28.20.

create table if not exists public.savings_rate_sources (
  id uuid primary key default gen_random_uuid(),
  provider_slug text not null,
  provider_name text not null,
  source_url text not null,
  source_kind text not null default 'provider_or_best_buy_page',
  product_hint text,
  status text not null default 'active',
  check_frequency_hours integer not null default 12,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider_slug, source_url),
  constraint savings_rate_sources_status_check check (status in ('active','paused','needs_review','failed','archived'))
);

alter table public.savings_rate_sources enable row level security;

drop policy if exists "Authenticated can read active savings sources" on public.savings_rate_sources;
create policy "Authenticated can read active savings sources" on public.savings_rate_sources
  for select using (auth.uid() is not null and status = 'active');

create index if not exists savings_rate_sources_provider_idx on public.savings_rate_sources(provider_slug, status);
create index if not exists savings_rate_sources_due_idx on public.savings_rate_sources(status, last_checked_at asc nulls first);

-- Upsert needs a deterministic unique key for source-derived rows.
create unique index if not exists savings_rate_deals_source_unique_idx
on public.savings_rate_deals(provider_slug, product_name, source_url)
where source_url is not null and product_name is not null;

alter table if exists public.investment_accounts
  add column if not exists provider_cash_value numeric,
  add column if not exists provider_investable_cash_value numeric,
  add column if not exists provider_dividend_cash_value numeric,
  add column if not exists provider_cash_source text,
  add column if not exists provider_isa_subscribed_amount numeric,
  add column if not exists provider_isa_remaining_amount numeric,
  add column if not exists provider_isa_allowance_year text,
  add column if not exists provider_last_transactions_sync_at timestamptz;

alter table if exists public.investment_holdings
  add column if not exists imported_result_value numeric,
  add column if not exists native_exchange text,
  add column if not exists native_currency text,
  add column if not exists native_latest_price numeric;

-- Normalise already-imported MIC codes so user-facing labels say LSE/NASDAQ/NYSE.
update public.investment_holdings
set exchange = case
  when upper(coalesce(exchange,'')) in ('XLON','XLSE','LON') then 'LSE'
  when upper(coalesce(exchange,'')) in ('XNAS','XNCM','XNGS','NMS','NGM','NAS','NASDAQGS') then 'NASDAQ'
  when upper(coalesce(exchange,'')) in ('XNYS','NYQ') then 'NYSE'
  when upper(coalesce(exchange,'')) in ('XASE','ASE','NYSEAMERICAN') then 'AMEX'
  else exchange
end
where upper(coalesce(exchange,'')) in ('XLON','XLSE','LON','XNAS','XNCM','XNGS','NMS','NGM','NAS','NASDAQGS','XNYS','NYQ','XASE','ASE','NYSEAMERICAN');

insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('savings_source_refresh_freshness_hours', '12', 'Do not re-check savings source pages more often than this unless forced by admin.'),
  ('mortgage_source_refresh_freshness_hours', '12', 'Do not re-check mortgage source pages more often than this unless forced by admin.'),
  ('investment_provider_sync_target_minutes', '60', 'Target cadence for broker/provider account sync when connected.'),
  ('investment_snapshot_target_minutes', '60', 'Target cadence for stored investment chart/value points.')
on conflict (setting_key) do update set description = excluded.description;

insert into public.app_future_integration_tasks(product_key, task_key, section, title, description, priority, status, metadata)
values
  ('investments', 'trading212-direct-api-cash-pl', 'cash-and-lots', 'Trading 212 direct API cash and P/L validation', 'Use Trading 212 account summary, positions, historical orders, dividend payments and cash transactions to improve cash buckets, ISA allowance, purchase lots and daily/true P/L when SnapTrade does not expose them.', 122, 'todo', '{}'::jsonb),
  ('savings', 'seed-uk-savings-source-universe', 'source-jobs', 'Seed UK savings source universe', 'Keep the default UK savings provider/best-buy source list active so admins do not have to paste each provider page individually.', 123, 'todo', '{}'::jsonb),
  ('mortgage', 'seed-uk-mortgage-source-universe', 'source-jobs', 'Seed UK mortgage source universe', 'Keep the default UK mortgage lender source list active so the catalogue refresh checks broad lender coverage without manual source entry.', 124, 'todo', '{}'::jsonb)
on conflict (product_key, task_key) do update set
  title = excluded.title,
  description = excluded.description,
  section = excluded.section,
  priority = excluded.priority,
  metadata = excluded.metadata;
