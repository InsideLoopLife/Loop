-- v28.47 savings accrual display + worker/market-session support

alter table if exists public.financial_accounts
  add column if not exists balance_last_confirmed_value numeric(14,2),
  add column if not exists balance_last_confirmed_at timestamptz,
  add column if not exists interest_accrual_frequency text default 'daily',
  add column if not exists interest_compounding_frequency text default 'monthly';

update public.financial_accounts
set balance_last_confirmed_value = coalesce(balance_last_confirmed_value, current_balance),
    balance_last_confirmed_at = coalesce(balance_last_confirmed_at, updated_at, created_at, now()),
    interest_accrual_frequency = coalesce(nullif(interest_accrual_frequency, ''), 'daily'),
    interest_compounding_frequency = coalesce(nullif(interest_compounding_frequency, ''), 'monthly')
where coalesce(is_liability, false) = false;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'financial_accounts_interest_accrual_frequency_check') then
    alter table public.financial_accounts drop constraint financial_accounts_interest_accrual_frequency_check;
  end if;
  alter table public.financial_accounts add constraint financial_accounts_interest_accrual_frequency_check
    check (interest_accrual_frequency in ('none','daily','monthly','annually','maturity'));
exception when duplicate_object then null;
end $$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'financial_accounts_interest_compounding_frequency_check') then
    alter table public.financial_accounts drop constraint financial_accounts_interest_compounding_frequency_check;
  end if;
  alter table public.financial_accounts add constraint financial_accounts_interest_compounding_frequency_check
    check (interest_compounding_frequency in ('none','daily','monthly','annually','maturity'));
exception when duplicate_object then null;
end $$;

create index if not exists financial_accounts_balance_confirmed_idx
  on public.financial_accounts(balance_last_confirmed_at);

insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('savings_accrual_display_enabled', 'true', 'Savings cards show an estimated balance from the last confirmed balance, interest rate and account accrual cadence.'),
  ('market_worker_snaptrade_optional_import', 'true', 'The market-data worker keeps investment price jobs running even if the SnapTrade sync module is absent from a deploy.'),
  ('market_session_holiday_guard_enabled', 'true', 'Known exchange holiday/session checks stop the UI showing stale live-market warnings when a market is closed.')
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    description = excluded.description;

notify pgrst, 'reload schema';
