-- Repairs partial v28.96 installs and keeps the income command centre usable on older schemas.
create or replace function public.app_is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.app_household_members member
    where member.household_id = p_household_id
      and member.user_id = auth.uid()
      and coalesce(member.status, 'active') = 'active'
  );
$$;

grant execute on function public.app_is_household_member(uuid) to authenticated;

alter table if exists public.household_carbon_profiles
  add column if not exists food_assumption_adopted boolean not null default false,
  add column if not exists annual_offset_kg numeric not null default 0,
  add column if not exists offset_provider text,
  add column if not exists offset_notes text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now();

alter table if exists public.pay_events
  add column if not exists employer_pension_percent numeric(8,4) not null default 0,
  add column if not exists employer_pension_monthly_amount numeric(14,2),
  add column if not exists employer_ni_topup_enabled boolean not null default false,
  add column if not exists employer_ni_rate_percent numeric(8,4) not null default 15,
  add column if not exists employer_ni_topup_share_percent numeric(8,4) not null default 100,
  add column if not exists pay_timing text default 'fixed_day',
  add column if not exists pay_day_of_month integer default 28,
  add column if not exists pay_adjustment text default 'previous_workday',
  add column if not exists maternity_scheme text;

select pg_notify('pgrst', 'reload schema');
