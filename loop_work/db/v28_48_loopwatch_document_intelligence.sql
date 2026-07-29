-- v28.48 - LoopWatch document intelligence and contract watch
-- Safe to rerun. Stores extracted metadata only; uploaded source files are not stored.

create extension if not exists pgcrypto;

create table if not exists public.loopwatch_document_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid,
  visibility_scope text not null default 'private',
  uploaded_by_user_id uuid references auth.users(id) on delete set null,
  owner_person_id uuid,
  original_filename text,
  mime_type text,
  file_size_bytes bigint,
  document_type_hint text,
  document_type text,
  status text not null default 'uploaded',
  storage_mode text not null default 'metadata_only',
  extraction_method text,
  extraction_warning text,
  extracted_text_chars integer,
  confidence_score numeric(5,2),
  source_file_deleted_at timestamptz,
  processing_started_at timestamptz,
  processing_finished_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loopwatch_document_jobs
  add column if not exists household_id uuid,
  add column if not exists visibility_scope text not null default 'private',
  add column if not exists uploaded_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists owner_person_id uuid,
  add column if not exists document_type_hint text,
  add column if not exists document_type text,
  add column if not exists storage_mode text not null default 'metadata_only',
  add column if not exists extraction_method text,
  add column if not exists extraction_warning text,
  add column if not exists extracted_text_chars integer,
  add column if not exists confidence_score numeric(5,2),
  add column if not exists source_file_deleted_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_finished_at timestamptz,
  add column if not exists error_message text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.loopwatch_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid,
  visibility_scope text not null default 'private',
  owner_person_id uuid,
  document_job_id uuid references public.loopwatch_document_jobs(id) on delete set null,
  item_type text not null default 'general_contract',
  provider_name text,
  product_name text,
  reference_hint text,
  start_date date,
  end_date date,
  renewal_date date,
  notice_period_days integer,
  payment_amount numeric(14,2),
  payment_frequency text,
  annual_cost numeric(14,2),
  auto_renews boolean,
  cover_level text,
  excess_total numeric(14,2),
  mileage_limit integer,
  interest_rate_percent numeric(8,4),
  apr_percent numeric(8,4),
  cancellation_summary text,
  increase_summary text,
  summary text,
  terms_json jsonb not null default '{}'::jsonb,
  risk_flags_json jsonb not null default '[]'::jsonb,
  confidence_json jsonb not null default '{}'::jsonb,
  confidence_score numeric(5,2),
  status text not null default 'needs_review',
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loopwatch_items
  add column if not exists household_id uuid,
  add column if not exists visibility_scope text not null default 'private',
  add column if not exists owner_person_id uuid,
  add column if not exists document_job_id uuid references public.loopwatch_document_jobs(id) on delete set null,
  add column if not exists item_type text not null default 'general_contract',
  add column if not exists reference_hint text,
  add column if not exists renewal_date date,
  add column if not exists notice_period_days integer,
  add column if not exists annual_cost numeric(14,2),
  add column if not exists auto_renews boolean,
  add column if not exists cover_level text,
  add column if not exists excess_total numeric(14,2),
  add column if not exists mileage_limit integer,
  add column if not exists interest_rate_percent numeric(8,4),
  add column if not exists apr_percent numeric(8,4),
  add column if not exists cancellation_summary text,
  add column if not exists increase_summary text,
  add column if not exists summary text,
  add column if not exists terms_json jsonb not null default '{}'::jsonb,
  add column if not exists risk_flags_json jsonb not null default '[]'::jsonb,
  add column if not exists confidence_json jsonb not null default '{}'::jsonb,
  add column if not exists confidence_score numeric(5,2),
  add column if not exists confirmed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.loopwatch_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid,
  visibility_scope text not null default 'private',
  loopwatch_item_id uuid not null references public.loopwatch_items(id) on delete cascade,
  event_type text not null,
  event_date date not null,
  status text not null default 'scheduled',
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loopwatch_events
  add column if not exists household_id uuid,
  add column if not exists visibility_scope text not null default 'private',
  add column if not exists updated_at timestamptz not null default now();

-- Defensive status/enum checks.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'loopwatch_document_jobs_visibility_scope_check') then
    alter table public.loopwatch_document_jobs drop constraint loopwatch_document_jobs_visibility_scope_check;
  end if;
  alter table public.loopwatch_document_jobs add constraint loopwatch_document_jobs_visibility_scope_check
    check (visibility_scope in ('private','household'));
exception when duplicate_object then null;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'loopwatch_items_visibility_scope_check') then
    alter table public.loopwatch_items drop constraint loopwatch_items_visibility_scope_check;
  end if;
  alter table public.loopwatch_items add constraint loopwatch_items_visibility_scope_check
    check (visibility_scope in ('private','household'));
exception when duplicate_object then null;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'loopwatch_events_visibility_scope_check') then
    alter table public.loopwatch_events drop constraint loopwatch_events_visibility_scope_check;
  end if;
  alter table public.loopwatch_events add constraint loopwatch_events_visibility_scope_check
    check (visibility_scope in ('private','household'));
