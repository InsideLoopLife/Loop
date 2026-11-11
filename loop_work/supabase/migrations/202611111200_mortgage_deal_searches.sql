-- Weekly search of the cheapest mortgage deals for a home's loan-to-value:
-- the five cheapest lenders, plus the home's current lender if it isn't
-- among them. Written by the weekly scheduled search, read on Home & mortgage.
create table if not exists public.mortgage_deal_search_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.homes(id) on delete cascade,
  searched_on date not null default current_date,
  rank int not null,
  lender_name text not null,
  product_name text,
  rate_type text,
  rate_percent numeric not null check (rate_percent > 0 and rate_percent < 100),
  fee_amount numeric not null default 0 check (fee_amount >= 0),
  ltv_max_percent numeric,
  initial_term_months int,
  monthly_payment numeric,
  yearly_cost numeric,
  is_current_lender boolean not null default false,
  customer_type text not null default 'remortgage',
  source_name text,
  source_url text,
  created_at timestamptz not null default now()
);
create index if not exists mortgage_deal_search_results_home_idx on public.mortgage_deal_search_results (home_id, searched_on desc, rank);
alter table public.mortgage_deal_search_results enable row level security;
create policy mortgage_deal_search_results_select on public.mortgage_deal_search_results
  for select using (user_id = (select auth.uid()) or app_same_active_household(user_id));
grant select on public.mortgage_deal_search_results to authenticated;
