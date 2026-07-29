-- v27.22 Notifications and private beta access gate support

alter table if exists app_notifications
  add column if not exists channel text not null default 'in_app',
  add column if not exists category text,
  add column if not exists action_status text,
  add column if not exists period_key text,
  add column if not exists expires_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists app_notifications_user_category_status_idx
  on app_notifications(user_id, category, status, created_at desc);

create index if not exists app_notifications_user_action_idx
  on app_notifications(user_id, action_status, created_at desc);

update app_notifications
set category = case
  when lower(notification_type) like '%nutrition%' or lower(notification_type) like '%food%' or lower(notification_type) like '%meal%' or lower(notification_type) like '%health%' then 'lifestyle'
  when lower(notification_type) like '%investment%' or lower(notification_type) like '%stock%' or lower(notification_type) like '%finance%' or lower(notification_type) like '%money%' or lower(notification_type) like '%mortgage%' or lower(notification_type) like '%renewal%' then 'wealth'
  when lower(notification_type) like '%household%' or lower(notification_type) like '%invite%' or lower(notification_type) like '%profile%' or lower(notification_type) like '%allocation%' then 'household'
  else 'system'
end
where category is null;

-- Optional queue table for future async/background jobs shown in notifications.
create table if not exists app_background_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  household_id uuid,
  job_type text not null,
  status text not null default 'queued',
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  source_label text,
  source_url text,
  result_href text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table app_background_jobs enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_background_jobs' and policyname = 'Users can read their own background jobs') then
    create policy "Users can read their own background jobs" on app_background_jobs for select using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_background_jobs' and policyname = 'Users can insert their own background jobs') then
    create policy "Users can insert their own background jobs" on app_background_jobs for insert with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_background_jobs' and policyname = 'Users can update their own background jobs') then
    create policy "Users can update their own background jobs" on app_background_jobs for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
  end if;
end $$;

create index if not exists app_background_jobs_user_status_idx on app_background_jobs(user_id, status, created_at desc);
