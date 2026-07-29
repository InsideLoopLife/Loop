-- v27.66 Inside LOOP product allergen/source/ingredient-tree + edit-card fix support
--
-- Adds:
-- - Separate allergen presence statuses: contains vs may_contain
-- - Product source snapshots: formal name, image, ingredients, allergen text, price + retailer
-- - Ingredient tree rows for nested/expandable ingredients
-- - RPCs to queue source refreshes and upsert allergen facts safely
--
-- This is additive and safe after v27.65.

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

-- ------------------------------------------------------------
-- Product source snapshots
-- ------------------------------------------------------------
create table if not exists public.app_food_product_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  card_id uuid,
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
  updated_at timestamptz not null default now(),
  constraint app_food_product_source_snapshots_status_check check (status in ('queued','processing','needs_review','applied','rejected','failed')),
  constraint app_food_product_source_snapshots_confidence_check check (confidence between 0 and 100)
);

create index if not exists app_food_product_source_snapshots_card_idx
on public.app_food_product_source_snapshots(card_id);

create index if not exists app_food_product_source_snapshots_status_idx
on public.app_food_product_source_snapshots(status, created_at desc);

create index if not exists app_food_product_source_snapshots_source_idx
on public.app_food_product_source_snapshots(source_host);

drop trigger if exists app_food_product_source_snapshots_updated_at on public.app_food_product_source_snapshots;
create trigger app_food_product_source_snapshots_updated_at
before update on public.app_food_product_source_snapshots
for each row execute function public.app_set_updated_at();

-- ------------------------------------------------------------
-- Product allergen facts
-- ------------------------------------------------------------
create table if not exists public.app_food_product_allergen_facts (
  id uuid primary key default gen_random_uuid(),
  card_id uuid,
  source_snapshot_id uuid references public.app_food_product_source_snapshots(id) on delete set null,
  allergen_key text not null,
  allergen_label text not null,
  presence text not null default 'unknown',
  evidence_text text,
  source_url text,
  confidence integer not null default 50,
  locked boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_food_product_allergen_facts_presence_check check (presence in ('contains','may_contain','not_present','unknown')),
  constraint app_food_product_allergen_facts_confidence_check check (confidence between 0 and 100)
);

