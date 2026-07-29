-- v27.67 Inside LOOP Nutrition full rebuild
--
-- Purpose:
-- This is a clean replacement layer for the broken patch chain.
-- It gives nutrition/product/recipe/card logging its own stable tables and RPCs.
--
-- Key rules:
-- 1) Products + ingredients can be shared database items.
-- 2) Recipes + takeaway/menu estimates are private to owner/household.
-- 3) Allergens are split into:
--      contains     = actual ingredient/source allergen
--      may_contain  = trace/cross-contamination warning
-- 4) Source refresh stores formal name, image, ingredient text, allergen text, nutrition text, price and retailer.
-- 5) Drinks require ml unless a known serving option supplies it.
--
-- Safe to run alongside prior app_* nutrition tables.
-- It does not drop your existing data.

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

-- ------------------------------------------------------------
-- Flexible household membership helper.
-- Avoids hard dependency on your current household table shape.
-- ------------------------------------------------------------
drop function if exists public.loop_user_is_household_member(uuid);
create or replace function public.loop_user_is_household_member(p_household_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_ok boolean := false;
begin
  if p_household_id is null or auth.uid() is null then
    return false;
  end if;

  if to_regclass('public.app_household_members') is not null then
    execute '
      select exists(
        select 1
        from public.app_household_members
        where household_id = $1
          and user_id = $2
          and coalesce(status, ''active'') in (''active'', ''accepted'')
      )'
    into v_ok
    using p_household_id, auth.uid();

    if v_ok then return true; end if;
  end if;

  if to_regclass('public.household_members') is not null then
    execute '
      select exists(
        select 1
        from public.household_members
        where household_id = $1
          and user_id = $2
          and coalesce(status, ''active'') in (''active'', ''accepted'')
      )'
    into v_ok
    using p_household_id, auth.uid();

    if v_ok then return true; end if;
  end if;

  return false;
end;
$$;

grant execute on function public.loop_user_is_household_member(uuid) to authenticated;

-- ------------------------------------------------------------
-- Cards: products, ingredients, recipes, takeaways
-- ------------------------------------------------------------
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
  updated_at timestamptz not null default now(),
  constraint loop_nutrition_cards_kind_check check (card_kind in ('product','ingredient','recipe','takeaway')),
  constraint loop_nutrition_cards_visibility_check check (visibility in ('shared_database','household_private','user_private')),
  constraint loop_nutrition_cards_product_type_check check (product_type in ('drink','food','other')),
  constraint loop_nutrition_cards_confidence_check check (confidence between 0 and 100),
  constraint loop_nutrition_cards_score_check check (score is null or score between 0 and 100)
);

create index if not exists loop_nutrition_cards_search_idx
on public.loop_nutrition_cards
using gin (
  to_tsvector(
    'simple',
    coalesce(display_name,'') || ' ' ||
    coalesce(formal_name,'') || ' ' ||
    coalesce(brand_name,'') || ' ' ||
    coalesce(variant_name,'') || ' ' ||
    coalesce(source_url,'')
  )
);

create index if not exists loop_nutrition_cards_household_idx
on public.loop_nutrition_cards(household_id, card_kind);

create index if not exists loop_nutrition_cards_owner_idx
on public.loop_nutrition_cards(owner_user_id, card_kind);

drop trigger if exists loop_nutrition_cards_updated_at on public.loop_nutrition_cards;
create trigger loop_nutrition_cards_updated_at
before update on public.loop_nutrition_cards
for each row execute function public.loop_set_updated_at();

-- ------------------------------------------------------------
-- Serving options for known products / sizes
-- ------------------------------------------------------------
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
  updated_at timestamptz not null default now(),
  constraint loop_nutrition_serving_options_confidence_check check (confidence between 0 and 100),
  constraint loop_nutrition_serving_options_size_check check (
    serving_ml is not null or serving_g is not null or prepared_volume_ml is not null
  )
);

create index if not exists loop_nutrition_serving_options_card_idx
on public.loop_nutrition_serving_options(card_id);

create index if not exists loop_nutrition_serving_options_name_idx
on public.loop_nutrition_serving_options(lower(canonical_name));

