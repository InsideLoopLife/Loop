-- LOOP v28.79 - Savings intelligence, interest accrual, visual pots and Financial Flow detail

-- Income settings now carry the complete pension contribution instruction used by projections.
alter table if exists public.pay_events
  add column if not exists employer_pension_percent numeric(8,4) not null default 0,
  add column if not exists employer_pension_monthly_amount numeric(14,2),
  add column if not exists employer_ni_topup_enabled boolean not null default false,
  add column if not exists employer_ni_rate_percent numeric(8,4) not null default 15,
  add column if not exists employer_ni_topup_share_percent numeric(8,4) not null default 100;

comment on column public.pay_events.employer_pension_percent is 'Employer pension contribution as a percentage of gross annual salary.';
comment on column public.pay_events.employer_pension_monthly_amount is 'Optional fixed employer pension contribution per month.';
comment on column public.pay_events.employer_ni_topup_enabled is 'Whether the employer adds some or all of its salary-sacrifice NI saving to the pension.';
comment on column public.pay_events.employer_ni_rate_percent is 'Employer NI rate used for the salary-sacrifice top-up calculation, stored so the assumption is auditable.';
comment on column public.pay_events.employer_ni_topup_share_percent is 'Percentage of the calculated employer NI saving that is paid into the pension.';

alter table if exists public.savings_pots
  add column if not exists reference_image_url text;

-- Preserve source provenance and use lifecycle states rather than deleting a product after one miss.
alter table if exists public.savings_rate_deals
  add column if not exists canonical_source text,
  add column if not exists source_product_id text,
  add column if not exists provider_product_code text,
  add column if not exists source_published_at timestamptz,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_verified_at timestamptz,
  add column if not exists effective_from timestamptz,
  add column if not exists effective_to timestamptz,
  add column if not exists verification_status text not null default 'UNVERIFIED',
  add column if not exists lifecycle_status text not null default 'ACTIVE',
  add column if not exists missing_observation_count integer not null default 0,
  add column if not exists raw_payload_hash text,
  add column if not exists licence_version_reference text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.savings_rate_deals'::regclass
      and conname = 'savings_rate_deals_lifecycle_status_check'
  ) then
    alter table public.savings_rate_deals
      add constraint savings_rate_deals_lifecycle_status_check
      check (lifecycle_status in ('ACTIVE','PENDING_WITHDRAWAL','WITHDRAWN','SUPERSEDED','MATURED','DATA_REVIEW'));
  end if;
exception when undefined_table then
  null;
end $$;

create index if not exists savings_rate_deals_lifecycle_idx
  on public.savings_rate_deals(lifecycle_status, status, last_seen_at);

create index if not exists savings_rate_deals_source_product_idx
  on public.savings_rate_deals(canonical_source, source_product_id);

create table if not exists public.savings_rate_deal_versions (
  id uuid primary key default gen_random_uuid(),
  savings_rate_deal_id uuid not null references public.savings_rate_deals(id) on delete cascade,
  lifecycle_status text not null,
  verification_status text not null,
  gross_aer numeric,
  product_payload jsonb not null default '{}'::jsonb,
  source_url text,
  source_published_at timestamptz,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  raw_payload_hash text,
  created_at timestamptz not null default now()
);

create index if not exists savings_rate_deal_versions_deal_time_idx
  on public.savings_rate_deal_versions(savings_rate_deal_id, effective_from desc);

alter table if exists public.savings_rate_deal_versions enable row level security;

-- Seed lifecycle/provenance for catalogue rows already present.
update public.savings_rate_deals
set lifecycle_status = case
      when status = 'active' then 'ACTIVE'
      when status in ('expired','withdrawn') then 'WITHDRAWN'
      else 'DATA_REVIEW'
    end,
    verification_status = case
      when status = 'active' and coalesce(confidence, 0) >= 88 then 'AUTO_VERIFIED'
      when status = 'needs_review' then 'REVIEW_REQUIRED'
      else verification_status
    end,
    canonical_source = coalesce(canonical_source, source_name, source_url),
    first_seen_at = coalesce(first_seen_at, created_at, now()),
    last_seen_at = coalesce(last_seen_at, last_checked_at, updated_at, created_at, now()),
    last_verified_at = coalesce(last_verified_at, last_checked_at, updated_at)
where true;

insert into public.app_build_notes(build_key, title, notes, payload, updated_at)
values (
  'v28_79_savings_intelligence_interest_pots_flow',
  'Savings intelligence, accrued interest, visual pots and Financial Flow savings',
  'Adds confirmed plus accrued interest, transparent tax/ISA opportunity logic, income-derived pension contributions including employer and NI top-up settings, visual piggy-bank pots, savings-specific Financial Flow charts and catalogue lifecycle/provenance fields.',
  '{"areas":["savings","financial_flow","pensions","daily_rates","loopwatch"],"requires_sql":true,"cron":"08:00 Europe/London"}'::jsonb,
  now()
)
on conflict (build_key) do update
set title = excluded.title,
    notes = excluded.notes,
    payload = excluded.payload,
    updated_at = now();

notify pgrst, 'reload schema';
select 'v28_79_savings_intelligence_interest_pots_flow' as migration_marker;
