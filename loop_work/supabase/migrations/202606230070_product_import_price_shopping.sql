-- v27.70 LOOP product import package + price refresh + shopping list planning
-- Run after v27.69. Safe to run repeatedly.

create extension if not exists pgcrypto;

-- Product library metadata needed by Aldi/Lidl/Tesco import packages.
alter table public.loop_nutrition_cards
  add column if not exists shop_tag text,
  add column if not exists retailer_article_number text,
  add column if not exists dedupe_key text,
  add column if not exists image_harvest_mode text,
  add column if not exists image_alt text,
  add column if not exists product_size_text text,
  add column if not exists price_refresh_status text not null default 'not_requested',
  add column if not exists last_price_checked_at timestamptz,
  add column if not exists last_price_status text,
  add column if not exists last_price_error text;

create index if not exists loop_nutrition_cards_shop_article_idx
  on public.loop_nutrition_cards(shop_tag, retailer_article_number)
  where shop_tag is not null and retailer_article_number is not null;

create index if not exists loop_nutrition_cards_dedupe_key_idx
  on public.loop_nutrition_cards(lower(dedupe_key))
  where dedupe_key is not null and dedupe_key <> '';

-- Extra import row fields for multi-file package imports.
alter table public.loop_product_import_rows
  add column if not exists import_key text,
  add column if not exists shop_tag text,
  add column if not exists retailer_article_number text,
  add column if not exists dedupe_key text,
  add column if not exists supporting_payload jsonb not null default '{}'::jsonb,
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists serving_options jsonb not null default '[]'::jsonb,
  add column if not exists source_allergens jsonb not null default '[]'::jsonb;

create index if not exists loop_product_import_rows_import_key_idx
  on public.loop_product_import_rows(batch_id, import_key);
create index if not exists loop_product_import_rows_shop_article_idx
  on public.loop_product_import_rows(shop_tag, retailer_article_number);


-- Serving options are needed to distinguish product variants/sizes.
create table if not exists public.loop_nutrition_serving_options (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  canonical_name text not null,
  serving_label text not null,
  serving_ml numeric,
  serving_g numeric,
  prepared_volume_ml numeric,
  package_count integer,
  is_default boolean not null default false,
  confidence integer not null default 50,
  requires_user_confirmation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loop_nutrition_serving_options_card_idx
  on public.loop_nutrition_serving_options(card_id);

drop trigger if exists loop_nutrition_serving_options_updated_at on public.loop_nutrition_serving_options;
create trigger loop_nutrition_serving_options_updated_at
before update on public.loop_nutrition_serving_options
for each row execute function public.loop_set_updated_at();

-- Source snapshots, used both by import package and source refresh cron.
create table if not exists public.loop_nutrition_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  submitted_by uuid references auth.users(id) on delete set null,
  source_url text not null,
  source_host text,
  retailer_name text,
  formal_name text,
  main_image_url text,
  price_amount numeric,
  price_currency text default 'GBP',
  price_text text,
  ingredients_text text,
  allergens_text text,
  nutrition_text text,
  raw_payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  confidence integer not null default 50,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loop_nutrition_source_snapshots
  add column if not exists import_batch_id uuid references public.loop_product_import_batches(id) on delete set null,
  add column if not exists import_row_id uuid references public.loop_product_import_rows(id) on delete set null,
  add column if not exists image_harvest_mode text;

alter table public.loop_nutrition_source_snapshots
  drop constraint if exists loop_nutrition_source_snapshots_status_check;

alter table public.loop_nutrition_source_snapshots
  add constraint loop_nutrition_source_snapshots_status_check
  check (status in ('queued','processing','ready_import','needs_review','applied','rejected','failed'));

create index if not exists loop_nutrition_source_snapshots_card_created_idx
  on public.loop_nutrition_source_snapshots(card_id, created_at desc);
create index if not exists loop_nutrition_source_snapshots_status_idx
  on public.loop_nutrition_source_snapshots(status, created_at desc);

drop trigger if exists loop_nutrition_source_snapshots_updated_at on public.loop_nutrition_source_snapshots;
create trigger loop_nutrition_source_snapshots_updated_at
before update on public.loop_nutrition_source_snapshots
for each row execute function public.loop_set_updated_at();

-- Price refresh run audit.
create table if not exists public.loop_product_price_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  run_kind text not null default 'cron',
  status text not null default 'running',
  scanned_count integer not null default 0,
  updated_count integer not null default 0,
  failed_count integer not null default 0,
  notes text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- Shopping list planning tables.
create table if not exists public.loop_shopping_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid,
  owner_user_id uuid references auth.users(id) on delete set null,
  title text not null default 'Shopping list',
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists loop_shopping_lists_updated_at on public.loop_shopping_lists;
create trigger loop_shopping_lists_updated_at
before update on public.loop_shopping_lists
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.loop_shopping_lists(id) on delete cascade,
  source_card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  ingredient_name text not null,
  canonical_name text,
  quantity numeric not null,
  unit text not null default 'g',
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists loop_shopping_list_items_list_idx
  on public.loop_shopping_list_items(list_id, canonical_name, unit);

create table if not exists public.loop_shopping_purchase_suggestions (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.loop_shopping_lists(id) on delete cascade,
  ingredient_key text not null,
  card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  retailer_name text,
  source_url text,
  packs integer not null default 1,
  required_quantity numeric,
  supplied_quantity numeric,
  waste_quantity numeric,
  unit text,
  price_amount numeric,
  price_currency text default 'GBP',
  score numeric,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists loop_shopping_purchase_suggestions_list_idx
  on public.loop_shopping_purchase_suggestions(list_id, ingredient_key, score);

-- Normalised key helper for shopping / matching.
drop function if exists public.loop_food_key(text);
create or replace function public.loop_food_key(p_value text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(p_value,''))), '\b(raw|fresh|sliced|diced|large|small|medium|skinless|boneless)\b', '', 'g'),
      '[^a-z0-9]+', ' ', 'g'
    ),
    ''
  )
