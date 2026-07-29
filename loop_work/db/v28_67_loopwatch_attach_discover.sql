-- LOOP v28.67 - LoopWatch attach/review, bill allocation and Discover workflows
-- Safe to rerun. Adds context-first intake, review metadata, bill price checks and car deal discovery scaffolding.

create extension if not exists pgcrypto;

alter table public.loopwatch_items
  add column if not exists source_kind text,
  add column if not exists attach_mode text,
  add column if not exists context_prompt text,
  add column if not exists user_context text,
  add column if not exists review_state text not null default 'needs_user_review',
  add column if not exists bill_allocation_mode text,
  add column if not exists linked_existing_planned_item_id uuid references public.planned_items(id) on delete set null,
  add column if not exists next_price_check_at date,
  add column if not exists price_check_cadence_days integer,
  add column if not exists last_price_check_prompt_at timestamptz,
  add column if not exists comparison_preferences_json jsonb not null default '{}'::jsonb;

-- Older code uses linked_planned_item_id; keep this as the canonical allocation field and leave the explicit alias for future UI migrations.
alter table public.loopwatch_items
  add column if not exists linked_planned_item_id uuid references public.planned_items(id) on delete set null;

create index if not exists loopwatch_items_price_check_idx
  on public.loopwatch_items(user_id, next_price_check_at, status)
  where status <> 'archived' and next_price_check_at is not null;

create index if not exists loopwatch_items_linked_planned_item_idx
  on public.loopwatch_items(linked_planned_item_id)
  where linked_planned_item_id is not null;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'loopwatch_items_review_state_check') then
    alter table public.loopwatch_items drop constraint loopwatch_items_review_state_check;
  end if;
  alter table public.loopwatch_items add constraint loopwatch_items_review_state_check
    check (review_state in ('needs_user_review','user_reviewed','accepted','rejected','auto_reviewed'));
exception when duplicate_object then null;
end $$;

create table if not exists public.loopwatch_discover_workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid,
  visibility_scope text not null default 'private',
  owner_person_id uuid,
  workflow_type text not null default 'vehicle_purchase',
  query text not null,
  status text not null default 'draft',
  cadence_days integer not null default 7,
  next_check_at date,
  last_checked_at timestamptz,
  results_count integer not null default 0,
  best_score integer,
  preferences_json jsonb not null default '{}'::jsonb,
  affordability_json jsonb not null default '{}'::jsonb,
  impact_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loopwatch_discover_workflows
  add column if not exists household_id uuid,
  add column if not exists visibility_scope text not null default 'private',
  add column if not exists owner_person_id uuid,
  add column if not exists workflow_type text not null default 'vehicle_purchase',
  add column if not exists status text not null default 'draft',
  add column if not exists cadence_days integer not null default 7,
  add column if not exists next_check_at date,
  add column if not exists last_checked_at timestamptz,
  add column if not exists results_count integer not null default 0,
  add column if not exists best_score integer,
  add column if not exists preferences_json jsonb not null default '{}'::jsonb,
  add column if not exists affordability_json jsonb not null default '{}'::jsonb,
  add column if not exists impact_json jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.loopwatch_discover_deals (
  id uuid primary key default gen_random_uuid(),
  workflow_type text not null default 'vehicle_purchase',
  source_name text,
  provider_name text,
  title text not null,
  deal_type text not null default 'lease',
  make text,
  model text,
  variant text,
  fuel_type text,
  monthly_cost numeric(14,2) not null default 0,
  upfront_cost numeric(14,2) not null default 0,
  term_months integer,
  annual_mileage integer,
  apr_percent numeric(8,4),
  estimated_annual_cost numeric(14,2),
  source_url text,
  status text not null default 'active',
  seen_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loopwatch_discover_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid,
  visibility_scope text not null default 'private',
  workflow_id uuid not null references public.loopwatch_discover_workflows(id) on delete cascade,
  deal_id uuid references public.loopwatch_discover_deals(id) on delete set null,
  status text not null default 'shortlisted',
  score integer,
  title text,
  summary text,
  monthly_cost numeric(14,2),
  upfront_cost numeric(14,2),
  term_months integer,
  impact_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loopwatch_discover_workflows enable row level security;
alter table public.loopwatch_discover_deals enable row level security;
alter table public.loopwatch_discover_results enable row level security;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'loopwatch_discover_workflows_status_check') then
    alter table public.loopwatch_discover_workflows drop constraint loopwatch_discover_workflows_status_check;
  end if;
  alter table public.loopwatch_discover_workflows add constraint loopwatch_discover_workflows_status_check
    check (status in ('draft','watching','needs_feed','paused','archived','error'));

  if exists (select 1 from pg_constraint where conname = 'loopwatch_discover_workflows_visibility_check') then
    alter table public.loopwatch_discover_workflows drop constraint loopwatch_discover_workflows_visibility_check;
  end if;
  alter table public.loopwatch_discover_workflows add constraint loopwatch_discover_workflows_visibility_check
    check (visibility_scope in ('private','household'));

  if exists (select 1 from pg_constraint where conname = 'loopwatch_discover_deals_status_check') then
    alter table public.loopwatch_discover_deals drop constraint loopwatch_discover_deals_status_check;
  end if;
  alter table public.loopwatch_discover_deals add constraint loopwatch_discover_deals_status_check
    check (status in ('active','expired','paused','needs_review'));

  if exists (select 1 from pg_constraint where conname = 'loopwatch_discover_results_status_check') then
    alter table public.loopwatch_discover_results drop constraint loopwatch_discover_results_status_check;
  end if;
  alter table public.loopwatch_discover_results add constraint loopwatch_discover_results_status_check
    check (status in ('shortlisted','dismissed','saved','expired'));
