-- v27.8 - Affordability Lab mortgage-rate/provider logic logging.
-- Keeps saved affordability logs auditable when the lab has used rate options,
-- lender-style deductions and the replacement-home mortgage rule.

alter table if exists affordability_scenarios
  add column if not exists loan_required numeric(14,2),
  add column if not exists ltv_percent numeric(7,3),
  add column if not exists selected_lender text,
  add column if not exists selected_product_name text,
  add column if not exists selected_product_fee numeric(12,2),
  add column if not exists selected_monthly_payment numeric(12,2),
  add column if not exists selected_stress_payment numeric(12,2),
  add column if not exists lender_checks_json jsonb not null default '[]'::jsonb,
  add column if not exists mortgage_products_json jsonb not null default '[]'::jsonb;

create index if not exists affordability_scenarios_user_kind_created_idx
  on affordability_scenarios(user_id, scenario_kind, created_at desc);

select pg_notify('pgrst', 'reload schema');
