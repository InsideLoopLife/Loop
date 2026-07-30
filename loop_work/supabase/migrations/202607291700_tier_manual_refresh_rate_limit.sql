-- New: tier-based daily cap on manual "Check price" clicks, mirroring
-- the exact same well-tested pattern as the AI budget system (midnight
-- UTC reset via date_trunc('day', now())). Separate from AI usage
-- tracking since this isn't an AI cost, just an abuse/spam guard on a
-- user-triggered action.
--
-- Already applied directly to production. This file is the git-history
-- record.

create table if not exists public.loop_tier_manual_refresh_limits (
  tier_key text primary key,
  daily_limit integer, -- null = unlimited
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.loop_tier_manual_refresh_limits (tier_key, daily_limit) values
  ('free', 10),
  ('extra', 20),
  ('plus', 40),
  ('pro', 100),
  ('staff', null)
on conflict (tier_key) do nothing;

create table if not exists public.loop_manual_refresh_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  holding_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists loop_manual_refresh_events_user_day_idx
  on public.loop_manual_refresh_events (user_id, created_at);

create or replace function public.loop_check_manual_refresh_entitlement(p_user_id uuid, p_tier_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_config record;
  v_used_today integer := 0;
begin
  select * into v_config
  from public.loop_tier_manual_refresh_limits
  where tier_key = coalesce(nullif(p_tier_key, ''), 'free') and enabled = true
  limit 1;

  if not found then
    select * into v_config from public.loop_tier_manual_refresh_limits where tier_key = 'free' limit 1;
  end if;

  select count(*)::integer into v_used_today
  from public.loop_manual_refresh_events e
  where e.user_id = p_user_id and e.created_at >= date_trunc('day', now());

  return jsonb_build_object(
    'allowed', coalesce(v_config.enabled, true) and (v_config.daily_limit is null or v_used_today < v_config.daily_limit),
    'reason', case
      when v_config.daily_limit is not null and v_used_today >= v_config.daily_limit
        then format('Daily manual price-check limit reached (%s/day for your plan). Resets at midnight.', v_config.daily_limit)
      else 'Allowed.'
    end,
    'daily_limit', v_config.daily_limit,
    'used_today', v_used_today,
    'remaining_today', case when v_config.daily_limit is null then null else greatest(v_config.daily_limit - v_used_today, 0) end
  );
end;
$$;

grant execute on function public.loop_check_manual_refresh_entitlement(uuid, text) to authenticated;
grant select, insert on public.loop_manual_refresh_events to authenticated;
alter table public.loop_manual_refresh_events enable row level security;
create policy loop_manual_refresh_events_own_rows on public.loop_manual_refresh_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
