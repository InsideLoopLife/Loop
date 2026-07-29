-- LOOP v28.03 - Wealth Watch admin, cron hardening and source ingestion
-- Adds admin-configurable settings, source jobs, lender mapping and safer feature-tier handling.

create table if not exists public.wealth_watch_settings (
  setting_key text primary key,
  setting_value text not null,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('savings_minimum_rate_delta', '0.10', 'Minimum AER/rate uplift before the savings watch creates a recommendation.'),
  ('savings_max_recommendations_per_account', '5', 'Maximum savings recommendations created per account per run.'),
  ('savings_stale_days', '14', 'Active savings deal rows older than this can be expired by admin.'),
  ('mortgage_alert_months', '9', 'Default number of months before fixed-rate end to start showing renewal options.'),
  ('mortgage_source_freshness_days', '14', 'Mortgage source rows older than this can be expired by admin.'),
  ('mortgage_max_recommendations_per_deal', '8', 'Maximum mortgage recommendations created for one mortgage row per run.')
on conflict (setting_key) do nothing;

create table if not exists public.wealth_watch_source_jobs (
  id uuid primary key default gen_random_uuid(),
  job_kind text not null,
  source_url text,
  status text not null default 'queued',
  created_by uuid references auth.users(id) on delete set null,
  result_payload jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wealth_watch_source_jobs_status_check check (status in ('queued','running','completed','failed','ignored'))
);
create index if not exists wealth_watch_source_jobs_lookup_idx on public.wealth_watch_source_jobs(job_kind, status, created_at desc);

create table if not exists public.mortgage_lender_sources (
  id uuid primary key default gen_random_uuid(),
  lender_slug text not null,
  lender_name text not null,
  source_url text not null,
  source_kind text not null default 'lender_product_page',
  status text not null default 'active',
  check_frequency_hours integer not null default 24,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lender_slug, source_url),
  constraint mortgage_lender_sources_status_check check (status in ('active','paused','needs_review','failed','archived'))
);
create index if not exists mortgage_lender_sources_lender_idx on public.mortgage_lender_sources(lender_slug, status);

alter table if exists public.mortgage_rate_deals
  add column if not exists admin_notes text,
  add column if not exists expires_at timestamptz,
  add column if not exists stale_reason text;

alter table if exists public.savings_rate_deals
  add column if not exists expires_at timestamptz,
  add column if not exists stale_reason text;

alter table if exists public.property_move_queries
  add column if not exists source_last_ingested_at timestamptz,
  add column if not exists source_confidence integer default 40;

create index if not exists savings_rate_deals_freshness_idx on public.savings_rate_deals(status, last_checked_at desc nulls last);
create index if not exists mortgage_rate_deals_freshness_idx on public.mortgage_rate_deals(status, source_checked_at desc nulls last);

alter table public.wealth_watch_settings enable row level security;
alter table public.wealth_watch_source_jobs enable row level security;
alter table public.mortgage_lender_sources enable row level security;

-- Normal users should not edit source tables. Service role/admin UI handles writes.
drop policy if exists "Authenticated can read active lender sources" on public.mortgage_lender_sources;
create policy "Authenticated can read active lender sources" on public.mortgage_lender_sources
  for select using (auth.uid() is not null and status = 'active');

-- Add/refresh feature keys. Do not overwrite existing tier-cell edits.
insert into public.app_tier_features(feature_key, category, name, description, is_active)
values
  ('savings_rate_watch', 'WEALTH', 'Savings rate watch', 'MVP deal recommendations for users with tracked savings balances/rates.', true),
  ('savings_surplus_optimiser', 'WEALTH', 'Savings surplus optimiser', 'Higher-tier optimisation using household surplus after expenditure, not just existing savings accounts.', true),
  ('mortgage_renewal_watch', 'WEALTH', 'Mortgage renewal watch', 'Mortgage deal-end/variable-rate monitoring with current-lender and market comparisons.', true),
  ('move_planner', 'WEALTH', 'Moving / property search planner', 'Save property URLs/manual price scenarios and estimate stamp duty, EPC/energy and affordability.', true)
on conflict (feature_key) do update set
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  updated_at = now();

insert into public.app_tier_plan_features(plan_slug, feature_key, enabled, limit_value, limit_period, enforcement_mode, health_status, user_message)
select p.slug, f.feature_key,
       case
         when f.feature_key = 'savings_surplus_optimiser' then p.slug in ('pro','realtime','enterprise','admin_override')
         else p.slug in ('plus','pro','realtime','enterprise','admin_override')
       end,
       case when f.feature_key = 'move_planner' and p.slug = 'plus' then 5 else null end,
       case when f.feature_key = 'move_planner' and p.slug = 'plus' then 'month' else 'none' end,
       case
         when f.feature_key = 'savings_surplus_optimiser' and p.slug not in ('pro','realtime','enterprise','admin_override') then 'upgrade'
         when p.slug in ('plus','pro','realtime','enterprise','admin_override') then 'audit'
         else 'upgrade'
       end,
       'active',
       case
         when f.feature_key = 'savings_surplus_optimiser' and p.slug not in ('pro','realtime','enterprise','admin_override') then 'Upgrade for surplus optimisation.'
         when p.slug in ('plus','pro','realtime','enterprise','admin_override') then 'Included for this tier.'
         else 'Upgrade to use this automation.'
       end
from public.app_tier_plans p
cross join (values ('savings_rate_watch'),('savings_surplus_optimiser'),('mortgage_renewal_watch'),('move_planner')) f(feature_key)
on conflict (plan_slug, feature_key) do nothing;

-- Useful seeded lender source mappings. Admin can edit/replace these in Wealth Watch.
insert into public.mortgage_lender_sources(lender_slug, lender_name, source_url, source_kind, status, notes)
values
  ('natwest', 'NatWest', 'https://www.natwest.com/mortgages/mortgage-rates.html', 'lender_product_page', 'active', 'Seeded source mapping; confirm product-transfer vs new-customer rows.'),
  ('halifax', 'Halifax', 'https://www.halifax.co.uk/mortgages/mortgage-rates.html', 'lender_product_page', 'active', 'Seeded source mapping; confirm source format.'),
  ('nationwide_building_society', 'Nationwide Building Society', 'https://www.nationwide.co.uk/mortgages/mortgage-rates/', 'lender_product_page', 'active', 'Seeded source mapping; confirm source format.'),
  ('santander', 'Santander', 'https://www.santander.co.uk/personal/mortgages/mortgage-rates', 'lender_product_page', 'active', 'Seeded source mapping; confirm source format.'),
  ('barclays', 'Barclays', 'https://www.barclays.co.uk/mortgages/mortgage-rates/', 'lender_product_page', 'active', 'Seeded source mapping; confirm source format.'),
  ('hsbc', 'HSBC', 'https://www.hsbc.co.uk/mortgages/our-rates/', 'lender_product_page', 'active', 'Seeded source mapping; confirm source format.')
on conflict (lender_slug, source_url) do nothing;
