-- v27.75 Property estimate mode
create extension if not exists pgcrypto;

create or replace function public.loop_set_updated_at()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.loop_is_platform_admin()
returns boolean language sql stable set search_path = public, pg_catalog as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
      or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
      or coalesce(auth.jwt() -> 'user_metadata' ->> 'loop_admin', '') = 'true';
$$;

grant execute on function public.loop_is_platform_admin() to authenticated;

create table if not exists public.loop_household_properties (
  id uuid primary key default gen_random_uuid(),
  household_id uuid,
  owner_user_id uuid references auth.users(id) on delete set null,
  label text not null default 'Property',
  address_line1 text,
  town_city text,
  postcode text,
  country_code text not null default 'GB',
  latitude numeric,
  longitude numeric,
  property_type text,
  bedrooms integer,
  estimated_value_pence integer,
  source_status jsonb not null default '{}'::jsonb,
  enrichment_status text not null default 'not_started',
  last_enriched_at timestamptz,
  notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loop_household_properties
  add column if not exists estimate_mode text not null default 'estimate_first',
  add column if not exists local_authority_name text,
  add column if not exists local_authority_code text,
  add column if not exists postcode_district text,
  add column if not exists region_name text,
  add column if not exists estimated_council_tax_band text,
  add column if not exists estimated_council_tax_band_low text,
  add column if not exists estimated_council_tax_band_high text,
  add column if not exists estimated_council_tax_annual_low_pence integer,
  add column if not exists estimated_council_tax_annual_high_pence integer,
  add column if not exists estimated_council_tax_annual_mid_pence integer,
  add column if not exists council_tax_estimate_confidence integer,
  add column if not exists council_tax_estimate_reason text,
  add column if not exists council_tax_estimate_status text not null default 'not_started',
  add column if not exists estimated_historic_value_pence integer,
  add column if not exists historic_value_basis text,
  add column if not exists comparable_sales_summary jsonb not null default '{}'::jsonb,
  add column if not exists nearby_sold_price_median_pence integer,
  add column if not exists nearby_sold_price_count integer,
  add column if not exists property_affordability_summary jsonb not null default '{}'::jsonb,
  add column if not exists source_confidence_summary jsonb not null default '{}'::jsonb,
  add column if not exists epc_rating text,
  add column if not exists heating_cost_estimate_annual_pence integer,
  add column if not exists council_tax_band text,
  add column if not exists council_tax_annual_pence integer,
  add column if not exists insurance_estimate_annual_pence integer,
  add column if not exists schools_summary jsonb not null default '{}'::jsonb;

create index if not exists loop_household_properties_postcode_idx on public.loop_household_properties(upper(coalesce(postcode,'')));

create table if not exists public.loop_property_data_sources (
  source_key text primary key,
  source_name text not null,
  source_area text not null,
  source_kind text not null,
  required_for_beta boolean not null default false,
  required_for_live boolean not null default false,
  account_needed boolean not null default false,
  env_keys text[] not null default array[]::text[],
  status text not null default 'not_started',
  setup_notes text not null,
  use_in_beta text not null,
  limitations text,
  sort_order integer not null default 100,
  updated_at timestamptz not null default now()
);

insert into public.loop_property_data_sources
(source_key, source_name, source_area, source_kind, required_for_beta, required_for_live, account_needed, env_keys, status, setup_notes, use_in_beta, limitations, sort_order)
values
('postcodes_io','Postcodes.io','postcode','open_api',true,true,false,array[]::text[],'planned','No account usually needed. Used for postcode validation, coordinates, admin district and region.','Use immediately for postcode/local authority inference.','Postcode-level, not exact address/UPRN.',10),
('ideal_postcodes','Ideal Postcodes','address','commercial_api',false,true,true,array['IDEAL_POSTCODES_API_KEY'],'not_started','Create an account for exact address lookup, UPRN and better property matching.','Optional. Beta can work from postcode + manual address.','Paid/commercial service.',20),
('hm_land_registry_ppd','HM Land Registry Price Paid Data','sold_prices','official_register',true,true,false,array[]::text[],'planned','Use open price-paid data for nearby comparable sold prices.','Use for rough comparables and affordability context.','Does not tell official council tax band; transaction data can lag.',30),
('epc_open_data','GOV.UK EPC Open Data','epc','official_register',false,true,true,array['UK_EPC_API_AUTH'],'not_started','Create/sign in with GOV.UK One Login for EPC API/bulk data.','Optional in beta. Show EPC as not configured or user-entered.','Certificates can be expired/replaced; exact address match can be messy.',40),
('google_maps','Google Maps Platform','maps','maps',false,true,true,array['GOOGLE_MAPS_API_KEY'],'not_started','Create Google Cloud project, enable maps/geocoding/static maps/routes and restrict API key.','Beta can use outbound map links only.','Requires billing and key restrictions.',50),
('dfe_schools','DfE / GOV.UK school data','schools','official_register',false,false,false,array[]::text[],'planned','Use public school performance/Ofsted/admissions sources where available.','Beta shows nearby-school summary/confidence only.','Catchment and oversubscription are not consistently available from one API.',60),
('insurance_affiliate','Home insurance partner feeds','insurance','affiliate',false,false,true,array['HOME_INSURANCE_PARTNER_KEY'],'not_needed_yet','Later commercial/affiliate integration for quotes/estimates.','Beta uses rough placeholders.','Accurate quotes require personal/property details and regulated flows.',70),
('dvla_vehicle','DVLA/MOT vehicle APIs','vehicles','official_register',false,false,true,array['DVLA_API_KEY','MOT_HISTORY_API_KEY'],'not_started','Useful for registration-based vehicle details and MOT history.','Manual car details are enough first.','Access/terms vary by API.',80),
('ai_property_research','AI property research fallback','council_tax','ai_research',true,true,true,array['OPENAI_API_KEY'],'planned','Use AI to summarise source evidence and explain confidence, not as the source of truth.','Use for reasoning text and admin review when incomplete.','Must label estimates clearly; do not present AI as official.',90)
on conflict (source_key) do update set
  status = excluded.status,
  setup_notes = excluded.setup_notes,
  use_in_beta = excluded.use_in_beta,
  limitations = excluded.limitations,
  env_keys = excluded.env_keys,
  updated_at = now();

create table if not exists public.loop_council_tax_band_rules (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  valuation_date date not null,
  band text not null,
  min_value_pence integer,
  max_value_pence integer,
  sort_order integer not null,
  unique(country_code, band)
);

insert into public.loop_council_tax_band_rules(country_code, valuation_date, band, min_value_pence, max_value_pence, sort_order)
values
('ENG','1991-04-01','A',null,4000000,10),('ENG','1991-04-01','B',4000000,5200000,20),('ENG','1991-04-01','C',5200000,6800000,30),('ENG','1991-04-01','D',6800000,8800000,40),('ENG','1991-04-01','E',8800000,12000000,50),('ENG','1991-04-01','F',12000000,16000000,60),('ENG','1991-04-01','G',16000000,32000000,70),('ENG','1991-04-01','H',32000000,null,80),
('WLS','2003-04-01','A',null,4400000,10),('WLS','2003-04-01','B',4400000,6500000,20),('WLS','2003-04-01','C',6500000,9100000,30),('WLS','2003-04-01','D',9100000,12300000,40),('WLS','2003-04-01','E',12300000,16200000,50),('WLS','2003-04-01','F',16200000,22300000,60),('WLS','2003-04-01','G',22300000,32400000,70),('WLS','2003-04-01','H',32400000,42400000,80),('WLS','2003-04-01','I',42400000,null,90),
('SCT','1991-04-01','A',null,2700000,10),('SCT','1991-04-01','B',2700000,3500000,20),('SCT','1991-04-01','C',3500000,4500000,30),('SCT','1991-04-01','D',4500000,5800000,40),('SCT','1991-04-01','E',5800000,8000000,50),('SCT','1991-04-01','F',8000000,10600000,60),('SCT','1991-04-01','G',10600000,21200000,70),('SCT','1991-04-01','H',21200000,null,80)
on conflict (country_code, band) do nothing;

create table if not exists public.loop_council_tax_rate_estimates (
  id uuid primary key default gen_random_uuid(),
  local_authority_code text,
  local_authority_name text,
  country_code text not null default 'ENG',
  band text not null,
  annual_charge_pence integer not null,
  charge_year text not null default '2026/27',
  source_kind text not null default 'default_assumption',
  source_url text,
  confidence integer not null default 35,
  updated_at timestamptz not null default now()
);

create table if not exists public.loop_property_estimate_runs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.loop_household_properties(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  postcode text,
  address_text text,
  estimated_value_pence integer,
  property_type text,
  bedrooms integer,
  status text not null default 'completed',
  confidence integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  sources_checked jsonb not null default '[]'::jsonb,
  warnings text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

alter table public.loop_property_data_sources enable row level security;
alter table public.loop_council_tax_band_rules enable row level security;
alter table public.loop_council_tax_rate_estimates enable row level security;
alter table public.loop_property_estimate_runs enable row level security;

drop policy if exists "property sources admin" on public.loop_property_data_sources;
create policy "property sources admin" on public.loop_property_data_sources for all to authenticated using (public.loop_is_platform_admin()) with check (public.loop_is_platform_admin());

drop policy if exists "band rules readable" on public.loop_council_tax_band_rules;
create policy "band rules readable" on public.loop_council_tax_band_rules for select to authenticated using (true);

drop policy if exists "rates readable" on public.loop_council_tax_rate_estimates;
create policy "rates readable" on public.loop_council_tax_rate_estimates for select to authenticated using (true);

drop policy if exists "rates admin write" on public.loop_council_tax_rate_estimates;
create policy "rates admin write" on public.loop_council_tax_rate_estimates for all to authenticated using (public.loop_is_platform_admin()) with check (public.loop_is_platform_admin());

drop policy if exists "estimate runs owner admin" on public.loop_property_estimate_runs;
create policy "estimate runs owner admin" on public.loop_property_estimate_runs for all to authenticated
using (user_id = auth.uid() or public.loop_is_platform_admin())
with check (user_id = auth.uid() or public.loop_is_platform_admin());

drop function if exists public.loop_v2775_property_estimate_healthcheck();
create or replace function public.loop_v2775_property_estimate_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql security definer set search_path = public, pg_catalog as $$
  select 'property_estimate_columns', exists(select 1 from information_schema.columns where table_schema='public' and table_name='loop_household_properties' and column_name='estimated_council_tax_band'), 'Property estimate fields exist.'
  union all select 'source_checklist', to_regclass('public.loop_property_data_sources') is not null, 'Source/API checklist exists.'
  union all select 'band_rules', exists(select 1 from public.loop_council_tax_band_rules where country_code='ENG' and band='D'), 'Band rules seeded.'
  union all select 'estimate_runs', to_regclass('public.loop_property_estimate_runs') is not null, 'Estimate run history exists.'
$$;
grant execute on function public.loop_v2775_property_estimate_healthcheck() to anon, authenticated;
