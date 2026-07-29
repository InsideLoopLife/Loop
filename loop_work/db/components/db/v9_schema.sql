-- V9: editable homes/mortgages, map fields, valuation sources and move-planner assumptions.

alter table homes add column if not exists full_address text;
alter table homes add column if not exists city text;
alter table homes add column if not exists region text;
alter table homes add column if not exists country text default 'United Kingdom';
alter table homes add column if not exists latitude numeric(10,7);
alter table homes add column if not exists longitude numeric(10,7);
alter table homes add column if not exists map_provider text;
alter table homes add column if not exists map_place_id text;
alter table homes add column if not exists map_url text;
alter table homes add column if not exists estimated_value_low numeric(14,2);
alter table homes add column if not exists estimated_value_mid numeric(14,2);
alter table homes add column if not exists estimated_value_high numeric(14,2);
alter table homes add column if not exists estimated_value_date date;
alter table homes add column if not exists valuation_status text default 'manual';
alter table homes add column if not exists target_purchase_price numeric(14,2);
alter table homes add column if not exists target_extra_cash numeric(14,2);
alter table homes add column if not exists target_interest_rate numeric(6,3);
alter table homes add column if not exists target_term_years integer;

create table if not exists home_valuation_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references homes(id) on delete cascade,
  source_name text not null,
  source_type text not null default 'user_estimate',
  valuation_amount numeric(14,2),
  valuation_low numeric(14,2),
  valuation_mid numeric(14,2),
  valuation_high numeric(14,2),
  confidence text not null default 'medium',
  valuation_date date not null default current_date,
  source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table home_valuation_sources enable row level security;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'home_valuation_sources_source_type_check') then
    alter table home_valuation_sources drop constraint home_valuation_sources_source_type_check;
  end if;
  alter table home_valuation_sources add constraint home_valuation_sources_source_type_check
  check (source_type in ('user_estimate', 'estate_agent', 'survey', 'zoopla', 'rightmove', 'land_registry', 'propertydata', 'avm', 'lender', 'other'));

  if exists (select 1 from pg_constraint where conname = 'home_valuation_sources_confidence_check') then
    alter table home_valuation_sources drop constraint home_valuation_sources_confidence_check;
  end if;
  alter table home_valuation_sources add constraint home_valuation_sources_confidence_check
  check (confidence in ('low', 'medium', 'high'));
end $$;

drop policy if exists "home_valuation_sources_select_own" on home_valuation_sources;
create policy "home_valuation_sources_select_own" on home_valuation_sources for select using ((select auth.uid()) = user_id);

drop policy if exists "home_valuation_sources_insert_own" on home_valuation_sources;
create policy "home_valuation_sources_insert_own" on home_valuation_sources for insert with check ((select auth.uid()) = user_id);

drop policy if exists "home_valuation_sources_update_own" on home_valuation_sources;
create policy "home_valuation_sources_update_own" on home_valuation_sources for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "home_valuation_sources_delete_own" on home_valuation_sources;
create policy "home_valuation_sources_delete_own" on home_valuation_sources for delete using ((select auth.uid()) = user_id);

create index if not exists home_valuation_sources_user_home_idx on home_valuation_sources(user_id, home_id);
create index if not exists homes_user_location_idx on homes(user_id, postcode, city);

-- Allow these provider types to be tracked on the integrations page.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'integration_connections_connection_type_check') then
    alter table integration_connections drop constraint integration_connections_connection_type_check;
  end if;

  alter table integration_connections add constraint integration_connections_connection_type_check
  check (connection_type in ('banking', 'open_banking', 'investment', 'open_finance', 'property', 'property_valuation', 'geocoding', 'maps', 'mortgage_rates', 'statutory_rates', 'tax_rates', 'ai_research', 'other'));
end $$;

select pg_notify('pgrst', 'reload schema');
