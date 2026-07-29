-- LOOP v27.90 household/admin/spending/tier consolidation
-- Safe after v27.89. Repairs linked household names/dedupes, restores admin RPC/tabs data, and adds optional spending feature flags.

create extension if not exists pgcrypto;

-- Admin recognition: keep DB RPC aligned with the app-level admin fallback.
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

-- Dedupe/sync household people rows for claimed users. A claimed member should appear once, by profile name, not once by email and once by virtual membership.
update public.people p
set
  name = coalesce(nullif(up.display_name,''), nullif(up.full_name,''), p.name),
  avatar_url = coalesce(nullif(p.avatar_url,''), nullif(up.avatar_url,'')),
  linked_user_id = coalesce(p.linked_user_id, up.user_id),
  updated_at = now()
from public.app_user_profiles up
where (
    p.linked_user_id = up.user_id
    or lower(coalesce(p.email,'')) = lower(coalesce(up.email,''))
  )
  and coalesce(nullif(up.display_name,''), nullif(up.full_name,'')) is not null;

with ranked as (
  select
    p.id,
    row_number() over (
      partition by p.user_id, coalesce(p.linked_user_id::text, lower(coalesce(p.email,'')))
      order by case when p.linked_user_id is not null then 0 else 1 end, p.updated_at desc nulls last, p.created_at desc nulls last
    ) as rn
  from public.people p
  where coalesce(p.linked_user_id::text, lower(coalesce(p.email,''))) <> ''
)
update public.people p
set active_until = current_date, notes = concat(coalesce(p.notes,''), case when coalesce(p.notes,'') = '' then '' else ' | ' end, 'Auto-archived duplicate linked household row by v27.90')
from ranked r
where p.id = r.id and r.rn > 1 and p.active_until is null;

-- Optional feature flags for spending/onboarding. UI can use these without hardcoding later.
create table if not exists public.app_user_feature_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  source text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, feature_key)
);

alter table public.app_user_feature_flags enable row level security;
drop policy if exists app_user_feature_flags_own on public.app_user_feature_flags;
create policy app_user_feature_flags_own on public.app_user_feature_flags
for all using (user_id = auth.uid() or public.app_is_platform_admin())
with check (user_id = auth.uid() or public.app_is_platform_admin());

-- Make admin tier dashboard resilient if admin checks were half-migrated: the Next page already gates admin access.
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
  if to_regclass('public.app_tier_plans') is not null then
    select coalesce(jsonb_agg(to_jsonb(p.*) order by p.sort_order), '[]'::jsonb) into v_plans from public.app_tier_plans p;
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
             count(m.user_id) filter (where m.manual_override)::int manual_overrides
      from public.app_tier_plans p
      left join public.app_user_plan_memberships m on m.plan_slug = p.slug
      group by p.slug, p.name, p.sort_order
    ) x;
  end if;

  if to_regprocedure('public.app_admin_list_users_by_tier(text)') is not null then
    select coalesce(jsonb_agg(to_jsonb(urow)), '[]'::jsonb) into v_users from public.app_admin_list_users_by_tier(null) urow;
  else
    select coalesce(jsonb_agg(jsonb_build_object('user_id', u.id, 'email', u.email, 'display_name', coalesce(p.display_name, split_part(u.email,'@',1)), 'plan_slug', coalesce(m.plan_slug,'free'))), '[]'::jsonb)
    into v_users
    from auth.users u
    left join public.app_user_profiles p on p.user_id = u.id
    left join public.app_user_plan_memberships m on m.user_id = u.id;
  end if;

  if to_regclass('public.app_plan_change_requests') is not null then
    select coalesce(jsonb_agg(row_to_json(r) order by r.created_at desc), '[]'::jsonb) into v_requests
    from (
      select req.id, req.user_id, u.email::text as email,
             coalesce(p.display_name, u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1))::text as display_name,
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

  return jsonb_build_object('plans', v_plans, 'users_by_tier', v_users_by_tier, 'users', v_users, 'pending_requests', v_requests, 'comparison', v_comparison);
end;
$$;

grant execute on function public.app_admin_tier_dashboard() to authenticated;

-- SnapTrade/realtime feature cells: seed a clear user-facing feature if the tier tables exist.
do $$
begin
  if to_regclass('public.app_tier_features') is not null then
    insert into public.app_tier_features(feature_key, category, name, description, is_active)
    values ('snaptrade_realtime', 'WEALTH', 'SnapTrade / realtime provider connection', 'Connect investment platforms through SnapTrade where your tier and provider status allow it.', true)
    on conflict (feature_key) do update set
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
           case when p.slug in ('pro','realtime','enterprise') then 'Provider connection available where SnapTrade is configured.' else 'Realtime provider connection requires Pro/realtime access.' end
    from public.app_tier_plans p
    on conflict (plan_slug, feature_key) do update set
      enabled = excluded.enabled,
      enforcement_mode = excluded.enforcement_mode,
      user_message = excluded.user_message,
      updated_at = now();
  end if;
end $$;
