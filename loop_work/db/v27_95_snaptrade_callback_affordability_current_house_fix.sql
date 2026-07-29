-- LOOP v27.95 SnapTrade callback + current-house affordability fix
-- Adds columns needed to persist SnapTrade callback status and keeps integration constraints compatible.

alter table public.integration_connections
  add column if not exists external_connection_id text,
  add column if not exists category text,
  add column if not exists review_status text not null default 'active',
  add column if not exists verified_by text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Older installs may still have the original narrow connection_type constraint.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'integration_connections_connection_type_check') then
    alter table public.integration_connections drop constraint integration_connections_connection_type_check;
  end if;

  alter table public.integration_connections add constraint integration_connections_connection_type_check
  check (connection_type in ('banking', 'open_banking', 'investment', 'open_finance', 'property', 'property_valuation', 'address_lookup', 'geocoding', 'maps', 'mortgage_rates', 'statutory_rates', 'tax_rates', 'ai_research', 'other'));
end $$;

create index if not exists integration_connections_provider_idx on public.integration_connections(user_id, provider, status);
create index if not exists integration_connections_external_id_idx on public.integration_connections(external_connection_id) where external_connection_id is not null;

-- Make sure app profiles can record provider connection state where an older DB is missing these columns.
alter table public.app_user_profiles
  add column if not exists market_data_provider_status text not null default 'not_configured',
  add column if not exists market_data_realtime_enabled boolean not null default false;

-- Any already-connected SnapTrade row should mark the user provider status as connected.
update public.app_user_profiles p
set market_data_provider_status = 'connected',
    updated_at = now()
where exists (
  select 1
  from public.integration_connections c
  where c.user_id = p.user_id
    and lower(c.provider) = 'snaptrade'
    and lower(c.status) = 'connected'
);
