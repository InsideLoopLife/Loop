-- v28.44 jobs, family school import, savings provider ownership, product URL batches

create table if not exists public.employment_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  household_id uuid,
  person_id uuid,
  employer_name text,
  role_title text,
  employment_type text not null default 'employed',
  start_date date,
  end_date date,
  annual_leave_days numeric,
  carried_over_leave_days numeric not null default 0,
  bank_holidays_included boolean not null default false,
  contracted_hours_per_week numeric,
  contracted_days_per_week numeric,
  work_pattern text,
  salary_link_mode text not null default 'separate_income_record',
  document_storage_preference text not null default 'digest_only',
  source_document_name text,
  source_document_size_bytes bigint,
  original_document_retained boolean not null default false,
  extracted_summary text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employment_jobs
  add column if not exists household_id uuid,
  add column if not exists person_id uuid,
  add column if not exists employment_type text not null default 'employed',
  add column if not exists annual_leave_days numeric,
  add column if not exists carried_over_leave_days numeric not null default 0,
  add column if not exists bank_holidays_included boolean not null default false,
  add column if not exists contracted_hours_per_week numeric,
  add column if not exists contracted_days_per_week numeric,
  add column if not exists work_pattern text,
  add column if not exists salary_link_mode text not null default 'separate_income_record',
  add column if not exists document_storage_preference text not null default 'digest_only',
  add column if not exists source_document_name text,
  add column if not exists source_document_size_bytes bigint,
  add column if not exists original_document_retained boolean not null default false,
  add column if not exists extracted_summary text,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists employment_jobs_user_idx on public.employment_jobs(user_id, created_at desc);
create index if not exists employment_jobs_household_idx on public.employment_jobs(household_id, person_id);

create table if not exists public.family_school_calendar_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  household_id uuid,
  child_person_id uuid,
  source_id uuid,
  source_url text,
  source_file_name text,
  source_file_size_bytes bigint,
  raw_text text,
  parsed_payload jsonb not null default '{}'::jsonb,
  confidence numeric not null default 0,
  status text not null default 'needs_review',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_school_calendar_imports_household_idx on public.family_school_calendar_imports(household_id, created_at desc);
create index if not exists family_school_calendar_imports_child_idx on public.family_school_calendar_imports(child_person_id, created_at desc);

create table if not exists public.financial_provider_logos (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null unique,
  provider_name text not null,
  logo_url text,
  logo_initials text,
  brand_colour text,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.financial_provider_logos(provider_key, provider_name, logo_initials, brand_colour, aliases)
values
  ('nationwide', 'Nationwide', 'NW', '#2455d6', array['Nationwide Building Society','Nationwide','NW','Flex','Instant Access Saver']),
  ('chip', 'Chip', 'CH', '#020617', array['Chip','Chip Financial','Easy Access']),
  ('revolut', 'Revolut', 'R', '#111827', array['Revolut','Revolut Bank','Revolut Savings']),
  ('plum', 'Plum', 'P', '#6d28d9', array['Plum','Plum Interest']),
  ('zopa', 'Zopa', 'Z', '#007a5a', array['Zopa','Biscuit Saver','Rainy Day']),
  ('santander', 'Santander', 'S', '#e11d48', array['Santander','123']),
  ('natwest', 'NatWest', 'NW', '#4f46e5', array['NatWest','National Westminster']),
  ('tsb', 'TSB', 'TSB', '#2563eb', array['TSB']),
  ('barclays', 'Barclays', 'B', '#0284c7', array['Barclays']),
  ('monzo', 'Monzo', 'M', '#fb7185', array['Monzo'])
on conflict (provider_key) do update set
  provider_name = excluded.provider_name,
  logo_initials = excluded.logo_initials,
  brand_colour = excluded.brand_colour,
  aliases = excluded.aliases,
  updated_at = now();

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

create unique index if not exists loop_product_link_import_rows_batch_url_uidx on public.loop_product_link_import_rows(batch_id, source_url);
create index if not exists loop_product_link_import_rows_batch_status_idx on public.loop_product_link_import_rows(batch_id, status, row_number);
create index if not exists loop_product_link_import_rows_fingerprint_idx on public.loop_product_link_import_rows(fingerprint);

-- Optional: mirror active job annual leave into family_leave_allowances for the current year where no explicit allowance exists.
insert into public.family_leave_allowances(user_id, household_id, person_id, leave_year, allowance_days, carried_over_days, bank_holidays_included, work_pattern, notes)
select
  j.user_id,
  j.household_id,
  j.person_id,
  extract(year from now())::int,
  coalesce(j.annual_leave_days, 0),
  coalesce(j.carried_over_leave_days, 0),
  coalesce(j.bank_holidays_included, false),
  coalesce(j.work_pattern, 'Not set'),
  'Created from Account > Jobs by v28.44 migration.'
from public.employment_jobs j
where j.person_id is not null
  and j.annual_leave_days is not null
  and (j.end_date is null or j.end_date >= current_date)
on conflict do nothing;
