-- LOOP v28.58 - Savings rate intelligence + family/school calendar parsing polish
-- Adds richer savings-deal fields so users see rate, access, withdrawal and term details.
-- Also records this build so the Family Planning / LoopWatch calendar parser fix can be tracked.

alter table if exists public.savings_rate_deals
  add column if not exists access_type text,
  add column if not exists withdrawal_rules text,
  add column if not exists notice_period_days integer,
  add column if not exists term_length_months integer,
  add column if not exists rate_type text,
  add column if not exists source_payload jsonb not null default '{}'::jsonb;

create index if not exists savings_rate_deals_access_idx
  on public.savings_rate_deals(status, access_type, gross_aer desc nulls last);

create index if not exists savings_rate_deals_notice_idx
  on public.savings_rate_deals(status, notice_period_days, gross_aer desc nulls last);

alter table if exists public.savings_rate_recommendations
  add column if not exists action_summary text,
  add column if not exists suitability_payload jsonb not null default '{}'::jsonb;

-- Source type values are intentionally not checked in older migrations, but this keeps
-- installs that added a custom check from rejecting LoopWatch calendar imports.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.family_calendar_sources'::regclass
      and conname = 'family_calendar_sources_source_type_check'
  ) then
    alter table public.family_calendar_sources drop constraint family_calendar_sources_source_type_check;
  end if;
exception when undefined_table then
  null;
end $$;

alter table if exists public.family_calendar_sources
  add column if not exists source_payload jsonb not null default '{}'::jsonb;

create table if not exists public.app_build_notes (
  id uuid primary key default gen_random_uuid(),
  build_key text not null unique,
  title text not null,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_build_notes(build_key, title, notes, payload, updated_at)
values (
  'v28_58_savings_rate_intelligence_family_school_modal',
  'Savings rate intelligence + school calendar parser polish',
  'Savings source extraction now stores access, notice, term, deposit cap and withdrawal-rule fields. User savings account edits/movements open in centred modals. LoopWatch school calendar detection is hardened so term-date snippets are not treated as generic contracts.',
  '{"areas":["savings","family_planning","loopwatch"],"requires_sql":true}'::jsonb,
  now()
)
on conflict (build_key) do update
set title = excluded.title,
    notes = excluded.notes,
    payload = excluded.payload,
    updated_at = now();