exception when duplicate_object then null;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'loopwatch_items_status_check') then
    alter table public.loopwatch_items drop constraint loopwatch_items_status_check;
  end if;
  alter table public.loopwatch_items add constraint loopwatch_items_status_check
    check (status in ('needs_review','confirmed','archived','failed'));
exception when duplicate_object then null;
end $$;

create index if not exists loopwatch_jobs_user_created_idx on public.loopwatch_document_jobs(user_id, created_at desc);
create index if not exists loopwatch_jobs_household_idx on public.loopwatch_document_jobs(household_id, visibility_scope, created_at desc) where household_id is not null;
create index if not exists loopwatch_items_user_created_idx on public.loopwatch_items(user_id, created_at desc);
create index if not exists loopwatch_items_renewal_idx on public.loopwatch_items(user_id, coalesce(renewal_date, end_date)) where status <> 'archived';
create index if not exists loopwatch_items_household_idx on public.loopwatch_items(household_id, visibility_scope, created_at desc) where household_id is not null;
create index if not exists loopwatch_events_user_date_idx on public.loopwatch_events(user_id, event_date, status);
create index if not exists loopwatch_events_item_idx on public.loopwatch_events(loopwatch_item_id, event_date);

alter table public.loopwatch_document_jobs enable row level security;
alter table public.loopwatch_items enable row level security;
alter table public.loopwatch_events enable row level security;

-- User-private rows are visible to the owning user. Household rows are visible to active household members.
do $$
declare
  t text;
begin
  foreach t in array array['loopwatch_document_jobs','loopwatch_items','loopwatch_events'] loop
    execute format('drop policy if exists loopwatch_select_v2848 on public.%I', t);
    execute format('drop policy if exists loopwatch_insert_v2848 on public.%I', t);
    execute format('drop policy if exists loopwatch_update_v2848 on public.%I', t);
    execute format('drop policy if exists loopwatch_delete_v2848 on public.%I', t);

    execute format($fmt$
      create policy loopwatch_select_v2848 on public.%I
      for select to authenticated
      using (
        user_id = auth.uid()
        or (
          household_id is not null
          and visibility_scope = 'household'
          and public.loop_is_active_household_member(household_id, auth.uid())
        )
      )
    $fmt$, t);

    execute format($fmt$
      create policy loopwatch_insert_v2848 on public.%I
      for insert to authenticated
      with check (
        user_id = auth.uid()
        and (
          household_id is null
          or public.loop_is_active_household_member(household_id, auth.uid())
        )
      )
    $fmt$, t);

    execute format($fmt$
      create policy loopwatch_update_v2848 on public.%I
      for update to authenticated
      using (
        user_id = auth.uid()
        or (household_id is not null and public.loop_can_manage_household(household_id, auth.uid()))
      )
      with check (
        user_id = auth.uid()
        or (household_id is not null and public.loop_can_manage_household(household_id, auth.uid()))
      )
    $fmt$, t);

    execute format($fmt$
      create policy loopwatch_delete_v2848 on public.%I
      for delete to authenticated
      using (
        user_id = auth.uid()
        or (household_id is not null and public.loop_can_manage_household(household_id, auth.uid()))
      )
    $fmt$, t);
  end loop;
end $$;

insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('loopwatch_enabled', 'true', 'LoopWatch document intelligence upload point is available in the Wealth navigation.'),
  ('loopwatch_storage_mode', 'metadata_only', 'Uploaded documents are processed in memory; only extracted metadata, dates, terms and review flags are saved.'),
  ('loopwatch_max_upload_mb', '10', 'Default maximum LoopWatch upload size. Override with LOOPWATCH_MAX_UPLOAD_BYTES.'),
  ('loopwatch_document_ai_env', 'LOOP_DOCUMENT_AI_KEY or OPENAI_API_KEY', 'Optional AI key for better extraction and image OCR. Heuristic extraction works without it for text/PDF text content.')
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    description = excluded.description;

insert into public.app_future_integration_tasks(product_key, task_key, section, title, description, priority, status, metadata)
values
  ('loopwatch', 'document-upload', 'customer-ui', 'LoopWatch upload point', 'Add a user-facing upload flow for contracts, insurance, car finance, broadband, savings terms and other household documents.', 160, 'done', '{"release":"v28.48"}'::jsonb),
  ('loopwatch', 'metadata-only-retention', 'privacy', 'Metadata-only document retention', 'Process documents in memory, keep extracted fields and mark source file deleted after processing.', 161, 'done', '{"release":"v28.48"}'::jsonb),
  ('loopwatch', 'renewal-events', 'watch', 'Create renewal and notice events', 'Create 90/45/21/7-day LoopWatch events from confirmed end or renewal dates.', 162, 'done', '{"release":"v28.48"}'::jsonb),
  ('loopwatch', 'deal-match-integration', 'watch', 'Connect LoopWatch to better-deal matching', 'Use confirmed LoopWatch cards to trigger insurance, broadband, mortgage and savings market checks before renewal.', 163, 'todo', '{"release":"v28.48"}'::jsonb)
on conflict (product_key, task_key) do update
set status = excluded.status,
    description = excluded.description,
    priority = excluded.priority,
    metadata = public.app_future_integration_tasks.metadata || excluded.metadata,
    updated_at = now();

notify pgrst, 'reload schema';
