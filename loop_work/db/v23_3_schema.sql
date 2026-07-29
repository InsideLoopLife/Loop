-- Life Tracker V23.3 migration
-- Adds payment-timing rules for calendar ordering and dashboard due-date logic.

alter table planned_items add column if not exists payment_timing text not null default 'fixed_day';
alter table planned_items add column if not exists payment_adjustment text not null default 'previous_workday';

alter table pay_events add column if not exists payment_timing text not null default 'last_workday';
alter table pay_events add column if not exists payment_day_of_month integer;
alter table pay_events add column if not exists payment_adjustment text not null default 'previous_workday';

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'planned_items_payment_timing_check') then
    alter table planned_items drop constraint planned_items_payment_timing_check;
  end if;
  alter table planned_items add constraint planned_items_payment_timing_check
  check (payment_timing in ('fixed_day', 'last_workday'));

  if exists (select 1 from pg_constraint where conname = 'planned_items_payment_adjustment_check') then
    alter table planned_items drop constraint planned_items_payment_adjustment_check;
  end if;
  alter table planned_items add constraint planned_items_payment_adjustment_check
  check (payment_adjustment in ('previous_workday', 'next_workday', 'none'));

  if exists (select 1 from pg_constraint where conname = 'pay_events_payment_timing_check') then
    alter table pay_events drop constraint pay_events_payment_timing_check;
  end if;
  alter table pay_events add constraint pay_events_payment_timing_check
  check (payment_timing in ('fixed_day', 'last_workday'));

  if exists (select 1 from pg_constraint where conname = 'pay_events_payment_adjustment_check') then
    alter table pay_events drop constraint pay_events_payment_adjustment_check;
  end if;
  alter table pay_events add constraint pay_events_payment_adjustment_check
  check (payment_adjustment in ('previous_workday', 'next_workday', 'none'));

  if exists (select 1 from pg_constraint where conname = 'pay_events_payment_day_check') then
    alter table pay_events drop constraint pay_events_payment_day_check;
  end if;
  alter table pay_events add constraint pay_events_payment_day_check
  check (payment_day_of_month is null or (payment_day_of_month >= 1 and payment_day_of_month <= 31));
end $$;

create index if not exists planned_items_user_payment_idx on planned_items(user_id, payment_timing, payment_adjustment);
create index if not exists pay_events_user_payment_idx on pay_events(user_id, payment_timing, payment_adjustment);

select pg_notify('pgrst', 'reload schema');
