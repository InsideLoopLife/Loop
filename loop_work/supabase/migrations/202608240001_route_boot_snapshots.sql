-- LOOP Instant Boot V3
-- Compact route presentation snapshots only. No transaction/history duplication.

create table if not exists public.route_boot_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  context_key text not null,
  route_key text not null,
  payload jsonb not null,
  payload_version integer not null default 1,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, context_key, route_key),
  constraint route_boot_snapshots_route_key_check
    check (route_key ~ '^[a-z0-9-]{1,64}$'),
  constraint route_boot_snapshots_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  constraint route_boot_snapshots_payload_size_check
    check (octet_length(payload::text) <= 65536)
);

alter table public.route_boot_snapshots enable row level security;

create or replace function public.current_route_boot_context_key()
returns text
language sql
stable
security invoker
set search_path = public, auth, pg_temp
as $$
  select coalesce(
    (
      select 'household:' || profile.household_id::text
      from public.app_user_profiles as profile
      where profile.user_id = auth.uid()
        and profile.household_id is not null
      limit 1
    ),
    'user:' || auth.uid()::text
  );
$$;

drop policy if exists route_boot_snapshots_select_own_context
  on public.route_boot_snapshots;
drop policy if exists route_boot_snapshots_insert_own_context
  on public.route_boot_snapshots;
drop policy if exists route_boot_snapshots_update_own_context
  on public.route_boot_snapshots;

create policy route_boot_snapshots_select_own_context
on public.route_boot_snapshots
for select
to authenticated
using (
  user_id = auth.uid()
  and context_key = public.current_route_boot_context_key()
);

create policy route_boot_snapshots_insert_own_context
on public.route_boot_snapshots
for insert
to authenticated
with check (
  user_id = auth.uid()
  and context_key = public.current_route_boot_context_key()
);

create policy route_boot_snapshots_update_own_context
on public.route_boot_snapshots
for update
to authenticated
using (
  user_id = auth.uid()
  and context_key = public.current_route_boot_context_key()
)
with check (
  user_id = auth.uid()
  and context_key = public.current_route_boot_context_key()
);

revoke all on public.route_boot_snapshots from anon, authenticated;
grant select, insert, update on public.route_boot_snapshots to authenticated;

create or replace function public.get_route_boot_snapshot(p_route_key text)
returns table (
  route_key text,
  payload jsonb,
  payload_version integer,
  generated_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public, auth, pg_temp
as $$
  select
    s.route_key,
    s.payload,
    s.payload_version,
    s.generated_at,
    s.updated_at
  from public.route_boot_snapshots as s
  where s.user_id = auth.uid()
    and s.context_key = public.current_route_boot_context_key()
    and s.route_key = p_route_key
    and p_route_key ~ '^[a-z0-9-]{1,64}$'
  limit 1;
$$;

create or replace function public.upsert_route_boot_snapshot(
  p_route_key text,
  p_payload jsonb,
  p_payload_version integer default 1,
  p_generated_at timestamptz default now()
)
returns void
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_route_key is null or p_route_key !~ '^[a-z0-9-]{1,64}$' then
    raise exception 'Invalid route key';
  end if;

  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Snapshot payload must be an object';
  end if;

  if octet_length(p_payload::text) > 65536 then
    raise exception 'Snapshot payload is too large';
  end if;

  insert into public.route_boot_snapshots (
    user_id,
    context_key,
    route_key,
    payload,
    payload_version,
    generated_at,
    updated_at
  ) values (
    auth.uid(),
    public.current_route_boot_context_key(),
    p_route_key,
    p_payload,
    greatest(1, coalesce(p_payload_version, 1)),
    coalesce(p_generated_at, now()),
    now()
  )
  on conflict (user_id, context_key, route_key)
  do update set
    payload = excluded.payload,
    payload_version = excluded.payload_version,
    generated_at = excluded.generated_at,
    updated_at = now();
end;
$$;

revoke all on function public.current_route_boot_context_key() from public, anon;
revoke all on function public.get_route_boot_snapshot(text) from public, anon;
revoke all on function public.upsert_route_boot_snapshot(text, jsonb, integer, timestamptz)
  from public, anon;

grant execute on function public.current_route_boot_context_key() to authenticated;
grant execute on function public.get_route_boot_snapshot(text) to authenticated;
grant execute on function public.upsert_route_boot_snapshot(text, jsonb, integer, timestamptz)
  to authenticated;

comment on table public.route_boot_snapshots is
  'Compact read-only presentation snapshots used to paint authenticated LOOP routes while fresh route data streams.';
