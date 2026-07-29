begin;

-- Savings-pot visual journey fields. Older code can now create a core pot even before
-- this migration, but these columns preserve the full image, goal and priority context.
alter table if exists public.savings_pots add column if not exists person_id uuid references public.people(id) on delete set null;
alter table if exists public.savings_pots add column if not exists reference_image_url text;
alter table if exists public.savings_pots add column if not exists goal_type text;
alter table if exists public.savings_pots add column if not exists priority_is_important boolean not null default false;
alter table if exists public.savings_pots add column if not exists priority_score integer not null default 50;
alter table if exists public.savings_pots drop constraint if exists savings_pots_priority_score_check;
alter table if exists public.savings_pots add constraint savings_pots_priority_score_check check (priority_score between 1 and 100);

-- Preserve provider imagery and make broker cost-basis provenance explicit.
alter table if exists public.investment_holdings add column if not exists logo_url text;
alter table if exists public.investment_holdings add column if not exists cost_basis_status text;

-- SnapTrade activity ledger. This is deliberately separate from market price snapshots:
-- BUY/SELL/REI/DIVIDEND are cash-flow events, while snapshots describe valuation.
create table if not exists public.investment_provider_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid references public.investment_accounts(id) on delete cascade,
  provider text not null,
  external_account_id text,
  external_activity_id text not null,
  activity_type text not null,
  activity_date date not null,
  ticker text,
  units numeric,
  unit_price numeric,
  amount numeric,
  currency text,
  raw_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(user_id, provider, external_activity_id)
);
create index if not exists investment_provider_activities_user_date_idx
  on public.investment_provider_activities(user_id, activity_date desc);
create index if not exists investment_provider_activities_account_date_idx
  on public.investment_provider_activities(investment_account_id, activity_date desc);
alter table public.investment_provider_activities enable row level security;
drop policy if exists investment_provider_activities_owner on public.investment_provider_activities;
create policy investment_provider_activities_owner on public.investment_provider_activities
  for select using (auth.uid() = user_id);

-- Activity-derived lots are idempotent across daily refreshes.
create unique index if not exists investment_purchase_lots_external_activity_uidx
  on public.investment_purchase_lots(user_id, external_source, external_transaction_id)
  where external_transaction_id is not null;

-- Person-scoped projections. Legacy unassigned pension accounts are backfilled to the
-- signed-in person's self record where one can be identified unambiguously.
alter table if exists public.pension_accounts add column if not exists person_id uuid references public.people(id) on delete set null;
alter table if exists public.pension_contribution_events add column if not exists pension_account_id uuid references public.pension_accounts(id) on delete set null;
alter table if exists public.pension_fund_value_snapshots add column if not exists pension_account_id uuid references public.pension_accounts(id) on delete set null;

update public.pension_accounts pa
set person_id = (
  select p.id
  from public.people p
  where p.linked_user_id = pa.user_id
     or (p.user_id = pa.user_id and lower(coalesce(p.relationship, '')) = 'self')
  order by case when p.linked_user_id = pa.user_id then 0 else 1 end, p.id
  limit 1
)
where pa.person_id is null
  and exists (
    select 1 from public.people p
    where p.linked_user_id = pa.user_id
       or (p.user_id = pa.user_id and lower(coalesce(p.relationship, '')) = 'self')
  );

comment on table public.investment_provider_activities is
  'Provider transaction/activity history such as BUY, SELL, DIVIDEND and REI. Kept separate from valuation snapshots.';
comment on column public.investment_holdings.logo_url is
  'Provider-supplied or mapped asset logo URL. UI retains an initials fallback if the URL fails.';
comment on column public.pension_accounts.person_id is
  'Household person whose retirement projection owns this pension account.';

notify pgrst, 'reload schema';
commit;
