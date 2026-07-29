-- v28.04 - SnapTrade position-level import and placeholder replacement
-- Additive hardening for provider-backed investment accounts.

alter table if exists public.investment_holdings
  add column if not exists group_label text,
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
  add column if not exists provider_migration_status text;

create unique index if not exists investment_holdings_snaptrade_external_unique
  on public.investment_holdings(user_id, investment_account_id, external_provider, external_position_id)
  where external_provider is not null and external_position_id is not null;

create index if not exists investment_holdings_snaptrade_account_idx
  on public.investment_holdings(user_id, investment_account_id, external_provider, record_status);

create index if not exists investment_holdings_group_label_idx
  on public.investment_holdings(user_id, investment_account_id, group_label)
  where coalesce(record_status, 'active') <> 'archived';

-- If a previous refresh created an account-value placeholder and later position-level
-- rows have also been imported, hide the placeholder from totals/charts.
with real_snaptrade_accounts as (
  select distinct user_id, investment_account_id, external_account_id
  from public.investment_holdings
  where lower(coalesce(external_provider, '')) = 'snaptrade'
    and coalesce(record_status, 'active') <> 'archived'
    and external_position_id is not null
    and external_position_id not like '%:account-value'
)
update public.investment_holdings h
set record_status = 'archived',
    archive_reason = 'snaptrade_positions_available',
    archived_at = coalesce(h.archived_at, now()),
    provider_migration_status = 'placeholder_replaced_by_positions'
from real_snaptrade_accounts r
where h.user_id = r.user_id
  and h.investment_account_id = r.investment_account_id
  and coalesce(h.external_account_id, '') = coalesce(r.external_account_id, '')
  and lower(coalesce(h.external_provider, '')) = 'snaptrade'
  and h.external_position_id = h.external_account_id || ':account-value'
  and coalesce(h.record_status, 'active') <> 'archived';
