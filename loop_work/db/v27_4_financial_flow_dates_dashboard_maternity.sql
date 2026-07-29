-- V27.4: Financial Flow date accuracy, maternity mode constraint, child-cost payment dates and dashboard display preferences.

alter table app_user_profiles
  add column if not exists dashboard_home_view text not null default 'breakdown',
  add column if not exists money_display_precision text not null default 'exact';

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'app_user_profiles_dashboard_home_view_check') then
    alter table app_user_profiles drop constraint app_user_profiles_dashboard_home_view_check;
  end if;
  alter table app_user_profiles add constraint app_user_profiles_dashboard_home_view_check
    check (dashboard_home_view in ('breakdown', 'financial_flow'));

  if exists (select 1 from pg_constraint where conname = 'app_user_profiles_money_display_precision_check') then
    alter table app_user_profiles drop constraint app_user_profiles_money_display_precision_check;
  end if;
  alter table app_user_profiles add constraint app_user_profiles_money_display_precision_check
    check (money_display_precision in ('rounded', 'exact'));
end $$;

alter table child_costs
  add column if not exists payment_timing text not null default 'fixed_day',
  add column if not exists payment_day_of_month integer not null default 1,
  add column if not exists payment_adjustment text not null default 'previous_workday';

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'child_costs_payment_timing_check') then
    alter table child_costs drop constraint child_costs_payment_timing_check;
  end if;
  alter table child_costs add constraint child_costs_payment_timing_check
    check (payment_timing in ('fixed_day', 'last_workday'));

  if exists (select 1 from pg_constraint where conname = 'child_costs_payment_day_of_month_check') then
    alter table child_costs drop constraint child_costs_payment_day_of_month_check;
  end if;
  alter table child_costs add constraint child_costs_payment_day_of_month_check
    check (payment_day_of_month between 1 and 31);

  if exists (select 1 from pg_constraint where conname = 'child_costs_payment_adjustment_check') then
    alter table child_costs drop constraint child_costs_payment_adjustment_check;
  end if;
  alter table child_costs add constraint child_costs_payment_adjustment_check
    check (payment_adjustment in ('previous_workday', 'next_workday', 'none'));
end $$;

-- Earlier migrations allowed only spread_equal / actual_by_week. The UI now saves the NHS hybrid mode too.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'pay_events_maternity_pay_mode_check') then
    alter table pay_events drop constraint pay_events_maternity_pay_mode_check;
  end if;
  alter table pay_events add constraint pay_events_maternity_pay_mode_check
    check (maternity_pay_mode is null or maternity_pay_mode in ('spread_equal', 'actual_by_week', 'nhs_spread_occupational_actual_smp'));
end $$;
