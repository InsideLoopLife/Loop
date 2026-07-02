-- v28.35 AI usage logging and guardrails
-- Tracks token usage and web-search calls so expensive AI flows can be audited in Admin.

create table if not exists public.loop_ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  provider text not null default 'openai',
  model text,
  scope text not null,
  component text,
  user_id uuid,
  request_id text,

  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cached_input_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,

  used_web_search boolean not null default false,
  web_search_tool_calls integer not null default 0,

  estimated_cost_gbp numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists loop_ai_usage_events_created_at_idx
on public.loop_ai_usage_events (created_at desc);

create index if not exists loop_ai_usage_events_scope_created_at_idx
on public.loop_ai_usage_events (scope, created_at desc);

create index if not exists loop_ai_usage_events_user_created_at_idx
on public.loop_ai_usage_events (user_id, created_at desc)
where user_id is not null;

create or replace function public.loop_admin_ai_usage_summary(days_back integer default 7)
returns table (
  scope text,
  events bigint,
  input_tokens bigint,
  output_tokens bigint,
  total_tokens bigint,
  web_search_tool_calls bigint,
  estimated_cost_gbp numeric,
  first_seen timestamptz,
  last_seen timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(scope, 'unknown') as scope,
    count(*) as events,
    coalesce(sum(input_tokens), 0)::bigint as input_tokens,
    coalesce(sum(output_tokens), 0)::bigint as output_tokens,
    coalesce(sum(total_tokens), 0)::bigint as total_tokens,
    coalesce(sum(web_search_tool_calls), 0)::bigint as web_search_tool_calls,
    coalesce(sum(estimated_cost_gbp), 0) as estimated_cost_gbp,
    min(created_at) as first_seen,
    max(created_at) as last_seen
  from public.loop_ai_usage_events
  where created_at >= now() - make_interval(days => greatest(1, days_back))
  group by coalesce(scope, 'unknown')
  order by total_tokens desc;
$$;

-- Optional admin settings documentation rows. Env vars are the hard gate for the worker,
-- but recording these keys makes the admin intent explicit.
create table if not exists public.wealth_watch_settings (
  setting_key text primary key,
  setting_value text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.wealth_watch_settings (setting_key, setting_value, updated_at)
values
  ('ai_market_search_enabled', 'false', now()),
  ('ai_web_search_market_lookup_enabled', 'false', now()),
  ('market_data_worker_ai_coverage_enabled', 'false', now()),
  ('ai_holding_image_import_enabled', 'false', now())
on conflict (setting_key) do nothing;