$$;

grant execute on function public.loop_food_key(text) to authenticated;

-- Improved matching now understands import_key/shop article/dedupe key.
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
    if v_match_id is not null then v_strategy := 'barcode_exact'; v_confidence := 100; end if;
  end if;

  if v_match_id is null and nullif(v_row.dedupe_key,'') is not null then
    select id into v_match_id
    from public.loop_nutrition_cards
    where lower(coalesce(dedupe_key,'')) = lower(v_row.dedupe_key)
    order by updated_at desc
    limit 1;
    if v_match_id is not null then v_strategy := 'dedupe_key_exact'; v_confidence := 99; end if;
  end if;

  if v_match_id is null and nullif(v_row.shop_tag,'') is not null and nullif(v_row.retailer_article_number,'') is not null then
    select id into v_match_id
    from public.loop_nutrition_cards
    where lower(coalesce(shop_tag,'')) = lower(v_row.shop_tag)
      and lower(coalesce(retailer_article_number,'')) = lower(v_row.retailer_article_number)
    order by updated_at desc
    limit 1;
    if v_match_id is not null then v_strategy := 'retailer_article_exact'; v_confidence := 98; end if;
  end if;

  if v_match_id is null and nullif(v_row.source_url,'') is not null then
    select id into v_match_id
    from public.loop_nutrition_cards
    where lower(coalesce(source_url,'')) = lower(v_row.source_url)
    order by updated_at desc
    limit 1;
    if v_match_id is not null then v_strategy := 'source_url_exact'; v_confidence := 96; end if;
  end if;

  if v_match_id is null and v_name_key is not null then
    select id into v_match_id
    from public.loop_nutrition_cards c
    where public.loop_product_import_key(c.display_name) = v_name_key
      and (v_brand_key is null or public.loop_product_import_key(c.brand_name) = v_brand_key)
    order by case when public.loop_product_import_key(c.brand_name) = v_brand_key then 0 else 1 end, updated_at desc
    limit 1;
    if v_match_id is not null then v_strategy := 'brand_name_exact'; v_confidence := case when v_brand_key is not null then 90 else 78 end; end if;
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

  return jsonb_build_object('row_id', p_row_id, 'existing_card_id', v_match_id, 'match_strategy', v_strategy, 'match_confidence', v_confidence);
end;
$$;

