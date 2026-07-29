-- LOOP v27.88 Investment ticker / provider-aware pension / tiers beta fix
-- Safe after v27.87. Fixes DB admin recognition, plan request notifications,
-- beta release flags and provider/ticker tracking guardrails.

create extension if not exists pgcrypto;

-- Keep app-level admin in sync with the Next app allow-list. This prevents
-- Admin > Tiers from failing inside RPCs even when the UI admin gate allows access.
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

alter table public.app_admin_users
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists email text,
  add column if not exists role text not null default 'admin',
  add column if not exists status text not null default 'active',
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

insert into public.app_admin_users(email, role, status, notes)
values ('dan@insideloop.life', 'owner', 'active', 'Seeded owner fallback for Inside LOOP admin RPCs.')
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
  v_email text;
  v_jwt_role text := lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', ''));
  v_jwt_loop_admin text := lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'loop_admin', ''));
  v_jwt_admin text := lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'admin', ''));
  v_is_admin boolean := false;
begin
  if v_user_id is null then
    return false;
  end if;

  if v_jwt_role in ('owner', 'admin', 'super_admin') then return true; end if;
  if v_jwt_loop_admin in ('true', '1', 'yes') then return true; end if;
  if v_jwt_admin in ('true', '1', 'yes') then return true; end if;

  select lower(coalesce(u.email, auth.jwt() ->> 'email', ''))
  into v_email
  from auth.users u
  where u.id = v_user_id;

  if v_email = 'dan@insideloop.life' then
    return true;
  end if;

  if to_regclass('public.app_admin_users') is not null then
    execute
      'select exists (
        select 1
        from public.app_admin_users a
        where lower(coalesce(a.status, '''')) = ''active''
          and (
            a.user_id = $1
            or lower(coalesce(a.email, '''')) = lower(coalesce($2, ''''))
          )
      )'
      into v_is_admin
      using v_user_id, v_email;
    if coalesce(v_is_admin, false) then return true; end if;
  end if;

  if to_regclass('public.profiles') is not null then
    execute
      'select exists (
        select 1 from public.profiles
        where id = $1 and lower(coalesce(role, '''')) in (''owner'', ''admin'', ''super_admin'')
      )'
      into v_is_admin
      using v_user_id;
    if coalesce(v_is_admin, false) then return true; end if;
  end if;

  return false;
end;
$$;

grant execute on function public.app_is_platform_admin() to anon, authenticated;

create or replace function public.app_platform_admin_user_ids()
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path = public, auth, pg_catalog
as $$
begin
  return query
  select distinct x.user_id
  from (
    select a.user_id
    from public.app_admin_users a
    where a.status = 'active' and a.user_id is not null
    union
    select u.id
    from auth.users u
    where lower(coalesce(u.email, '')) = 'dan@insideloop.life'
       or lower(coalesce(u.raw_app_meta_data ->> 'role', '')) in ('owner', 'admin', 'super_admin')
       or lower(coalesce(u.raw_app_meta_data ->> 'loop_admin', '')) in ('true','1','yes')
       or lower(coalesce(u.raw_app_meta_data ->> 'admin', '')) in ('true','1','yes')
  ) x
  where x.user_id is not null;
end;
$$;

grant execute on function public.app_platform_admin_user_ids() to authenticated;

-- Beta/feature-release switches.
create table if not exists public.app_beta_flags (
  flag_key text primary key,
  label text not null,
  description text,
  scope text not null default 'site',
  enabled boolean not null default false,
  rollout_percent numeric not null default 0,
  requires_admin_approval boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_beta_flags_key_check check (flag_key ~ '^[a-z0-9_\-]+$'),
  constraint app_beta_flags_rollout_check check (rollout_percent >= 0 and rollout_percent <= 100)
);

insert into public.app_beta_flags(flag_key, label, description, scope, enabled, rollout_percent, requires_admin_approval)
values
  ('site_beta_enabled', 'Whole site beta mode', 'Marks the whole product as beta and allows beta-only UI copy/features.', 'site', true, 100, false),
  ('manual_upgrade_review', 'Manual upgrade review', 'Upgrade requests stay pending and appear in Admin → Tiers.', 'tiers', true, 100, true),
  ('auto_approve_paid_tier_requests', 'Auto-approve paid tier requests', 'When billing is wired, paid plan requests can be moved automatically instead of pending review.', 'tiers', false, 0, false),
  ('new_savings_ladder', 'Savings ladder beta', 'Use the savings/cash ladder in place of live current-account tracking.', 'wealth', true, 100, false)
on conflict (flag_key) do update set
  label = excluded.label,
  description = excluded.description,
  scope = excluded.scope,
  updated_at = now();

alter table public.app_beta_flags enable row level security;

drop policy if exists "app beta flags admin" on public.app_beta_flags;
create policy "app beta flags admin" on public.app_beta_flags
for all using (public.app_is_platform_admin())
with check (public.app_is_platform_admin());

-- Recreate admin notification routing so upgrade requests reach DB-backed admins.
create or replace function public.app_create_admin_notification(
  p_type text,
  p_title text,
  p_body text,
  p_actor_user_id uuid default null,
  p_related_table text default null,
  p_related_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_admin_count integer := 0;
  v_admin uuid;
begin
  for v_admin in select user_id from public.app_platform_admin_user_ids()
  loop
    insert into public.app_admin_notifications(
      type, title, body, actor_user_id, target_admin_user_id, related_table, related_id, metadata
    )
    values (
      p_type, p_title, p_body, p_actor_user_id, v_admin, p_related_table, p_related_id, coalesce(p_metadata, '{}'::jsonb)
    );
    v_admin_count := v_admin_count + 1;
  end loop;

  if v_admin_count = 0 then
    insert into public.app_admin_notifications(
      type, title, body, actor_user_id, target_admin_user_id, related_table, related_id, metadata
    )
    values (
      p_type, p_title, p_body, p_actor_user_id, null, p_related_table, p_related_id, coalesce(p_metadata, '{}'::jsonb)
    );
  end if;

  return jsonb_build_object('ok', true, 'admin_count', v_admin_count);
end;
$$;

grant execute on function public.app_create_admin_notification(text,text,text,uuid,text,uuid,jsonb) to authenticated;

-- User request flow: pending in beta, optional auto-approve once billing is ready.
drop function if exists public.app_request_plan_change(text, text);

create or replace function public.app_request_plan_change(
  p_plan_slug text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_current text;
  v_request_id uuid;
  v_requested_name text;
  v_requested_is_paid boolean := false;
  v_auto_approve boolean := false;
  v_manual_review boolean := true;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select name, coalesce(is_paid, false)
  into v_requested_name, v_requested_is_paid
  from public.app_tier_plans
  where slug = p_plan_slug
    and is_active = true
    and visible_to_users = true;

  if v_requested_name is null then
    raise exception 'Plan is not available.';
  end if;

  insert into public.app_user_plan_memberships(user_id, plan_slug, status, source)
  values (v_user_id, 'free', 'active', 'default')
  on conflict (user_id) do nothing;

  select plan_slug into v_current
  from public.app_user_plan_memberships
  where user_id = v_user_id
  limit 1;

  select coalesce(enabled, false) into v_auto_approve
  from public.app_beta_flags
  where flag_key = 'auto_approve_paid_tier_requests';

  select coalesce(enabled, true) into v_manual_review
  from public.app_beta_flags
  where flag_key = 'manual_upgrade_review';

  insert into public.app_plan_change_requests(user_id, requested_plan_slug, current_plan_slug, note, status)
  values (
    v_user_id,
    p_plan_slug,
    coalesce(v_current, 'free'),
    p_note,
    case when v_auto_approve and v_requested_is_paid and not v_manual_review then 'approved' else 'requested' end
  )
  returning id into v_request_id;

  if v_auto_approve and v_requested_is_paid and not v_manual_review then
    insert into public.app_user_plan_memberships(user_id, plan_slug, status, source, manual_override, override_reason, created_by)
    values (v_user_id, p_plan_slug, 'active', 'beta', false, 'Auto-approved paid plan request.', null)
    on conflict (user_id) do update set
      plan_slug = excluded.plan_slug,
      status = 'active',
      source = 'beta',
      manual_override = false,
      override_reason = excluded.override_reason,
      updated_at = now();

    perform public.app_create_admin_notification(
      'plan_change_auto_approved',
      'Plan upgrade auto-applied',
      concat('A user requested ', coalesce(v_requested_name, p_plan_slug), ' and it was auto-applied by beta settings.'),
      v_user_id,
      'app_plan_change_requests',
      v_request_id,
      jsonb_build_object('requested_plan_slug', p_plan_slug, 'current_plan_slug', coalesce(v_current, 'free'), 'note', p_note)
    );

    return jsonb_build_object('ok', true, 'request_id', v_request_id, 'status', 'approved', 'applied', true);
  end if;

  perform public.app_create_admin_notification(
    'plan_change_request',
    'Plan upgrade requested',
    concat('A beta user requested ', coalesce(v_requested_name, p_plan_slug), '. Review it in Admin → Tiers.'),
    v_user_id,
    'app_plan_change_requests',
    v_request_id,
    jsonb_build_object('requested_plan_slug', p_plan_slug, 'current_plan_slug', coalesce(v_current, 'free'), 'note', p_note)
  );

  return jsonb_build_object('ok', true, 'request_id', v_request_id, 'status', 'requested', 'applied', false);
end;
$$;

grant execute on function public.app_request_plan_change(text, text) to authenticated;

-- Admin review stays usable even if older migrations only half-applied.
drop function if exists public.app_admin_review_plan_request(uuid, boolean, text);

create or replace function public.app_admin_review_plan_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_request record;
begin
  if not public.app_is_platform_admin() then
    raise exception 'Admin access required.';
  end if;

  select * into v_request
  from public.app_plan_change_requests
  where id = p_request_id;

  if v_request.id is null then
    raise exception 'Request not found.';
  end if;

  update public.app_plan_change_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = p_note
  where id = p_request_id;

  if p_approve then
    insert into public.app_user_plan_memberships(user_id, plan_slug, status, source, manual_override, override_reason, created_by)
    values (v_request.user_id, v_request.requested_plan_slug, 'active', 'admin', true, coalesce(p_note, 'Approved upgrade request.'), auth.uid())
    on conflict (user_id) do update set
      plan_slug = excluded.plan_slug,
      status = 'active',
      source = 'admin',
      manual_override = true,
      override_reason = excluded.override_reason,
      created_by = excluded.created_by,
      updated_at = now();
  end if;

  return jsonb_build_object('ok', true, 'approved', p_approve, 'request_id', p_request_id);
end;
$$;

grant execute on function public.app_admin_review_plan_request(uuid, boolean, text) to authenticated;

-- Optional metadata table for provider-aware wrappers. The UI also has a local glossary,
-- but this lets future AI/admin provider updates persist in Supabase.
create table if not exists public.investment_provider_capabilities (
  provider_key text primary key,
  provider_name text not null,
  product_family text not null default 'investment',
  valuation_mode text not null default 'units',
  default_contribution_method text,
  platform_fee_percent numeric,
  monthly_fee numeric,
  notes text,
  updated_at timestamptz not null default now(),
  constraint investment_provider_capabilities_valuation_check check (valuation_mode in ('units','portfolio_value','defined_benefit','mixed'))
);

insert into public.investment_provider_capabilities(provider_key, provider_name, product_family, valuation_mode, default_contribution_method, platform_fee_percent, monthly_fee, notes)
values
  ('pensionbee', 'PensionBee', 'pension', 'portfolio_value', 'relief_at_source', 0.75, 0, 'PensionBee is typically tracked as a pot/portfolio value rather than individual units.'),
  ('legal-general', 'Legal & General', 'pension', 'mixed', 'salary_sacrifice', null, 0, 'Workplace schemes can be either fund/unit based or value-first depending on scheme.'),
  ('nhs-pension', 'NHS Pension', 'defined_benefit', 'defined_benefit', 'net_pay', 0, 0, 'Defined benefit scheme; track service, salary and accrual rather than units.'),
  ('vanguard', 'Vanguard', 'investment', 'units', null, 0.15, 0, 'Unit/fund based platform tracking.'),
  ('fidelity', 'Fidelity', 'investment', 'units', null, null, 0, 'Unit/fund based platform tracking; fees product-specific.')
on conflict (provider_key) do update set
  provider_name = excluded.provider_name,
  product_family = excluded.product_family,
  valuation_mode = excluded.valuation_mode,
  default_contribution_method = excluded.default_contribution_method,
  platform_fee_percent = excluded.platform_fee_percent,
  monthly_fee = excluded.monthly_fee,
  notes = excluded.notes,
  updated_at = now();

notify pgrst, 'reload schema';
