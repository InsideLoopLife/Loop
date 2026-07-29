-- V10: quicker property capture, address lookup/enrichment metadata and valuation averaging controls.

alter table homes add column if not exists house_number text;
alter table homes add column if not exists uprn text;
alter table homes add column if not exists property_type text;
alter table homes add column if not exists lookup_source text default 'manual';
alter table homes add column if not exists purchase_source_url text;
alter table homes add column if not exists last_lookup_at date;

create index if not exists homes_user_postcode_house_idx on homes(user_id, postcode, house_number);
create index if not exists homes_user_lookup_source_idx on homes(user_id, lookup_source);

-- Keep valuation sources flexible while we trial source averaging / confidence weighting.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'home_valuation_sources_source_type_check') then
    alter table home_valuation_sources drop constraint home_valuation_sources_source_type_check;
  end if;

  alter table home_valuation_sources add constraint home_valuation_sources_source_type_check
  check (source_type in ('user_estimate', 'estate_agent', 'survey', 'zoopla', 'rightmove', 'land_registry', 'propertydata', 'avm', 'lender', 'postcode_lookup', 'openai_research', 'other'));
end $$;

-- Allow specific property/address integrations to be tracked in Integrations later.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'integration_connections_connection_type_check') then
    alter table integration_connections drop constraint integration_connections_connection_type_check;
  end if;

  alter table integration_connections add constraint integration_connections_connection_type_check
  check (connection_type in ('banking', 'open_banking', 'investment', 'open_finance', 'property', 'property_valuation', 'address_lookup', 'geocoding', 'maps', 'mortgage_rates', 'statutory_rates', 'tax_rates', 'ai_research', 'other'));
end $$;

select pg_notify('pgrst', 'reload schema');