grant execute on function public.loop_product_import_match_row(uuid) to authenticated;

-- Roll up shopping list ingredients into total required quantities.
drop function if exists public.loop_shopping_list_rollup(uuid);
create or replace function public.loop_shopping_list_rollup(p_list_id uuid)
returns table(
  ingredient_key text,
  display_name text,
  total_quantity numeric,
  unit text,
  line_count bigint
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    public.loop_food_key(coalesce(canonical_name, ingredient_name)) as ingredient_key,
    min(ingredient_name) as display_name,
    sum(case
      when lower(unit) = 'kg' then quantity * 1000
      when lower(unit) = 'l' then quantity * 1000
      else quantity
    end) as total_quantity,
    case
      when lower(unit) in ('kg','g') then 'g'
      when lower(unit) in ('l','ml') then 'ml'
      else lower(unit)
    end as unit,
    count(*) as line_count
  from public.loop_shopping_list_items
  where list_id = p_list_id
  group by 1, 4
  order by 2;
$$;

grant execute on function public.loop_shopping_list_rollup(uuid) to authenticated;


-- RLS for new tables. Admin/service actions can write; authenticated users can read shared product support data.
alter table public.loop_nutrition_source_snapshots enable row level security;
alter table public.loop_product_price_refresh_runs enable row level security;
alter table public.loop_shopping_lists enable row level security;
alter table public.loop_shopping_list_items enable row level security;
alter table public.loop_shopping_purchase_suggestions enable row level security;

drop policy if exists "source snapshots readable through shared cards" on public.loop_nutrition_source_snapshots;
create policy "source snapshots readable through shared cards" on public.loop_nutrition_source_snapshots
for select to authenticated using (
  exists (
    select 1 from public.loop_nutrition_cards c
    where c.id = card_id and (c.visibility = 'shared_database' or c.owner_user_id = auth.uid())
  )
);

drop policy if exists "shopping lists owner readable" on public.loop_shopping_lists;
create policy "shopping lists owner readable" on public.loop_shopping_lists
for select to authenticated using (owner_user_id = auth.uid());

drop policy if exists "shopping lists owner writable" on public.loop_shopping_lists;
create policy "shopping lists owner writable" on public.loop_shopping_lists
for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists "shopping items through list" on public.loop_shopping_list_items;
create policy "shopping items through list" on public.loop_shopping_list_items
for all to authenticated using (
  exists (select 1 from public.loop_shopping_lists l where l.id = list_id and l.owner_user_id = auth.uid())
) with check (
  exists (select 1 from public.loop_shopping_lists l where l.id = list_id and l.owner_user_id = auth.uid())
);

drop policy if exists "shopping suggestions through list" on public.loop_shopping_purchase_suggestions;
create policy "shopping suggestions through list" on public.loop_shopping_purchase_suggestions
for select to authenticated using (
  exists (select 1 from public.loop_shopping_lists l where l.id = list_id and l.owner_user_id = auth.uid())
);


drop function if exists public.loop_v2770_import_price_shopping_healthcheck();
create or replace function public.loop_v2770_import_price_shopping_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'import_rows_package_columns', exists(select 1 from information_schema.columns where table_schema='public' and table_name='loop_product_import_rows' and column_name='supporting_payload'), 'Import rows can store package supporting files.'
  union all
  select 'source_snapshots_table', to_regclass('public.loop_nutrition_source_snapshots') is not null, 'Source snapshots table exists.'
  union all
  select 'price_refresh_runs_table', to_regclass('public.loop_product_price_refresh_runs') is not null, 'Price refresh audit table exists.'
  union all
  select 'shopping_lists_table', to_regclass('public.loop_shopping_lists') is not null, 'Shopping list tables exist.'
  union all
  select 'shopping_rollup_rpc', exists(select 1 from pg_proc where proname='loop_shopping_list_rollup'), 'Shopping rollup RPC exists.'
  union all
  select 'improved_match_rpc', exists(select 1 from pg_proc where proname='loop_product_import_match_row'), 'Improved matching RPC exists.';
$$;

grant execute on function public.loop_v2770_import_price_shopping_healthcheck() to anon;
grant execute on function public.loop_v2770_import_price_shopping_healthcheck() to authenticated;
