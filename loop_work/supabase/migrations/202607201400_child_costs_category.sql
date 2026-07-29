begin;

alter table public.child_costs
  add column if not exists category_id uuid references public.spending_categories(id) on delete set null;

create index if not exists child_costs_category_idx
  on public.child_costs(category_id);

notify pgrst, 'reload schema';

commit;
