-- V27.3 — Financial Flow polish
-- Optional budgets, Flow display preferences, nursery Tax-Free Childcare carry-through,
-- and recurring bill logo enrichment.

alter table spending_categories
  alter column monthly_budget drop not null;

alter table app_user_profiles
  add column if not exists spending_person_display_mode text not null default 'both',
  add column if not exists spending_date_format text not null default 'day_month_ordinal',
  add column if not exists spending_bill_logo_mode text not null default 'auto';

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'app_user_profiles_spending_person_display_mode_check') then
    alter table app_user_profiles drop constraint app_user_profiles_spending_person_display_mode_check;
  end if;
  alter table app_user_profiles add constraint app_user_profiles_spending_person_display_mode_check
    check (spending_person_display_mode in ('name', 'image', 'both'));

  if exists (select 1 from pg_constraint where conname = 'app_user_profiles_spending_date_format_check') then
    alter table app_user_profiles drop constraint app_user_profiles_spending_date_format_check;
  end if;
  alter table app_user_profiles add constraint app_user_profiles_spending_date_format_check
    check (spending_date_format in ('day_month_ordinal', 'day_of_month', 'month_day', 'short_numeric', 'iso'));

  if exists (select 1 from pg_constraint where conname = 'app_user_profiles_spending_bill_logo_mode_check') then
    alter table app_user_profiles drop constraint app_user_profiles_spending_bill_logo_mode_check;
  end if;
  alter table app_user_profiles add constraint app_user_profiles_spending_bill_logo_mode_check
    check (spending_bill_logo_mode in ('auto', 'off'));
end $$;

alter table planned_items
  add column if not exists brand_name text,
  add column if not exists brand_domain text,
  add column if not exists brand_logo_url text,
  add column if not exists brand_logo_source text,
  add column if not exists brand_logo_checked_at timestamptz;

create index if not exists planned_items_user_brand_logo_missing_idx
  on planned_items(user_id, direction, brand_logo_checked_at)
  where brand_logo_url is null;

-- Keep the planner constraint aligned with the richer item-type dropdown in Financial Flow.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'planned_items_item_type_check') then
    alter table planned_items drop constraint planned_items_item_type_check;
  end if;

  alter table planned_items add constraint planned_items_item_type_check
    check (item_type in (
      'salary_topup','child_benefit','dividend','bonus','interest',
      'subscription','utilities','mobile_phone','insurance','mortgage_rent',
      'childcare','school_activity','grocery','transport','healthcare',
      'debt_payment','saving_investment','monthly_cost','bill','one_off',
      'manual_income','transfer'
    ));
end $$;

select pg_notify('pgrst', 'reload schema');
