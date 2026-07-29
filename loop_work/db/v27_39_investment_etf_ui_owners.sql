-- v27.39: investment ETF discovery, owner chips, view mode and safer pot deletion UI

alter table if exists public.app_user_profiles
  add column if not exists investment_view_mode text not null default 'lines';

alter table if exists public.app_user_profiles
  drop constraint if exists app_user_profiles_investment_view_mode_check;

alter table if exists public.app_user_profiles
  add constraint app_user_profiles_investment_view_mode_check
  check (investment_view_mode in ('lines', 'squares'));

create table if not exists public.investment_account_owners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid not null references public.investment_accounts(id) on delete cascade,
  person_id uuid references public.people(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, investment_account_id, person_id)
);

insert into public.investment_account_owners (user_id, investment_account_id, person_id)
select user_id, id, person_id
from public.investment_accounts
where person_id is not null
on conflict do nothing;

alter table public.investment_account_owners enable row level security;

do $$
begin
  create policy investment_account_owners_select_own on public.investment_account_owners
    for select using ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy investment_account_owners_insert_own on public.investment_account_owners
    for insert with check ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy investment_account_owners_update_own on public.investment_account_owners
    for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy investment_account_owners_delete_own on public.investment_account_owners
    for delete using ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

create index if not exists investment_account_owners_account_idx
  on public.investment_account_owners(user_id, investment_account_id);

-- Make common UK ETF rows easier to recognise after imports/manual creation.
update public.investment_holdings
set asset_kind = 'etf', price_quote_unit = coalesce(nullif(price_quote_unit, ''), 'gbx')
where user_id is not null
  and upper(coalesce(exchange, '')) = 'LSE'
  and upper(coalesce(ticker, '')) in ('VWRP','VWRL','VUAG','VUSA','VHVG','VFEM','IUSA','CSP1','EQQQ','VUKG','VUKE');

notify pgrst, 'reload schema';
