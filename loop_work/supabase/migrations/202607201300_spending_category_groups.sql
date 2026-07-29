begin;

create table if not exists public.spending_category_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,
  household_id uuid references public.app_households(id) on delete cascade,
  visibility_scope text not null default 'household' check (visibility_scope in ('private','household')),
  name text not null check (char_length(name) between 1 and 60),
  icon text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists spending_category_groups_household_idx
  on public.spending_category_groups(household_id);
create index if not exists spending_category_groups_user_idx
  on public.spending_category_groups(user_id);

alter table public.spending_categories
  add column if not exists group_id uuid references public.spending_category_groups(id) on delete set null;

create index if not exists spending_categories_group_idx
  on public.spending_categories(group_id);

alter table public.spending_category_groups enable row level security;

drop policy if exists spending_category_groups_read on public.spending_category_groups;
create policy spending_category_groups_read on public.spending_category_groups
for select to authenticated
using (
  user_id = auth.uid()
  or (
    visibility_scope = 'household'
    and household_id is not null
    and exists (
      select 1 from public.app_household_members m
      where m.household_id = spending_category_groups.household_id
        and m.user_id = auth.uid()
        and coalesce(m.status, 'active') = 'active'
    )
  )
);

drop policy if exists spending_category_groups_insert on public.spending_category_groups;
create policy spending_category_groups_insert on public.spending_category_groups
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists spending_category_groups_update on public.spending_category_groups;
create policy spending_category_groups_update on public.spending_category_groups
for update to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.app_household_members m
    where m.household_id = spending_category_groups.household_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(m.permission_tier, 'member') in ('owner','admin','parent','parent_admin')
  )
)
with check (
  user_id = auth.uid()
  or exists (
    select 1 from public.app_household_members m
    where m.household_id = spending_category_groups.household_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(m.permission_tier, 'member') in ('owner','admin','parent','parent_admin')
  )
);

drop policy if exists spending_category_groups_delete on public.spending_category_groups;
create policy spending_category_groups_delete on public.spending_category_groups
for delete to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.app_household_members m
    where m.household_id = spending_category_groups.household_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
      and coalesce(m.permission_tier, 'member') in ('owner','admin','parent','parent_admin')
  )
);

notify pgrst, 'reload schema';

commit;
