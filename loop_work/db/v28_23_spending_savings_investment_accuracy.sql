-- v28.23: spending quick-category, savings top-up planner sync and investment coverage requests

create table if not exists public.loop_investment_ai_market_requests (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  inferred_market_code text,
  inferred_market_name text,
  inferred_country_code text,
  inferred_currency_code text,
  generated_sql text,
  status text not null default 'planned',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loop_investment_ai_market_requests_status_check check (status in ('planned','sql_generated','applied','rejected'))
);

create index if not exists loop_investment_ai_market_requests_status_idx
on public.loop_investment_ai_market_requests(status, created_at desc);

alter table public.loop_investment_ai_market_requests enable row level security;

drop policy if exists "loop investment ai requests user insert" on public.loop_investment_ai_market_requests;
create policy "loop investment ai requests user insert" on public.loop_investment_ai_market_requests
for insert to authenticated with check (auth.uid() = created_by);

drop policy if exists "loop investment ai requests user read own" on public.loop_investment_ai_market_requests;
create policy "loop investment ai requests user read own" on public.loop_investment_ai_market_requests
for select to authenticated using (auth.uid() = created_by);

insert into public.app_future_integration_tasks(product_key, task_key, section, title, description, priority, status, metadata)
values
  ('investments', 'trading212-direct-api-open-pl-cost-cash', 'cash-and-lots', 'Trading 212 direct API correction layer', 'Use account summary, positions, orders, dividends and transactions from user-owned Trading 212 API keys to correct cash, original cost, dividends waiting to reinvest and open-position P/L when SnapTrade is incomplete.', 125, 'todo', '{}'::jsonb),
  ('spending', 'quick-category-ajax-review', 'planning', 'Quick categorise spending lines', 'Let users update spending line categories from the monthly flow using the quick category modal rather than editing every bill/subscription.', 126, 'todo', '{}'::jsonb),
  ('savings', 'sync-monthly-topups-to-planner', 'planner-sync', 'Savings top-ups appear in Financial Flow', 'Savings accounts with a monthly top-up day and amount should create or refresh a linked outgoing planned item until the savings account/deal is ended.', 127, 'todo', '{}'::jsonb)
on conflict (product_key, task_key) do update set
  title = excluded.title,
  description = excluded.description,
  section = excluded.section,
  priority = excluded.priority,
  metadata = excluded.metadata;
