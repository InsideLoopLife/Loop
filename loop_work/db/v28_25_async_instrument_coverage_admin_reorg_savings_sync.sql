-- v28.25 - Async instrument coverage placeholders, investment cadence visibility and savings-flow trigger
-- Safe to rerun.

create extension if not exists pgcrypto;

-- User-side placeholder that appears inside the selected investment pot while AI/admin resolves a no-match ticker/fund.
create table if not exists public.investment_instrument_coverage_placeholders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid not null,
  request_id uuid,
  instrument_id uuid,
  query text not null,
  exchange_hint text,
  status text not null default 'queued',
  eta_text text not null default 'Usually 2-10 minutes',
  progress jsonb not null default '{}'::jsonb,
  resolved_ticker text,
  resolved_exchange text,
  resolved_asset_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.investment_instrument_coverage_placeholders
  add column if not exists request_id uuid,
  add column if not exists instrument_id uuid,
  add column if not exists eta_text text not null default 'Usually 2-10 minutes',
  add column if not exists progress jsonb not null default '{}'::jsonb,
  add column if not exists resolved_ticker text,
  add column if not exists resolved_exchange text,
  add column if not exists resolved_asset_name text;

create index if not exists investment_coverage_placeholders_user_account_idx
  on public.investment_instrument_coverage_placeholders(user_id, investment_account_id, status, created_at desc);
create index if not exists investment_coverage_placeholders_request_idx
  on public.investment_instrument_coverage_placeholders(request_id) where request_id is not null;

alter table public.investment_instrument_coverage_placeholders enable row level security;

drop policy if exists "coverage placeholders own read" on public.investment_instrument_coverage_placeholders;
create policy "coverage placeholders own read" on public.investment_instrument_coverage_placeholders
for select to authenticated using (auth.uid() = user_id);

drop policy if exists "coverage placeholders own insert" on public.investment_instrument_coverage_placeholders;
create policy "coverage placeholders own insert" on public.investment_instrument_coverage_placeholders
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "coverage placeholders own update" on public.investment_instrument_coverage_placeholders;
create policy "coverage placeholders own update" on public.investment_instrument_coverage_placeholders
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table if exists public.loop_investment_ai_market_requests
  add column if not exists request_query text,
  add column if not exists exchange_hint text,
  add column if not exists progress jsonb not null default '{}'::jsonb,
  add column if not exists match_confidence numeric(5,2);

-- Earlier releases only allowed planned/sql_generated/applied/rejected. Coverage processing needs extra states.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'loop_investment_ai_market_requests_status_check') then
    alter table public.loop_investment_ai_market_requests drop constraint loop_investment_ai_market_requests_status_check;
  end if;
  alter table public.loop_investment_ai_market_requests add constraint loop_investment_ai_market_requests_status_check
  check (status in ('planned','queued','in_progress','needs_review','active','complete','completed','failed','sql_generated','applied','rejected'));
exception when duplicate_object then null;
end $$;


-- Settings that make it clear that the UI cadence depends on the scheduled route actually being called.
insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('investment_price_snapshot_cron_path', '/api/cron/investment-price-snapshots', 'Route that should be called every minute by Vercel Cron or an external scheduler. The job then decides which ticker/exchange groups are due by tier.'),
  ('investment_coverage_request_cron_path', '/api/cron/investment-coverage-requests', 'Route that processes queued user ticker/ETF coverage requests and updates pot placeholders.'),
  ('investment_coverage_request_eta_minutes', '2-10', 'User-facing estimate for most ticker/ETF coverage requests during development/beta.')
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    description = excluded.description;

-- Stronger savings transfer sync: DB trigger keeps monthly savings top-ups visible in financial flow.
-- Defensive column checks for savings account fields used by the trigger.
alter table if exists public.financial_accounts
  add column if not exists name text,
  add column if not exists provider text,
  add column if not exists savings_product_name text,
  add column if not exists monthly_top_up_amount numeric,
  add column if not exists top_up_day integer,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists interest_rate_end_date date,
  add column if not exists is_liability boolean default false;

alter table if exists public.planned_items
  add column if not exists payment_timing text,
  add column if not exists payment_adjustment text,
  add column if not exists end_behavior text,
  add column if not exists renewal_notice_days integer,
  add column if not exists brand_name text,
  add column if not exists brand_domain text,
  add column if not exists brand_logo_url text,
  add column if not exists brand_logo_source text,
  add column if not exists brand_logo_checked_at timestamptz;

