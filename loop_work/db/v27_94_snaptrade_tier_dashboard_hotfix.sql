-- LOOP v27.94 SnapTrade tier dashboard hotfix
-- Fixes Admin > Tiers failing with: function digest(text, unknown) does not exist.
-- Also makes provider connection entitlement separate from provider-live status so SnapTrade can be connected before realtime prices are live.

-- Keep DB admin recognition aligned with app UI.
create table if not exists public.app_admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  role text not null default 'admin',
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id),
  unique(email)
);

insert into public.app_admin_users(email, role, status, notes)
values ('dan@insideloop.life', 'owner', 'active', 'Inside LOOP owner/admin fallback for RPCs.')
on conflict (email) do update set role = excluded.role, status = excluded.status, updated_at = now();

create or replace function public.app_is_platform_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_is_admin boolean := false;
begin
  if v_user_id is null then return false; end if;

  select lower(coalesce(u.email, v_email, '')) into v_email
  from auth.users u where u.id = v_user_id;

  if v_email = 'dan@insideloop.life' then return true; end if;

  select exists(
    select 1 from public.app_admin_users a
    where lower(coalesce(a.status,'')) = 'active'
      and (a.user_id = v_user_id or lower(coalesce(a.email,'')) = v_email)
  ) into v_is_admin;

  return coalesce(v_is_admin, false);
end;
$$;

grant execute on function public.app_is_platform_admin() to anon, authenticated;

-- Drop/recreate because older versions used pgcrypto.digest() without the extensions schema in search_path.
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

  if to_regclass('public.app_user_plan_memberships') is not null then
    insert into public.app_user_plan_memberships(user_id, plan_slug, status, source)
    select u.id, 'free', 'active', 'default'
    from auth.users u
    where not exists (
      select 1 from public.app_user_plan_memberships m where m.user_id = u.id
    );
  end if;

  return query
  select
    u.id as user_id,
    concat('user_', left(md5(u.id::text), 10)) as anon_user_ref,
    u.email::text as email,
    case
      when u.email is null then null
      else concat(left(u.email, 2), '***@', split_part(u.email, '@', 2))
    end as masked_email,
    coalesce(p.display_name, p.full_name, u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))::text as display_name,
    coalesce(m.plan_slug, 'free')::text as plan_slug,
    coalesce(m.status, 'active')::text as status,
    coalesce(m.source, 'default')::text as source,
    coalesce(m.manual_override, false)::boolean as manual_override,
    m.override_reason::text,
    m.starts_at,
    m.expires_at,
    u.created_at
  from auth.users u
  left join public.app_user_plan_memberships m on m.user_id = u.id
  left join public.app_user_profiles p on p.user_id = u.id
  where p_plan_slug is null or coalesce(m.plan_slug, 'free') = p_plan_slug
  order by u.created_at desc;
end;
$$;

grant execute on function public.app_admin_list_users_by_tier(text) to authenticated;

-- Recreate dashboard so it uses the safe user-list function above and does not fail the whole page.
drop function if exists public.app_admin_tier_dashboard();

create or replace function public.app_admin_tier_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_plans jsonb := '[]'::jsonb;
  v_users_by_tier jsonb := '[]'::jsonb;
  v_users jsonb := '[]'::jsonb;
  v_requests jsonb := '[]'::jsonb;
  v_comparison jsonb := '{}'::jsonb;
begin
  if not public.app_is_platform_admin() then
    raise exception 'Admin access required.';
  end if;

  if to_regclass('public.app_tier_plans') is not null then
    select coalesce(jsonb_agg(to_jsonb(p.*) order by p.sort_order), '[]'::jsonb)
    into v_plans
    from public.app_tier_plans p;
  end if;

  if to_regclass('public.app_user_plan_memberships') is not null and to_regclass('public.app_tier_plans') is not null then
    insert into public.app_user_plan_memberships(user_id, plan_slug, status, source)
    select u.id, 'free', 'active', 'default'
    from auth.users u
    where not exists (select 1 from public.app_user_plan_memberships m where m.user_id = u.id);

    select coalesce(jsonb_agg(row_to_json(x) order by x.sort_order), '[]'::jsonb) into v_users_by_tier
    from (
      select p.slug plan_slug, p.name plan_name, p.sort_order,
             count(m.user_id)::int user_count,
             count(m.user_id) filter (where coalesce(m.manual_override,false))::int manual_overrides
      from public.app_tier_plans p
      left join public.app_user_plan_memberships m on m.plan_slug = p.slug
      group by p.slug, p.name, p.sort_order
    ) x;
  end if;

  if to_regprocedure('public.app_admin_list_users_by_tier(text)') is not null then
    select coalesce(jsonb_agg(to_jsonb(urow)), '[]'::jsonb)
    into v_users
    from public.app_admin_list_users_by_tier(null) urow;
  end if;

  if to_regclass('public.app_plan_change_requests') is not null then
    select coalesce(jsonb_agg(row_to_json(r) order by r.created_at desc), '[]'::jsonb) into v_requests
    from (
      select req.id, req.user_id, u.email::text as email,
             coalesce(p.display_name, p.full_name, u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))::text as display_name,
             req.requested_plan_slug, req.current_plan_slug, req.status, req.note, req.created_at
      from public.app_plan_change_requests req
      left join auth.users u on u.id = req.user_id
      left join public.app_user_profiles p on p.user_id = req.user_id
      where req.status in ('requested','pending')
    ) r;
  end if;

  if to_regprocedure('public.app_plan_comparison_rpc()') is not null then
    select public.app_plan_comparison_rpc() into v_comparison;
  end if;

  return jsonb_build_object(
    'plans', v_plans,
    'users_by_tier', v_users_by_tier,
    'users', v_users,
    'pending_requests', v_requests,
    'comparison', coalesce(v_comparison, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.app_admin_tier_dashboard() to authenticated;

-- Make the user-facing SnapTrade feature visible/configurable in Admin > Tiers.
do $$
begin
  if to_regclass('public.app_tier_features') is not null then
    insert into public.app_tier_features(feature_key, category, name, description, is_active)
    values ('snaptrade_realtime', 'WEALTH', 'SnapTrade / broker connection', 'Connect an investment provider through SnapTrade where the plan and provider status allow it.', true)
    on conflict (feature_key) do update set
      category = excluded.category,
      name = excluded.name,
      description = excluded.description,
      is_active = true,
      updated_at = now();
  end if;

  if to_regclass('public.app_tier_plan_features') is not null and to_regclass('public.app_tier_plans') is not null then
    insert into public.app_tier_plan_features(plan_slug, feature_key, enabled, limit_value, limit_period, enforcement_mode, health_status, user_message)
    select p.slug,
           'snaptrade_realtime',
           (p.slug in ('pro','realtime','enterprise')),
           null,
           'none',
           case when p.slug in ('pro','realtime','enterprise') then 'audit' else 'upgrade' end,
           'active',
           case when p.slug in ('pro','realtime','enterprise')
             then 'SnapTrade connection is available. Realtime prices start once the provider connection is live.'
             else 'SnapTrade/broker connection requires a realtime-enabled tier.' end
    from public.app_tier_plans p
    on conflict (plan_slug, feature_key) do update set
      enabled = excluded.enabled,
      enforcement_mode = excluded.enforcement_mode,
      health_status = excluded.health_status,
      user_message = excluded.user_message,
      updated_at = now();
  end if;
end $$;
