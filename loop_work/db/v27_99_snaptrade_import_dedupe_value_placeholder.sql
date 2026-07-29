-- LOOP v27.99 SnapTrade import dedupe + account-value placeholder
-- Fixes: duplicate connected account cards from SnapTrade account previews, imported account showing £0 when provider returns account value but no positions yet.

alter table if exists public.investment_accounts
  add column if not exists external_provider text,
  add column if not exists external_connection_id text,
  add column if not exists external_account_id text,
  add column if not exists external_account_raw jsonb not null default '{}'::jsonb,
  add column if not exists provider_import_enabled boolean not null default false,
  add column if not exists sync_status text,
  add column if not exists last_provider_sync_at timestamptz,
  add column if not exists record_status text not null default 'active',
  add column if not exists archive_reason text,
  add column if not exists archived_at timestamptz,
  add column if not exists provider_migration_status text;

alter table if exists public.investment_holdings
  add column if not exists external_provider text,
  add column if not exists external_account_id text,
  add column if not exists external_position_id text,
  add column if not exists external_position_raw jsonb not null default '{}'::jsonb,
  add column if not exists imported_current_value numeric(16,2),
  add column if not exists imported_invested_value numeric(16,2),
  add column if not exists imported_result_value numeric(16,2),
  add column if not exists imported_account_currency text,
  add column if not exists import_source_type text,
  add column if not exists last_provider_sync_at timestamptz,
  add column if not exists record_status text not null default 'active',
  add column if not exists archive_reason text,
  add column if not exists archived_at timestamptz,
  add column if not exists provider_migration_status text;

create unique index if not exists investment_accounts_snaptrade_external_unique
  on public.investment_accounts(user_id, external_provider, external_account_id)
  where external_provider is not null and external_account_id is not null;

create unique index if not exists investment_holdings_snaptrade_external_unique
  on public.investment_holdings(user_id, investment_account_id, external_provider, external_position_id)
  where external_provider is not null and external_position_id is not null;

create or replace function public.loop_v2799_try_numeric(p_value text)
returns numeric
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  if btrim(p_value) ~ '^-?[0-9]+(\.[0-9]+)?$' then
    return btrim(p_value)::numeric;
  end if;
  return null;
exception when others then
  return null;
end $$;

with snaptrade_account_values as (
  select
    a.id as account_id,
    a.user_id,
    a.external_account_id,
    a.provider,
    a.account_type,
    coalesce(
      public.loop_v2799_try_numeric(a.external_account_raw #>> '{balance,total,amount}'),
      public.loop_v2799_try_numeric(a.external_account_raw #>> '{balance,total}'),
      public.loop_v2799_try_numeric(a.external_account_raw #>> '{total_value,amount}'),
      public.loop_v2799_try_numeric(a.external_account_raw #>> '{total_value}'),
      public.loop_v2799_try_numeric(a.external_account_raw #>> '{market_value,amount}'),
      public.loop_v2799_try_numeric(a.external_account_raw #>> '{market_value}')
    ) as account_value,
    upper(coalesce(
      nullif(a.external_account_raw #>> '{currency,code}', ''),
      nullif(a.external_account_raw #>> '{currency}', ''),
      'GBP'
    )) as account_currency
  from public.investment_accounts a
  where lower(coalesce(a.external_provider, '')) = 'snaptrade'
    and coalesce(a.record_status, 'active') <> 'archived'
), active_snaptrade_accounts_without_holdings as (
  select s.*
  from snaptrade_account_values s
  where coalesce(s.account_value, 0) > 0
    and not exists (
      select 1
      from public.investment_holdings h
      where h.user_id = s.user_id
        and h.investment_account_id = s.account_id
        and coalesce(h.record_status, 'active') <> 'archived'
    )
)
insert into public.investment_holdings (
  user_id,
  investment_account_id,
  asset_name,
  ticker,
  exchange,
  asset_kind,
  units,
  average_buy_price,
  latest_price,
  latest_price_date,
  currency,
  annual_asset_fee_percent,
  target_allocation_percent,
  price_polling_enabled,
  notes,
  external_provider,
  external_account_id,
  external_position_id,
  external_position_raw,
  imported_current_value,
  imported_account_currency,
  import_source_type,
  last_provider_sync_at,
  record_status
)
select
  s.user_id,
  s.account_id,
  coalesce(nullif(s.provider, ''), 'Broker') || ' account value',
  null,
  null,
  'other',
  1,
  s.account_value,
  s.account_value,
  current_date,
  s.account_currency,
  0,
  0,
  false,
  'SnapTrade account-level value placeholder. The provider returned account value before position-level holdings; refresh later to replace with actual positions.',
  'snaptrade',
  s.external_account_id,
  s.external_account_id || ':account-value',
  jsonb_build_object('synthetic', true, 'source', 'v27_99_backfill', 'reason', 'account value without positions'),
  s.account_value,
  s.account_currency,
  'snaptrade',
  now(),
  'active'
from active_snaptrade_accounts_without_holdings s
on conflict do nothing;

with snaptrade_account_values as (
  select
    a.id as account_id,
    a.user_id,
    a.external_account_id,
    coalesce(
      public.loop_v2799_try_numeric(a.external_account_raw #>> '{balance,total,amount}'),
      public.loop_v2799_try_numeric(a.external_account_raw #>> '{balance,total}'),
      public.loop_v2799_try_numeric(a.external_account_raw #>> '{total_value,amount}'),
      public.loop_v2799_try_numeric(a.external_account_raw #>> '{total_value}'),
      public.loop_v2799_try_numeric(a.external_account_raw #>> '{market_value,amount}'),
      public.loop_v2799_try_numeric(a.external_account_raw #>> '{market_value}')
    ) as account_value,
    upper(coalesce(
      nullif(a.external_account_raw #>> '{currency,code}', ''),
      nullif(a.external_account_raw #>> '{currency}', ''),
      'GBP'
    )) as account_currency
  from public.investment_accounts a
  where lower(coalesce(a.external_provider, '')) = 'snaptrade'
    and coalesce(a.record_status, 'active') <> 'archived'
)
update public.investment_holdings h
set imported_current_value = s.account_value,
    latest_price = s.account_value,
    average_buy_price = s.account_value,
    currency = s.account_currency,
    imported_account_currency = s.account_currency,
    last_provider_sync_at = now(),
    notes = 'SnapTrade account-level value placeholder. The provider returned account value before position-level holdings; refresh later to replace with actual positions.'
from snaptrade_account_values s
where h.user_id = s.user_id
  and h.investment_account_id = s.account_id
  and h.external_position_id = s.external_account_id || ':account-value'
  and coalesce(s.account_value, 0) > 0
  and coalesce(h.record_status, 'active') <> 'archived';
