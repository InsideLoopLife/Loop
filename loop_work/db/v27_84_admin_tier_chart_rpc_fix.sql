-- v27.84 Admin tier chart + product RPC repair
-- Run after v27.83/v27.83.1. This fixes the product RPC array append bug,
-- makes import listing column-safe, and makes Admin > Tiers use the same
-- app_tier_* data model as the user-facing /account/plan chart.

-- ---------------------------------------------------------------------------
-- Product RPC: fix malformed array literal from text[] concatenation.
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
  v_parts text[] := array[]::text[];
  v_sql text;
begin
  if to_regclass('public.loop_nutrition_cards') is not null then
    v_parts := array_append(v_parts, $part$
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
    $part$);
  end if;

  if to_regclass('public.nutrition_ingredients') is not null then
    v_parts := array_append(v_parts, $part$
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
    $part$);
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

-- ---------------------------------------------------------------------------
-- Import batches RPC: column-safe wrapper so missing source_name/file_name never
-- breaks the admin dashboard.
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
    from (select id, to_jsonb(t.*) as j from %s t) b
    order by coalesce(public.loop_try_timestamptz(b.j ->> 'updated_at'), public.loop_try_timestamptz(b.j ->> 'created_at'), now()) desc
    limit %s
  $dyn$, v_table, v_limit);

  return query execute v_sql;
end;
$$;

grant execute on function public.loop_admin_product_imports_list(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- User-facing tier chart admin controls.
-- ---------------------------------------------------------------------------

create or replace function public.app_admin_upsert_feature_definition(
  p_feature_key text,
  p_category text,
  p_name text,
  p_description text default null,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_key text := lower(regexp_replace(coalesce(p_feature_key, ''), '[^a-zA-Z0-9_-]+', '_', 'g'));
begin
  if not public.app_is_platform_admin() then
    raise exception 'Admin access required.';
  end if;

  if v_key = '' then
    raise exception 'Feature key is required.';
  end if;

  insert into public.app_tier_features(feature_key, category, name, description, is_active)
  values (v_key, coalesce(nullif(p_category, ''), 'General'), coalesce(nullif(p_name, ''), v_key), p_description, coalesce(p_is_active, true))
  on conflict (feature_key) do update set
    category = excluded.category,
    name = excluded.name,
    description = excluded.description,
    is_active = excluded.is_active,
    updated_at = now();

  return jsonb_build_object('ok', true, 'feature_key', v_key);
end;
$$;

grant execute on function public.app_admin_upsert_feature_definition(text,text,text,text,boolean) to authenticated;

create or replace function public.app_admin_delete_feature(p_feature_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if not public.app_is_platform_admin() then
    raise exception 'Admin access required.';
  end if;

  update public.app_tier_features
  set is_active = false,
      updated_at = now()
  where feature_key = p_feature_key;

  return jsonb_build_object('ok', true, 'feature_key', p_feature_key, 'mode', 'hidden');
end;
$$;

grant execute on function public.app_admin_delete_feature(text) to authenticated;

create or replace function public.app_admin_delete_plan(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_has_users boolean;
begin
  if not public.app_is_platform_admin() then
    raise exception 'Admin access required.';
  end if;

  select exists(select 1 from public.app_user_plan_memberships where plan_slug = p_slug)
  into v_has_users;

  if v_has_users then
    update public.app_tier_plans
    set visible_to_users = false,
        is_active = false,
        updated_at = now()
    where slug = p_slug;

    return jsonb_build_object('ok', true, 'slug', p_slug, 'mode', 'hidden_because_users_exist');
  end if;

  delete from public.app_tier_plan_features where plan_slug = p_slug;
  delete from public.app_tier_plans where slug = p_slug;

  return jsonb_build_object('ok', true, 'slug', p_slug, 'mode', 'deleted');
end;
$$;

grant execute on function public.app_admin_delete_plan(text) to authenticated;

-- Include visibility and activation fields so Admin > Tiers can edit the same
-- columns users see without querying a second, inconsistent tier table.
drop function if exists public.app_plan_comparison_rpc();

create or replace function public.app_plan_comparison_rpc()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_plans jsonb;
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'slug', slug,
      'name', name,
      'description', description,
      'monthly_price_pence', monthly_price_pence,
      'annual_price_pence', annual_price_pence,
      'badge', badge,
      'sort_order', sort_order,
      'is_active', is_active,
      'visible_to_users', visible_to_users,
      'is_paid', is_paid,
      'payment_required', payment_required,
      'currency', currency
    )
    order by sort_order
  ), '[]'::jsonb)
  into v_plans
  from public.app_tier_plans
  where is_active = true and visible_to_users = true;

  select coalesce(jsonb_agg(feature_row order by category, name), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'feature_key', f.feature_key,
      'category', f.category,
      'name', f.name,
      'description', f.description,
      'plans', coalesce(jsonb_object_agg(
        p.slug,
        jsonb_build_object(
          'enabled', coalesce(pf.enabled, false),
          'limit_value', pf.limit_value,
          'limit_period', coalesce(pf.limit_period, 'none'),
          'health_status', coalesce(pf.health_status, 'hidden'),
          'enforcement_mode', coalesce(pf.enforcement_mode, 'upgrade'),
          'message', pf.user_message
        )
      ) filter (where p.slug is not null), '{}'::jsonb)
    ) as feature_row,
    f.category,
    f.name
    from public.app_tier_features f
    cross join public.app_tier_plans p
    left join public.app_tier_plan_features pf
      on pf.feature_key = f.feature_key
     and pf.plan_slug = p.slug
    where f.is_active = true
      and p.is_active = true
      and p.visible_to_users = true
    group by f.feature_key, f.category, f.name, f.description
  ) x;

  return jsonb_build_object('plans', v_plans, 'features', v_rows);
