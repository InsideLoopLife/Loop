-- LOOP v28.80 - Savings context, guided pots and annual pension performance evidence

alter table if exists public.savings_pots
  add column if not exists goal_type text not null default 'other',
  add column if not exists priority_is_important boolean not null default false,
  add column if not exists priority_score integer not null default 50;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.savings_pots'::regclass
      and conname = 'savings_pots_goal_type_check'
  ) then
    alter table public.savings_pots add constraint savings_pots_goal_type_check
      check (goal_type in ('holiday','emergency','house','car','education','christmas','repairs','other'));
  end if;
exception when undefined_table then null; end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.savings_pots'::regclass
      and conname = 'savings_pots_priority_score_check'
  ) then
    alter table public.savings_pots add constraint savings_pots_priority_score_check
      check (priority_score between 1 and 100);
  end if;
exception when undefined_table then null; end $$;

create table if not exists public.savings_pot_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.app_households(id) on delete cascade,
  savings_pot_id uuid not null references public.savings_pots(id) on delete cascade,
  movement_type text not null default 'allocation' check (movement_type in ('allocation','deallocation','correction')),
  amount numeric(14,2) not null,
  effective_at date not null default current_date,
  note text,
  visibility_scope text not null default 'private' check (visibility_scope in ('private','household')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists savings_pot_movements_pot_date_idx
  on public.savings_pot_movements(savings_pot_id, effective_at desc, created_at desc);
create index if not exists savings_pot_movements_household_date_idx
  on public.savings_pot_movements(household_id, effective_at desc);

alter table public.savings_pot_movements enable row level security;

do $$ begin
  create policy "savings_pot_movements_select_visible" on public.savings_pot_movements
  for select using (
    auth.uid() = user_id
    or (
      visibility_scope = 'household'
      and household_id is not null
      and exists (
        select 1 from public.app_household_members hm
        where hm.household_id = savings_pot_movements.household_id
          and hm.user_id = auth.uid()
          and coalesce(hm.status, 'active') in ('active','accepted')
      )
    )
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "savings_pot_movements_insert_visible" on public.savings_pot_movements
  for insert with check (
    auth.uid() = user_id
    and (
      household_id is null
      or exists (
        select 1 from public.app_household_members hm
        where hm.household_id = savings_pot_movements.household_id
          and hm.user_id = auth.uid()
          and coalesce(hm.status, 'active') in ('active','accepted')
      )
    )
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "savings_pot_movements_update_own" on public.savings_pot_movements
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "savings_pot_movements_delete_own" on public.savings_pot_movements
  for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- Annualised fund performance evidence. The app stores source-backed 5-year and 10-year
-- annualised figures once per year and exposes low/middle/high scenarios to the user.
create table if not exists public.pension_fund_performance_assumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pension_account_id uuid references public.pension_accounts(id) on delete cascade,
  pension_fund_id uuid references public.pension_funds(id) on delete cascade,
  fund_name text,
  provider_name text,
  current_value numeric(14,2) not null default 0,
  annualised_5y_percent numeric(10,4),
  annualised_10y_percent numeric(10,4),
  low_percent numeric(10,4),
  middle_percent numeric(10,4),
  high_percent numeric(10,4),
  as_of_date date not null,
  source_name text,
  source_url text,
  source_kind text not null default 'stored_unit_price_history',
  verified_at timestamptz not null default now(),
  raw_payload_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, pension_fund_id, as_of_date)
);

create index if not exists pension_fund_performance_user_date_idx
  on public.pension_fund_performance_assumptions(user_id, as_of_date desc);
create index if not exists pension_fund_performance_fund_date_idx
  on public.pension_fund_performance_assumptions(pension_fund_id, as_of_date desc);

alter table public.pension_fund_performance_assumptions enable row level security;

do $$ begin
  create policy "pension_fund_performance_select_own" on public.pension_fund_performance_assumptions
  for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pension_fund_performance_insert_own" on public.pension_fund_performance_assumptions
  for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pension_fund_performance_update_own" on public.pension_fund_performance_assumptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pension_fund_performance_delete_own" on public.pension_fund_performance_assumptions
  for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- Public image bucket for user-selected goal inspiration images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('savings-pot-images', 'savings-pot-images', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
  create policy "savings_pot_images_public_read" on storage.objects
  for select using (bucket_id = 'savings-pot-images');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "savings_pot_images_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'savings-pot-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "savings_pot_images_update_own" on storage.objects
  for update using (
    bucket_id = 'savings-pot-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "savings_pot_images_delete_own" on storage.objects
  for delete using (
    bucket_id = 'savings-pot-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
exception when duplicate_object then null; end $$;

insert into public.app_build_notes(build_key, title, notes, payload, updated_at)
values (
  'v28_80_savings_context_pot_journey_pension_performance',
  'Savings context, guided pots and annual pension performance',
  'Adds savings-only year activity, a guided pot journey with visual categories and monthly threads, per-person PSA handling, and annual source-backed 5y/10y pension performance assumptions.',
  '{"areas":["savings","pots","financial_flow","pensions","loopwatch"],"requires_sql":true,"annual_pension_refresh":true}'::jsonb,
  now()
)
on conflict (build_key) do update
set title = excluded.title,
    notes = excluded.notes,
    payload = excluded.payload,
    updated_at = now();

notify pgrst, 'reload schema';
select 'v28_80_savings_context_pot_journey_pension_performance' as migration_marker;
