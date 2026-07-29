-- LOOP v28.59 - Moneybox full catalogue + savings optimiser hardening
-- Adds a source-job result payload column used by the refreshed savings extraction pipeline.

alter table if exists public.savings_rate_sources
  add column if not exists last_result_payload jsonb not null default '{}'::jsonb;

create index if not exists savings_rate_sources_result_gin_idx
  on public.savings_rate_sources using gin(last_result_payload);

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
  'v28_59_moneybox_catalogue_savings_pipeline_check',
  'Moneybox full catalogue + savings optimiser hardening',
  'Moneybox allocation search now includes the full reviewed fund/ETF/cash list and the 20 supported US stocks. The savings optimiser now seeds sources before a one-click run and can extract multiple rate rows from source/rate-table pages rather than only one product per page.',
  '{"areas":["investments","moneybox","savings"],"moneybox_assets_reviewed":56,"requires_sql":true}'::jsonb,
  now()
)
on conflict (build_key) do update
set title = excluded.title,
    notes = excluded.notes,
    payload = excluded.payload,
    updated_at = now();
