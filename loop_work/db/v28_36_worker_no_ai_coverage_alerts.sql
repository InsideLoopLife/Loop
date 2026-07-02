-- v28.36 worker no-AI guardrails and coverage alerts
-- Ensures unknown instruments are queued for admin review and do not trigger paid AI/web-search from the market worker.

create table if not exists public.loop_investment_ai_market_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loop_investment_ai_market_requests
  add column if not exists prompt text,
  add column if not exists request_query text,
  add column if not exists exchange_hint text,
  add column if not exists inferred_market_code text,
  add column if not exists status text not null default 'planned',
  add column if not exists created_by uuid,
  add column if not exists match_confidence numeric not null default 0,
  add column if not exists progress jsonb not null default '{}'::jsonb;

create index if not exists loop_investment_ai_market_requests_status_idx
on public.loop_investment_ai_market_requests (status, updated_at desc);

create index if not exists loop_investment_ai_market_requests_query_exchange_idx
on public.loop_investment_ai_market_requests (request_query, exchange_hint, status);

alter table public.investment_holdings
  add column if not exists price_check_status text,
  add column if not exists instrument_resolution_status text,
  add column if not exists instrument_resolution_notes text,
  add column if not exists price_polling_enabled boolean;

-- Optional config flags for admin/status pages. Values are intentionally false by default.
create table if not exists public.wealth_watch_settings (
  setting_key text primary key,
  setting_value text,
  updated_at timestamptz not null default now()
);

insert into public.wealth_watch_settings (setting_key, setting_value, updated_at)
values
  ('market_worker_ai_coverage_enabled', 'false', now()),
  ('ai_market_search_enabled', 'false', now()),
  ('ai_web_search_market_lookup_enabled', 'false', now()),
  ('worker_unknown_instrument_policy', 'admin_review_no_ai', now())
on conflict (setting_key) do update set
  setting_value = excluded.setting_value,
  updated_at = now();
