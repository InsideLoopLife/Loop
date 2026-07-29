-- LOOP v28.49 - LoopWatch renewal, provider increase and household cost logic
-- Connects confirmed LoopWatch cards to cost forecasts, Financial Flow and deal/opportunity watch.

alter table public.loopwatch_items
  add column if not exists current_monthly_cost numeric(14,2),
  add column if not exists projected_monthly_cost numeric(14,2),
  add column if not exists projected_annual_cost numeric(14,2),
  add column if not exists next_increase_date date,
  add column if not exists next_increase_amount numeric(14,2),
  add column if not exists increase_source text,
  add column if not exists linked_planned_item_id uuid references public.planned_items(id) on delete set null,
  add column if not exists last_watch_checked_at timestamptz,
  add column if not exists watch_status text not null default 'not_checked',
  add column if not exists watch_summary text;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'loopwatch_items_watch_status_check') then
    alter table public.loopwatch_items drop constraint loopwatch_items_watch_status_check;
  end if;
  alter table public.loopwatch_items add constraint loopwatch_items_watch_status_check
    check (watch_status in ('not_checked','ok','review','opportunities','error'));
exception when duplicate_object then null;
end $$;

create table if not exists public.loopwatch_provider_rules (
  id uuid primary key default gen_random_uuid(),
  provider_slug text not null,
  provider_name text not null,
  applies_to_item_type text not null default 'mobile_contract',
  rule_label text not null,
  increase_month integer not null default 4,
  increase_day integer not null default 1,
  increase_amount_monthly numeric(14,2),
  increase_percent numeric(8,4),
  effective_from date,
  effective_to date,
  source_url text,
  source_label text,
  status text not null default 'needs_review',
  confidence integer not null default 60,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loopwatch_provider_rules
  add column if not exists source_label text,
  add column if not exists status text not null default 'needs_review',
  add column if not exists confidence integer not null default 60,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'loopwatch_provider_rules_status_check') then
    alter table public.loopwatch_provider_rules drop constraint loopwatch_provider_rules_status_check;
  end if;
  alter table public.loopwatch_provider_rules add constraint loopwatch_provider_rules_status_check
    check (status in ('active','needs_review','paused','archived'));

  if exists (select 1 from pg_constraint where conname = 'loopwatch_provider_rules_date_check') then
    alter table public.loopwatch_provider_rules drop constraint loopwatch_provider_rules_date_check;
  end if;
  alter table public.loopwatch_provider_rules add constraint loopwatch_provider_rules_date_check
    check (increase_month between 1 and 12 and increase_day between 1 and 31);
exception when duplicate_object then null;
end $$;

create unique index if not exists loopwatch_provider_rules_unique_idx
  on public.loopwatch_provider_rules(provider_slug, applies_to_item_type, coalesce(effective_from, date '1900-01-01'), coalesce(effective_to, date '2100-12-31'));
create index if not exists loopwatch_provider_rules_lookup_idx
  on public.loopwatch_provider_rules(provider_slug, applies_to_item_type, status, effective_from desc nulls last);

create table if not exists public.loopwatch_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid,
  visibility_scope text not null default 'private',
  loopwatch_item_id uuid not null references public.loopwatch_items(id) on delete cascade,
  opportunity_type text not null,
  status text not null default 'open',
  priority integer not null default 50,
  title text not null,
  summary text,
  due_date date,
  estimated_monthly_change numeric(14,2),
  estimated_annual_change numeric(14,2),
  action_href text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loopwatch_opportunities
  add column if not exists household_id uuid,
  add column if not exists visibility_scope text not null default 'private',
  add column if not exists priority integer not null default 50,
  add column if not exists due_date date,
  add column if not exists estimated_monthly_change numeric(14,2),
  add column if not exists estimated_annual_change numeric(14,2),
  add column if not exists action_href text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'loopwatch_opportunities_status_check') then
    alter table public.loopwatch_opportunities drop constraint loopwatch_opportunities_status_check;
  end if;
  alter table public.loopwatch_opportunities add constraint loopwatch_opportunities_status_check
    check (status in ('open','done','dismissed','snoozed'));

  if exists (select 1 from pg_constraint where conname = 'loopwatch_opportunities_visibility_scope_check') then
    alter table public.loopwatch_opportunities drop constraint loopwatch_opportunities_visibility_scope_check;
  end if;
  alter table public.loopwatch_opportunities add constraint loopwatch_opportunities_visibility_scope_check
    check (visibility_scope in ('private','household'));
exception when duplicate_object then null;
end $$;

drop index if exists public.loopwatch_opportunities_item_type_unique_idx;
create unique index if not exists loopwatch_opportunities_item_type_unique_idx
  on public.loopwatch_opportunities(loopwatch_item_id, opportunity_type);
create index if not exists loopwatch_opportunities_user_status_idx
  on public.loopwatch_opportunities(user_id, status, priority desc, due_date nulls last);
create index if not exists loopwatch_opportunities_household_idx
  on public.loopwatch_opportunities(household_id, visibility_scope, status, priority desc)
  where household_id is not null;

alter table public.loopwatch_provider_rules enable row level security;
alter table public.loopwatch_opportunities enable row level security;

-- Customers can read active provider rules. Admin/service-role owns writes.
drop policy if exists loopwatch_provider_rules_read_active on public.loopwatch_provider_rules;
create policy loopwatch_provider_rules_read_active on public.loopwatch_provider_rules
  for select to authenticated
  using (status = 'active' or created_by = auth.uid());

