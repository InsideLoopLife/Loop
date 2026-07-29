-- v27.69 LOOP product import + AI enrichment queue
-- Adds a safe staging layer for CSV/Excel-style product imports.
-- Products/ingredients can become shared library items; recipes/takeaways remain private elsewhere.

create extension if not exists pgcrypto;

create or replace function public.loop_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Keep this migration usable even if v27.67 has not been run yet.
create table if not exists public.loop_nutrition_cards (
  id uuid primary key default gen_random_uuid(),
  card_kind text not null default 'product',
  visibility text not null default 'shared_database',
  product_type text not null default 'food',
  owner_user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  display_name text not null,
  formal_name text,
  brand_name text,
  variant_name text,
  source_url text,
  source_host text,
  main_image_url text,
  serving_label text,
  serving_ml numeric,
  serving_g numeric,
  prepared_volume_ml numeric,
  package_count integer,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fibre_g numeric,
  sugar_g numeric,
  added_sugar_g numeric,
  saturated_fat_g numeric,
  salt_g numeric,
  sodium_mg numeric,
  caffeine_mg numeric,
  nutrition jsonb not null default '{}'::jsonb,
  dietary_flags text[] not null default array[]::text[],
  confidence integer not null default 50,
  score integer,
  status text not null default 'active',
  is_verified boolean not null default false,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loop_nutrition_cards
  add column if not exists barcode text,
  add column if not exists category text,
  add column if not exists import_batch_id uuid,
  add column if not exists import_row_id uuid,
  add column if not exists enrichment_status text not null default 'not_requested',
  add column if not exists enrichment_note text,
  add column if not exists last_enriched_at timestamptz,
  add column if not exists data_quality_status text not null default 'draft';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'loop_nutrition_cards_enrichment_status_check'
  ) then
    alter table public.loop_nutrition_cards
      add constraint loop_nutrition_cards_enrichment_status_check
      check (enrichment_status in ('not_requested','queued','processing','ai_enriched','needs_review','verified','failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'loop_nutrition_cards_data_quality_status_check'
  ) then
    alter table public.loop_nutrition_cards
      add constraint loop_nutrition_cards_data_quality_status_check
      check (data_quality_status in ('draft','imported','estimated','needs_review','verified','conflict'));
  end if;
end $$;

create index if not exists loop_nutrition_cards_barcode_idx on public.loop_nutrition_cards(lower(barcode)) where barcode is not null;
create index if not exists loop_nutrition_cards_brand_name_idx on public.loop_nutrition_cards(lower(coalesce(brand_name,'')), lower(display_name));
create index if not exists loop_nutrition_cards_category_idx on public.loop_nutrition_cards(category, product_type);

-- Generic facts allow calories/macros/micros/source confidence to be tracked without changing schema every time.
create table if not exists public.loop_nutrition_card_facts (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.loop_nutrition_cards(id) on delete cascade,
  fact_key text not null,
  fact_label text,
  value_numeric numeric,
  value_text text,
  unit text,
  source_kind text not null default 'import',
  source_url text,
  source_batch_id uuid,
  source_row_id uuid,
  confidence integer not null default 50,
  is_estimated boolean not null default false,
  is_verified boolean not null default false,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_nutrition_card_facts_source_kind_check check (source_kind in ('import','ai_estimate','source_url','label_image','admin','user_correction')),
  constraint loop_nutrition_card_facts_confidence_check check (confidence between 0 and 100)
);

create unique index if not exists loop_nutrition_card_facts_unique_key
  on public.loop_nutrition_card_facts(card_id, fact_key);

create index if not exists loop_nutrition_card_facts_review_idx
  on public.loop_nutrition_card_facts(is_estimated, is_verified, confidence);


create table if not exists public.loop_nutrition_card_ingredients (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  parent_id uuid references public.loop_nutrition_card_ingredients(id) on delete cascade,
  sort_order integer not null default 0,
  section_label text not null default 'Ingredients',
  ingredient_name text not null,
  quantity_text text,
  percentage numeric,
  raw_text text,
  info_mode text not null default 'raw_only',
  linked_card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  confidence integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loop_nutrition_card_ingredients_card_idx
  on public.loop_nutrition_card_ingredients(card_id, parent_id, sort_order);

create table if not exists public.loop_nutrition_card_allergens (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  allergen_key text not null,
  allergen_label text not null,
  presence text not null default 'unknown',
  evidence_text text,
  source_url text,
  confidence integer not null default 50,
  locked boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists loop_nutrition_card_allergens_unique_idx
  on public.loop_nutrition_card_allergens(card_id, lower(allergen_key), presence);

create table if not exists public.loop_nutrition_price_observations (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  retailer_name text,
  source_url text,
  price_amount numeric,
  price_currency text default 'GBP',
  price_text text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists loop_nutrition_price_observations_card_idx
  on public.loop_nutrition_price_observations(card_id, observed_at desc);

drop trigger if exists loop_nutrition_card_facts_updated_at on public.loop_nutrition_card_facts;
create trigger loop_nutrition_card_facts_updated_at
before update on public.loop_nutrition_card_facts
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_product_import_batches (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references auth.users(id) on delete set null,
  file_name text,
  import_name text,
  status text not null default 'uploaded',
  total_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  matched_count integer not null default 0,
  needs_review_count integer not null default 0,
  failed_count integer not null default 0,
  source_type text not null default 'csv',
  default_visibility text not null default 'shared_database',
  default_currency text not null default 'GBP',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_product_import_batches_status_check check (status in ('uploaded','mapping','staged','matching','matched','enriching','ai_enriched','applying','applied','needs_review','failed')),
  constraint loop_product_import_batches_visibility_check check (default_visibility in ('shared_database','household_private','user_private'))
);

drop trigger if exists loop_product_import_batches_updated_at on public.loop_product_import_batches;
create trigger loop_product_import_batches_updated_at
before update on public.loop_product_import_batches
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_product_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.loop_product_import_batches(id) on delete cascade,
  row_number integer not null,
  status text not null default 'new',
  raw_row jsonb not null default '{}'::jsonb,
  normalised jsonb not null default '{}'::jsonb,
  enriched jsonb not null default '{}'::jsonb,
  existing_card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  match_strategy text,
  match_confidence integer not null default 0,
  conflict_fields text[] not null default array[]::text[],
  warnings text[] not null default array[]::text[],
  error_message text,
  product_name text,
  brand text,
  product_type text,
  category text,
  barcode text,
  source_url text,
  image_url text,
  retailer text,
  price_amount numeric,
  price_currency text default 'GBP',
  created_card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_product_import_rows_status_check check (status in ('new','matched_existing','needs_review','ready_to_create','created','updated','ai_queued','ai_enriching','ai_enriched','skipped','failed')),
  constraint loop_product_import_rows_match_confidence_check check (match_confidence between 0 and 100)
);

create unique index if not exists loop_product_import_rows_batch_row_unique
  on public.loop_product_import_rows(batch_id, row_number);
create index if not exists loop_product_import_rows_batch_status_idx on public.loop_product_import_rows(batch_id, status);
create index if not exists loop_product_import_rows_match_idx on public.loop_product_import_rows(existing_card_id, match_confidence);
create index if not exists loop_product_import_rows_barcode_idx on public.loop_product_import_rows(lower(barcode)) where barcode is not null;

drop trigger if exists loop_product_import_rows_updated_at on public.loop_product_import_rows;
create trigger loop_product_import_rows_updated_at
before update on public.loop_product_import_rows
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_product_import_enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.loop_product_import_batches(id) on delete cascade,
  row_id uuid references public.loop_product_import_rows(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  job_kind text not null default 'ai_product_enrichment',
  status text not null default 'queued',
  provider text,
  model text,
  prompt_version text not null default 'v27.69-product-enrichment',
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_product_import_enrichment_jobs_status_check check (status in ('queued','processing','completed','failed','skipped'))
);

create index if not exists loop_product_import_enrichment_jobs_batch_idx on public.loop_product_import_enrichment_jobs(batch_id, status, created_at desc);

drop trigger if exists loop_product_import_enrichment_jobs_updated_at on public.loop_product_import_enrichment_jobs;
create trigger loop_product_import_enrichment_jobs_updated_at
before update on public.loop_product_import_enrichment_jobs
for each row execute function public.loop_set_updated_at();

-- RLS. App admin actions use service-role where configured; authenticated can read shared cards/facts.
alter table public.loop_nutrition_cards enable row level security;
alter table public.loop_nutrition_card_facts enable row level security;
alter table public.loop_product_import_batches enable row level security;
alter table public.loop_product_import_rows enable row level security;
alter table public.loop_product_import_enrichment_jobs enable row level security;

drop policy if exists "nutrition cards shared readable" on public.loop_nutrition_cards;
create policy "nutrition cards shared readable" on public.loop_nutrition_cards
for select to authenticated using (visibility = 'shared_database' or owner_user_id = auth.uid());

drop policy if exists "nutrition facts shared readable" on public.loop_nutrition_card_facts;
create policy "nutrition facts shared readable" on public.loop_nutrition_card_facts
for select to authenticated using (
  exists (
    select 1 from public.loop_nutrition_cards c
    where c.id = card_id and (c.visibility = 'shared_database' or c.owner_user_id = auth.uid())
  )
);

-- Helpful normalisation helpers.
drop function if exists public.loop_product_import_key(text);
create or replace function public.loop_product_import_key(p_value text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select nullif(regexp_replace(lower(trim(coalesce(p_value,''))), '[^a-z0-9]+', ' ', 'g'), '')
$$;

grant execute on function public.loop_product_import_key(text) to authenticated;

drop function if exists public.loop_product_import_recount(uuid);
create or replace function public.loop_product_import_recount(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update public.loop_product_import_batches b
  set
    total_rows = coalesce((select count(*) from public.loop_product_import_rows r where r.batch_id = p_batch_id),0),
    matched_count = coalesce((select count(*) from public.loop_product_import_rows r where r.batch_id = p_batch_id and r.status = 'matched_existing'),0),
    needs_review_count = coalesce((select count(*) from public.loop_product_import_rows r where r.batch_id = p_batch_id and r.status = 'needs_review'),0),
    created_count = coalesce((select count(*) from public.loop_product_import_rows r where r.batch_id = p_batch_id and r.status = 'created'),0),
    updated_count = coalesce((select count(*) from public.loop_product_import_rows r where r.batch_id = p_batch_id and r.status = 'updated'),0),
    failed_count = coalesce((select count(*) from public.loop_product_import_rows r where r.batch_id = p_batch_id and r.status = 'failed'),0),
    updated_at = now()
  where b.id = p_batch_id;
end;
$$;

grant execute on function public.loop_product_import_recount(uuid) to authenticated;

-- Finds likely card matches for a staged row.
drop function if exists public.loop_product_import_match_row(uuid);
create or replace function public.loop_product_import_match_row(p_row_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row public.loop_product_import_rows%rowtype;
  v_match_id uuid;
  v_strategy text;
  v_confidence integer := 0;
  v_name_key text;
  v_brand_key text;
begin
  select * into v_row from public.loop_product_import_rows where id = p_row_id;
  if not found then
    raise exception 'Import row not found.';
  end if;

  v_name_key := public.loop_product_import_key(v_row.product_name);
  v_brand_key := public.loop_product_import_key(v_row.brand);

  if nullif(v_row.barcode,'') is not null then
    select id into v_match_id
    from public.loop_nutrition_cards
    where lower(coalesce(barcode,'')) = lower(v_row.barcode)
    order by updated_at desc
    limit 1;
    if v_match_id is not null then
      v_strategy := 'barcode_exact';
      v_confidence := 100;
    end if;
  end if;

  if v_match_id is null and nullif(v_row.source_url,'') is not null then
    select id into v_match_id
    from public.loop_nutrition_cards
    where lower(coalesce(source_url,'')) = lower(v_row.source_url)
    order by updated_at desc
    limit 1;
    if v_match_id is not null then
      v_strategy := 'source_url_exact';
      v_confidence := 96;
    end if;
  end if;

  if v_match_id is null and v_name_key is not null then
    select id into v_match_id
    from public.loop_nutrition_cards c
    where public.loop_product_import_key(c.display_name) = v_name_key
      and (v_brand_key is null or public.loop_product_import_key(c.brand_name) = v_brand_key)
    order by case when public.loop_product_import_key(c.brand_name) = v_brand_key then 0 else 1 end, updated_at desc
    limit 1;
    if v_match_id is not null then
      v_strategy := 'brand_name_exact';
      v_confidence := case when v_brand_key is not null then 90 else 78 end;
    end if;
  end if;

  update public.loop_product_import_rows
  set
    existing_card_id = v_match_id,
    match_strategy = v_strategy,
    match_confidence = v_confidence,
    status = case
      when v_match_id is not null and v_confidence >= 90 then 'matched_existing'
      when v_match_id is not null then 'needs_review'
      else 'ready_to_create'
    end,
    warnings = case
      when v_match_id is not null and v_confidence < 90 then array_append(warnings, 'Possible existing product match. Review before applying.')
      else warnings
    end
  where id = p_row_id;

  perform public.loop_product_import_recount(v_row.batch_id);

  return jsonb_build_object(
    'row_id', p_row_id,
    'existing_card_id', v_match_id,
    'match_strategy', v_strategy,
    'match_confidence', v_confidence
  );
end;
$$;

grant execute on function public.loop_product_import_match_row(uuid) to authenticated;

drop function if exists public.loop_v2769_product_import_healthcheck();
create or replace function public.loop_v2769_product_import_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'import_batches_table', to_regclass('public.loop_product_import_batches') is not null, 'Product import batches table exists.'
  union all
  select 'import_rows_table', to_regclass('public.loop_product_import_rows') is not null, 'Product import rows table exists.'
  union all
  select 'enrichment_jobs_table', to_regclass('public.loop_product_import_enrichment_jobs') is not null, 'Product enrichment jobs table exists.'
  union all
  select 'card_facts_table', to_regclass('public.loop_nutrition_card_facts') is not null, 'Nutrition card facts table exists.'
  union all
  select 'match_rpc', exists(select 1 from pg_proc where proname = 'loop_product_import_match_row'), 'Row matching RPC exists.'
  union all
  select 'recount_rpc', exists(select 1 from pg_proc where proname = 'loop_product_import_recount'), 'Batch recount RPC exists.';
$$;

grant execute on function public.loop_v2769_product_import_healthcheck() to anon;
grant execute on function public.loop_v2769_product_import_healthcheck() to authenticated;
