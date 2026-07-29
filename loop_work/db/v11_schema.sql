-- V11: Assumptions workspace and check log.
-- This keeps statutory/tax/student-loan/SMP/stamp-duty assumptions visible and auditable.

create table if not exists assumption_check_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  area text not null,
  related_table text,
  related_id uuid,
  status text not null default 'ok' check (status in ('ok', 'warning', 'needs_review')),
  message text not null,
  assumption_keys text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table assumption_check_log enable row level security;

drop policy if exists "assumption_check_log_select_own" on assumption_check_log;
create policy "assumption_check_log_select_own" on assumption_check_log for select using ((select auth.uid()) = user_id);

drop policy if exists "assumption_check_log_insert_own" on assumption_check_log;
create policy "assumption_check_log_insert_own" on assumption_check_log for insert with check ((select auth.uid()) = user_id);

drop policy if exists "assumption_check_log_update_own" on assumption_check_log;
create policy "assumption_check_log_update_own" on assumption_check_log for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "assumption_check_log_delete_own" on assumption_check_log;
create policy "assumption_check_log_delete_own" on assumption_check_log for delete using ((select auth.uid()) = user_id);

alter table statutory_rate_assumptions add column if not exists category text;
alter table statutory_rate_assumptions add column if not exists verified_by text default 'manual';
alter table statutory_rate_assumptions add column if not exists review_status text default 'active' check (review_status in ('active', 'needs_review', 'archived'));

create index if not exists assumption_check_log_user_created_idx on assumption_check_log(user_id, created_at desc);
create index if not exists statutory_rate_assumptions_user_category_idx on statutory_rate_assumptions(user_id, category, rate_key);

select pg_notify('pgrst', 'reload schema');