-- Opportunity rows mirror LoopWatch item visibility.
drop policy if exists loopwatch_opportunities_select_v2849 on public.loopwatch_opportunities;
create policy loopwatch_opportunities_select_v2849 on public.loopwatch_opportunities
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      household_id is not null
      and visibility_scope = 'household'
      and public.loop_is_active_household_member(household_id, auth.uid())
    )
  );

drop policy if exists loopwatch_opportunities_insert_v2849 on public.loopwatch_opportunities;
create policy loopwatch_opportunities_insert_v2849 on public.loopwatch_opportunities
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      household_id is null
      or public.loop_is_active_household_member(household_id, auth.uid())
    )
  );

drop policy if exists loopwatch_opportunities_update_v2849 on public.loopwatch_opportunities;
create policy loopwatch_opportunities_update_v2849 on public.loopwatch_opportunities
  for update to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and public.loop_can_manage_household(household_id, auth.uid()))
  )
  with check (
    user_id = auth.uid()
    or (household_id is not null and public.loop_can_manage_household(household_id, auth.uid()))
  );

insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('loopwatch_watch_enabled', 'true', 'Run LoopWatch deal/cost checks for confirmed contracts and policies.'),
  ('loopwatch_renewal_window_days', '90', 'Default window before end/renewal date where LoopWatch creates comparison prompts.'),
  ('loopwatch_telecom_april_increase_enabled', 'true', 'Use provider rules to project mobile, broadband and pay-TV annual increases once a carrier/provider is confirmed.'),
  ('loopwatch_financial_flow_sync', 'review_required', 'LoopWatch can create/update planned_items from confirmed costs; user action is required.'),
  ('loopwatch_insurance_advice_mode', 'flags_only', 'Insurance logic flags dates, excess, cover level and gaps for review; it does not claim regulated advice.')
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    description = excluded.description;

-- Provider rules are deliberately seeded as needs_review placeholders unless a provider-specific source has been verified.
insert into public.loopwatch_provider_rules(provider_slug, provider_name, applies_to_item_type, rule_label, increase_month, increase_day, status, confidence, notes)
values
  ('ee', 'EE', 'mobile_contract', 'Annual pounds-and-pence mobile increase - add current disclosed amount', 3, 31, 'needs_review', 50, 'Admin should maintain current provider amount from official terms/source.'),
  ('ee', 'EE', 'broadband_contract', 'Annual pounds-and-pence broadband increase - add current disclosed amount', 3, 31, 'needs_review', 50, 'Admin should maintain current provider amount from official terms/source.'),
  ('bt', 'BT', 'broadband_contract', 'Annual pounds-and-pence broadband increase - add current disclosed amount', 3, 31, 'needs_review', 50, 'Admin should maintain current provider amount from official terms/source.'),
  ('o2', 'O2', 'mobile_contract', 'Annual pounds-and-pence mobile increase - add current disclosed amount', 4, 1, 'needs_review', 50, 'Admin should maintain current provider amount from official terms/source.'),
  ('vodafone', 'Vodafone', 'mobile_contract', 'Annual pounds-and-pence mobile increase - add current disclosed amount', 4, 1, 'needs_review', 50, 'Admin should maintain current provider amount from official terms/source.'),
  ('three', 'Three', 'mobile_contract', 'Annual pounds-and-pence mobile increase - add current disclosed amount', 4, 1, 'needs_review', 50, 'Admin should maintain current provider amount from official terms/source.'),
  ('sky', 'Sky', 'broadband_contract', 'Annual pounds-and-pence broadband increase - add current disclosed amount', 4, 1, 'needs_review', 50, 'Admin should maintain current provider amount from official terms/source.'),
  ('virgin-media', 'Virgin Media', 'broadband_contract', 'Annual pounds-and-pence broadband increase - add current disclosed amount', 4, 1, 'needs_review', 50, 'Admin should maintain current provider amount from official terms/source.')
on conflict do nothing;

insert into public.app_future_integration_tasks(product_key, task_key, section, title, description, priority, status, metadata)
values
  ('loopwatch', 'cost-to-financial-flow', 'financial-flow', 'Sync confirmed LoopWatch costs into Financial Flow', 'Use confirmed contract monthly/annual cost to create or update the household planned item after user approval.', 164, 'done', '{"release":"v28.49"}'::jsonb),
  ('loopwatch', 'provider-increase-rules', 'watch', 'Provider annual increase rules', 'Maintain provider-specific mobile/broadband annual increase rules and project next April/March rises from confirmed providers.', 165, 'done', '{"release":"v28.49"}'::jsonb),
  ('loopwatch', 'renewal-opportunities', 'watch', 'Renewal opportunity cards', 'Create action cards when contracts, policies or offers are inside the renewal/notice window.', 166, 'done', '{"release":"v28.49"}'::jsonb),
  ('loopwatch', 'insurance-comparison-feed', 'future-source', 'Insurance comparison feed/API', 'Connect policies ending soon to comparison/affiliate APIs once a compliant source is chosen.', 167, 'todo', '{"release":"v28.49"}'::jsonb)
on conflict (product_key, task_key) do update
set section = excluded.section,
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    status = excluded.status,
    metadata = excluded.metadata,
    updated_at = now();

select pg_notify('pgrst', 'reload schema');
