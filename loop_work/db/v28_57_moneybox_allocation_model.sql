-- V28.57 Moneybox allocation model
-- Adds provider-specific storage for Moneybox allocation/contribution rules.
-- Run after v28_56_realtime_market_logo_source_hotfix.sql.

alter table if exists public.investment_accounts
  add column if not exists provider_import_enabled boolean not null default false,
  add column if not exists sync_status text,
  add column if not exists last_provider_sync_at timestamptz;

alter table if exists public.investment_holdings
  add column if not exists external_provider text,
  add column if not exists external_position_raw jsonb,
  add column if not exists import_source_type text;

alter table if exists public.investment_purchase_lots
  add column if not exists external_transaction_id text,
  add column if not exists external_source text,
  add column if not exists total_cost numeric(14,2),
  add column if not exists fees numeric(14,2) not null default 0;

create table if not exists public.moneybox_portfolio_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid not null references public.investment_accounts(id) on delete cascade,
  contribution_amount numeric(14,2) not null default 0,
  contribution_frequency text not null default 'weekly' check (contribution_frequency in ('weekly','fortnightly','monthly','quarterly','one_off','variable')),
  contribution_start_date date not null default current_date,
  estimated_execution_lag_days integer not null default 7,
  current_total_value numeric(14,2),
  current_total_value_date date,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, investment_account_id)
);

create table if not exists public.moneybox_portfolio_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid not null references public.investment_accounts(id) on delete cascade,
  rule_id uuid references public.moneybox_portfolio_rules(id) on delete cascade,
  asset_key text not null,
  asset_name text not null,
  provider_name text,
  asset_kind text not null default 'fund',
  ticker text,
  exchange text,
  isin text,
  annual_asset_fee_percent numeric(8,4) not null default 0,
  allocation_percent numeric(8,4) not null default 0 check (allocation_percent >= 0 and allocation_percent <= 100),
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, investment_account_id, asset_key)
);

create table if not exists public.moneybox_value_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid not null references public.investment_accounts(id) on delete cascade,
  holding_id uuid references public.investment_holdings(id) on delete set null,
  asset_key text,
  correction_date date not null default current_date,
  corrected_total_value numeric(14,2),
  corrected_asset_value numeric(14,2),
  corrected_units numeric(22,8),
  corrected_price numeric(18,8),
  note text,
  created_at timestamptz not null default now()
);

alter table public.moneybox_portfolio_rules enable row level security;
alter table public.moneybox_portfolio_allocations enable row level security;
alter table public.moneybox_value_corrections enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='moneybox_portfolio_rules' and policyname='Users can read their own moneybox rules') then
    create policy "Users can read their own moneybox rules" on public.moneybox_portfolio_rules for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='moneybox_portfolio_rules' and policyname='Users can insert their own moneybox rules') then
    create policy "Users can insert their own moneybox rules" on public.moneybox_portfolio_rules for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='moneybox_portfolio_rules' and policyname='Users can update their own moneybox rules') then
    create policy "Users can update their own moneybox rules" on public.moneybox_portfolio_rules for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='moneybox_portfolio_rules' and policyname='Users can delete their own moneybox rules') then
    create policy "Users can delete their own moneybox rules" on public.moneybox_portfolio_rules for delete using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='moneybox_portfolio_allocations' and policyname='Users can read their own moneybox allocations') then
    create policy "Users can read their own moneybox allocations" on public.moneybox_portfolio_allocations for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='moneybox_portfolio_allocations' and policyname='Users can insert their own moneybox allocations') then
    create policy "Users can insert their own moneybox allocations" on public.moneybox_portfolio_allocations for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='moneybox_portfolio_allocations' and policyname='Users can update their own moneybox allocations') then
    create policy "Users can update their own moneybox allocations" on public.moneybox_portfolio_allocations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='moneybox_portfolio_allocations' and policyname='Users can delete their own moneybox allocations') then
    create policy "Users can delete their own moneybox allocations" on public.moneybox_portfolio_allocations for delete using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='moneybox_value_corrections' and policyname='Users can read their own moneybox corrections') then
    create policy "Users can read their own moneybox corrections" on public.moneybox_value_corrections for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='moneybox_value_corrections' and policyname='Users can insert their own moneybox corrections') then
    create policy "Users can insert their own moneybox corrections" on public.moneybox_value_corrections for insert with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists moneybox_portfolio_rules_user_account_idx on public.moneybox_portfolio_rules(user_id, investment_account_id);
create index if not exists moneybox_portfolio_allocations_user_account_idx on public.moneybox_portfolio_allocations(user_id, investment_account_id);
create index if not exists moneybox_value_corrections_user_account_idx on public.moneybox_value_corrections(user_id, investment_account_id, correction_date desc);
create index if not exists investment_purchase_lots_moneybox_model_idx on public.investment_purchase_lots(user_id, external_source, holding_id, purchase_date);

update public.investment_provider_glossary
set offerings = '[{"value":"isa","label":"Stocks & Shares ISA"},{"value":"lisa","label":"Stocks & Shares Lifetime ISA"},{"value":"gia","label":"GIA"},{"value":"junior_isa","label":"Junior ISA"},{"value":"private","label":"Personal Pension"}]'::jsonb,
    default_annual_platform_fee_percent = 0.45,
    default_fixed_monthly_fee = 1,
    supports_pies = true,
    supports_fractional_shares = true,
    supports_fund_search = true,
    docs = '[{"label":"Moneybox funds","url":"https://www.moneyboxapp.com/funds/"},{"label":"Moneybox fees","url":"https://www.moneyboxapp.com/fees/"}]'::jsonb,
    notes = 'Moneybox is modelled from fund/ETF allocation, contribution amount and estimated settlement delay. Users can manually anchor total value or edit each inferred holding.',
    updated_at = now()
where id = 'moneybox';

notify pgrst, 'reload schema';
