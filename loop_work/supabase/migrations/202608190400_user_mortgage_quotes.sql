create table if not exists public.user_mortgage_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid null references public.homes(id) on delete cascade,
  lender_name text not null,
  product_name text null,
  rate_percent numeric(8,4) not null check (rate_percent > 0 and rate_percent < 100),
  rate_type text null,
  ltv_max_percent numeric(6,2) null check (ltv_max_percent is null or (ltv_max_percent >= 0 and ltv_max_percent <= 100)),
  initial_term_months integer null check (initial_term_months is null or initial_term_months > 0),
  fee_amount numeric(12,2) null check (fee_amount is null or fee_amount >= 0),
  source_method text not null default 'manual' check (source_method in ('manual','url','image')),
  source_url text null,
  evidence_status text not null default 'user_supplied' check (evidence_status in ('user_supplied','extracted_reviewed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_mortgage_quotes_user_home_created_idx
  on public.user_mortgage_quotes(user_id, home_id, created_at desc);

alter table public.user_mortgage_quotes enable row level security;

drop policy if exists user_mortgage_quotes_select_own on public.user_mortgage_quotes;
create policy user_mortgage_quotes_select_own
  on public.user_mortgage_quotes for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_mortgage_quotes_insert_own on public.user_mortgage_quotes;
create policy user_mortgage_quotes_insert_own
  on public.user_mortgage_quotes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_mortgage_quotes_update_own on public.user_mortgage_quotes;
create policy user_mortgage_quotes_update_own
  on public.user_mortgage_quotes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists user_mortgage_quotes_delete_own on public.user_mortgage_quotes;
create policy user_mortgage_quotes_delete_own
  on public.user_mortgage_quotes for delete
  to authenticated
  using (user_id = auth.uid());
