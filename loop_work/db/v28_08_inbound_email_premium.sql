-- v28.08 Premium inbound email aliases + safe import staging
-- Run after v28.07. This does not require per-user mailbox creation: configure one catch-all inbound route for *@insideloop.life.

create extension if not exists pgcrypto;

create table if not exists public.loop_inbound_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alias text not null,
  domain text not null default 'insideloop.life',
  status text not null default 'active',
  allowed_sender_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_received_at timestamptz,
  unique(user_id),
  unique(alias, domain),
  constraint loop_inbound_aliases_alias_check check (alias ~ '^[a-z0-9][a-z0-9._-]{2,40}$'),
  constraint loop_inbound_aliases_status_check check (status in ('active','paused','disabled'))
);

create table if not exists public.loop_inbound_email_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'generic',
  provider_message_id text,
  alias text,
  domain text default 'insideloop.life',
  from_email text,
  to_email text,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'received',
  reject_reason text,
  extracted_json jsonb not null default '{}'::jsonb,
  raw_headers_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint loop_inbound_email_events_status_check check (status in ('received','accepted','rejected','error'))
);

create table if not exists public.loop_inbound_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inbound_event_id uuid references public.loop_inbound_email_events(id) on delete set null,
  import_kind text not null,
  source text not null default 'inbound_email',
  source_value text not null,
  status text not null default 'needs_review',
  title text,
  parsed_json jsonb not null default '{}'::jsonb,
  security_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  imported_at timestamptz,
  rejected_at timestamptz,
  constraint loop_inbound_imports_kind_check check (import_kind in ('property_url','investment_ticker','unknown')),
  constraint loop_inbound_imports_status_check check (status in ('needs_review','ready','imported','rejected','blocked','error'))
);

create index if not exists loop_inbound_imports_user_status_idx on public.loop_inbound_imports(user_id, status, created_at desc);
create index if not exists loop_inbound_events_alias_idx on public.loop_inbound_email_events(alias, domain, created_at desc);

alter table public.loop_inbound_aliases enable row level security;
alter table public.loop_inbound_email_events enable row level security;
alter table public.loop_inbound_imports enable row level security;

drop policy if exists "inbound aliases owner read" on public.loop_inbound_aliases;
create policy "inbound aliases owner read" on public.loop_inbound_aliases for select using (auth.uid() = user_id);

drop policy if exists "inbound imports owner read" on public.loop_inbound_imports;
create policy "inbound imports owner read" on public.loop_inbound_imports for select using (auth.uid() = user_id);

drop policy if exists "inbound events owner read" on public.loop_inbound_email_events;
create policy "inbound events owner read" on public.loop_inbound_email_events for select using (auth.uid() = user_id);

create or replace function public.loop_normalise_inbound_alias(p_value text)
returns text
language sql
immutable
as $$
  select trim(both '.' from regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9._-]+', '', 'g'));
$$;

create or replace function public.loop_random_alias_for_email(p_email text)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_local text := split_part(lower(coalesce(p_email, 'loop')), '@', 1);
  v_base text;
  v_alias text;
begin
  v_base := public.loop_normalise_inbound_alias(v_local);
  if length(v_base) < 3 or v_base in ('admin','support','security','help','postmaster','abuse','billing','root','system','loop','insideloop') then
    v_base := 'loop' || substr(encode(gen_random_bytes(4), 'hex'), 1, 6);
  end if;
  v_base := substr(v_base, 1, 28);

  loop
    v_alias := v_base || '-' || substr(encode(gen_random_bytes(3), 'hex'), 1, 4);
    exit when not exists(select 1 from public.loop_inbound_aliases where alias = v_alias and domain = 'insideloop.life');
  end loop;
  return v_alias;
end;
$$;

create or replace function public.loop_user_has_inbound_email_entitlement(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth, pg_catalog
as $$
  select exists(
    select 1
    from public.app_user_plan_memberships m
    where m.user_id = p_user_id
      and m.status in ('active','trialing','pending')
      and (m.expires_at is null or m.expires_at > now())
      and lower(m.plan_slug) in ('plus','pro','premium','extra','founder')
  ) or exists(
    select 1
    from auth.users u
    where u.id = p_user_id
      and lower(coalesce(u.raw_app_meta_data ->> 'role','')) in ('admin','owner','super_admin')
  );
$$;

create or replace function public.loop_claim_inbound_alias(p_alias text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_alias text;
  v_reserved text[] := array['admin','support','security','help','postmaster','abuse','billing','root','system','loop','insideloop','mail','smtp','api'];
  v_row public.loop_inbound_aliases%rowtype;
begin
  if v_user_id is null then raise exception 'Not signed in'; end if;
  if not public.loop_user_has_inbound_email_entitlement(v_user_id) then
    return jsonb_build_object('ok', false, 'code', 'premium_required', 'message', 'Inbound email aliases are available on paid tiers.');
  end if;

  select email into v_email from auth.users where id = v_user_id;
  select * into v_row from public.loop_inbound_aliases where user_id = v_user_id;
  if found then
    return jsonb_build_object('ok', true, 'alias', v_row.alias, 'email', v_row.alias || '@' || v_row.domain, 'status', v_row.status, 'existing', true);
  end if;

  v_alias := public.loop_normalise_inbound_alias(p_alias);
  if v_alias is null or length(v_alias) < 3 then
    v_alias := public.loop_random_alias_for_email(v_email);
  end if;
  if v_alias = any(v_reserved) or v_alias like 'admin%' or v_alias like 'support%' then
    raise exception 'That alias is reserved.';
  end if;

  insert into public.loop_inbound_aliases(user_id, alias, domain, allowed_sender_email)
  values (v_user_id, v_alias, 'insideloop.life', lower(v_email))
  returning * into v_row;

  return jsonb_build_object('ok', true, 'alias', v_row.alias, 'email', v_row.alias || '@' || v_row.domain, 'status', v_row.status, 'existing', false);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'alias_taken', 'message', 'That alias is already taken.');
end;
$$;

grant execute on function public.loop_claim_inbound_alias(text) to authenticated;
grant execute on function public.loop_user_has_inbound_email_entitlement(uuid) to authenticated, service_role;

-- Feature row so Admin > Tiers can show/lock this as a premium feature.
insert into public.app_tier_features(feature_key, category, name, description, is_active)
values ('inbound_email_imports', 'Automation', 'Email-to-LOOP alias', 'Premium inbound email address for property URLs and investment tickers.', true)
on conflict (feature_key) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.app_tier_plan_features(plan_slug, feature_key, enabled, enforcement_mode, user_message)
select p.slug, 'inbound_email_imports', (lower(p.slug) in ('plus','pro','premium','extra','founder')), case when lower(p.slug) in ('plus','pro','premium','extra','founder') then 'audit' else 'block' end, 'Email-to-LOOP is a premium feature.'
from public.app_tier_plans p
on conflict (plan_slug, feature_key) do update set enabled = excluded.enabled, enforcement_mode = excluded.enforcement_mode, user_message = excluded.user_message;
