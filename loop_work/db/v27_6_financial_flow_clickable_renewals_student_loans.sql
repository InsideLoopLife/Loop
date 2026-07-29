-- V27.6: clickable Financial Flow filters, bill lifecycle / renewal tracking and manual student loan balances.

alter table planned_items
  add column if not exists end_behavior text not null default 'drops_off',
  add column if not exists renewal_notice_days integer not null default 30,
  add column if not exists early_upgrade_date date,
  add column if not exists expected_refund_amount numeric(12,2) not null default 0;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'planned_items_end_behavior_check') then
    alter table planned_items drop constraint planned_items_end_behavior_check;
  end if;

  alter table planned_items add constraint planned_items_end_behavior_check
    check (end_behavior in ('drops_off', 'renews', 'review_needed'));

  if exists (select 1 from pg_constraint where conname = 'planned_items_renewal_notice_days_check') then
    alter table planned_items drop constraint planned_items_renewal_notice_days_check;
  end if;

  alter table planned_items add constraint planned_items_renewal_notice_days_check
    check (renewal_notice_days is null or (renewal_notice_days >= 0 and renewal_notice_days <= 365));
end $$;

create index if not exists planned_items_user_lifecycle_idx
  on planned_items(user_id, end_date, end_behavior)
  where end_date is not null;

create table if not exists student_loan_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  plan text not null default 'plan_1',
  current_balance numeric(12,2) not null default 0,
  balance_date date not null default current_date,
  interest_rate numeric(6,3),
  payroll_monthly_override numeric(12,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table student_loan_accounts enable row level security;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'student_loan_accounts_plan_check') then
    alter table student_loan_accounts drop constraint student_loan_accounts_plan_check;
  end if;

  alter table student_loan_accounts add constraint student_loan_accounts_plan_check
    check (plan in ('plan_1', 'plan_2', 'plan_4', 'plan_5', 'postgraduate'));
end $$;

create index if not exists student_loan_accounts_user_person_idx
  on student_loan_accounts(user_id, person_id, plan);

drop policy if exists "student_loan_accounts_select_own" on student_loan_accounts;
create policy "student_loan_accounts_select_own" on student_loan_accounts
for select using ((select auth.uid()) = user_id);

drop policy if exists "student_loan_accounts_insert_own" on student_loan_accounts;
create policy "student_loan_accounts_insert_own" on student_loan_accounts
for insert with check ((select auth.uid()) = user_id);

drop policy if exists "student_loan_accounts_update_own" on student_loan_accounts;
create policy "student_loan_accounts_update_own" on student_loan_accounts
for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "student_loan_accounts_delete_own" on student_loan_accounts;
create policy "student_loan_accounts_delete_own" on student_loan_accounts
for delete using ((select auth.uid()) = user_id);

select pg_notify('pgrst', 'reload schema');