drop trigger if exists loop_nutrition_serving_options_updated_at on public.loop_nutrition_serving_options;
create trigger loop_nutrition_serving_options_updated_at
before update on public.loop_nutrition_serving_options
for each row execute function public.loop_set_updated_at();

-- ------------------------------------------------------------
-- Aliases for search/known products
-- ------------------------------------------------------------
create table if not exists public.loop_nutrition_product_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  alias_key text not null unique,
  canonical_name text not null,
  brand_name text,
  product_family text,
  confidence integer not null default 60,
  created_at timestamptz not null default now(),
  constraint loop_nutrition_product_aliases_confidence_check check (confidence between 0 and 100)
);

-- ------------------------------------------------------------
-- Ingredient tree
-- ------------------------------------------------------------
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
  updated_at timestamptz not null default now(),
  constraint loop_nutrition_card_ingredients_info_mode_check check (info_mode in ('raw_only','expand','link_to_product')),
  constraint loop_nutrition_card_ingredients_confidence_check check (confidence between 0 and 100)
);

create index if not exists loop_nutrition_card_ingredients_card_idx
on public.loop_nutrition_card_ingredients(card_id, parent_id, sort_order);

drop trigger if exists loop_nutrition_card_ingredients_updated_at on public.loop_nutrition_card_ingredients;
create trigger loop_nutrition_card_ingredients_updated_at
before update on public.loop_nutrition_card_ingredients
for each row execute function public.loop_set_updated_at();

-- ------------------------------------------------------------
-- Allergens, split between contains and may_contain
-- ------------------------------------------------------------
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
  updated_at timestamptz not null default now(),
  constraint loop_nutrition_card_allergens_presence_check check (presence in ('contains','may_contain','not_present','unknown')),
  constraint loop_nutrition_card_allergens_confidence_check check (confidence between 0 and 100)
);

create unique index if not exists loop_nutrition_card_allergens_unique_idx
on public.loop_nutrition_card_allergens(card_id, lower(allergen_key), presence);

create index if not exists loop_nutrition_card_allergens_card_idx
on public.loop_nutrition_card_allergens(card_id);

drop trigger if exists loop_nutrition_card_allergens_updated_at on public.loop_nutrition_card_allergens;
create trigger loop_nutrition_card_allergens_updated_at
before update on public.loop_nutrition_card_allergens
for each row execute function public.loop_set_updated_at();

-- ------------------------------------------------------------
-- Source snapshots / price history
-- ------------------------------------------------------------
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
  updated_at timestamptz not null default now(),
  constraint loop_nutrition_source_snapshots_status_check check (status in ('queued','processing','needs_review','applied','rejected','failed')),
  constraint loop_nutrition_source_snapshots_confidence_check check (confidence between 0 and 100)
);

create index if not exists loop_nutrition_source_snapshots_card_idx
on public.loop_nutrition_source_snapshots(card_id, created_at desc);

create index if not exists loop_nutrition_source_snapshots_status_idx
on public.loop_nutrition_source_snapshots(status, created_at desc);

drop trigger if exists loop_nutrition_source_snapshots_updated_at on public.loop_nutrition_source_snapshots;
create trigger loop_nutrition_source_snapshots_updated_at
before update on public.loop_nutrition_source_snapshots
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_nutrition_price_observations (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references public.loop_nutrition_cards(id) on delete cascade,
  snapshot_id uuid references public.loop_nutrition_source_snapshots(id) on delete set null,
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

-- ------------------------------------------------------------
-- Food logs
-- ------------------------------------------------------------
create table if not exists public.loop_nutrition_food_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  card_id uuid references public.loop_nutrition_cards(id) on delete set null,
  display_name text not null,
  log_date date not null default current_date,
  time_eaten time without time zone,
  meal_slot text not null default 'meal',
  serving_multiplier numeric not null default 1,
  serving_mode text not null default 'each_person',
  drink_volume_ml numeric,
  nutrition_snapshot jsonb not null default '{}'::jsonb,
  notes text,
  image_url text,
  status text not null default 'logged',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_nutrition_food_logs_meal_slot_check check (meal_slot in ('breakfast','lunch','dinner','snack','drink','meal')),
  constraint loop_nutrition_food_logs_serving_mode_check check (serving_mode in ('each_person','split_shared')),
  constraint loop_nutrition_food_logs_status_check check (status in ('draft','logged','needs_review','deleted'))
);

