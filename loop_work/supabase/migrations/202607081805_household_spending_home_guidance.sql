-- v28.77 Household spending and home-usage guidance foundation
-- Adds a household-level living profile and assumption storage so LOOP can compare
-- actual family spending with planning bands and expected utility usage.

create table if not exists public.household_living_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.app_households(id) on delete cascade,
  home_id uuid references public.homes(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  property_kind text default 'house', -- house, flat, bungalow, other
  property_style text, -- detached, semi_detached, terrace, flat, bungalow, unknown
  tenure text, -- own, mortgage, rent, living_with_family, other
  bedrooms integer,
  occupants_override integer,
  heating_type text default 'gas', -- gas, electric, heat_pump, oil, other
  epc_rating text,
  energy_supplier text,
  water_supplier text,
  source text default 'manual',
  confidence_score integer default 40,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint household_living_profiles_confidence_chk check (confidence_score is null or confidence_score between 0 and 100),
  constraint household_living_profiles_bedrooms_chk check (bedrooms is null or bedrooms between 0 and 20),
  constraint household_living_profiles_occupants_chk check (occupants_override is null or occupants_override between 1 and 30)
);

create index if not exists household_living_profiles_household_idx on public.household_living_profiles(household_id, created_at desc);
create index if not exists household_living_profiles_home_idx on public.household_living_profiles(home_id);

create table if not exists public.household_guidance_assumptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.app_households(id) on delete cascade,
  assumption_key text not null,
  assumption_group text not null default 'spending',
  monthly_low numeric(12,2),
  monthly_typical numeric(12,2),
  monthly_high numeric(12,2),
  annual_usage numeric(14,4),
  usage_unit text,
  source text default 'loop_default',
  source_url text,
  confidence_score integer default 35,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(household_id, assumption_key, assumption_group),
  constraint household_guidance_assumptions_confidence_chk check (confidence_score is null or confidence_score between 0 and 100)
);

create index if not exists household_guidance_assumptions_household_idx on public.household_guidance_assumptions(household_id, assumption_group);

alter table public.household_living_profiles enable row level security;
alter table public.household_guidance_assumptions enable row level security;

drop policy if exists household_living_profiles_owner_rw on public.household_living_profiles;
create policy household_living_profiles_owner_rw on public.household_living_profiles
  for all using (
    user_id = auth.uid()
    or exists (
      select 1 from public.app_household_members m
      where m.household_id = household_living_profiles.household_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  ) with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.app_household_members m
      where m.household_id = household_living_profiles.household_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and coalesce(m.can_manage_household_costs, false) = true
    )
  );

drop policy if exists household_guidance_assumptions_member_rw on public.household_guidance_assumptions;
create policy household_guidance_assumptions_member_rw on public.household_guidance_assumptions
  for all using (
    exists (
      select 1 from public.app_household_members m
      where m.household_id = household_guidance_assumptions.household_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  ) with check (
    exists (
      select 1 from public.app_household_members m
      where m.household_id = household_guidance_assumptions.household_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and (coalesce(m.can_manage_household_costs, false) = true or m.permission_tier in ('owner','admin'))
    )
  );