end;
$$;

grant execute on function public.app_plan_comparison_rpc() to authenticated;

drop function if exists public.app_admin_list_users_by_tier(text);

create or replace function public.app_admin_list_users_by_tier(p_plan_slug text default null)
returns table (
  user_id uuid,
  anon_user_ref text,
  email text,
  masked_email text,
  display_name text,
  plan_slug text,
  status text,
  source text,
  manual_override boolean,
  override_reason text,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  if not public.app_is_platform_admin() then
    raise exception 'Admin access required.';
  end if;

  insert into public.app_user_plan_memberships(user_id, plan_slug, status, source)
  select u.id, 'free', 'active', 'default'
  from auth.users u
  where not exists (
    select 1 from public.app_user_plan_memberships m where m.user_id = u.id
  );

  return query
  select
    u.id as user_id,
    concat('user_', left(encode(digest(u.id::text, 'sha256'), 'hex'), 10)) as anon_user_ref,
    u.email::text as email,
    case
      when u.email is null then null
      else concat(left(u.email, 2), '***@', split_part(u.email, '@', 2))
    end as masked_email,
    coalesce(p.display_name, u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))::text as display_name,
    coalesce(m.plan_slug, 'free') as plan_slug,
    coalesce(m.status, 'active') as status,
    coalesce(m.source, 'default') as source,
    coalesce(m.manual_override, false) as manual_override,
    m.override_reason,
    m.starts_at,
    m.expires_at,
    u.created_at
  from auth.users u
  left join public.app_user_plan_memberships m on m.user_id = u.id
  left join public.loop_user_admin_profiles p on p.user_id = u.id
  where p_plan_slug is null or coalesce(m.plan_slug, 'free') = p_plan_slug
  order by u.created_at desc;
end;
$$;

grant execute on function public.app_admin_list_users_by_tier(text) to authenticated;

drop function if exists public.app_admin_tier_dashboard();

create or replace function public.app_admin_tier_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_plans jsonb;
  v_users_by_tier jsonb;
  v_users jsonb;
  v_requests jsonb;
  v_features jsonb;
  v_notifications jsonb;
  v_comparison jsonb;
begin
  if not public.app_is_platform_admin() then
    raise exception 'Admin access required.';
  end if;

  insert into public.app_user_plan_memberships(user_id, plan_slug, status, source)
  select u.id, 'free', 'active', 'default'
  from auth.users u
  where not exists (
    select 1 from public.app_user_plan_memberships m where m.user_id = u.id
  );

  select coalesce(jsonb_agg(to_jsonb(p.*) order by p.sort_order), '[]'::jsonb)
  into v_plans
  from public.app_tier_plans p;

  select coalesce(jsonb_agg(row_to_json(x) order by x.sort_order), '[]'::jsonb)
  into v_users_by_tier
  from (
    select
      p.slug as plan_slug,
      p.name as plan_name,
      p.sort_order,
      count(m.user_id)::int as user_count,
      count(m.user_id) filter (where m.manual_override)::int as manual_overrides
    from public.app_tier_plans p
    left join public.app_user_plan_memberships m on m.plan_slug = p.slug
    group by p.slug, p.name, p.sort_order
  ) x;

  select coalesce(jsonb_agg(to_jsonb(urow) order by urow.created_at desc), '[]'::jsonb)
  into v_users
  from public.app_admin_list_users_by_tier(null) urow;

  select coalesce(jsonb_agg(row_to_json(r) order by r.created_at desc), '[]'::jsonb)
  into v_requests
  from (
    select
      req.id,
      req.user_id,
      u.email::text as email,
      coalesce(p.display_name, u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))::text as display_name,
      case when u.email is null then null else concat(left(u.email, 2), '***@', split_part(u.email, '@', 2)) end as masked_email,
      req.requested_plan_slug,
      req.current_plan_slug,
      req.status,
      req.note,
      req.created_at
    from public.app_plan_change_requests req
    left join auth.users u on u.id = req.user_id
    left join public.loop_user_admin_profiles p on p.user_id = req.user_id
    where req.status = 'requested'
  ) r;

  select coalesce(jsonb_agg(to_jsonb(f.*) order by f.category, f.name), '[]'::jsonb)
  into v_features
  from public.app_tier_features f
  where f.is_active = true;

  select coalesce(jsonb_agg(to_jsonb(n.*) order by n.created_at desc), '[]'::jsonb)
  into v_notifications
  from public.app_admin_notifications n
  where n.status = 'unread'
    and (n.target_admin_user_id is null or n.target_admin_user_id = auth.uid())
  limit 25;

  select public.app_plan_comparison_rpc() into v_comparison;

  return jsonb_build_object(
    'plans', v_plans,
    'users_by_tier', v_users_by_tier,
    'users', v_users,
    'pending_requests', v_requests,
    'features', v_features,
    'admin_notifications', v_notifications,
    'comparison', v_comparison
  );
end;
$$;

grant execute on function public.app_admin_tier_dashboard() to authenticated;

notify pgrst, 'reload schema';
