-- v28.50 - LoopWatch one-stop intake routing logic
-- Safe to rerun. Adds metadata-only routing/suggestion fields for documents, bills,
-- policies, contracts, school/nursery dates and household admin letters.

create extension if not exists pgcrypto;

alter table public.loopwatch_document_jobs
  add column if not exists user_note text,
  add column if not exists routed_at timestamptz;

alter table public.loopwatch_items
  add column if not exists suggested_owner_person_id uuid,
  add column if not exists detected_person_name text,
  add column if not exists intake_category text,
  add column if not exists routing_status text not null default 'suggested',
  add column if not exists routing_summary text,
  add column if not exists routing_suggestions_json jsonb not null default '[]'::jsonb,
  add column if not exists applied_targets_json jsonb not null default '[]'::jsonb;

create index if not exists loopwatch_items_intake_category_idx
  on public.loopwatch_items(user_id, intake_category, created_at desc)
  where status <> 'archived';

create index if not exists loopwatch_items_routing_status_idx
  on public.loopwatch_items(user_id, routing_status, created_at desc)
  where status <> 'archived';

create index if not exists loopwatch_items_suggested_owner_idx
  on public.loopwatch_items(suggested_owner_person_id, created_at desc)
  where suggested_owner_person_id is not null;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'loopwatch_items_routing_status_check') then
    alter table public.loopwatch_items drop constraint loopwatch_items_routing_status_check;
  end if;
  alter table public.loopwatch_items add constraint loopwatch_items_routing_status_check
    check (routing_status in ('suggested','reviewing','confirmed','applied_financial_flow','applied_family_calendar','applied_watch','dismissed','failed'));
exception when duplicate_object then null;
end $$;

insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('loopwatch_one_stop_intake_enabled', 'true', 'LoopWatch can classify uploaded household documents and suggest next actions rather than only extracting contract fields.'),
  ('loopwatch_auto_owner_detection', 'review_high_confidence', 'Suggest a household person from names, notes and document context. Auto-applies only when confidence is high enough; user can override.'),
  ('loopwatch_school_calendar_import', 'review_required', 'School/nursery calendars can be imported into Family Planning from extracted metadata after user confirmation.'),
  ('loopwatch_source_storage_mode', 'metadata_only', 'Store structured fields and suggestions only. Do not store the uploaded source document.'),
  ('loopwatch_action_confirmation_mode', 'user_confirms_before_apply', 'LoopWatch asks before syncing costs, importing dates or using policy/contract logic.')
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    description = excluded.description;

insert into public.app_future_integration_tasks(product_key, task_key, section, title, description, priority, status, metadata)
values
  ('loopwatch', 'one-stop-intake-router', 'intake', 'One-stop document intake routing', 'Classify uploads as policy, bill, school/nursery, vehicle, wealth or general admin and suggest next actions.', 168, 'done', '{"release":"v28.50"}'::jsonb),
  ('loopwatch', 'owner-person-suggestion', 'household', 'Household/person suggestion from document context', 'Suggest the right person from names, relationship context and upload notes, with user review before relying on it.', 169, 'done', '{"release":"v28.50"}'::jsonb),
  ('loopwatch', 'school-calendar-import-from-loopwatch', 'family-planning', 'Import school/nursery dates from LoopWatch metadata', 'Term dates, holidays and inset days can be imported into Family Planning after the user confirms the child.', 170, 'done', '{"release":"v28.50"}'::jsonb),
  ('loopwatch', 'portal-for-new-things', 'ux', 'LoopWatch upload portal for new household things', 'A single upload point for contracts, bills, letters, school agendas, policies and household admin documents.', 171, 'done', '{"release":"v28.50"}'::jsonb),
  ('loopwatch', 'document-task-calendar-next', 'future-source', 'General appointment/task calendar creation', 'Future upgrade: create non-school appointments/reminders from letters once the core calendar/task model is selected.', 172, 'todo', '{"release":"v28.50"}'::jsonb)
on conflict (product_key, task_key) do update
set section = excluded.section,
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    status = excluded.status,
    metadata = excluded.metadata,
    updated_at = now();

select pg_notify('pgrst', 'reload schema');
