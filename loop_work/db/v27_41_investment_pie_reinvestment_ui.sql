-- v27.41: investment pie reinvestment/dividend assumptions and grouped allocation UX

create table if not exists public.investment_pie_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid not null references public.investment_accounts(id) on delete cascade,
  group_label text not null,
  monthly_reinvest_amount numeric(14,2) not null default 0,
  reinvest_frequency text not null default 'monthly' check (reinvest_frequency in ('weekly', 'fortnightly', 'monthly', 'quarterly')),
  expected_dividend_yield_percent numeric(8,4) not null default 0,
  auto_reinvest_dividends boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, investment_account_id, group_label)
);

alter table public.investment_pie_settings enable row level security;

do $$
begin
  create policy investment_pie_settings_select_own on public.investment_pie_settings
    for select using ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy investment_pie_settings_insert_own on public.investment_pie_settings
    for insert with check ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy investment_pie_settings_update_own on public.investment_pie_settings
    for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy investment_pie_settings_delete_own on public.investment_pie_settings
    for delete using ((select auth.uid()) = user_id);
exception when duplicate_object then null;
end $$;

create index if not exists investment_pie_settings_account_idx
  on public.investment_pie_settings(user_id, investment_account_id, group_label);

-- Backfill a settings row for existing Trading 212 pie groups so the UI can be configured immediately.
insert into public.investment_pie_settings (user_id, investment_account_id, group_label)
select distinct user_id, investment_account_id, group_label
from public.investment_holdings
where nullif(trim(group_label), '') is not null
on conflict do nothing;

notify pgrst, 'reload schema';