exception when duplicate_object then null;
end $$;

create index if not exists loopwatch_discover_workflows_user_idx
  on public.loopwatch_discover_workflows(user_id, status, next_check_at nulls last, created_at desc);
create index if not exists loopwatch_discover_workflows_household_idx
  on public.loopwatch_discover_workflows(household_id, visibility_scope, status, next_check_at nulls last)
  where household_id is not null;
create index if not exists loopwatch_discover_deals_lookup_idx
  on public.loopwatch_discover_deals(workflow_type, status, monthly_cost, seen_at desc);
create index if not exists loopwatch_discover_results_workflow_idx
  on public.loopwatch_discover_results(workflow_id, score desc, created_at desc);

-- Customers can read active deal catalogue rows; catalogue writes should be service/admin/importer.
drop policy if exists loopwatch_discover_deals_read_active on public.loopwatch_discover_deals;
create policy loopwatch_discover_deals_read_active on public.loopwatch_discover_deals
  for select to authenticated
  using (status = 'active' or status = 'needs_review');

drop policy if exists loopwatch_discover_workflows_select_v2867 on public.loopwatch_discover_workflows;
create policy loopwatch_discover_workflows_select_v2867 on public.loopwatch_discover_workflows
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      household_id is not null
      and visibility_scope = 'household'
      and public.loop_is_active_household_member(household_id, auth.uid())
    )
  );

drop policy if exists loopwatch_discover_workflows_insert_v2867 on public.loopwatch_discover_workflows;
create policy loopwatch_discover_workflows_insert_v2867 on public.loopwatch_discover_workflows
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      household_id is null
      or public.loop_is_active_household_member(household_id, auth.uid())
    )
  );

drop policy if exists loopwatch_discover_workflows_update_v2867 on public.loopwatch_discover_workflows;
create policy loopwatch_discover_workflows_update_v2867 on public.loopwatch_discover_workflows
  for update to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and public.loop_can_manage_household(household_id, auth.uid()))
  )
  with check (
    user_id = auth.uid()
    or (household_id is not null and public.loop_can_manage_household(household_id, auth.uid()))
  );

drop policy if exists loopwatch_discover_results_select_v2867 on public.loopwatch_discover_results;
create policy loopwatch_discover_results_select_v2867 on public.loopwatch_discover_results
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      household_id is not null
      and visibility_scope = 'household'
      and public.loop_is_active_household_member(household_id, auth.uid())
    )
  );

drop policy if exists loopwatch_discover_results_insert_v2867 on public.loopwatch_discover_results;
create policy loopwatch_discover_results_insert_v2867 on public.loopwatch_discover_results
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      household_id is null
      or public.loop_is_active_household_member(household_id, auth.uid())
    )
  );

insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('loopwatch_context_first_intake', 'true', 'LoopWatch can start from a search/context prompt before upload and creates a review card.'),
  ('loopwatch_bill_allocation_mode', 'match_or_create', 'Bills can be allocated to an existing Financial Flow planned item or created if no match is found.'),
  ('loopwatch_default_price_check_cadence_days', '90', 'Default cadence for checking whether a confirmed bill/contract should be repriced.'),
  ('loopwatch_discover_vehicle_enabled', 'true', 'LoopWatch Discover can create vehicle lease/PCP watch workflows and score affordability impact.'),
  ('loopwatch_discover_vehicle_feed_mode', 'catalogue_then_fallback', 'Use imported deal catalogue rows first, then fallback placeholders until aggregator feeds are connected.')
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    description = excluded.description;

insert into public.app_future_integration_tasks(product_key, task_key, section, title, description, priority, status, metadata)
values
  ('loopwatch', 'context-first-attach', 'ux', 'Context-first LoopWatch attach flow', 'Search/attach an item, ask for context, show a review modal, then create a review card.', 173, 'done', '{"release":"v28.67"}'::jsonb),
  ('loopwatch', 'bill-allocation-existing-planned-item', 'financial-flow', 'Allocate bills to existing Financial Flow items', 'Confirmed LoopWatch bills can update a selected or auto-matched planned bill instead of creating duplicates.', 174, 'done', '{"release":"v28.67"}'::jsonb),
  ('loopwatch', 'price-check-cadence', 'watch', 'Bill price-check cadence', 'Confirmed bills/contracts store a next price-check date and cadence so LoopWatch can prompt new price checks.', 175, 'done', '{"release":"v28.67"}'::jsonb),
  ('loopwatch', 'discover-vehicle-workflows', 'discover', 'Vehicle lease/PCP Discover workflows', 'Users can create car-search workflows with budget, mileage and term prompts, shortlist scoring and affordability impact.', 176, 'done', '{"release":"v28.67"}'::jsonb),
  ('loopwatch', 'vehicle-aggregator-feeds', 'future-source', 'Vehicle aggregator deal feeds', 'Connect lease/PCP aggregator feeds or imports to populate the LoopWatch Discover deal catalogue.', 177, 'todo', '{"release":"v28.67"}'::jsonb)
on conflict (product_key, task_key) do update
set section = excluded.section,
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    status = excluded.status,
    metadata = excluded.metadata,
    updated_at = now();

select pg_notify('pgrst', 'reload schema');