create index if not exists loop_nutrition_food_logs_household_date_idx
on public.loop_nutrition_food_logs(household_id, log_date desc);

create index if not exists loop_nutrition_food_logs_created_by_idx
on public.loop_nutrition_food_logs(created_by, log_date desc);

drop trigger if exists loop_nutrition_food_logs_updated_at on public.loop_nutrition_food_logs;
create trigger loop_nutrition_food_logs_updated_at
before update on public.loop_nutrition_food_logs
for each row execute function public.loop_set_updated_at();

create table if not exists public.loop_nutrition_food_log_people (
  id uuid primary key default gen_random_uuid(),
  log_id uuid references public.loop_nutrition_food_logs(id) on delete cascade,
  person_id uuid not null,
  confirmation_status text not null default 'accepted',
  created_at timestamptz not null default now(),
  constraint loop_nutrition_food_log_people_status_check check (confirmation_status in ('accepted','pending','rejected'))
);

create unique index if not exists loop_nutrition_food_log_people_unique_idx
on public.loop_nutrition_food_log_people(log_id, person_id);

-- ------------------------------------------------------------
-- Nutrition notifications
-- ------------------------------------------------------------
create table if not exists public.loop_nutrition_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references auth.users(id) on delete cascade,
  recipient_person_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  household_id uuid,
  notification_kind text not null,
  title text not null,
  body text,
  action_url text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'unread',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint loop_nutrition_notifications_status_check check (status in ('unread','read','archived')),
  constraint loop_nutrition_notifications_kind_check check (notification_kind in ('food_logged_for_you','product_source_needs_review','product_correction_applied','handover_review'))
);

create index if not exists loop_nutrition_notifications_recipient_idx
on public.loop_nutrition_notifications(recipient_user_id, status, created_at desc);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.loop_nutrition_cards enable row level security;
alter table public.loop_nutrition_serving_options enable row level security;
alter table public.loop_nutrition_product_aliases enable row level security;
alter table public.loop_nutrition_card_ingredients enable row level security;
alter table public.loop_nutrition_card_allergens enable row level security;
alter table public.loop_nutrition_source_snapshots enable row level security;
alter table public.loop_nutrition_price_observations enable row level security;
alter table public.loop_nutrition_food_logs enable row level security;
alter table public.loop_nutrition_food_log_people enable row level security;
alter table public.loop_nutrition_notifications enable row level security;

drop policy if exists "cards readable by scope" on public.loop_nutrition_cards;
create policy "cards readable by scope" on public.loop_nutrition_cards
for select to authenticated
using (
  visibility = 'shared_database'
  or owner_user_id = auth.uid()
  or public.loop_user_is_household_member(household_id)
);

drop policy if exists "cards insert own" on public.loop_nutrition_cards;
create policy "cards insert own" on public.loop_nutrition_cards
for insert to authenticated
with check (
  owner_user_id = auth.uid()
  or owner_user_id is null
);

drop policy if exists "cards update owner or household" on public.loop_nutrition_cards;
create policy "cards update owner or household" on public.loop_nutrition_cards
for update to authenticated
using (
  owner_user_id = auth.uid()
  or public.loop_user_is_household_member(household_id)
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true'
)
with check (
  owner_user_id = auth.uid()
  or public.loop_user_is_household_member(household_id)
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true'
);

drop policy if exists "serving options readable" on public.loop_nutrition_serving_options;
create policy "serving options readable" on public.loop_nutrition_serving_options
for select to authenticated using (true);

drop policy if exists "aliases readable" on public.loop_nutrition_product_aliases;
create policy "aliases readable" on public.loop_nutrition_product_aliases
for select to authenticated using (true);

drop policy if exists "ingredients readable by card" on public.loop_nutrition_card_ingredients;
create policy "ingredients readable by card" on public.loop_nutrition_card_ingredients
for select to authenticated
using (
  exists (
    select 1 from public.loop_nutrition_cards c
    where c.id = card_id
      and (
        c.visibility = 'shared_database'
        or c.owner_user_id = auth.uid()
        or public.loop_user_is_household_member(c.household_id)
      )
  )
);

