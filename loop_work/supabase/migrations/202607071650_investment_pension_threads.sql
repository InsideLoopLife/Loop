-- v28.65 - investment/pension ownership threads and safer portfolio movement UI
-- Ensures each stock/ETF/fund can expose a local thread of purchase lots and each pension pot can expose contribution events.

create table if not exists public.pension_contribution_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pension_account_id uuid references public.pension_accounts(id) on delete cascade,
  pension_fund_id uuid references public.pension_funds(id) on delete cascade,
  contribution_month text,
  contribution_date date not null default current_date,
  contribution_due_date date,
  investment_date date,
  contribution_amount numeric(14,2) not null default 0,
  employee_amount numeric(14,2) not null default 0,
  employer_amount numeric(14,2) not null default 0,
  employer_ni_topup_amount numeric(14,2) not null default 0,
  fixed_amount numeric(14,2) not null default 0,
  gross_pensionable_pay numeric(14,2),
  allocation_percent numeric(10,4),
  unit_price numeric(18,8),
  units_bought numeric(20,8),
  source text not null default 'manual',
  event_status text not null default 'invested',
  external_transaction_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.pension_contribution_events
  add column if not exists pension_account_id uuid references public.pension_accounts(id) on delete cascade,
  add column if not exists contribution_due_date date,
  add column if not exists investment_date date,
  add column if not exists employee_amount numeric(14,2) not null default 0,
  add column if not exists employer_amount numeric(14,2) not null default 0,
  add column if not exists employer_ni_topup_amount numeric(14,2) not null default 0,
  add column if not exists fixed_amount numeric(14,2) not null default 0,
  add column if not exists gross_pensionable_pay numeric(14,2),
  add column if not exists allocation_percent numeric(10,4),
  add column if not exists event_status text not null default 'invested',
  add column if not exists external_transaction_id text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.investment_purchase_lots
  add column if not exists contribution_date date,
  add column if not exists execution_date date,
  add column if not exists contribution_source text,
  add column if not exists allocation_percent numeric(10,4),
  add column if not exists native_purchase_price numeric(18,8),
  add column if not exists native_currency text,
  add column if not exists total_cost numeric(14,2),
  add column if not exists fees numeric(14,2),
  add column if not exists external_transaction_id text,
  add column if not exists external_source text,
  add column if not exists estimated boolean not null default false;

update public.pension_contribution_events
set contribution_due_date = coalesce(contribution_due_date, contribution_date),
    investment_date = coalesce(investment_date, contribution_date),
    contribution_month = coalesce(contribution_month, to_char(contribution_date, 'YYYY-MM'))
where contribution_due_date is null or investment_date is null or contribution_month is null;

update public.investment_purchase_lots
set contribution_date = coalesce(contribution_date, purchase_date),
    execution_date = coalesce(execution_date, purchase_date)
where contribution_date is null or execution_date is null;

alter table public.pension_contribution_events enable row level security;

do $$ begin
  create policy "pension_contribution_events_select_own" on public.pension_contribution_events for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pension_contribution_events_insert_own" on public.pension_contribution_events for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pension_contribution_events_update_own" on public.pension_contribution_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pension_contribution_events_delete_own" on public.pension_contribution_events for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create index if not exists pension_contribution_events_account_due_idx on public.pension_contribution_events(pension_account_id, contribution_due_date desc);
create index if not exists pension_contribution_events_fund_investment_idx on public.pension_contribution_events(pension_fund_id, investment_date desc);
create unique index if not exists pension_contribution_events_external_tx_uidx
  on public.pension_contribution_events(user_id, external_transaction_id)
  where external_transaction_id is not null;
create index if not exists investment_purchase_lots_holding_execution_idx on public.investment_purchase_lots(holding_id, execution_date desc);
create unique index if not exists investment_purchase_lots_external_tx_uidx
  on public.investment_purchase_lots(user_id, external_transaction_id)
  where external_transaction_id is not null;

comment on table public.pension_contribution_events is 'Per-pot/fund pension thread: salary sacrifice, employer, NI top-up, fixed and manual contribution events with unit price/units when known.';
comment on table public.investment_purchase_lots is 'Per-holding investment thread: each purchase tranche, source, cost and fee used to derive average price and manual reconciliation.';

notify pgrst, 'reload schema';
select 'v28_65_investment_pension_threads' as migration_marker;
