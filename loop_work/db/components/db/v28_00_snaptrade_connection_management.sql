-- v28.00 - SnapTrade connection management, account de-dupe and manual restore guard
-- Safe to run after v27_96/v27_98/v27_99. This is deliberately additive and non-destructive.

alter table if exists public.integration_connections
  add column if not exists external_connection_id text,
  add column if not exists review_status text default 'active',
  add column if not exists category text,
  add column if not exists verified_by text,
  add column if not exists last_synced_at timestamptz,
  add column if not exists updated_at timestamptz default now();

create index if not exists integration_connections_user_provider_idx
  on public.integration_connections(user_id, provider);
create index if not exists integration_connections_snaptrade_external_idx
  on public.integration_connections(user_id, external_connection_id)
  where provider = 'SnapTrade' and external_connection_id is not null;

alter table if exists public.investment_accounts
  add column if not exists external_provider text,
  add column if not exists external_connection_id text,
  add column if not exists external_account_id text,
  add column if not exists external_institution_account_id text,
  add column if not exists external_account_raw jsonb,
  add column if not exists provider_import_enabled boolean default false,
  add column if not exists sync_status text,
  add column if not exists last_provider_sync_at timestamptz,
  add column if not exists record_status text default 'active',
  add column if not exists archive_reason text,
  add column if not exists archived_at timestamptz,
  add column if not exists superseded_by_account_id uuid,
  add column if not exists provider_migration_status text;

alter table if exists public.investment_holdings
  add column if not exists external_provider text,
  add column if not exists external_account_id text,
  add column if not exists external_position_id text,
  add column if not exists external_position_raw jsonb,
  add column if not exists imported_current_value numeric,
  add column if not exists imported_account_currency text,
  add column if not exists import_source_type text,
  add column if not exists last_provider_sync_at timestamptz,
  add column if not exists record_status text default 'active',
  add column if not exists archive_reason text,
  add column if not exists archived_at timestamptz,
  add column if not exists superseded_by_account_id uuid,
  add column if not exists provider_migration_status text;

create table if not exists public.investment_provider_migrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null default 'snaptrade',
  wrapper_type text,
  external_account_id text,
  snaptrade_account_id uuid,
  manual_account_id uuid,
  migration_status text not null default 'manual_archived',
  match_strength text,
  user_confirmed_archive boolean default false,
  match_score numeric default 0,
  match_reason text,
  archived_at timestamptz,
  restored_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists investment_provider_migrations_user_snap_idx
  on public.investment_provider_migrations(user_id, snaptrade_account_id);
create index if not exists investment_provider_migrations_user_manual_idx
  on public.investment_provider_migrations(user_id, manual_account_id);

create index if not exists investment_accounts_snaptrade_external_idx
  on public.investment_accounts(user_id, external_provider, external_account_id)
  where external_provider = 'snaptrade' and external_account_id is not null;
create index if not exists investment_accounts_snaptrade_connection_idx
  on public.investment_accounts(user_id, external_connection_id)
  where external_provider = 'snaptrade' and external_connection_id is not null;
create index if not exists investment_accounts_active_status_idx
  on public.investment_accounts(user_id, record_status);
create index if not exists investment_holdings_account_active_idx
  on public.investment_holdings(user_id, investment_account_id, record_status);

-- Do not keep multiple visible SnapTrade connection rows for the same connection id.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, provider, external_connection_id
      order by coalesce(updated_at, created_at, now()) desc, created_at desc, id desc
    ) as rn
  from public.integration_connections
  where provider = 'SnapTrade'
    and nullif(external_connection_id, '') is not null
)
update public.integration_connections c
set
  status = 'archived',
  review_status = 'archived',
  notes = coalesce(c.notes, '') || case when coalesce(c.notes, '') = '' then '' else ' ' end || 'Archived duplicate SnapTrade connection row by v28.00.',
  updated_at = now()
from ranked r
where c.id = r.id
  and r.rn > 1;

-- If the same SnapTrade account was imported more than once, keep the newest active row and archive the duplicates.
with ranked_accounts as (
  select
    id,
    user_id,
    coalesce(
      nullif(external_institution_account_id, ''),
      nullif(external_account_raw ->> 'institution_account_id', ''),
      nullif(external_account_raw ->> 'institutionAccountId', ''),
      nullif(external_account_raw ->> 'number', ''),
      nullif(external_account_id, '')
    ) as dedupe_key,
    row_number() over (
      partition by user_id, external_provider, coalesce(
        nullif(external_institution_account_id, ''),
        nullif(external_account_raw ->> 'institution_account_id', ''),
        nullif(external_account_raw ->> 'institutionAccountId', ''),
        nullif(external_account_raw ->> 'number', ''),
        nullif(external_account_id, '')
      )
      order by coalesce(last_provider_sync_at, updated_at, created_at, now()) desc, id desc
    ) as rn
  from public.investment_accounts
  where external_provider = 'snaptrade'
    and coalesce(record_status, 'active') <> 'archived'
)
update public.investment_holdings h
set
  record_status = 'archived',
  archive_reason = 'duplicate_snaptrade_import_archived_by_v28_00',
  archived_at = now(),
  provider_migration_status = 'duplicate_snaptrade_import_archived'
from ranked_accounts r
where h.user_id = r.user_id
  and h.investment_account_id = r.id
  and r.rn > 1
  and r.dedupe_key is not null
  and coalesce(h.record_status, 'active') <> 'archived';

with ranked_accounts as (
  select
    id,
    user_id,
    coalesce(
      nullif(external_institution_account_id, ''),
      nullif(external_account_raw ->> 'institution_account_id', ''),
      nullif(external_account_raw ->> 'institutionAccountId', ''),
      nullif(external_account_raw ->> 'number', ''),
      nullif(external_account_id, '')
    ) as dedupe_key,
    row_number() over (
      partition by user_id, external_provider, coalesce(
        nullif(external_institution_account_id, ''),
        nullif(external_account_raw ->> 'institution_account_id', ''),
        nullif(external_account_raw ->> 'institutionAccountId', ''),
        nullif(external_account_raw ->> 'number', ''),
        nullif(external_account_id, '')
      )
      order by coalesce(last_provider_sync_at, updated_at, created_at, now()) desc, id desc
    ) as rn
  from public.investment_accounts
  where external_provider = 'snaptrade'
    and coalesce(record_status, 'active') <> 'archived'
)
update public.investment_accounts a
set
  record_status = 'archived',
  archive_reason = 'duplicate_snaptrade_import_archived_by_v28_00',
  archived_at = now(),
  provider_import_enabled = false,
  provider_migration_status = 'duplicate_snaptrade_import_archived'
from ranked_accounts r
where a.id = r.id
  and r.rn > 1
  and r.dedupe_key is not null;
