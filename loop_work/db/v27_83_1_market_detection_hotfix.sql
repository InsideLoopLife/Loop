-- v27.83.1 hotfix: column-safe investment market detection + remainder of v27.83 after the failed block.
-- Use this if db/v27_83_tier_models_markets_products.sql failed with: column "provider_name" does not exist.
-- It is safe to run more than once.

do $$
declare
  v_market_expr text;
begin
  if to_regclass('public.investment_holdings') is not null then
    select string_agg(format('nullif(%I::text, '''')', c.column_name), ', ' order by p.priority)
      into v_market_expr
    from (values
      ('exchange', 1),
      ('native_exchange', 2),
      ('market_code', 3),
      ('market', 4),
      ('provider_name', 5),
      ('provider', 6)
    ) as p(column_name, priority)
    join information_schema.columns c
      on c.table_schema = 'public'
     and c.table_name = 'investment_holdings'
     and c.column_name = p.column_name;

    if v_market_expr is not null then
      execute format($dyn$
        insert into public.loop_investment_markets(market_code, market_name, country_code, currency_code, enabled, coverage_status, requested_reason, ai_next_update_note)
        select distinct
          upper(coalesce(%1$s)) as market_code,
          upper(coalesce(%1$s)) as market_name,
          null::text,
          null::text,
          true,
          'manual',
          'Detected from existing investment holdings.',
          'Detected from existing holdings; confirm provider mapping.'
        from public.investment_holdings
        where coalesce(%1$s) is not null
        on conflict (market_code) do nothing
      $dyn$, v_market_expr);
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Product admin: nutrition_cards + nutrition_ingredients, left-joined to
-- quality snapshots so a small snapshot table never hides the full user DB.
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
  updated_at timestamptz not null default now(),
  unique(card_id)
);

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
  v_parts text[] := array[]::text[];
  v_sql text;
begin
  if to_regclass('public.loop_nutrition_cards') is not null then
    v_parts := v_parts || $part$
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
      from (select id, to_jsonb(loop_nutrition_cards.*) as j from public.loop_nutrition_cards) c
    $part$;
  end if;

  if to_regclass('public.nutrition_ingredients') is not null then
    v_parts := v_parts || $part$
      select
        i.id::uuid as product_id,
        coalesce(j ->> 'label', j ->> 'display_name', j ->> 'name', 'Unnamed product')::text as display_name,
        coalesce(j ->> 'brand_name', j ->> 'brand')::text as brand_name,
        coalesce(j ->> 'source_type', 'ingredient')::text as product_type,
        coalesce(j ->> 'source_type', j ->> 'source_provider', 'ingredient')::text as source_provider,
        coalesce(j ->> 'source_url', j ->> 'url')::text as source_url,
        coalesce(j ->> 'image_url', j ->> 'main_image_url')::text as main_image_url,
        public.loop_try_numeric(j ->> 'calories')::numeric as calories,
        coalesce(public.loop_try_numeric(j ->> 'data_confidence'), public.loop_try_numeric(j ->> 'confidence'))::integer as confidence,
        'active'::text as source_status,
        coalesce(public.loop_try_timestamptz(j ->> 'last_used_at'), public.loop_try_timestamptz(j ->> 'updated_at'), public.loop_try_timestamptz(j ->> 'created_at'), now()) as source_updated_at
      from (select id, to_jsonb(nutrition_ingredients.*) as j from public.nutrition_ingredients) i
    $part$;
  end if;

  if array_length(v_parts, 1) is null then
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
  $sql$, array_to_string(v_parts, ' union all '), v_limit);

  return query execute v_sql;
end;
$$;

grant execute on function public.loop_admin_products_list(integer) to anon, authenticated;

create or replace function public.loop_admin_product_library(
  p_search text default null,
  p_sort text default 'added_desc',
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  product_id uuid,
  display_name text,
  brand_name text,
  card_kind text,
  source_url text,
  main_image_url text,
  created_at timestamptz,
  confidence integer,
  status text,
  data_quality_status text,
  missing_fields text[]
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.loop_is_platform_admin() then
    return;
  end if;

  return query
  with base as (
    select * from public.loop_admin_products_list(10000)
  ), filtered as (
    select * from base
    where (p_search is null or p_search = ''
      or display_name ilike '%' || p_search || '%'
      or brand_name ilike '%' || p_search || '%'
      or source_url ilike '%' || p_search || '%'
      or source_provider ilike '%' || p_search || '%')
  )
  select
    f.product_id,
    f.display_name,
    f.brand_name,
    coalesce(f.product_type, 'product')::text as card_kind,
    f.source_url,
    f.main_image_url,
    f.updated_at as created_at,
    f.confidence,
    f.status,
    case when coalesce(f.quality_score, 0) >= 100 then 'complete' else 'needs_review' end::text as data_quality_status,
    f.missing_fields
  from filtered f
  order by
    case when p_sort = 'alpha' then f.display_name end asc nulls last,
    case when p_sort = 'alpha_desc' then f.display_name end desc nulls last,
    case when p_sort = 'confidence_low' then f.confidence end asc nulls first,
    case when p_sort = 'confidence_high' then f.confidence end desc nulls last,
    case when p_sort = 'added_asc' then f.updated_at end asc nulls last,
    f.updated_at desc nulls last
  limit greatest(1, least(coalesce(p_limit,100),1000))
  offset greatest(0, coalesce(p_offset,0));
end;
$$;

grant execute on function public.loop_admin_product_library(text,text,integer,integer) to authenticated;

notify pgrst, 'reload schema';
