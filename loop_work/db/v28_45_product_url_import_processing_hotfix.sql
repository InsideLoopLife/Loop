-- v28.45 product URL import processing hotfix
-- No destructive changes. Ensures URL import tables have columns used by the processing UI/action.

create table if not exists public.loop_product_link_import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  import_name text not null,
  discovery_mode text not null default 'provided_urls_only',
  source_input text,
  batch_size integer not null default 10,
  discovered_count integer not null default 0,
  status text not null default 'staged',
  notes text,
  last_action_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loop_product_link_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.loop_product_link_import_batches(id) on delete cascade,
  row_number integer not null,
  source_url text not null,
  source_host text,
  fingerprint text,
  status text not null default 'waiting',
  confidence numeric not null default 0,
  staged_product_name text,
  matched_card_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loop_product_link_import_rows
  add column if not exists staged_product_name text,
  add column if not exists matched_card_id uuid,
  add column if not exists confidence numeric not null default 0,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists loop_product_link_import_rows_batch_url_uidx on public.loop_product_link_import_rows(batch_id, source_url);
create index if not exists loop_product_link_import_rows_batch_status_idx on public.loop_product_link_import_rows(batch_id, status, row_number);
create index if not exists loop_product_link_import_rows_fingerprint_idx on public.loop_product_link_import_rows(fingerprint);
