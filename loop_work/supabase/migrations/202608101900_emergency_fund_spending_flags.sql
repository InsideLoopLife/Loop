begin;

alter table public.spending_category_groups
  add column if not exists emergency_fund_essential boolean not null default false;

alter table public.spending_categories
  add column if not exists emergency_fund_essential boolean not null default false;

update public.spending_categories
set emergency_fund_essential = true
where lower(coalesce(standard_category_key, '')) in
  ('house', 'bills', 'insurance', 'debt', 'childcare', 'car');

comment on column public.spending_category_groups.emergency_fund_essential is
  'When true, all outgoing categories in the group contribute to Loop emergency-fund targets.';
comment on column public.spending_categories.emergency_fund_essential is
  'When true, outgoing items in this category contribute to Loop emergency-fund targets.';

notify pgrst, 'reload schema';
commit;
