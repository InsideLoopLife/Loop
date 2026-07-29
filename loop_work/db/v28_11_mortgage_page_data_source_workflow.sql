-- LOOP v28.11 - Mortgage page UX, mortgage data source checklist and valuation automation setup
-- Run after v28_10_loop_inbox_postmark_admin_checklist.sql.

create table if not exists public.app_future_integration_tasks (
  id uuid primary key default gen_random_uuid(),
  product_key text not null,
  task_key text not null,
  title text not null,
  description text not null default '',
  section text not null default 'Setup',
  priority int not null default 100,
  status text not null default 'todo',
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_key, task_key),
  constraint app_future_integration_tasks_status_check check (status in ('todo','done','blocked','not_applicable'))
);

alter table public.app_future_integration_tasks enable row level security;

drop policy if exists "future integration tasks admin read" on public.app_future_integration_tasks;
create policy "future integration tasks admin read" on public.app_future_integration_tasks
  for select using (
    exists (
      select 1 from public.app_admin_users au
      join auth.users u on lower(u.email) = lower(au.email)
      where u.id = auth.uid() and au.status = 'active'
    )
  );

alter table if exists public.mortgage_rate_deals
  add column if not exists aprc numeric,
  add column if not exists total_initial_period_cost numeric,
  add column if not exists direct_apply_url text,
  add column if not exists eligibility_summary text,
  add column if not exists last_verified_by uuid references auth.users(id) on delete set null;

alter table if exists public.mortgage_renewal_recommendations
  add column if not exists total_initial_period_cost numeric,
  add column if not exists effective_initial_rate numeric;

create index if not exists mortgage_rate_deals_direct_source_idx
  on public.mortgage_rate_deals(status, source_checked_at desc nulls last, rate_percent, ltv_max);

