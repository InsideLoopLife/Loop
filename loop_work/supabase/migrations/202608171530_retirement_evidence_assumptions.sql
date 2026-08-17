-- Source-backed retirement assumptions and persisted automatic/manual choices.
create table if not exists public.retirement_economic_assumptions (
  id uuid primary key default gen_random_uuid(),
  assumption_key text not null,
  annualised_rate_percent numeric(10,4) not null,
  period_years integer not null,
  start_date date not null,
  end_date date not null,
  start_value numeric(18,6) not null,
  end_value numeric(18,6) not null,
  source_name text not null,
  source_url text not null,
  source_kind text not null default 'official_statistics',
  verified_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (assumption_key, end_date)
);

create index if not exists retirement_economic_assumptions_latest_idx
  on public.retirement_economic_assumptions (assumption_key, end_date desc);

alter table public.retirement_economic_assumptions enable row level security;
do $$ begin
  create policy "retirement_economic_assumptions_authenticated_read"
    on public.retirement_economic_assumptions for select to authenticated using (true);
exception when duplicate_object then null; end $$;

alter table if exists public.retirement_plans
  add column if not exists growth_assumption_mode text not null default 'automatic',
  add column if not exists inflation_assumption_mode text not null default 'automatic',
  add column if not exists assumption_snapshot jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.retirement_plans add constraint retirement_plans_growth_mode_check
    check (growth_assumption_mode in ('automatic','manual'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.retirement_plans add constraint retirement_plans_inflation_mode_check
    check (inflation_assumption_mode in ('automatic','manual'));
exception when duplicate_object then null; end $$;

-- CPIH all-items index: 2015 annual average 100.0; 2025 annual average 138.0.
-- CAGR is the prevailing 10-year rate, distinct from the Bank of England target.
insert into public.retirement_economic_assumptions (
  assumption_key, annualised_rate_percent, period_years, start_date, end_date,
  start_value, end_value, source_name, source_url, metadata
) values (
  'uk_cpih_prevailing_10y', 3.2761, 10, '2015-12-31', '2025-12-31',
  100.0, 138.0, 'Office for National Statistics · CPIH all items',
  'https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/l522/mm23',
  '{"series":"L522","dataset":"MM23","calculation":"compound annual growth rate"}'::jsonb
) on conflict (assumption_key, end_date) do update set
  annualised_rate_percent = excluded.annualised_rate_percent,
  start_value = excluded.start_value,
  end_value = excluded.end_value,
  source_name = excluded.source_name,
  source_url = excluded.source_url,
  verified_at = now(),
  metadata = excluded.metadata;

notify pgrst, 'reload schema';