drop policy if exists "allergens readable by card" on public.loop_nutrition_card_allergens;
create policy "allergens readable by card" on public.loop_nutrition_card_allergens
for select to authenticated
using (
  exists (
    select 1 from public.loop_nutrition_cards c
    where c.id = card_id
      and (
        c.visibility = 'shared_database'
        or c.owner_user_id = auth.uid()
        or public.loop_user_is_household_member(c.household_id)
      )
  )
);

drop policy if exists "source snapshots readable by submitter or card" on public.loop_nutrition_source_snapshots;
create policy "source snapshots readable by submitter or card" on public.loop_nutrition_source_snapshots
for select to authenticated
using (
  submitted_by = auth.uid()
  or exists (
    select 1 from public.loop_nutrition_cards c
    where c.id = card_id
      and (
        c.visibility = 'shared_database'
        or c.owner_user_id = auth.uid()
        or public.loop_user_is_household_member(c.household_id)
      )
  )
);

drop policy if exists "source snapshots insert own" on public.loop_nutrition_source_snapshots;
create policy "source snapshots insert own" on public.loop_nutrition_source_snapshots
for insert to authenticated
with check (submitted_by = auth.uid());

drop policy if exists "price observations readable by card" on public.loop_nutrition_price_observations;
create policy "price observations readable by card" on public.loop_nutrition_price_observations
for select to authenticated
using (
  exists (
    select 1 from public.loop_nutrition_cards c
    where c.id = card_id
      and (
        c.visibility = 'shared_database'
        or c.owner_user_id = auth.uid()
        or public.loop_user_is_household_member(c.household_id)
      )
  )
);

drop policy if exists "food logs readable" on public.loop_nutrition_food_logs;
create policy "food logs readable" on public.loop_nutrition_food_logs
for select to authenticated
using (
  created_by = auth.uid()
  or public.loop_user_is_household_member(household_id)
);

drop policy if exists "food logs insert own" on public.loop_nutrition_food_logs;
create policy "food logs insert own" on public.loop_nutrition_food_logs
for insert to authenticated
with check (created_by = auth.uid());

drop policy if exists "food logs update own or household" on public.loop_nutrition_food_logs;
create policy "food logs update own or household" on public.loop_nutrition_food_logs
for update to authenticated
using (created_by = auth.uid() or public.loop_user_is_household_member(household_id))
with check (created_by = auth.uid() or public.loop_user_is_household_member(household_id));

drop policy if exists "food log people readable through log" on public.loop_nutrition_food_log_people;
create policy "food log people readable through log" on public.loop_nutrition_food_log_people
for select to authenticated
using (
  exists (
    select 1 from public.loop_nutrition_food_logs l
    where l.id = log_id
      and (l.created_by = auth.uid() or public.loop_user_is_household_member(l.household_id))
  )
);

drop policy if exists "notifications recipient read" on public.loop_nutrition_notifications;
create policy "notifications recipient read" on public.loop_nutrition_notifications
for select to authenticated using (recipient_user_id = auth.uid());

-- writes for child tables through RPC/service/admin actions
drop policy if exists "nutrition admin all serving" on public.loop_nutrition_serving_options;
create policy "nutrition admin all serving" on public.loop_nutrition_serving_options
for all to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true')
with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true');