insert into public.app_future_integration_tasks(product_key, task_key, title, description, section, priority, metadata)
values
('mortgage_data', 'choose-source-strategy', 'Choose the mortgage source strategy', 'Use manual/admin mortgage_rate_deals for beta, then decide whether to license Moneyfacts API/datafeed or another mortgage-sourcing provider for whole-market coverage. Avoid scraping aggregator pages without explicit permission.', 'Source strategy', 210, '{"recommended":"Moneyfacts for product data; lender product pages/manual rows for beta."}'::jsonb),
('mortgage_data', 'moneyfacts-commercial-check', 'Check Moneyfacts commercial fit', 'Request pricing/terms for residential mortgage product data. Confirm fields needed: lender, product name, rate, initial term, LTV, fee, ERC notes, product-transfer/new-customer flags, source timestamp and source URL.', 'Source strategy', 220, '{}'::jsonb),
('mortgage_data', 'current-lender-product-transfer', 'Map current-lender product transfer sources', 'For the main UK lenders in your beta cohort, add lender source mappings in mortgage_lender_sources and flag existing-customer-only/product-transfer rows separately from new-customer rows.', 'Current lender', 230, '{}'::jsonb),
('mortgage_data', 'svr-source-data', 'Add live SVR/follow-on rate source rows', 'Replace fallback SVR assumptions with sourced lender SVR/follow-on rates. Each row needs lender_slug, source_url, checked_at, confidence and stale expiry rules.', 'Current lender', 240, '{}'::jsonb),
('mortgage_data', 'deal-card-fields', 'Validate deal-card fields', 'Confirm mortgage_rate_deals includes lender, product, rate, initial_term_months, product_fee, LTV min/max, direct_apply_url/source_url, eligibility summary and total initial-period cost.', 'Data model', 250, '{}'::jsonb),
('mortgage_data', 'run-watch-test', 'Run a watch test for a fixed deal with 12 months left', 'Create a test mortgage with initial_period_end within 12 months, add matching mortgage_rate_deals rows, run Admin > Wealth Watch > Run mortgage watch, and confirm cards appear on House > Mortgage deals.', 'Testing', 260, '{}'::jsonb),
('mortgage_data', 'run-variable-test', 'Run a variable/SVR test', 'Create a mortgage with rate_type variable/tracker/SVR and confirm it is always considered watch-ready even without a fixed end date.', 'Testing', 270, '{}'::jsonb),
('mortgage_data', 'negative-eligibility-test', 'Test eligibility filters', 'Add rows that do not match LTV or are existing-customer only for a different lender. Confirm they do not appear for the wrong user/mortgage.', 'Security / accuracy', 280, '{}'::jsonb),
('mortgage_data', 'regulated-advice-disclaimer', 'Add regulated advice wording', 'Add wording that LOOP provides comparison/research support, not regulated mortgage advice, and points users to a broker/lender where needed.', 'Compliance', 290, '{}'::jsonb),
('valuation_automation', 'hmlr-comparables', 'Automate HM Land Registry comparable sales', 'Use HMLR Price Paid Data by postcode/street/property type to suggest low/mid/high comparable estimates, with transaction date and confidence.', 'Open data', 310, '{}'::jsonb),
('valuation_automation', 'address-uprn-source', 'Choose address/UPRN lookup provider', 'Use Ideal Postcodes, Ordnance Survey AddressBase, PropertyData, Homedata or another licensed source for exact address/UPRN matching. Postcode-only matching is not enough for precise automation.', 'Identity matching', 320, '{}'::jsonb),
('valuation_automation', 'epc-council-tax-source', 'Connect EPC and council tax enrichment', 'Configure EPC/council-tax sources so moving-home searches can fill EPC rating, energy estimate and council tax band/annual cost automatically.', 'Enrichment', 330, '{}'::jsonb),
('valuation_automation', 'commercial-avm-provider', 'Evaluate a commercial AVM/property data API', 'Assess Homedata, PropertyData or another provider for automated valuation, floor area, listing events and local-market confidence. Gate this behind a higher licence if costs require it.', 'Premium data', 340, '{}'::jsonb),
('valuation_automation', 'valuation-confidence-rules', 'Set valuation confidence rules', 'Define how to weight Land Registry comparables, AVM estimates, agent valuations and manual overrides. Keep the source trail visible to the user.', 'Scoring', 350, '{}'::jsonb),
('valuation_automation', 'valuation-refresh-schedule', 'Set refresh and retention rules', 'Decide how often valuations refresh by tier and how old source data can be before the UI shows it as stale.', 'Operations', 360, '{}'::jsonb)
on conflict (product_key, task_key) do update set
  title = excluded.title,
  description = excluded.description,
  section = excluded.section,
  priority = excluded.priority,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.loop_property_data_sources
(source_key, source_name, source_area, source_kind, required_for_beta, required_for_live, account_needed, env_keys, status, setup_notes, use_in_beta, limitations, sort_order)
values
('homedata_avm','Homedata AVM / property bundle','valuation','commercial_api',false,true,true,array['PROPERTY_DATA_API_KEY'],'not_started','Evaluate for AVM, EPC, flood/planning and listing-event data. Keep behind a higher licence if per-call costs are material.','Optional premium enrichment after HMLR comparables.','Commercial provider; check licence, fair use and retention rules.',95),
('propertydata_api','PropertyData API','valuation','commercial_api',false,true,true,array['PROPERTY_DATA_API_KEY'],'not_started','Evaluate for council tax, market analytics, valuation and postcode/property data endpoints.','Optional premium enrichment for valuation and moving home.','Commercial provider; verify exact endpoint coverage and terms.',96)
on conflict (source_key) do update set
  source_name = excluded.source_name,
  source_area = excluded.source_area,
  source_kind = excluded.source_kind,
  required_for_live = excluded.required_for_live,
  account_needed = excluded.account_needed,
  env_keys = excluded.env_keys,
  setup_notes = excluded.setup_notes,
  use_in_beta = excluded.use_in_beta,
  limitations = excluded.limitations,
  sort_order = excluded.sort_order,
  updated_at = now();
