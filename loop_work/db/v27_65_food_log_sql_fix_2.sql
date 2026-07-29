-- v27.65 Inside LOOP food logging SQL fix 2
--
-- Fixes v27.64 error:
-- ERROR: 42601: VALUES lists must all be the same length
-- LINE 379: 'allergen_validation',
--
-- Cause:
-- The allergen_validation seed row was missing one boolean value for:
-- requires_source / requires_vision.
--
-- This file also avoids expression-based ON CONFLICT for serving-size seeds,
-- so it is safer if your Supabase/Postgres parser is picky.
--
-- Safe to run even if v27.63/v27.64 partially ran.

create extension if not exists pgcrypto;

create or replace function public.app_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -------------------------
-- Product serving options
-- -------------------------
create table if not exists public.app_food_product_serving_options (
  id uuid primary key default gen_random_uuid(),
  product_card_id uuid,
  canonical_name text not null,
  brand_name text,
  product_family text,
  variant_name text,
  serving_label text not null,
  serving_ml numeric,
  serving_g numeric,
  prepared_volume_ml numeric,
  package_count integer,
  is_default boolean not null default false,
  confidence integer not null default 50,
  data_source text not null default 'starter_seed',
  source_url text,
  requires_user_confirmation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_food_product_serving_options_confidence_check check (confidence between 0 and 100),
  constraint app_food_product_serving_options_size_check check (
    serving_ml is not null
    or serving_g is not null
    or prepared_volume_ml is not null
  )
);

create index if not exists app_food_product_serving_options_name_idx
on public.app_food_product_serving_options
using gin (
  to_tsvector(
    'simple',
    canonical_name || ' ' || coalesce(brand_name,'') || ' ' || coalesce(variant_name,'') || ' ' || coalesce(product_family,'')
  )
);

create index if not exists app_food_product_serving_options_card_idx
on public.app_food_product_serving_options(product_card_id);

create unique index if not exists app_food_product_serving_options_unique_size_idx
on public.app_food_product_serving_options(
  lower(canonical_name),
  lower(serving_label),
  coalesce(serving_ml, -1),
  coalesce(serving_g, -1),
  coalesce(prepared_volume_ml, -1),
  coalesce(package_count, -1)
);

drop trigger if exists app_food_product_serving_options_updated_at on public.app_food_product_serving_options;
create trigger app_food_product_serving_options_updated_at
before update on public.app_food_product_serving_options
for each row execute function public.app_set_updated_at();

-- -------------------------
-- Product aliases
-- -------------------------
create table if not exists public.app_food_product_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  alias_key text not null,
  canonical_name text not null,
  brand_name text,
  product_family text,
  confidence integer not null default 60,
  created_at timestamptz not null default now(),
  constraint app_food_product_aliases_confidence_check check (confidence between 0 and 100)
);

alter table public.app_food_product_aliases
add column if not exists alias_key text;

update public.app_food_product_aliases
set alias_key = lower(trim(alias))
where alias_key is null or alias_key = '';

delete from public.app_food_product_aliases a
using public.app_food_product_aliases b
where a.alias_key = b.alias_key
  and a.id::text > b.id::text;

alter table public.app_food_product_aliases
alter column alias_key set not null;

create unique index if not exists app_food_product_aliases_alias_key_idx
on public.app_food_product_aliases(alias_key);

-- -------------------------
-- Correction queue
-- -------------------------
create table if not exists public.app_food_product_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  card_id uuid,
  log_entry_id uuid,
  submitted_name text,
  source_url text,
  label_image_url text,
  note text,
  correction_kind text not null default 'product_data',
  status text not null default 'queued',
  ai_attempts integer not null default 0,
  resolved_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_food_product_corrections_kind_check check (correction_kind in ('product_data','serving_size','label_scan','image_fix','nutrition_fix','allergen_fix')),
  constraint app_food_product_corrections_status_check check (status in ('queued','processing','needs_review','applied','rejected','failed'))
);

