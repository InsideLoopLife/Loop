-- Life Tracker V4 migration
-- Run this after V3. It fixes schema-cache issues and adds:
-- pay event types, simple/advanced childcare modelling, activities and bank-holiday-aware monthly forecasts.

alter table pay_events add column if not exists pay_kind text not null default 'salary';

-- V3 compatibility: add the richer nursery columns too, so this file can be run even if V3 was missed.
alter table child_costs add column if not exists cost_kind text not null default 'fixed';
alter table child_costs add column if not exists billing_month date;
alter table child_costs add column if not exists daily_rate numeric(12,2) not null default 0;
alter table child_costs add column if not exists extra_daily_cost numeric(12,2) not null default 0;
alter table child_costs add column if not exists funded_hours_per_week numeric(8,2) not null default 0;
alter table child_costs add column if not exists funding_mode text not null default 'none';
alter table child_costs add column if not exists hourly_funding_credit numeric(12,2) not null default 0;
alter table child_costs add column if not exists term_weeks_per_year numeric(8,2) not null default 38;
alter table child_costs add column if not exists monday_hours numeric(8,2) not null default 0;
alter table child_costs add column if not exists tuesday_hours numeric(8,2) not null default 0;
alter table child_costs add column if not exists wednesday_hours numeric(8,2) not null default 0;
alter table child_costs add column if not exists thursday_hours numeric(8,2) not null default 0;
alter table child_costs add column if not exists friday_hours numeric(8,2) not null default 0;


do $$
begin
  if exists (select 1 from pg_constraint where conname = 'pay_events_pay_kind_check') then
    alter table pay_events drop constraint pay_events_pay_kind_check;
  end if;

  alter table pay_events add constraint pay_events_pay_kind_check
  check (pay_kind in ('salary', 'maternity', 'return_to_work', 'other'));
end $$;

alter table child_costs add column if not exists billing_schedule text not null default 'all_year';
alter table child_costs add column if not exists bank_holidays_are_free boolean not null default true;
alter table child_costs add column if not exists part_day_multiplier numeric(5,2) not null default 0.5;
alter table child_costs add column if not exists full_day_hours numeric(8,2) not null default 10;
alter table child_costs add column if not exists part_day_hours numeric(8,2) not null default 5;
alter table child_costs add column if not exists monday_session text not null default 'off';
alter table child_costs add column if not exists tuesday_session text not null default 'off';
alter table child_costs add column if not exists wednesday_session text not null default 'off';
alter table child_costs add column if not exists thursday_session text not null default 'off';
alter table child_costs add column if not exists friday_session text not null default 'off';
alter table child_costs add column if not exists activity_weekly_cost numeric(12,2) not null default 0;
alter table child_costs add column if not exists activity_weekday integer not null default 6;
alter table child_costs add column if not exists activity_billing_mode text not null default 'calendar';
alter table child_costs add column if not exists activity_term_weeks_per_year numeric(8,2) not null default 38;

-- Replace old V3 cost-kind constraint so activities can be stored.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'child_costs_cost_kind_check') then
    alter table child_costs drop constraint child_costs_cost_kind_check;
  end if;

  alter table child_costs add constraint child_costs_cost_kind_check
  check (cost_kind in ('fixed', 'nursery', 'activity'));

  if exists (select 1 from pg_constraint where conname = 'child_costs_billing_schedule_check') then
    alter table child_costs drop constraint child_costs_billing_schedule_check;
  end if;

  alter table child_costs add constraint child_costs_billing_schedule_check
  check (billing_schedule in ('all_year', 'term_time'));

  if exists (select 1 from pg_constraint where conname = 'child_costs_day_session_check') then
    alter table child_costs drop constraint child_costs_day_session_check;
  end if;

  alter table child_costs add constraint child_costs_day_session_check
  check (
    monday_session in ('off', 'full', 'part') and
    tuesday_session in ('off', 'full', 'part') and
    wednesday_session in ('off', 'full', 'part') and
    thursday_session in ('off', 'full', 'part') and
    friday_session in ('off', 'full', 'part')
  );

  if exists (select 1 from pg_constraint where conname = 'child_costs_activity_billing_mode_check') then
    alter table child_costs drop constraint child_costs_activity_billing_mode_check;
  end if;

  alter table child_costs add constraint child_costs_activity_billing_mode_check
  check (activity_billing_mode in ('calendar', 'averaged_term'));
end $$;

create index if not exists pay_events_person_month_idx on pay_events(person_id, effective_from, effective_until);
create index if not exists child_costs_child_month_idx on child_costs(child_id, starts_on, ends_on);

-- Tell Supabase/PostgREST to refresh its schema cache immediately.
select pg_notify('pgrst', 'reload schema');