drop policy if exists "nutrition admin all aliases" on public.loop_nutrition_product_aliases;
create policy "nutrition admin all aliases" on public.loop_nutrition_product_aliases
for all to authenticated
using (coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true')
with check (coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin','') = 'true');

-- ------------------------------------------------------------
-- URL host + display helpers
-- ------------------------------------------------------------
drop function if exists public.loop_url_host(text);
create or replace function public.loop_url_host(p_url text)
returns text
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  v_host text;
begin
  begin
    v_host := lower(regexp_replace(coalesce(p_url,''), '^https?://([^/?#]+).*$','\1'));
  exception when others then
    return null;
  end;

  v_host := regexp_replace(v_host, '^www\.', '');
  if v_host = coalesce(p_url,'') or v_host = '' then
    return null;
  end if;
  return v_host;
end;
$$;

grant execute on function public.loop_url_host(text) to authenticated;

drop function if exists public.loop_food_display_name_with_size(text, numeric, numeric, numeric);
create or replace function public.loop_food_display_name_with_size(
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

grant execute on function public.loop_food_display_name_with_size(text, numeric, numeric, numeric) to authenticated;

-- ------------------------------------------------------------
-- Search cards
-- ------------------------------------------------------------
drop function if exists public.loop_nutrition_search_cards(text, uuid, integer);
create or replace function public.loop_nutrition_search_cards(
  p_query text default '',
  p_household_id uuid default null,
  p_limit integer default 12
)
returns table (
  id uuid,
  card_kind text,
  visibility text,
  product_type text,
  display_name text,
  brand_name text,
  formal_name text,
  main_image_url text,
  serving_label text,
  serving_ml numeric,
  serving_g numeric,
  prepared_volume_ml numeric,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fibre_g numeric,
  salt_g numeric,
  caffeine_mg numeric,
  confidence integer,
  score integer
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select
    c.id,
    c.card_kind,
    c.visibility,
    c.product_type,
    public.loop_food_display_name_with_size(c.display_name, c.prepared_volume_ml, c.serving_ml, c.serving_g) as display_name,
    c.brand_name,
    c.formal_name,
    c.main_image_url,
    c.serving_label,
    c.serving_ml,
    c.serving_g,
    c.prepared_volume_ml,
    c.calories,
    c.protein_g,
    c.carbs_g,
    c.fibre_g,
    c.salt_g,
    c.caffeine_mg,
    c.confidence,
    c.score
  from public.loop_nutrition_cards c
  where c.status = 'active'
    and (
      c.visibility = 'shared_database'
      or c.owner_user_id = auth.uid()
      or public.loop_user_is_household_member(c.household_id)
    )
    and (
      coalesce(trim(p_query), '') = ''
      or lower(c.display_name) like '%' || lower(trim(p_query)) || '%'
      or lower(coalesce(c.formal_name,'')) like '%' || lower(trim(p_query)) || '%'
      or lower(coalesce(c.brand_name,'')) like '%' || lower(trim(p_query)) || '%'
      or lower(coalesce(c.source_url,'')) like '%' || lower(trim(p_query)) || '%'
    )
    and (
      p_household_id is null
      or c.visibility = 'shared_database'
      or c.household_id = p_household_id
    )
  order by
    case when lower(c.display_name) = lower(trim(p_query)) then 0 else 1 end,
    c.confidence desc,
    c.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 12), 50));
$$;

grant execute on function public.loop_nutrition_search_cards(text, uuid, integer) to authenticated;

-- ------------------------------------------------------------
-- Serving lookup
-- ------------------------------------------------------------
drop function if exists public.loop_nutrition_serving_options_for_query(text, uuid);
create or replace function public.loop_nutrition_serving_options_for_query(
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
  from public.loop_nutrition_product_aliases a
  where a.alias_key = v_query
     or v_query like '%' || a.alias_key || '%'
     or a.alias_key like '%' || v_query || '%'
  order by a.confidence desc
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'card_id', o.card_id,
      'canonical_name', o.canonical_name,
      'serving_label', o.serving_label,
      'serving_ml', o.serving_ml,
      'serving_g', o.serving_g,
      'prepared_volume_ml', o.prepared_volume_ml,
      'package_count', o.package_count,
      'is_default', o.is_default,
      'confidence', o.confidence,
      'requires_user_confirmation', o.requires_user_confirmation,
      'display_name', public.loop_food_display_name_with_size(o.canonical_name, o.prepared_volume_ml, o.serving_ml, o.serving_g)
    )
    order by o.is_default desc, coalesce(o.prepared_volume_ml, o.serving_ml, 0), coalesce(o.serving_g, 0)
  ), '[]'::jsonb)
  into v_result
  from public.loop_nutrition_serving_options o
  where (p_card_id is not null and o.card_id = p_card_id)
     or (v_canonical is not null and lower(o.canonical_name) = lower(v_canonical))
     or (v_canonical is null and lower(o.canonical_name) like '%' || v_query || '%');

  return jsonb_build_object(
    'query', p_query,
    'canonical_name', v_canonical,
    'options', v_result
  );
end;
$$;

grant execute on function public.loop_nutrition_serving_options_for_query(text, uuid) to authenticated;

