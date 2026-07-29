-- v28.54 - opening-baseline investment movement, pension provider status and LoopWatch AI classification polish
-- Safe to rerun.

create extension if not exists pgcrypto;

-- Investment daily movement now uses the first Loop price point stored for the current trading date/session.
alter table public.investment_holdings
  add column if not exists session_open_price_gbp numeric(18,8),
  add column if not exists session_open_native_price numeric(18,8),
  add column if not exists session_open_at timestamptz,
  add column if not exists day_change_basis text not null default 'session_open';

alter table public.investment_price_snapshots
  add column if not exists session_open_price_gbp numeric(18,8),
  add column if not exists session_open_native_price numeric(18,8),
  add column if not exists session_open_at timestamptz,
  add column if not exists day_change_basis text not null default 'session_open';

create index if not exists investment_price_points_listing_day_open_idx
  on public.investment_instrument_price_points(listing_id, point_at asc)
  where listing_id is not null;

create index if not exists investment_price_points_symbol_day_open_idx
  on public.investment_instrument_price_points(ticker, exchange_code, point_at asc);

create index if not exists investment_holdings_day_change_basis_idx
  on public.investment_holdings(user_id, day_change_basis)
  where record_status is null or record_status <> 'archived';

-- Pension provider status: do not imply PensionBee/L&G are auto-pulled unless a provider feed supplies values.
alter table public.pension_accounts
  add column if not exists provider_refresh_enabled boolean not null default true,
  add column if not exists provider_refresh_status text,
  add column if not exists provider_refresh_notes text,
  add column if not exists last_provider_refresh_at timestamptz,
  add column if not exists provider_stale_after_days integer not null default 30;

alter table public.pension_funds
  add column if not exists provider_refresh_status text,
  add column if not exists provider_refresh_notes text,
  add column if not exists last_provider_refresh_at timestamptz;

update public.pension_accounts
set provider_refresh_enabled = true,
    provider_refresh_status = case
      when lower(provider) like '%pensionbee%' or lower(provider) like '%pension bee%' then 'manual_provider_value'
      when lower(provider) like '%legal%' or lower(provider) like '%l&g%' or lower(provider) like '%lgim%' then
        case when coalesce(valuation_mode, 'fund_units') = 'provider_value' then 'manual_provider_value' else 'fund_values_review' end
      when coalesce(valuation_mode, 'fund_units') = 'provider_value' then 'manual_provider_value'
      else 'fund_values_review'
    end,
    provider_refresh_notes = case
      when lower(provider) like '%pensionbee%' or lower(provider) like '%pension bee%' then 'PensionBee account values are not automatically pulled unless a connected provider feed supplies them. Upload a statement through LoopWatch or edit the confirmed pot value.'
      when lower(provider) like '%legal%' or lower(provider) like '%l&g%' or lower(provider) like '%lgim%' then 'L&G workplace pensions are plan-specific. Loop stores confirmed provider values or confirmed fund rows; the workplace portal remains the source of truth.'
      else coalesce(provider_refresh_notes, 'Loop stores the latest confirmed pension value. Provider login/API sync is not assumed unless a connected provider feed supplies it.')
    end,
    last_provider_refresh_at = coalesce(last_provider_refresh_at, now())
where provider_refresh_status is null;

-- LoopWatch: allow pension statements as a first-class metadata-only intake type.
insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('investment_daily_movement_basis', 'session_open', 'Investment cards use change since the first Loop price point stored for today/session rather than provider previous close.'),
  ('pension_provider_refresh_mode', 'confirmed_value_or_connected_feed', 'PensionBee/L&G values are shown as confirmed/manual unless a connected feed or LoopWatch statement updates them.'),
  ('loopwatch_ai_model_policy', 'mini_no_web', 'LoopWatch document extraction may use configured GPT mini models, but not web-search tools, and does not store source files.')
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    description = excluded.description;

insert into public.app_future_integration_tasks(product_key, task_key, section, title, description, priority, status, metadata)
values
  ('investments', 'opening-baseline-daily-movement', 'market-data', 'Use opening baseline for daily movement', 'Daily movement now uses the first Loop price point stored for the current session/date, avoiding unreliable previous-close provider data on first import.', 181, 'done', '{"release":"v28.54"}'::jsonb),
  ('investments', 'pension-provider-status-health', 'pensions', 'Pension provider refresh status', 'PensionBee/L&G pots now show whether they are manual provider-value pots, fund-row pots or need a statement/value refresh.', 182, 'done', '{"release":"v28.54"}'::jsonb),
  ('loopwatch', 'pension-statement-intake', 'intake', 'Pension statement intake', 'LoopWatch can classify PensionBee/L&G/workplace pension statements and suggest updating pension pot values after review.', 183, 'done', '{"release":"v28.54"}'::jsonb),
  ('loopwatch', 'mini-ai-document-classifier-no-web', 'ai', 'Mini AI document classifier without web', 'LoopWatch AI extraction is configured for mini models and does not attach web-search tools.', 184, 'done', '{"release":"v28.54"}'::jsonb)
on conflict (product_key, task_key) do update
set section = excluded.section,
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    status = excluded.status,
    metadata = excluded.metadata,
    updated_at = now();

select pg_notify('pgrst', 'reload schema');
