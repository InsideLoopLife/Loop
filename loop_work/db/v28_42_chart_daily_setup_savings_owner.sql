-- v28.42 chart daily movement, setup suppression and savings owner allocation support

-- Ensure profile onboarding fields exist so completed checklists can disappear automatically.
alter table if exists public.app_user_profiles
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_skipped_at timestamptz;

-- Ensure savings account person/scope fields exist.
alter table if exists public.financial_accounts
  add column if not exists owner_person_id uuid,
  add column if not exists ownership_scope text default 'household',
  add column if not exists savings_limit_scope text default 'individual',
  add column if not exists visibility_scope text default 'household';

create index if not exists financial_accounts_owner_person_idx
  on public.financial_accounts(owner_person_id);

create index if not exists financial_accounts_savings_scope_idx
  on public.financial_accounts(ownership_scope, savings_limit_scope, visibility_scope);

-- Add chart/daily movement columns where older schemas do not yet have them.
alter table if exists public.investment_holdings
  add column if not exists previous_close_price_gbp numeric,
  add column if not exists previous_close_native_price numeric,
  add column if not exists previous_close_native_currency text,
  add column if not exists previous_close_at timestamptz,
  add column if not exists day_change_gbp numeric,
  add column if not exists day_change_percent numeric,
  add column if not exists day_change_native numeric,
  add column if not exists day_change_native_percent numeric,
  add column if not exists latest_fx_rate_to_gbp numeric,
  add column if not exists latest_fx_source text;

alter table if exists public.investment_price_snapshots
  add column if not exists previous_close_price_gbp numeric,
  add column if not exists previous_close_native_price numeric,
  add column if not exists previous_close_at timestamptz,
  add column if not exists day_change_gbp numeric,
  add column if not exists day_change_percent numeric,
  add column if not exists day_change_native numeric,
  add column if not exists day_change_native_percent numeric;

-- Backfill previous-close fields from latest available prior stored point where possible.
with latest_prior as (
  select distinct on (h.id)
    h.id as holding_id,
    s.price as previous_close_price_gbp,
    s.native_price as previous_close_native_price,
    s.native_currency as previous_close_native_currency,
    coalesce(s.snapshot_at, s.created_at) as previous_close_at
  from public.investment_holdings h
  join public.investment_price_snapshots s on s.holding_id = h.id
  where coalesce(s.snapshot_at, s.created_at) < date_trunc('day', now())
    and coalesce(s.price, 0) > 0
  order by h.id, coalesce(s.snapshot_at, s.created_at) desc
)
update public.investment_holdings h
set previous_close_price_gbp = coalesce(h.previous_close_price_gbp, lp.previous_close_price_gbp),
    previous_close_native_price = coalesce(h.previous_close_native_price, lp.previous_close_native_price),
    previous_close_native_currency = coalesce(h.previous_close_native_currency, lp.previous_close_native_currency),
    previous_close_at = coalesce(h.previous_close_at, lp.previous_close_at),
    day_change_gbp = case
      when h.previous_close_price_gbp is null and lp.previous_close_price_gbp > 0 and h.latest_price is not null then h.latest_price - lp.previous_close_price_gbp
      else h.day_change_gbp
    end,
    day_change_percent = case
      when h.previous_close_price_gbp is null and lp.previous_close_price_gbp > 0 and h.latest_price is not null then ((h.latest_price - lp.previous_close_price_gbp) / lp.previous_close_price_gbp) * 100
      else h.day_change_percent
    end,
    updated_at = coalesce(h.updated_at, now())
from latest_prior lp
where h.id = lp.holding_id;
