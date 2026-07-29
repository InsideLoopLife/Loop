-- v27.85 Product/admin RPC repair + House/Pension/Household tightening
-- Run after v27.84. This migration is deliberately column-safe and replaces
-- the product/import admin RPCs that were still throwing malformed-array and
-- missing-column errors.

-- ---------------------------------------------------------------------------
-- Small safe coercion helpers used by column-safe JSON mappers.
-- ---------------------------------------------------------------------------
create or replace function public.loop_try_numeric(p_value text)
returns numeric
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  return regexp_replace(p_value, '[^0-9\.\-]', '', 'g')::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.loop_try_timestamptz(p_value text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  return p_value::timestamptz;
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin product quality storage. Admin edits go here; raw user-created/imported
-- cards remain source records until reviewed/overridden.
-- ---------------------------------------------------------------------------
create table if not exists public.loop_product_quality_snapshots (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null,
  display_name text,
  brand_name text,
  product_type text,
  source_provider text,
  source_url text,
  main_image_url text,
  calories numeric,
  confidence integer,
  has_image boolean not null default false,
  has_nutrition boolean not null default false,
  has_verified_source boolean not null default false,
  has_serving boolean not null default false,
  has_allergen_split boolean not null default false,
  image_last_checked_at timestamptz,
  image_status text,
  quality_score integer not null default 0,
  missing_fields text[] not null default array[]::text[],
  status text not null default 'needs_review',
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loop_product_quality_snapshots add column if not exists card_id uuid;
alter table public.loop_product_quality_snapshots add column if not exists display_name text;
alter table public.loop_product_quality_snapshots add column if not exists brand_name text;
alter table public.loop_product_quality_snapshots add column if not exists product_type text;
alter table public.loop_product_quality_snapshots add column if not exists source_provider text;
alter table public.loop_product_quality_snapshots add column if not exists source_url text;
alter table public.loop_product_quality_snapshots add column if not exists main_image_url text;
alter table public.loop_product_quality_snapshots add column if not exists calories numeric;
alter table public.loop_product_quality_snapshots add column if not exists confidence integer;
alter table public.loop_product_quality_snapshots add column if not exists has_image boolean default false;
alter table public.loop_product_quality_snapshots add column if not exists has_nutrition boolean default false;
alter table public.loop_product_quality_snapshots add column if not exists has_verified_source boolean default false;
alter table public.loop_product_quality_snapshots add column if not exists quality_score integer default 0;
alter table public.loop_product_quality_snapshots add column if not exists missing_fields text[] default array[]::text[];
alter table public.loop_product_quality_snapshots add column if not exists status text default 'needs_review';
alter table public.loop_product_quality_snapshots add column if not exists last_checked_at timestamptz default now();
alter table public.loop_product_quality_snapshots add column if not exists created_at timestamptz default now();
alter table public.loop_product_quality_snapshots add column if not exists updated_at timestamptz default now();

delete from public.loop_product_quality_snapshots a
using public.loop_product_quality_snapshots b
where a.card_id is not null
  and a.card_id = b.card_id
  and a.ctid < b.ctid;

create unique index if not exists loop_product_quality_snapshots_card_id_uidx
  on public.loop_product_quality_snapshots(card_id);

-- ---------------------------------------------------------------------------
-- User-submitted product review queue. This is the safe route for new products:
-- users can add/log locally, while global/product-admin promotion can be reviewed
-- by confidence/source/quality score.
-- ---------------------------------------------------------------------------
create table if not exists public.loop_product_review_queue (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid references auth.users(id) on delete set null,
  household_id uuid,
  source_table text,
  source_id uuid,
  product_name text,
  brand_name text,
  source_url text,
  image_url text,
  confidence numeric,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  admin_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

alter table public.loop_product_review_queue enable row level security;

drop policy if exists loop_product_review_queue_insert_own on public.loop_product_review_queue;
create policy loop_product_review_queue_insert_own
on public.loop_product_review_queue
for insert
to authenticated
with check (submitted_by = auth.uid());

drop policy if exists loop_product_review_queue_select_own_or_admin on public.loop_product_review_queue;
create policy loop_product_review_queue_select_own_or_admin
on public.loop_product_review_queue
for select
to authenticated
using (submitted_by = auth.uid() or public.app_is_platform_admin());

drop policy if exists loop_product_review_queue_admin_all on public.loop_product_review_queue;
create policy loop_product_review_queue_admin_all
on public.loop_product_review_queue
for all
to authenticated
using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

create or replace function public.loop_queue_product_for_review(
  p_source_table text,
  p_source_id uuid,
  p_product_name text,
  p_brand_name text default null,
  p_source_url text default null,
  p_image_url text default null,
  p_confidence numeric default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_id uuid;
  v_household_id uuid;
begin
  select household_id into v_household_id
  from public.app_user_profiles
  where user_id = auth.uid()
  limit 1;

  insert into public.loop_product_review_queue(
    submitted_by, household_id, source_table, source_id, product_name, brand_name,
    source_url, image_url, confidence, payload, status
  ) values (
    auth.uid(), v_household_id, p_source_table, p_source_id, p_product_name, p_brand_name,
    p_source_url, p_image_url, p_confidence, coalesce(p_payload, '{}'::jsonb), 'queued'
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.loop_queue_product_for_review(text, uuid, text, text, text, text, numeric, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Product admin RPC: deliberately uses string-built UNION SQL, not text[]
-- array_append, to avoid the malformed array literal failure seen in v27.84.
-- ---------------------------------------------------------------------------
create or replace function public.loop_admin_products_list(p_limit integer default 5000)
returns table (
  product_id uuid,
  display_name text,
  brand_name text,
  product_type text,
  source_provider text,
  source_url text,
  main_image_url text,
  calories numeric,
  confidence integer,
  has_image boolean,
  has_nutrition boolean,
  has_verified_source boolean,
  quality_score integer,
  missing_fields text[],
  status text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 5000), 10000));
  v_union text := '';
  v_sql text;
begin
  if to_regclass('public.loop_nutrition_cards') is not null then
    v_union := v_union || case when v_union = '' then '' else ' union all ' end || $part$
      select
        c.id::uuid as product_id,
        coalesce(j ->> 'display_name', j ->> 'name', j ->> 'title', j ->> 'product_name', j ->> 'formal_name', 'Unnamed product')::text as display_name,
        coalesce(j ->> 'brand_name', j ->> 'brand', j ->> 'vendor', j ->> 'retailer_name')::text as brand_name,
        coalesce(j ->> 'product_type', j ->> 'card_kind', j ->> 'category', j ->> 'category_path')::text as product_type,
        coalesce(j ->> 'source_provider', j ->> 'source_kind', j ->> 'retailer_name', j ->> 'shop_tag')::text as source_provider,
        coalesce(j ->> 'source_url', j ->> 'url', j ->> 'product_url')::text as source_url,
        coalesce(j ->> 'main_image_url', j ->> 'image_url', j ->> 'image', j ->> 'thumbnail_url')::text as main_image_url,
        coalesce(public.loop_try_numeric(j ->> 'calories'), public.loop_try_numeric(j #>> '{nutrition,calories}'), public.loop_try_numeric(j #>> '{nutrition,kcal}'), public.loop_try_numeric(j ->> 'energy_kcal'))::numeric as calories,
        coalesce(public.loop_try_numeric(j ->> 'confidence'), public.loop_try_numeric(j ->> 'estimate_confidence'), public.loop_try_numeric(j ->> 'source_confidence'))::integer as confidence,
        coalesce(j ->> 'status', j ->> 'data_quality_status', 'active')::text as source_status,
        coalesce(public.loop_try_timestamptz(j ->> 'updated_at'), public.loop_try_timestamptz(j ->> 'created_at'), now()) as source_updated_at
      from (select t.id, to_jsonb(t.*) as j from public.loop_nutrition_cards t) c
    $part$;
  end if;

  if to_regclass('public.nutrition_ingredients') is not null then
    v_union := v_union || case when v_union = '' then '' else ' union all ' end || $part$
      select
        i.id::uuid as product_id,
        coalesce(j ->> 'label', j ->> 'display_name', j ->> 'name', 'Unnamed product')::text as display_name,
        coalesce(j ->> 'brand_name', j ->> 'brand')::text as brand_name,
        coalesce(j ->> 'source_type', 'ingredient')::text as product_type,
        coalesce(j ->> 'source_type', j ->> 'source_provider', 'ingredient')::text as source_provider,
        coalesce(j ->> 'source_url', j ->> 'url')::text as source_url,
        coalesce(j ->> 'image_url', j ->> 'main_image_url')::text as main_image_url,
        coalesce(public.loop_try_numeric(j ->> 'calories'), public.loop_try_numeric(j ->> 'kcal'), public.loop_try_numeric(j #>> '{nutrition,calories}'))::numeric as calories,
        coalesce(public.loop_try_numeric(j ->> 'data_confidence'), public.loop_try_numeric(j ->> 'confidence'))::integer as confidence,
        'active'::text as source_status,
        coalesce(public.loop_try_timestamptz(j ->> 'last_used_at'), public.loop_try_timestamptz(j ->> 'updated_at'), public.loop_try_timestamptz(j ->> 'created_at'), now()) as source_updated_at
      from (select t.id, to_jsonb(t.*) as j from public.nutrition_ingredients t) i
    $part$;
  end if;

  if v_union = '' then
    return;
  end if;

  v_sql := format($sql$
    with mapped as (%s), joined as (
      select
        m.product_id,
        coalesce(q.display_name, m.display_name)::text as display_name,
        coalesce(q.brand_name, m.brand_name)::text as brand_name,
        coalesce(q.product_type, m.product_type)::text as product_type,
        coalesce(q.source_provider, m.source_provider)::text as source_provider,
        coalesce(q.source_url, m.source_url)::text as source_url,
        coalesce(q.main_image_url, m.main_image_url)::text as main_image_url,
        coalesce(q.calories, m.calories)::numeric as calories,
        coalesce(q.confidence, m.confidence, 0)::integer as confidence,
        q.has_image as q_has_image,
        q.has_nutrition as q_has_nutrition,
        q.has_verified_source as q_has_verified_source,
        q.quality_score as q_quality_score,
        q.missing_fields as q_missing_fields,
        coalesce(q.status, m.source_status, 'needs_review')::text as status,
        coalesce(q.updated_at, q.last_checked_at, m.source_updated_at, now()) as updated_at
      from mapped m
      left join public.loop_product_quality_snapshots q on q.card_id = m.product_id
    )
    select
      j.product_id,
      j.display_name,
      j.brand_name,
      j.product_type,
      j.source_provider,
      j.source_url,
      j.main_image_url,
      j.calories,
      j.confidence,
      coalesce(j.q_has_image, nullif(j.main_image_url, '') is not null) as has_image,
      coalesce(j.q_has_nutrition, j.calories is not null) as has_nutrition,
      coalesce(j.q_has_verified_source, nullif(j.source_url, '') is not null or nullif(j.source_provider, '') is not null) as has_verified_source,
      coalesce(j.q_quality_score,
        (case when nullif(j.main_image_url, '') is not null then 25 else 0 end
        + case when j.calories is not null then 35 else 0 end
        + case when nullif(j.source_url, '') is not null or nullif(j.source_provider, '') is not null then 25 else 0 end
        + case when coalesce(j.confidence, 0) >= 70 then 15 else 0 end)::integer
      ) as quality_score,
      coalesce(j.q_missing_fields, array_remove(array[
        case when nullif(j.main_image_url, '') is null then 'image' end,
        case when j.calories is null then 'nutrition' end,
        case when not (nullif(j.source_url, '') is not null or nullif(j.source_provider, '') is not null) then 'verified_source' end,
        case when coalesce(j.confidence, 0) < 70 then 'confidence' end
      ], null)::text[]) as missing_fields,
      j.status,
      j.updated_at
    from joined j
    order by quality_score asc, updated_at desc
    limit %s
  $sql$, v_union, v_limit);

  return query execute v_sql;
end;
$$;

grant execute on function public.loop_admin_products_list(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Import batches RPC: only reads from JSONB projection so a missing physical
-- source_name column can never break the admin page.
-- ---------------------------------------------------------------------------
create or replace function public.loop_admin_product_imports_list(p_limit integer default 100)
returns table (
  batch_id uuid,
  source_name text,
  status text,
  total_rows integer,
  ready_rows integer,
  needs_review_rows integer,
  imported_rows integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_table text;
  v_sql text;
begin
  if to_regclass('public.loop_product_import_batches') is not null then
    v_table := 'public.loop_product_import_batches';
  elsif to_regclass('public.product_import_batches') is not null then
    v_table := 'public.product_import_batches';
  else
    return;
  end if;

  v_sql := format($dyn$
    select
      b.id::uuid as batch_id,
      coalesce(b.j ->> 'source_name', b.j ->> 'file_name', b.j ->> 'source_type', b.j ->> 'retailer_name', b.j ->> 'import_scope', 'Import')::text as source_name,
      coalesce(b.j ->> 'status', 'unknown')::text as status,
      coalesce(public.loop_try_numeric(b.j ->> 'total_rows'), 0)::integer as total_rows,
      coalesce(public.loop_try_numeric(b.j ->> 'ready_rows'), 0)::integer as ready_rows,
      coalesce(public.loop_try_numeric(b.j ->> 'needs_review_rows'), 0)::integer as needs_review_rows,
      coalesce(public.loop_try_numeric(b.j ->> 'imported_rows'), 0)::integer as imported_rows,
      coalesce(public.loop_try_timestamptz(b.j ->> 'created_at'), now())::timestamptz as created_at,
      coalesce(public.loop_try_timestamptz(b.j ->> 'updated_at'), public.loop_try_timestamptz(b.j ->> 'created_at'), now())::timestamptz as updated_at
    from (select t.id, to_jsonb(t.*) as j from %s t) b
    order by coalesce(public.loop_try_timestamptz(b.j ->> 'updated_at'), public.loop_try_timestamptz(b.j ->> 'created_at'), now()) desc
    limit %s
  $dyn$, v_table, v_limit);

  return query execute v_sql;
end;
$$;

grant execute on function public.loop_admin_product_imports_list(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pensions: salary sacrifice/NI top-up and payment timing fields.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.pension_accounts') is not null then
    alter table public.pension_accounts add column if not exists employer_ni_topup_mode text default 'none';
    alter table public.pension_accounts add column if not exists employer_ni_rate_percent numeric default 13.8;
    alter table public.pension_accounts add column if not exists regular_pay_day integer;
    alter table public.pension_accounts add column if not exists pension_payment_timing text default 'next_working_day';
    alter table public.pension_accounts add column if not exists contribution_delay_days integer default 0;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Homes: image/backdrop URL and household ownership repair.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.homes') is not null then
    alter table public.homes add column if not exists image_url text;
  end if;
end $$;

-- Repair/normalise people rows for claimed household members. A claimed account
-- should still be selectable as a house/pension/investment owner under the
-- household owner data store.
do $$
begin
  if to_regclass('public.people') is not null
     and to_regclass('public.app_household_members') is not null
     and to_regclass('public.app_households') is not null then
    insert into public.people(user_id, name, relationship, email, linked_user_id)
    select distinct
      h.owner_user_id,
      coalesce(nullif(split_part(au.email, '@', 1), ''), 'Household member') as name,
      case
        when lower(coalesce(m.role, '')) = 'child' then 'child'
        when lower(coalesce(m.role, '')) in ('partner', 'parent', 'owner', 'admin', 'adult', 'member') then 'partner'
        else 'other'
      end as relationship,
      au.email,
      m.user_id
    from public.app_household_members m
    join public.app_households h on h.id = m.household_id
    left join auth.users au on au.id = m.user_id
    where coalesce(m.status, 'active') = 'active'
      and m.user_id is not null
      and h.owner_user_id is not null
      and m.user_id <> h.owner_user_id
      and not exists (
        select 1
        from public.people p
        where p.user_id = h.owner_user_id
          and (
            p.linked_user_id = m.user_id
            or (au.email is not null and lower(coalesce(p.email, '')) = lower(au.email))
          )
      );
  end if;
end $$;

create or replace function public.app_repair_household_people_links()
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    return 0;
  end if;

  insert into public.people(user_id, name, relationship, email, linked_user_id)
  select distinct
    h.owner_user_id,
    coalesce(nullif(split_part(au.email, '@', 1), ''), 'Household member') as name,
    case
      when lower(coalesce(m.role, '')) = 'child' then 'child'
      when lower(coalesce(m.role, '')) in ('partner', 'parent') then lower(m.role)
      else 'partner'
    end as relationship,
    au.email,
    m.user_id
  from public.app_household_members mine
  join public.app_households h on h.id = mine.household_id
  join public.app_household_members m on m.household_id = mine.household_id and coalesce(m.status, 'active') = 'active'
  left join auth.users au on au.id = m.user_id
  where mine.user_id = auth.uid()
    and coalesce(mine.status, 'active') = 'active'
    and m.user_id is not null
    and h.owner_user_id is not null
    and m.user_id <> h.owner_user_id
    and not exists (
      select 1 from public.people p
      where p.user_id = h.owner_user_id
        and (p.linked_user_id = m.user_id or (au.email is not null and lower(coalesce(p.email, '')) = lower(au.email)))
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.app_repair_household_people_links() to authenticated;

-- ---------------------------------------------------------------------------
-- Investment coverage: persist built-in coverage rows as covered, not manual,
-- and remove the need for dashboard text saying to run old migrations.
-- ---------------------------------------------------------------------------
create table if not exists public.loop_investment_markets (
  id uuid primary key default gen_random_uuid(),
  market_code text not null unique,
  market_name text not null,
  country_code text,
  currency_code text,
  enabled boolean not null default true,
  coverage_status text not null default 'planned',
  requested_reason text,
  ai_next_update_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loop_investment_coverage_sources (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_kind text,
  source_url text,
  markets text[] not null default array[]::text[],
  checks_stocks boolean not null default false,
  check_frequency_minutes integer not null default 1440,
  enabled boolean not null default true,
  stocks_referenced integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.loop_investment_markets(market_code, market_name, country_code, currency_code, enabled, coverage_status, requested_reason, ai_next_update_note)
values
  ('LSE', 'London Stock Exchange', 'GB', 'GBP', true, 'covered', 'Built-in UK share/ETF coverage seed.', 'Coverage seed is active; add provider/API mapping from the dashboard if needed.'),
  ('AIM', 'Alternative Investment Market', 'GB', 'GBP', true, 'covered', 'Built-in UK small-cap coverage seed.', 'Coverage seed is active; add provider/API mapping from the dashboard if needed.'),
  ('NASDAQ', 'Nasdaq', 'US', 'USD', true, 'covered', 'Built-in US technology/equity coverage seed.', 'Coverage seed is active; add provider/API mapping from the dashboard if needed.'),
  ('NYSE', 'New York Stock Exchange', 'US', 'USD', true, 'covered', 'Built-in US equity coverage seed.', 'Coverage seed is active; add provider/API mapping from the dashboard if needed.'),
  ('VANGUARD', 'Vanguard UK fund prices', 'GB', 'GBP', true, 'covered', 'Built-in provider-fund NAV coverage seed.', 'Coverage seed is active; add provider/API mapping from the dashboard if needed.')
on conflict (market_code) do update set
  market_name = excluded.market_name,
  country_code = excluded.country_code,
  currency_code = excluded.currency_code,
  enabled = true,
  coverage_status = 'covered',
  requested_reason = coalesce(public.loop_investment_markets.requested_reason, excluded.requested_reason),
  ai_next_update_note = excluded.ai_next_update_note,
  updated_at = now();

insert into public.loop_investment_coverage_sources(source_name, source_kind, source_url, markets, checks_stocks, check_frequency_minutes, enabled, stocks_referenced, notes)
values
  ('Built-in delayed/basic share coverage', 'admin_list', null, array['LSE','AIM','NASDAQ','NYSE']::text[], true, 1440, true, 0, 'Seeded delayed/basic share coverage. Dashboard-created providers can override or enrich this source.'),
  ('Provider fund NAV coverage', 'admin_list', null, array['VANGUARD']::text[], false, 1440, true, 0, 'Seeded provider-fund NAV coverage. Dashboard-created providers can override or enrich this source.')
on conflict do nothing;

update public.loop_investment_markets
set coverage_status = 'covered', updated_at = now()
where market_code in ('LSE', 'AIM', 'NASDAQ', 'NYSE', 'VANGUARD')
  and coalesce(coverage_status, '') in ('manual', 'planned', 'requested', '');
