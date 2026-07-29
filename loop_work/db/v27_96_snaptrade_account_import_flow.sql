-- LOOP v27.96 SnapTrade account import flow
-- Adds the provider/account mapping fields required after a successful SnapTrade connection.
-- Connection != import: the user can connect a broker, then choose which brokerage accounts to track.

alter table if exists public.integration_connections
  add column if not exists external_connection_id text,
  add column if not exists review_status text default 'active',
  add column if not exists verified_by text,
  add column if not exists last_synced_at timestamptz;

alter table if exists public.investment_accounts
  add column if not exists external_provider text,
  add column if not exists external_connection_id text,
  add column if not exists external_account_id text,
  add column if not exists external_account_raw jsonb not null default '{}'::jsonb,
  add column if not exists provider_import_enabled boolean not null default false,
  add column if not exists sync_status text,
  add column if not exists last_provider_sync_at timestamptz;

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
  add column if not exists last_provider_sync_at timestamptz;

create unique index if not exists investment_accounts_snaptrade_external_unique
  on public.investment_accounts(user_id, external_provider, external_account_id)
  where external_provider is not null and external_account_id is not null;

create unique index if not exists investment_holdings_snaptrade_external_unique
  on public.investment_holdings(user_id, investment_account_id, external_provider, external_position_id)
  where external_provider is not null and external_position_id is not null;

-- Existing successful callbacks should show as connected immediately on the Investments page.
update public.app_user_profiles p
set market_data_provider_status = 'connected'
where exists (
  select 1
  from public.integration_connections c
  where c.user_id = p.user_id
    and lower(coalesce(c.provider, '')) = 'snaptrade'
    and lower(coalesce(c.status, '')) = 'connected'
);

update public.integration_connections
set last_synced_at = coalesce(last_synced_at, updated_at, created_at, now()),
    review_status = coalesce(review_status, 'active')
where lower(coalesce(provider, '')) = 'snaptrade'
  and lower(coalesce(status, '')) = 'connected';
