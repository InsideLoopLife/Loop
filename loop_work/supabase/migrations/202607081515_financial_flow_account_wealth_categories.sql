-- v28.73 Financial Flow account wealth toggles and standard category seed

alter table if exists public.app_user_profiles
  add column if not exists financial_flow_student_loan_enabled boolean not null default false,
  add column if not exists financial_flow_show_person_names boolean not null default false,
  add column if not exists child_profile_avatar_mode text not null default 'safe_characters';

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'app_user_profiles_child_profile_avatar_mode_check') then
    alter table public.app_user_profiles drop constraint app_user_profiles_child_profile_avatar_mode_check;
  end if;
  alter table public.app_user_profiles add constraint app_user_profiles_child_profile_avatar_mode_check
    check (child_profile_avatar_mode in ('safe_characters','uploaded_images','anonymous_tokens'));
end $$;

alter table if exists public.spending_categories
  add column if not exists standard_category_key text,
  add column if not exists is_standard_category boolean not null default false,
  add column if not exists category_icon text;

with default_categories(name, category_type, icon, category_key) as (
  values
    ('House', 'fixed', '🏠', 'house'),
    ('Bills', 'fixed', '⚡', 'bills'),
    ('Insurance', 'fixed', '🛡️', 'insurance'),
    ('Food shopping', 'variable', '🛒', 'food'),
    ('Travel', 'variable', '🚗', 'travel'),
    ('Childcare', 'fixed', '👶', 'childcare'),
    ('Subscriptions', 'fixed', '📱', 'subscriptions'),
    ('Fun', 'variable', '✨', 'fun'),
    ('Health', 'variable', '💚', 'health'),
    ('Debt', 'debt', '💳', 'debt'),
    ('Savings', 'saving', '🐷', 'savings'),
    ('Investments', 'saving', '📈', 'investments'),
    ('Pension', 'saving', '🎯', 'pension')
), category_owners as (
  select distinct user_id from public.app_user_profiles where user_id is not null
  union
  select distinct user_id from public.spending_categories where user_id is not null
  union
  select distinct user_id from public.planned_items where user_id is not null
)
insert into public.spending_categories(user_id, name, type, category_icon, monthly_budget, standard_category_key, is_standard_category)
select o.user_id, d.name, d.category_type, d.icon, 0, d.category_key, true
from category_owners o
cross join default_categories d
where not exists (
  select 1 from public.spending_categories c
  where c.user_id = o.user_id
    and (lower(c.name) = lower(d.name) or c.standard_category_key = d.category_key)
);

update public.spending_categories c
set
  standard_category_key = case
    when lower(c.name) in ('house','home','mortgage','rent') then 'house'
    when lower(c.name) in ('bills','utilities','utility bills') then 'bills'
    when lower(c.name) = 'insurance' then 'insurance'
    when lower(c.name) in ('food','food shopping','grocery','groceries') then 'food'
    when lower(c.name) = 'travel' then 'travel'
    when lower(c.name) in ('childcare','child costs') then 'childcare'
    when lower(c.name) in ('subscriptions','streaming') then 'subscriptions'
    when lower(c.name) in ('fun','entertainment') then 'fun'
    when lower(c.name) = 'health' then 'health'
    when lower(c.name) = 'debt' then 'debt'
    when lower(c.name) = 'savings' then 'savings'
    when lower(c.name) = 'investments' then 'investments'
    when lower(c.name) = 'pension' then 'pension'
    else c.standard_category_key
  end,
  is_standard_category = coalesce(c.is_standard_category,false) or lower(c.name) in ('house','home','mortgage','rent','bills','utilities','utility bills','insurance','food','food shopping','grocery','groceries','travel','childcare','child costs','subscriptions','streaming','fun','entertainment','health','debt','savings','investments','pension')
where c.standard_category_key is null or c.is_standard_category = false;

notify pgrst, 'reload schema';
