-- LOOP v27.97 SnapTrade/manual investment migration guard
-- Adds a reversible archive layer so importing provider accounts does not double-count matching manual pots.

alter table if exists public.investment_accounts
  add column if not exists record_status text not null default 'active',
  add column if not exists archive_reason text,
  add column if not exists archived_at timestamptz,
  add column if not exists superseded_by_account_id uuid references public.investment_accounts(id) on delete set null,
  add column if not exists restored_from_provider_at timestamptz,
  add column if not exists provider_migration_status text;

alter table if exists public.investment_holdings
  add column if not exists record_status text not null default 'active',
  add column if not exists archive_reason text,
  add column if not exists archived_at timestamptz,
  add column if not exists superseded_by_account_id uuid references public.investment_accounts(id) on delete set null,
  add column if not exists superseded_by_holding_id uuid references public.investment_holdings(id) on delete set null,
  add column if not exists restored_from_provider_at timestamptz,
  add column if not exists provider_migration_status text;

create index if not exists investment_accounts_user_record_status_idx
  on public.investment_accounts(user_id, record_status);

create index if not exists investment_holdings_user_record_status_idx
  on public.investment_holdings(user_id, record_status);

create table if not exists public.investment_provider_migrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'snaptrade',
  snaptrade_account_id uuid references public.investment_accounts(id) on delete set null,
  manual_account_id uuid references public.investment_accounts(id) on delete set null,
  migration_status text not null default 'manual_archived',
  match_score integer not null default 0,
  match_reason text,
  archived_at timestamptz,
  restored_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.investment_provider_migrations enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'investment_provider_migrations' and policyname = 'investment_provider_migrations_select_own'
  ) then
    create policy investment_provider_migrations_select_own on public.investment_provider_migrations for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'investment_provider_migrations' and policyname = 'investment_provider_migrations_insert_own'
  ) then
    create policy investment_provider_migrations_insert_own on public.investment_provider_migrations for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'investment_provider_migrations' and policyname = 'investment_provider_migrations_update_own'
  ) then
    create policy investment_provider_migrations_update_own on public.investment_provider_migrations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.loop_restore_manual_investments_for_user(
  p_user_id uuid,
  p_reason text default 'provider_access_removed'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restored_accounts integer := 0;
  archived_provider_accounts integer := 0;
  restored_holdings integer := 0;
  archived_provider_holdings integer := 0;
begin
  -- Restore manual accounts/holdings that were only hidden because a provider import superseded them.
  update public.investment_accounts
  set record_status = 'active',
      archive_reason = null,
      archived_at = null,
      restored_from_provider_at = now(),
      provider_migration_status = coalesce(provider_migration_status, 'restored_after_provider_access_removed')
  where user_id = p_user_id
    and coalesce(record_status, 'active') = 'archived'
    and coalesce(external_provider, '') <> 'snaptrade'
    and coalesce(archive_reason, '') like 'superseded_by_snaptrade%';
  get diagnostics restored_accounts = row_count;

  update public.investment_holdings h
  set record_status = 'active',
      archive_reason = null,
      archived_at = null,
      restored_from_provider_at = now(),
      provider_migration_status = coalesce(provider_migration_status, 'restored_after_provider_access_removed')
  where h.user_id = p_user_id
    and coalesce(h.record_status, 'active') = 'archived'
    and coalesce(h.external_provider, '') <> 'snaptrade'
    and coalesce(h.archive_reason, '') like 'superseded_by_snaptrade%';
  get diagnostics restored_holdings = row_count;

  -- Hide provider imported accounts/holdings while the user lacks the tier/provider entitlement.
  update public.investment_accounts
  set record_status = 'archived',
      archive_reason = p_reason,
      archived_at = now(),
      provider_import_enabled = false,
      provider_migration_status = 'provider_access_removed'
  where user_id = p_user_id
    and lower(coalesce(external_provider, '')) = 'snaptrade'
    and coalesce(record_status, 'active') <> 'archived';
  get diagnostics archived_provider_accounts = row_count;

  update public.investment_holdings
  set record_status = 'archived',
      archive_reason = p_reason,
      archived_at = now(),
      provider_migration_status = 'provider_access_removed'
  where user_id = p_user_id
    and lower(coalesce(external_provider, '')) = 'snaptrade'
    and coalesce(record_status, 'active') <> 'archived';
  get diagnostics archived_provider_holdings = row_count;

  update public.investment_provider_migrations
  set migration_status = 'manual_restored_provider_archived',
      restored_at = coalesce(restored_at, now()),
      notes = coalesce(notes || E'\n', '') || coalesce(p_reason, 'provider access removed'),
      updated_at = now()
  where user_id = p_user_id
    and provider = 'snaptrade'
    and migration_status in ('manual_archived', 'active_provider');

  return jsonb_build_object(
    'restored_manual_accounts', restored_accounts,
    'restored_manual_holdings', restored_holdings,
    'archived_provider_accounts', archived_provider_accounts,
    'archived_provider_holdings', archived_provider_holdings
  );
end $$;

grant execute on function public.loop_restore_manual_investments_for_user(uuid, text) to authenticated, service_role;

create or replace function public.loop_reactivate_snaptrade_investments_for_user(
  p_user_id uuid,
  p_reason text default 'provider_access_restored'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restored_provider_accounts integer := 0;
  restored_provider_holdings integer := 0;
begin
  update public.investment_accounts
  set record_status = 'active',
      archive_reason = null,
      archived_at = null,
      provider_import_enabled = true,
      provider_migration_status = 'provider_access_restored'
  where user_id = p_user_id
    and lower(coalesce(external_provider, '')) = 'snaptrade'
    and coalesce(record_status, 'active') = 'archived'
    and coalesce(archive_reason, '') = 'provider_access_removed';
  get diagnostics restored_provider_accounts = row_count;

  update public.investment_holdings
  set record_status = 'active',
      archive_reason = null,
      archived_at = null,
      provider_migration_status = 'provider_access_restored'
  where user_id = p_user_id
    and lower(coalesce(external_provider, '')) = 'snaptrade'
    and coalesce(record_status, 'active') = 'archived'
    and coalesce(archive_reason, '') = 'provider_access_removed';
  get diagnostics restored_provider_holdings = row_count;

  return jsonb_build_object('restored_provider_accounts', restored_provider_accounts, 'restored_provider_holdings', restored_provider_holdings);
end $$;

grant execute on function public.loop_reactivate_snaptrade_investments_for_user(uuid, text) to authenticated, service_role;
