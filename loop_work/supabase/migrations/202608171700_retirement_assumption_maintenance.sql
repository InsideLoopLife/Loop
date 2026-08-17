-- Pre-live hardening for self-maintaining retirement assumptions.
alter table if exists public.pension_funds
  add column if not exists performance_annualised_5y_percent numeric(10,4),
  add column if not exists performance_annualised_10y_percent numeric(10,4),
  add column if not exists performance_planning_rate_percent numeric(10,4),
  add column if not exists performance_as_of_date date,
  add column if not exists performance_source_url text,
  add column if not exists performance_source_kind text,
  add column if not exists performance_status text not null default 'history_building',
  add column if not exists performance_verified_at timestamptz;

do $$ begin
  alter table public.pension_funds add constraint pension_funds_performance_status_check
    check (performance_status in ('evidence_ready','history_building','needs_review','manual'));
exception when duplicate_object then null; end $$;

create table if not exists public.retirement_assumption_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  status text not null default 'started' check (status in ('started','completed','completed_with_warnings','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  pension_status text,
  inflation_status text,
  funds_checked integer not null default 0,
  assumptions_stored integer not null default 0,
  funds_needing_review integer not null default 0,
  error text,
  payload jsonb not null default '{}'::jsonb
);
create index if not exists retirement_assumption_refresh_runs_started_idx
  on public.retirement_assumption_refresh_runs(started_at desc);
alter table public.retirement_assumption_refresh_runs enable row level security;
revoke all on public.retirement_assumption_refresh_runs from public, anon, authenticated;
grant all on public.retirement_assumption_refresh_runs to service_role;
do $$ begin
  create policy "retirement_assumption_runs_service_only" on public.retirement_assumption_refresh_runs
    for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

create table if not exists public.retirement_assumption_source_health (
  source_key text primary key,
  status text not null default 'unknown' check (status in ('healthy','degraded','failed','unknown')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer not null default 0,
  last_error text,
  next_refresh_due_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.retirement_assumption_source_health enable row level security;
revoke all on public.retirement_assumption_source_health from public, anon, authenticated;
grant all on public.retirement_assumption_source_health to service_role;
do $$ begin
  create policy "retirement_assumption_health_service_only" on public.retirement_assumption_source_health
    for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