alter table if exists public.spending_categories
  add column if not exists category_icon text;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'planned_items_item_type_check') then
    alter table public.planned_items drop constraint planned_items_item_type_check;
  end if;
  alter table public.planned_items add constraint planned_items_item_type_check
  check (item_type in ('salary_topup','child_benefit','dividend','bonus','interest','subscription','utilities','mobile_phone','insurance','mortgage_rent','childcare','school_activity','grocery','transport','healthcare','debt_payment','saving_investment','monthly_cost','bill','one_off','manual_income','transfer'));
exception when duplicate_object then null;
end $$;

create or replace function public.loop_sync_savings_topup_to_planner(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  c_id uuid;
  marker text;
  amount numeric;
  day_int integer;
begin
  select * into a from public.financial_accounts where id = p_account_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'account_not_found');
  end if;

  marker := '[linked_savings_account:' || a.id || ']';
  delete from public.planned_items
  where user_id = a.user_id
    and notes ilike '%' || marker || '%';

  amount := coalesce(a.monthly_top_up_amount, 0);
  if coalesce(a.is_liability, false) or amount <= 0 then
    return jsonb_build_object('ok', true, 'created', false, 'reason', 'no_monthly_savings_topup');
  end if;

  select id into c_id
  from public.spending_categories
  where user_id = a.user_id and lower(name) = 'savings'
  limit 1;

  if c_id is null then
    insert into public.spending_categories(user_id, name, type, category_icon, monthly_budget)
    values (a.user_id, 'Savings', 'saving', '💰', 0)
    returning id into c_id;
  end if;

  day_int := least(28, greatest(1, coalesce(a.top_up_day, 1)));

  insert into public.planned_items(
    user_id, person_id, category_id, direction, item_type, label, amount, recurrence,
    start_date, end_date, day_of_month, payment_timing, payment_adjustment,
    end_behavior, renewal_notice_days, brand_name, brand_domain, brand_logo_source,
    notes, created_at, updated_at
  ) values (
    a.user_id, null, c_id, 'outgoing', 'saving_investment',
    left('Savings transfer: ' || coalesce(nullif(a.name,''), nullif(a.savings_product_name,''), nullif(a.provider,''), 'Savings account'), 140),
    amount, 'monthly', coalesce(a.start_date, current_date), coalesce(a.end_date, a.interest_rate_end_date),
    day_int, 'fixed_day', 'previous_workday', case when coalesce(a.end_date, a.interest_rate_end_date) is null then 'renews' else 'drops_off' end,
    30, coalesce(nullif(a.provider,''), 'Savings'), null, 'savings_link',
    marker || ' Blue financial-flow transfer created from savings account top-up settings.', now(), now()
  );

  return jsonb_build_object('ok', true, 'created', true, 'amount', amount, 'day', day_int);
end;
$$;

create or replace function public.loop_financial_accounts_savings_topup_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.loop_sync_savings_topup_to_planner(new.id);
  return new;
end;
$$;

drop trigger if exists financial_accounts_savings_topup_sync on public.financial_accounts;
create trigger financial_accounts_savings_topup_sync
after insert or update of monthly_top_up_amount, top_up_day, start_date, end_date, interest_rate_end_date, provider, name, savings_product_name, is_liability
on public.financial_accounts
for each row execute function public.loop_financial_accounts_savings_topup_trigger();

-- Backfill all existing active savings top-ups.
select public.loop_sync_savings_topup_to_planner(id)
from public.financial_accounts
where coalesce(is_liability,false) = false
  and coalesce(monthly_top_up_amount,0) > 0;

-- Admin checklist tasks. Uses priority, not sort_order.
insert into public.app_future_integration_tasks(product_key, task_key, section, title, description, priority, status, metadata)
values
  ('investments', 'coverage-placeholders-eta', 'coverage', 'Show no-match ticker placeholders with ETA', 'When a user requests a ticker/ETF to be added, place a temporary placeholder in their pot and show the 2-10 minute coverage status steps.', 140, 'todo', '{"release":"v28.25"}'::jsonb),
  ('investments', 'one-minute-price-cron', 'chart-storage', 'Schedule one-minute investment price route', 'Call /api/cron/investment-price-snapshots every minute; the job decides per ticker whether realtime/plus/free cadence is due.', 141, 'todo', '{"release":"v28.25"}'::jsonb),
  ('financial_flow', 'savings-transfer-trigger', 'savings', 'Savings top-ups appear in spending/flow', 'Monthly savings top-ups are synced by trigger into planned_items as blue saving/investment transfers.', 142, 'todo', '{"release":"v28.25"}'::jsonb)
on conflict (product_key, task_key) do update
set description = excluded.description,
    priority = excluded.priority,
    metadata = public.app_future_integration_tasks.metadata || excluded.metadata,
    updated_at = now();

notify pgrst, 'reload schema';