drop trigger if exists app_food_product_corrections_updated_at on public.app_food_product_corrections;
create trigger app_food_product_corrections_updated_at
before update on public.app_food_product_corrections
for each row execute function public.app_set_updated_at();

-- -------------------------
-- AI nutrition model policies
-- -------------------------
create table if not exists public.app_nutrition_ai_resolution_policies (
  task_key text primary key,
  task_name text not null,
  model_lane text not null,
  preferred_model_env_key text not null,
  fallback_model_env_key text,
  requires_source boolean not null default false,
  requires_vision boolean not null default false,
  max_prompt_tokens integer not null default 6000,
  max_output_tokens integer not null default 1400,
  monthly_cost_cap_pence integer not null default 0,
  confidence_floor integer not null default 70,
  auto_apply_floor integer not null default 90,
  enabled boolean not null default true,
  instructions text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_nutrition_ai_resolution_policies_confidence_check check (
    confidence_floor between 0 and 100 and auto_apply_floor between 0 and 100
  )
);

drop trigger if exists app_nutrition_ai_resolution_policies_updated_at on public.app_nutrition_ai_resolution_policies;
create trigger app_nutrition_ai_resolution_policies_updated_at
before update on public.app_nutrition_ai_resolution_policies
for each row execute function public.app_set_updated_at();

create table if not exists public.app_nutrition_ai_resolution_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  task_key text references public.app_nutrition_ai_resolution_policies(task_key),
  subject_kind text not null,
  subject_id uuid,
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb,
  confidence integer,
  status text not null default 'queued',
  model_used text,
  source_url text,
  cost_estimate_pence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_nutrition_ai_resolution_runs_status_check check (status in ('queued','processing','needs_review','auto_applied','applied','failed','rejected')),
  constraint app_nutrition_ai_resolution_runs_confidence_check check (confidence is null or confidence between 0 and 100)
);

drop trigger if exists app_nutrition_ai_resolution_runs_updated_at on public.app_nutrition_ai_resolution_runs;
create trigger app_nutrition_ai_resolution_runs_updated_at
before update on public.app_nutrition_ai_resolution_runs
for each row execute function public.app_set_updated_at();

-- -------------------------
-- RLS
-- -------------------------
alter table public.app_food_product_serving_options enable row level security;
alter table public.app_food_product_aliases enable row level security;
alter table public.app_food_product_corrections enable row level security;
alter table public.app_nutrition_ai_resolution_policies enable row level security;
alter table public.app_nutrition_ai_resolution_runs enable row level security;

drop policy if exists "serving options readable" on public.app_food_product_serving_options;
create policy "serving options readable" on public.app_food_product_serving_options
for select to authenticated using (true);

drop policy if exists "serving options service writable" on public.app_food_product_serving_options;
create policy "serving options service writable" on public.app_food_product_serving_options
for all to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "product aliases readable" on public.app_food_product_aliases;
create policy "product aliases readable" on public.app_food_product_aliases
for select to authenticated using (true);