drop function if exists public.loop_nutrition_drink_volume_required(text, text, numeric, uuid);
create or replace function public.loop_nutrition_drink_volume_required(
  p_meal_slot text,
  p_product_type text,
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
    or lower(coalesce(p_product_type, '')) = 'drink';
  v_known_ml numeric;
begin
  if p_serving_option_id is not null then
    select coalesce(prepared_volume_ml, serving_ml)
    into v_known_ml
    from public.loop_nutrition_serving_options
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

grant execute on function public.loop_nutrition_drink_volume_required(text, text, numeric, uuid) to authenticated;

-- ------------------------------------------------------------
-- Queue source refresh
-- ------------------------------------------------------------
drop function if exists public.loop_nutrition_queue_source_refresh(uuid, text, text);
create or replace function public.loop_nutrition_queue_source_refresh(
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

  if trim(coalesce(p_source_url, '')) = '' then
    raise exception 'Source URL is required.';
  end if;

  insert into public.loop_nutrition_source_snapshots(
    card_id,
    submitted_by,
    source_url,
    source_host,
    raw_payload,
    status
  )
  values (
    p_card_id,
    auth.uid(),
    p_source_url,
    public.loop_url_host(p_source_url),
    jsonb_build_object('note', p_note),
    'queued'
  )
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'snapshot_id', v_id,
    'message', 'Source refresh queued.'
  );
end;
$$;

grant execute on function public.loop_nutrition_queue_source_refresh(uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- Split allergen summary
-- ------------------------------------------------------------
drop function if exists public.loop_nutrition_allergen_summary(uuid);
create or replace function public.loop_nutrition_allergen_summary(p_card_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'contains', coalesce(jsonb_agg(jsonb_build_object('key', allergen_key, 'label', allergen_label, 'evidence', evidence_text, 'confidence', confidence)) filter (where presence = 'contains'), '[]'::jsonb),
    'may_contain', coalesce(jsonb_agg(jsonb_build_object('key', allergen_key, 'label', allergen_label, 'evidence', evidence_text, 'confidence', confidence)) filter (where presence = 'may_contain'), '[]'::jsonb),
    'unknown', coalesce(jsonb_agg(jsonb_build_object('key', allergen_key, 'label', allergen_label)) filter (where presence = 'unknown'), '[]'::jsonb)
  )
  from public.loop_nutrition_card_allergens
  where card_id = p_card_id;
$$;

grant execute on function public.loop_nutrition_allergen_summary(uuid) to authenticated;

-- ------------------------------------------------------------
-- Starter seed cards/options
-- ------------------------------------------------------------
insert into public.loop_nutrition_product_aliases(alias, alias_key, canonical_name, brand_name, product_family, confidence)
values
('red bull sugarfree', lower('red bull sugarfree'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('red bull sugar free', lower('red bull sugar free'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('redbull sugarfree', lower('redbull sugarfree'), 'Red Bull Sugarfree', 'Red Bull', 'Energy drink', 95),
('gfuel hype sauce', lower('gfuel hype sauce'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 90),
('g fuel hype sauce', lower('g fuel hype sauce'), 'GFuel Hype Sauce 2.0', 'G FUEL', 'Powdered energy drink', 90)
on conflict (alias_key) do update set
  canonical_name = excluded.canonical_name,
  brand_name = excluded.brand_name,
  product_family = excluded.product_family,
  confidence = excluded.confidence;

with card_seed as (
  select *
  from (
    values
      ('Red Bull Sugarfree'::text, 'Red Bull'::text, 'drink'::text, '250ml can'::text, 250::numeric, null::numeric, 250::numeric, 8::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 80::numeric, 90::integer),
      ('GFuel Hype Sauce 2.0'::text, 'G FUEL'::text, 'drink'::text, '1 scoop / 500ml prepared drink'::text, null::numeric, 6.2::numeric, 500::numeric, 5::numeric, 0::numeric, 2::numeric, 0::numeric, 0::numeric, 0::numeric, 0.2::numeric, 140::numeric, 92::integer)
  ) as v(display_name, brand_name, product_type, serving_label, serving_ml, serving_g, prepared_volume_ml, calories, protein_g, carbs_g, fat_g, fibre_g, sugar_g, salt_g, caffeine_mg, confidence)
)
insert into public.loop_nutrition_cards(
  card_kind, visibility, product_type, display_name, formal_name, brand_name, serving_label, serving_ml, serving_g, prepared_volume_ml,
  calories, protein_g, carbs_g, fat_g, fibre_g, sugar_g, salt_g, caffeine_mg, confidence, is_verified
)
select
  'product', 'shared_database', s.product_type, s.display_name, s.display_name, s.brand_name, s.serving_label, s.serving_ml, s.serving_g, s.prepared_volume_ml,
  s.calories, s.protein_g, s.carbs_g, s.fat_g, s.fibre_g, s.sugar_g, s.salt_g, s.caffeine_mg, s.confidence, false
from card_seed s
where not exists (
  select 1 from public.loop_nutrition_cards c
  where lower(c.display_name) = lower(s.display_name)
    and c.card_kind = 'product'
);

insert into public.loop_nutrition_serving_options(card_id, canonical_name, serving_label, serving_ml, serving_g, prepared_volume_ml, package_count, is_default, confidence, requires_user_confirmation)
select c.id, c.display_name, c.serving_label, c.serving_ml, c.serving_g, c.prepared_volume_ml, 1, true, c.confidence, false
from public.loop_nutrition_cards c
where lower(c.display_name) in ('red bull sugarfree', 'gfuel hype sauce 2.0')
  and not exists (
    select 1 from public.loop_nutrition_serving_options o
    where o.card_id = c.id and lower(o.serving_label) = lower(c.serving_label)
  );

insert into public.loop_nutrition_serving_options(canonical_name, serving_label, serving_ml, prepared_volume_ml, package_count, is_default, confidence, requires_user_confirmation)
select 'Red Bull Sugarfree', '355ml can', 355, 355, 1, false, 80, true
where not exists (select 1 from public.loop_nutrition_serving_options where lower(canonical_name) = 'red bull sugarfree' and serving_ml = 355);

insert into public.loop_nutrition_serving_options(canonical_name, serving_label, serving_ml, prepared_volume_ml, package_count, is_default, confidence, requires_user_confirmation)
select 'Red Bull Sugarfree', '473ml can', 473, 473, 1, false, 75, true
where not exists (select 1 from public.loop_nutrition_serving_options where lower(canonical_name) = 'red bull sugarfree' and serving_ml = 473);

-- ------------------------------------------------------------
-- Healthcheck
-- ------------------------------------------------------------
drop function if exists public.loop_v2767_nutrition_healthcheck();
create or replace function public.loop_v2767_nutrition_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'cards_table'::text, to_regclass('public.loop_nutrition_cards') is not null, 'Nutrition cards table exists.'
  union all
  select 'serving_options_table', to_regclass('public.loop_nutrition_serving_options') is not null, 'Serving options table exists.'
  union all
  select 'ingredient_tree_table', to_regclass('public.loop_nutrition_card_ingredients') is not null, 'Ingredient tree table exists.'
  union all
  select 'allergen_split_table', to_regclass('public.loop_nutrition_card_allergens') is not null, 'Allergen split table exists.'
  union all
  select 'source_snapshots_table', to_regclass('public.loop_nutrition_source_snapshots') is not null, 'Source snapshots table exists.'
  union all
  select 'food_logs_table', to_regclass('public.loop_nutrition_food_logs') is not null, 'Food logs table exists.'
  union all
  select 'search_rpc', exists(select 1 from pg_proc where proname = 'loop_nutrition_search_cards'), 'Search RPC exists.'
  union all
  select 'serving_rpc', exists(select 1 from pg_proc where proname = 'loop_nutrition_serving_options_for_query'), 'Serving lookup RPC exists.'
  union all
  select 'source_refresh_rpc', exists(select 1 from pg_proc where proname = 'loop_nutrition_queue_source_refresh'), 'Source refresh RPC exists.'
  union all
  select 'red_bull_seed', exists(select 1 from public.loop_nutrition_cards where lower(display_name) = 'red bull sugarfree'), 'Red Bull starter card exists.'
  union all
  select 'gfuel_seed', exists(select 1 from public.loop_nutrition_cards where lower(display_name) = 'gfuel hype sauce 2.0'), 'GFuel starter card exists.';
$$;

grant execute on function public.loop_v2767_nutrition_healthcheck() to anon;
grant execute on function public.loop_v2767_nutrition_healthcheck() to authenticated;