create unique index if not exists app_food_product_allergen_facts_card_key_presence_idx
on public.app_food_product_allergen_facts(
  coalesce(card_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(allergen_key),
  presence
);

create index if not exists app_food_product_allergen_facts_card_idx
on public.app_food_product_allergen_facts(card_id);

drop trigger if exists app_food_product_allergen_facts_updated_at on public.app_food_product_allergen_facts;
create trigger app_food_product_allergen_facts_updated_at
before update on public.app_food_product_allergen_facts
for each row execute function public.app_set_updated_at();

-- ------------------------------------------------------------
-- Ingredient tree facts
-- ------------------------------------------------------------
create table if not exists public.app_food_ingredient_tree_items (
  id uuid primary key default gen_random_uuid(),
  card_id uuid,
  source_snapshot_id uuid references public.app_food_product_source_snapshots(id) on delete set null,
  parent_id uuid references public.app_food_ingredient_tree_items(id) on delete cascade,
  sort_order integer not null default 0,
  section_label text not null default 'Ingredients',
  ingredient_name text not null,
  quantity_text text,
  percentage numeric,
  raw_text text,
  has_children boolean not null default false,
  info_mode text not null default 'expand',
  confidence integer not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_food_ingredient_tree_items_info_mode_check check (info_mode in ('expand','link_to_product','raw_only')),
  constraint app_food_ingredient_tree_items_confidence_check check (confidence between 0 and 100)
);

create index if not exists app_food_ingredient_tree_items_card_idx
on public.app_food_ingredient_tree_items(card_id, parent_id, sort_order);

drop trigger if exists app_food_ingredient_tree_items_updated_at on public.app_food_ingredient_tree_items;
create trigger app_food_ingredient_tree_items_updated_at
before update on public.app_food_ingredient_tree_items
for each row execute function public.app_set_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.app_food_product_source_snapshots enable row level security;
alter table public.app_food_product_allergen_facts enable row level security;
alter table public.app_food_ingredient_tree_items enable row level security;

drop policy if exists "source snapshots self or admin read" on public.app_food_product_source_snapshots;
create policy "source snapshots self or admin read" on public.app_food_product_source_snapshots
for select to authenticated
using (
  submitted_by = auth.uid()
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "source snapshots self insert" on public.app_food_product_source_snapshots;
create policy "source snapshots self insert" on public.app_food_product_source_snapshots
for insert to authenticated with check (submitted_by = auth.uid());

drop policy if exists "allergen facts readable" on public.app_food_product_allergen_facts;
create policy "allergen facts readable" on public.app_food_product_allergen_facts
for select to authenticated using (true);

drop policy if exists "ingredient tree readable" on public.app_food_ingredient_tree_items;
create policy "ingredient tree readable" on public.app_food_ingredient_tree_items
for select to authenticated using (true);

drop policy if exists "source/admin all allergen facts" on public.app_food_product_allergen_facts;
create policy "source/admin all allergen facts" on public.app_food_product_allergen_facts
for all to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

drop policy if exists "source/admin all ingredient tree" on public.app_food_ingredient_tree_items;
create policy "source/admin all ingredient tree" on public.app_food_ingredient_tree_items
for all to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','owner','super_admin')
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', '') = 'true'
);

-- ------------------------------------------------------------
-- Helper: source host
-- ------------------------------------------------------------
drop function if exists public.app_url_host(text);
create or replace function public.app_url_host(p_url text)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_host text;
begin
  v_host := lower(regexp_replace(coalesce(p_url,''), '^https?://([^/?#]+).*$','\1'));
  v_host := regexp_replace(v_host, '^www\.', '');
  if v_host = coalesce(p_url,'') then
    return null;
  end if;
  return v_host;
end;
$$;

grant execute on function public.app_url_host(text) to authenticated;

-- ------------------------------------------------------------
-- Queue product source refresh
-- ------------------------------------------------------------
drop function if exists public.app_queue_product_source_refresh(uuid, text, text);
create or replace function public.app_queue_product_source_refresh(
  p_card_id uuid,
  p_source_url text,
  p_note text default null
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

  if coalesce(trim(p_source_url), '') = '' then
    raise exception 'Source URL is required.';
  end if;

  insert into public.app_food_product_source_snapshots(
    card_id,
    submitted_by,
    source_url,
    source_host,
    raw_payload,
    status,
    confidence
  )
  values (
    p_card_id,
    auth.uid(),
    p_source_url,
    public.app_url_host(p_source_url),
    jsonb_build_object('note', p_note),
    'queued',
    50
  )
  returning id into v_id;

  -- Also mirror into the existing correction queue when present.
  if to_regclass('public.app_food_product_corrections') is not null then
    insert into public.app_food_product_corrections(
      user_id,
      card_id,
      source_url,
      note,
      correction_kind,
      status
    )
    values (
      auth.uid(),
      p_card_id,
      p_source_url,
      p_note,
      'product_data',
      'queued'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'snapshot_id', v_id,
    'status', 'queued',
    'message', 'Source refresh queued. LOOP will pull image, formal product name, ingredients, allergens, price and retailer.'
  );
end;
$$;

grant execute on function public.app_queue_product_source_refresh(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- Upsert safe allergen fact
-- ------------------------------------------------------------
drop function if exists public.app_upsert_product_allergen_fact(uuid, uuid, text, text, text, text, text, integer);
create or replace function public.app_upsert_product_allergen_fact(
  p_card_id uuid,
  p_source_snapshot_id uuid,
  p_allergen_key text,
  p_allergen_label text,
  p_presence text,
  p_evidence_text text default null,
  p_source_url text default null,
  p_confidence integer default 75
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_id uuid;
  v_key text := lower(trim(p_allergen_key));
  v_presence text := lower(trim(p_presence));
begin
  if v_presence not in ('contains','may_contain','not_present','unknown') then
    raise exception 'Invalid allergen presence: %', p_presence;
  end if;

  insert into public.app_food_product_allergen_facts(
    card_id,
    source_snapshot_id,
    allergen_key,
    allergen_label,
    presence,
    evidence_text,
    source_url,
    confidence,
    locked
  )
  values (
    p_card_id,
    p_source_snapshot_id,
    v_key,
    coalesce(nullif(trim(p_allergen_label), ''), initcap(v_key)),
    v_presence,
    p_evidence_text,
    p_source_url,
    greatest(0, least(100, coalesce(p_confidence, 75))),
    true
  )
  on conflict (
    coalesce(card_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(allergen_key),
    presence
  ) do update set
    source_snapshot_id = excluded.source_snapshot_id,
    allergen_label = excluded.allergen_label,
    evidence_text = excluded.evidence_text,
    source_url = excluded.source_url,
    confidence = greatest(public.app_food_product_allergen_facts.confidence, excluded.confidence),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.app_upsert_product_allergen_fact(uuid, uuid, text, text, text, text, text, integer) to authenticated;

-- ------------------------------------------------------------
-- Read card allergens split by actual vs may-contain
-- ------------------------------------------------------------
drop function if exists public.app_product_allergen_summary(uuid);
create or replace function public.app_product_allergen_summary(p_card_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'contains', coalesce(jsonb_agg(jsonb_build_object('key', allergen_key, 'label', allergen_label, 'evidence', evidence_text, 'confidence', confidence)) filter (where presence = 'contains'), '[]'::jsonb),
    'may_contain', coalesce(jsonb_agg(jsonb_build_object('key', allergen_key, 'label', allergen_label, 'evidence', evidence_text, 'confidence', confidence)) filter (where presence = 'may_contain'), '[]'::jsonb),
    'not_present', coalesce(jsonb_agg(jsonb_build_object('key', allergen_key, 'label', allergen_label)) filter (where presence = 'not_present'), '[]'::jsonb),
    'unknown', coalesce(jsonb_agg(jsonb_build_object('key', allergen_key, 'label', allergen_label)) filter (where presence = 'unknown'), '[]'::jsonb)
  )
  from public.app_food_product_allergen_facts
  where card_id = p_card_id;
$$;

grant execute on function public.app_product_allergen_summary(uuid) to authenticated;

-- ------------------------------------------------------------
-- Seed/adjust AI policy guardrail wording
-- ------------------------------------------------------------
insert into public.app_nutrition_ai_resolution_policies
(task_key, task_name, model_lane, preferred_model_env_key, fallback_model_env_key, requires_source, requires_vision, max_prompt_tokens, max_output_tokens, monthly_cost_cap_pence, confidence_floor, auto_apply_floor, instructions)
values
(
  'product_source_harvest',
  'Product source harvest',
  'web_grounded_extraction',
  'LOOP_AI_REASONING_MODEL',
  'LOOP_AI_FAST_MODEL',
  true,
  false,
  7000,
  1800,
  700,
  75,
  90,
  'When a product URL is supplied, extract formal product name, main product image, product page URL, ingredients text, allergen text, price, currency and retailer/site. Store may-contain allergens separately from contains allergens. Do not overwrite existing verified nutrition unless confidence is higher or admin approves.'
),
(
  'ingredient_tree_parse',
  'Ingredient tree parse',
  'structured_text',
  'LOOP_AI_FAST_MODEL',
  'LOOP_AI_REASONING_MODEL',
  false,
  false,
  5000,
  1800,
  400,
  70,
  88,
  'Parse ingredients into top-level ingredient rows and nested expandable sub-ingredients. Use expand mode for ingredients with bracketed make-up, e.g. lemon flavour topping [sugar, fats]. Use link_to_product only for clear reusable products such as ZOE Daily 30+ or branded sauces.'
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

-- ------------------------------------------------------------
-- Healthcheck
-- ------------------------------------------------------------
drop function if exists public.app_v2766_healthcheck();
create or replace function public.app_v2766_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'source_snapshots_table'::text,
    to_regclass('public.app_food_product_source_snapshots') is not null,
    'Product source snapshot table exists.'::text
  union all
  select 'allergen_facts_table'::text,
    to_regclass('public.app_food_product_allergen_facts') is not null,
    'Allergen facts table exists with contains/may_contain split.'::text
  union all
  select 'ingredient_tree_table'::text,
    to_regclass('public.app_food_ingredient_tree_items') is not null,
    'Ingredient tree table exists.'::text
  union all
  select 'queue_source_refresh_rpc'::text,
    exists(select 1 from pg_proc where proname = 'app_queue_product_source_refresh'),
    'Product source refresh queue RPC exists.'::text
  union all
  select 'allergen_summary_rpc'::text,
    exists(select 1 from pg_proc where proname = 'app_product_allergen_summary'),
    'Allergen summary RPC exists.'::text
  union all
  select 'product_source_harvest_policy'::text,
    exists(select 1 from public.app_nutrition_ai_resolution_policies where task_key = 'product_source_harvest'),
    'Product source harvest AI policy exists.'::text
  union all
  select 'ingredient_tree_policy'::text,
    exists(select 1 from public.app_nutrition_ai_resolution_policies where task_key = 'ingredient_tree_parse'),
    'Ingredient tree parse AI policy exists.'::text;
$$;

grant execute on function public.app_v2766_healthcheck() to anon;
grant execute on function public.app_v2766_healthcheck() to authenticated;
