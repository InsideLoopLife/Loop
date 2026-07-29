-- v27.91 - Savings provider typeahead, deal metadata and eligibility matching
-- Adds open-ended/boosted savings account metadata plus tables for logged savings deals and user provider relationships.

alter table if exists public.financial_accounts
  add column if not exists provider_slug text,
  add column if not exists savings_product_name text,
  add column if not exists interest_rate numeric(7,4),
  add column if not exists interest_rate_end_date date,
  add column if not exists top_up_day integer,
  add column if not exists monthly_top_up_amount numeric(14,2),
  add column if not exists opening_balance_assumption numeric(14,2),
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists account_status text default 'active',
  add column if not exists notes text,
  add column if not exists deal_duration_mode text default 'ongoing',
  add column if not exists savings_rate_deal_id uuid,
  add column if not exists source_deal_url text,
  add column if not exists eligibility_note text;

create table if not exists public.user_financial_provider_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_slug text not null,
  provider_name text,
  relationship_type text not null default 'existing_customer',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider_slug)
);

create table if not exists public.savings_rate_deals (
  id uuid primary key default gen_random_uuid(),
  provider_slug text,
  provider_name text,
  product_name text,
  account_type text default 'savings',
  gross_aer numeric,
  bonus_rate numeric,
  minimum_balance numeric,
  maximum_balance numeric,
  monthly_max_deposit numeric,
  requires_existing_customer boolean not null default false,
  eligible_provider_slug text,
  eligibility_note text,
  deal_duration_mode text not null default 'ongoing',
  rate_end_date date,
  source_url text,
  source_name text,
  detected_by text not null default 'admin',
  confidence integer default 50,
  status text not null default 'active',
  ai_summary text,
  admin_notes text,
  last_checked_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_financial_provider_relationships_user on public.user_financial_provider_relationships(user_id);
create index if not exists idx_user_financial_provider_relationships_provider on public.user_financial_provider_relationships(provider_slug);
create index if not exists idx_savings_rate_deals_provider on public.savings_rate_deals(provider_slug);
create index if not exists idx_savings_rate_deals_status on public.savings_rate_deals(status);
create index if not exists idx_savings_rate_deals_rate on public.savings_rate_deals(gross_aer desc nulls last);

alter table public.user_financial_provider_relationships enable row level security;
alter table public.savings_rate_deals enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_financial_provider_relationships' and policyname = 'Users manage their own provider relationships'
  ) then
    create policy "Users manage their own provider relationships"
      on public.user_financial_provider_relationships
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'savings_rate_deals' and policyname = 'Authenticated users can read active savings deals'
  ) then
    create policy "Authenticated users can read active savings deals"
      on public.savings_rate_deals
      for select
      using (auth.uid() is not null and status = 'active');
  end if;
end $$;

-- Keep provider relationship rows updated when users add a savings account with a provider slug.
-- v27.91.1: qualify financial_accounts columns so Postgres does not confuse source
-- columns with the target insert column list, and make the migration safe when v27.87
-- has not already added provider_slug to financial_accounts.
insert into public.user_financial_provider_relationships(user_id, provider_slug, provider_name, relationship_type, is_active)
select distinct
  fa.user_id,
  fa.provider_slug,
  coalesce(nullif(fa.provider, ''), fa.provider_slug),
  'existing_customer',
  true
from public.financial_accounts fa
where fa.provider_slug is not null
  and fa.provider_slug <> ''
  and coalesce(fa.is_liability, false) = false
on conflict (user_id, provider_slug) do update
set provider_name = coalesce(excluded.provider_name, public.user_financial_provider_relationships.provider_name),
    is_active = true,
    updated_at = now();

-- Helper view for future admin/AI deal matching. This is intentionally read-only and safe to recreate.
drop view if exists public.loop_savings_deal_match_preview;
create view public.loop_savings_deal_match_preview as
select
  fa.user_id,
  fa.id as account_id,
  fa.provider_slug as current_provider_slug,
  fa.provider as current_provider_name,
  fa.name as account_label,
  fa.savings_product_name,
  fa.current_balance,
  fa.interest_rate as current_rate,
  d.id as deal_id,
  d.provider_slug as deal_provider_slug,
  d.provider_name as deal_provider_name,
  d.product_name as deal_product_name,
  d.gross_aer as deal_rate,
  case
    when d.gross_aer is null or fa.interest_rate is null then null
    else d.gross_aer - fa.interest_rate
  end as rate_delta,
  d.requires_existing_customer,
  exists (
    select 1
    from public.user_financial_provider_relationships r
    where r.user_id = fa.user_id
      and r.is_active = true
      and (r.provider_slug = d.provider_slug or r.provider_slug = d.eligible_provider_slug)
  ) as eligibility_known,
  d.eligibility_note,
  d.source_url,
  d.last_checked_at
from public.financial_accounts fa
join public.savings_rate_deals d on d.status = 'active'
where coalesce(fa.is_liability, false) = false
  and coalesce(fa.account_type, '') not in ('current_account');