drop policy if exists "product aliases admin writable" on public.app_food_product_aliases;
create policy "product aliases admin writable" on public.app_food_product_aliases
for all to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "corrections self insert" on public.app_food_product_corrections;
create policy "corrections self insert" on public.app_food_product_corrections
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "corrections self or admin read" on public.app_food_product_corrections;
create policy "corrections self or admin read" on public.app_food_product_corrections
for select to authenticated
using (
  user_id = auth.uid()
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "ai policies readable" on public.app_nutrition_ai_resolution_policies;
create policy "ai policies readable" on public.app_nutrition_ai_resolution_policies
for select to authenticated using (true);

drop policy if exists "ai policies admin all" on public.app_nutrition_ai_resolution_policies;
create policy "ai policies admin all" on public.app_nutrition_ai_resolution_policies
for all to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "ai runs self read" on public.app_nutrition_ai_resolution_runs;
create policy "ai runs self read" on public.app_nutrition_ai_resolution_runs
for select to authenticated
using (
  user_id = auth.uid()
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

-- -------------------------
-- Seed aliases
-- -------------------------
insert into public.app_food_product_aliases(alias, alias_key, canonical_name, brand_name, product_family, confidence)
values
('red bull sugarfree', lower('red bull sugarfree'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('red bull sugar free', lower('red bull sugar free'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('redbull sugarfree', lower('redbull sugarfree'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('redbull sugar free', lower('redbull sugar free'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('gfuel hype sauce', lower('gfuel hype sauce'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 90),
('g fuel hype sauce', lower('g fuel hype sauce'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 90),
('gfuel hype sauce 2.0', lower('gfuel hype sauce 2.0'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 95),
('g fuel hype sauce 2.0', lower('g fuel hype sauce 2.0'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 95)
on conflict (alias_key) do update set
  alias = excluded.alias,
  canonical_name = excluded.canonical_name,
  brand_name = excluded.brand_name,
  product_family = excluded.product_family,
  confidence = excluded.confidence;

-- -------------------------
-- Seed serving options without ON CONFLICT expressions
-- -------------------------
with seed_servings as (
  select *
  from (
    values
      ('Red Bull Sugarfree'::text, 'Red Bull'::text, 'Energy drink'::text, 'Sugarfree'::text, '250ml can'::text, 250::numeric, null::numeric, 250::numeric, 1::integer, true::boolean, 92::integer, 'starter_seed_size_hint'::text, false::boolean),
      ('Red Bull Sugarfree', 'Red Bull', 'Energy drink', 'Sugarfree', '355ml can', 355::numeric, null::numeric, 355::numeric, 1, false, 80, 'starter_seed_size_hint', true),
      ('Red Bull Sugarfree', 'Red Bull', 'Energy drink', 'Sugarfree', '473ml can', 473::numeric, null::numeric, 473::numeric, 1, false, 75, 'starter_seed_size_hint', true),
      ('Red Bull Sugarfree', 'Red Bull', 'Energy drink', 'Sugarfree', '4 × 250ml cans', 250::numeric, null::numeric, 250::numeric, 4, false, 80, 'starter_seed_size_hint', true),
      ('GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 'Hype Sauce 2.0', '1 scoop / 500ml prepared drink', null::numeric, 6.2::numeric, 500::numeric, 1, true, 92, 'starter_seed_label_user_supplied', false),
      ('GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 'Hype Sauce 2.0', '1 scoop / 355ml prepared drink', null::numeric, 6.2::numeric, 355::numeric, 1, false, 80, 'starter_seed_label_user_supplied', true)
  ) as v(
    canonical_name,
    brand_name,
    product_family,
    variant_name,
    serving_label,
    serving_ml,
    serving_g,
    prepared_volume_ml,
    package_count,
    is_default,
    confidence,
    data_source,
    requires_user_confirmation
  )
)
insert into public.app_food_product_serving_options
(canonical_name, brand_name, product_family, variant_name, serving_label, serving_ml, serving_g, prepared_volume_ml, package_count, is_default, confidence, data_source, requires_user_confirmation)
select
  s.canonical_name,
  s.brand_name,
  s.product_family,
  s.variant_name,
  s.serving_label,
  s.serving_ml,
  s.serving_g,
  s.prepared_volume_ml,
  s.package_count,
  s.is_default,
  s.confidence,
  s.data_source,
  s.requires_user_confirmation
from seed_servings s
where not exists (
  select 1
  from public.app_food_product_serving_options existing
  where lower(existing.canonical_name) = lower(s.canonical_name)
    and lower(existing.serving_label) = lower(s.serving_label)
    and coalesce(existing.serving_ml, -1) = coalesce(s.serving_ml, -1)
    and coalesce(existing.serving_g, -1) = coalesce(s.serving_g, -1)
    and coalesce(existing.prepared_volume_ml, -1) = coalesce(s.prepared_volume_ml, -1)
    and coalesce(existing.package_count, -1) = coalesce(s.package_count, -1)
);

-- Ensure default flags are correct after repeat runs.
update public.app_food_product_serving_options
set is_default = false
where lower(canonical_name) in ('red bull sugarfree', 'gfuel hype sauce 2.0');

update public.app_food_product_serving_options
set is_default = true,
    requires_user_confirmation = false,
    confidence = greatest(confidence, 92)
where lower(canonical_name) = 'red bull sugarfree'
  and serving_ml = 250
  and prepared_volume_ml = 250;

update public.app_food_product_serving_options
set is_default = true,
    requires_user_confirmation = false,
    confidence = greatest(confidence, 92)
where lower(canonical_name) = 'gfuel hype sauce 2.0'
  and serving_g = 6.2
  and prepared_volume_ml = 500;

-- -------------------------
-- Seed AI policies
-- -------------------------
insert into public.app_nutrition_ai_resolution_policies
(task_key, task_name, model_lane, preferred_model_env_key, fallback_model_env_key, requires_source, requires_vision, max_prompt_tokens, max_output_tokens, monthly_cost_cap_pence, confidence_floor, auto_apply_floor, instructions)
values
(
  'freehand_food_parse',
  'Freehand food/drink parsing',
  'fast_structured_text',
  'LOOP_AI_FAST_MODEL',
  'LOOP_AI_REASONING_MODEL',
  false,
  false,
  4000,
  1200,
  300,
  65,
  88,
  'Classify the user text as product, drink product, recipe/meal, ingredient, or takeaway. Extract time, meal slot, serving size, drink volume, likely brand, and confidence. Never create a product card if the query is too broad; return candidates and ask for confirmation.'
),
(
  'product_source_resolution',
  'Product source resolution',
  'web_grounded_reasoning',
  'LOOP_AI_REASONING_MODEL',
  'LOOP_AI_FAST_MODEL',
  true,
  false,
  7000,
  1800,
  800,
  75,
  92,
  'Use official product pages, retailer listings, barcode databases, and label images in that order. Prefer product size and label facts over generic nutrition estimates. Where ml/g differs, create a separate serving option and append the size in brackets.'
),
(
  'label_image_scan',
  'Nutrition/supplement label scan',
  'vision_structured_extraction',
  'LOOP_AI_VISION_MODEL',
  'LOOP_AI_REASONING_MODEL',
  false,
  true,
  6000,
  1800,
  1000,
  75,
  93,
  'Extract exact nutrition facts, supplement facts, allergens, serving size, servings per pack, directions and other ingredients. Do not infer allergens from brand/category. If the label does not list an allergen, mark unknown rather than positive.'
),
(
  'allergen_validation',
  'Allergen validation',
  'strict_safety_classifier',
  'LOOP_AI_REASONING_MODEL',
  null,
  true,
  true,
  5000,
  1200,
  500,
  80,
  95,
  'Allergens are locked facts. Only mark an allergen as present when it is explicitly listed on the label/source or an ingredient is an established allergen. Avoid spreading inherited tags from unrelated products.'
)
on conflict (task_key) do update set
  task_name = excluded.task_name,
  model_lane = excluded.model_lane,
  preferred_model_env_key = excluded.preferred_model_env_key,
  fallback_model_env_key = excluded.fallback_model_env_key,
  requires_source = excluded.requires_source,
  requires_vision = excluded.requires_vision,
  max_prompt_tokens = excluded.max_prompt_tokens,
  max_output_tokens = excluded.max_output_tokens,
  monthly_cost_cap_pence = excluded.monthly_cost_cap_pence,
  confidence_floor = excluded.confidence_floor,
  auto_apply_floor = excluded.auto_apply_floor,
  instructions = excluded.instructions,
  updated_at = now();

-- -------------------------
-- RPCs
-- -------------------------
drop function if exists public.app_food_display_name_with_size(text, numeric, numeric, numeric);
create or replace function public.app_food_display_name_with_size(
  p_name text,
  p_prepared_volume_ml numeric default null,
  p_serving_ml numeric default null,
  p_serving_g numeric default null
)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_name text := trim(coalesce(p_name, 'Food / drink'));
  v_ml numeric := coalesce(p_prepared_volume_ml, p_serving_ml);
begin
  if v_ml is not null and position('ml' in lower(v_name)) = 0 then
    return v_name || ' (' || trim(to_char(v_ml, 'FM999999990.##')) || 'ml)';
  end if;

  if v_ml is null and p_serving_g is not null and position('g' in lower(v_name)) = 0 then
    return v_name || ' (' || trim(to_char(p_serving_g, 'FM999999990.##')) || 'g)';
  end if;

  return v_name;
end;
$$;

grant execute on function public.app_food_display_name_with_size(text, numeric, numeric, numeric) to authenticated;

drop function if exists public.app_food_serving_options_for_query(text, uuid);
create or replace function public.app_food_serving_options_for_query(
  p_query text,
  p_card_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_canonical text;
  v_result jsonb;
begin
  select a.canonical_name
  into v_canonical
  from public.app_food_product_aliases a
  where a.alias_key = v_query
     or v_query like '%' || a.alias_key || '%'
     or a.alias_key like '%' || v_query || '%'
  order by a.confidence desc
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'canonical_name', o.canonical_name,
      'brand_name', o.brand_name,
      'product_family', o.product_family,
      'variant_name', o.variant_name,
      'serving_label', o.serving_label,
      'serving_ml', o.serving_ml,
      'serving_g', o.serving_g,
      'prepared_volume_ml', o.prepared_volume_ml,
      'package_count', o.package_count,
      'is_default', o.is_default,
      'confidence', o.confidence,
      'requires_user_confirmation', o.requires_user_confirmation,
      'display_name', public.app_food_display_name_with_size(o.canonical_name, o.prepared_volume_ml, o.serving_ml, o.serving_g)
    )
    order by o.is_default desc, coalesce(o.prepared_volume_ml, o.serving_ml, 0), coalesce(o.serving_g, 0)
  ), '[]'::jsonb)
  into v_result
  from public.app_food_product_serving_options o
  where (p_card_id is not null and o.product_card_id = p_card_id)
     or (v_canonical is not null and lower(o.canonical_name) = lower(v_canonical))
     or (v_canonical is null and (
          lower(o.canonical_name) like '%' || v_query || '%'
       or lower(coalesce(o.brand_name,'')) like '%' || v_query || '%'
       or lower(coalesce(o.variant_name,'')) like '%' || v_query || '%'
     ));

  return jsonb_build_object(
    'query', p_query,
    'canonical_name', v_canonical,
    'options', v_result,
    'requires_volume_if_drink', coalesce(jsonb_array_length(v_result), 0) = 0
  );
end;
$$;

grant execute on function public.app_food_serving_options_for_query(text, uuid) to authenticated;

drop function if exists public.app_food_log_drink_volume_required(text, text, numeric, uuid);
create or replace function public.app_food_log_drink_volume_required(
  p_meal_slot text,
  p_card_kind text,
  p_volume_ml numeric default null,
  p_serving_option_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = public, pg_catalog
as $$
declare
  v_is_drink boolean := lower(coalesce(p_meal_slot, '')) = 'drink'
    or lower(coalesce(p_card_kind, '')) like '%drink%'
    or lower(coalesce(p_card_kind, '')) like '%beverage%';
  v_known_ml numeric;
begin
  if p_serving_option_id is not null then
    select coalesce(prepared_volume_ml, serving_ml)
    into v_known_ml
    from public.app_food_product_serving_options
    where id = p_serving_option_id;
  end if;

  return jsonb_build_object(
    'is_drink', v_is_drink,
    'volume_required', v_is_drink and coalesce(p_volume_ml, v_known_ml) is null,
    'effective_volume_ml', coalesce(p_volume_ml, v_known_ml),
    'message', case
      when v_is_drink and coalesce(p_volume_ml, v_known_ml) is null
        then 'Drink volume is required so hydration and timing context are accurate.'
      else null
    end
  );
end;
$$;

grant execute on function public.app_food_log_drink_volume_required(text, text, numeric, uuid) to authenticated;

drop function if exists public.app_queue_food_product_correction(uuid, uuid, uuid, text, text, text, text, text);
create or replace function public.app_queue_food_product_correction(
  p_household_id uuid,
  p_card_id uuid,
  p_log_entry_id uuid,
  p_submitted_name text,
  p_source_url text default null,
  p_label_image_url text default null,
  p_note text default null,
  p_correction_kind text default 'product_data'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  insert into public.app_food_product_corrections(
    user_id,
    household_id,
    card_id,
    log_entry_id,
    submitted_name,
    source_url,
    label_image_url,
    note,
    correction_kind
  )
  values (
    auth.uid(),
    p_household_id,
    p_card_id,
    p_log_entry_id,
    p_submitted_name,
    p_source_url,
    p_label_image_url,
    p_note,
    coalesce(p_correction_kind, 'product_data')
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'correction_id', v_id,
    'status', 'queued',
    'message', 'Correction queued. The product card can be updated after AI/source review.'
  );
end;
$$;

grant execute on function public.app_queue_food_product_correction(uuid, uuid, uuid, text, text, text, text, text) to authenticated;

-- -------------------------
-- Healthcheck
-- -------------------------
drop function if exists public.app_v2765_healthcheck();
create or replace function public.app_v2765_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'serving_options_table'::text,
    to_regclass('public.app_food_product_serving_options') is not null,
    'Product serving options table exists.'::text
  union all
  select 'serving_aliases_table'::text,
    to_regclass('public.app_food_product_aliases') is not null,
    'Product aliases table exists.'::text
  union all
  select 'alias_key_unique_index'::text,
    exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'app_food_product_aliases_alias_key_idx'),
    'Alias unique index exists.'::text
  union all
  select 'red_bull_sizes_seeded'::text,
    exists(select 1 from public.app_food_product_serving_options where lower(canonical_name) = 'red bull sugarfree' and serving_ml = 250),
    'Red Bull Sugarfree 250ml starter serving is seeded.'::text
  union all
  select 'gfuel_prepared_seeded'::text,
    exists(select 1 from public.app_food_product_serving_options where lower(canonical_name) = 'gfuel hype sauce 2.0' and prepared_volume_ml = 500),
    'GFuel prepared 500ml starter serving is seeded.'::text
  union all
  select 'serving_options_rpc'::text,
    exists(select 1 from pg_proc where proname = 'app_food_serving_options_for_query'),
    'Serving option lookup RPC exists.'::text
  union all
  select 'drink_volume_required_rpc'::text,
    exists(select 1 from pg_proc where proname = 'app_food_log_drink_volume_required'),
    'Drink volume validation RPC exists.'::text
  union all
  select 'ai_policy_table'::text,
    to_regclass('public.app_nutrition_ai_resolution_policies') is not null,
    'Nutrition AI policy table exists.'::text
  union all
  select 'allergen_policy_seeded'::text,
    exists(select 1 from public.app_nutrition_ai_resolution_policies where task_key = 'allergen_validation' and requires_source = true and requires_vision = true),
    'Allergen validation policy has matching values and is seeded.'::text
  union all
  select 'correction_queue'::text,
    to_regclass('public.app_food_product_corrections') is not null,
    'Product correction queue exists.'::text;
$$;

grant execute on function public.app_v2765_healthcheck() to anon;
grant execute on function public.app_v2765_healthcheck() to authenticated;
