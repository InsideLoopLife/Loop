-- v27.43: payment tiers and market-data entitlements for share/ETF pricing

alter table if exists public.app_user_profiles
  add column if not exists payment_tier text not null default 'free',
  add column if not exists payment_tier_status text not null default 'inactive',
  add column if not exists payment_tier_override text,
  add column if not exists billing_provider text not null default 'manual',
  add column if not exists billing_customer_id text,
  add column if not exists billing_subscription_id text,
  add column if not exists market_data_tier text not null default 'manual',
  add column if not exists market_data_tier_override text,
  add column if not exists market_data_provider_status text not null default 'not_configured',
  add column if not exists market_data_realtime_enabled boolean not null default false,
  add column if not exists tier_checked_at timestamptz,
  add column if not exists tier_check_note text;

alter table if exists public.app_user_profiles
  drop constraint if exists app_user_profiles_payment_tier_check;
alter table if exists public.app_user_profiles
  add constraint app_user_profiles_payment_tier_check
  check (payment_tier in ('free','starter','plus','pro','realtime','enterprise'));

alter table if exists public.app_user_profiles
  drop constraint if exists app_user_profiles_payment_tier_status_check;
alter table if exists public.app_user_profiles
  add constraint app_user_profiles_payment_tier_status_check
  check (payment_tier_status in ('active','trialing','manual_review','past_due','cancelled','inactive'));

alter table if exists public.app_user_profiles
  drop constraint if exists app_user_profiles_market_data_tier_check;
alter table if exists public.app_user_profiles
  add constraint app_user_profiles_market_data_tier_check
  check (market_data_tier in ('manual','delayed','enhanced_delayed','realtime'));

create table if not exists public.app_customer_entitlement_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checked_by uuid references auth.users(id) on delete set null,
  check_kind text not null default 'manual_admin_check',
  payment_tier text,
  payment_tier_status text,
  market_data_tier text,
  provider_status text,
  result_status text not null default 'reviewed',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_market_data_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  symbol text,
  provider text,
  market_data_tier text,
  request_count integer not null default 1,
  cost_estimate_gbp numeric(12,4) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.app_customer_entitlement_checks enable row level security;
alter table public.app_market_data_usage enable row level security;

do $$
begin
  create policy app_customer_entitlement_checks_admin_select on public.app_customer_entitlement_checks
    for select using (app_is_admin());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy app_customer_entitlement_checks_admin_insert on public.app_customer_entitlement_checks
    for insert with check (app_is_admin());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy app_market_data_usage_own_select on public.app_market_data_usage
    for select using ((select auth.uid()) = user_id or app_is_admin());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy app_market_data_usage_own_insert on public.app_market_data_usage
    for insert with check ((select auth.uid()) = user_id or app_is_admin());
exception when duplicate_object then null;
end $$;

create index if not exists app_user_profiles_tier_idx on public.app_user_profiles(payment_tier, payment_tier_status, market_data_tier);
create index if not exists app_customer_entitlement_checks_user_idx on public.app_customer_entitlement_checks(user_id, created_at desc);
create index if not exists app_market_data_usage_user_idx on public.app_market_data_usage(user_id, created_at desc);

notify pgrst, 'reload schema';
