-- What the home looks like (for its drawing) and its council tax band.
alter table public.homes add column if not exists house_style jsonb;
alter table public.homes add column if not exists council_tax_band text check (council_tax_band is null or council_tax_band ~ '^[A-I]$');

-- The home's story beyond the current deal: purchase, Help to Buy loan and
-- its repayment, earlier deals, remortgages, extensions.
create table if not exists public.home_journey_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid,
  home_id uuid not null references public.homes(id) on delete cascade,
  event_date date not null,
  kind text not null check (kind in ('purchase','mortgage_deal','remortgage','help_to_buy_loan','help_to_buy_repaid','shared_ownership','further_borrowing','overpayment','improvement','valuation','sale','other')),
  title text not null,
  amount numeric,
  rate_percent numeric,
  lender text,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists home_journey_events_home_idx on public.home_journey_events (home_id, event_date);
alter table public.home_journey_events enable row level security;
create policy home_journey_events_select on public.home_journey_events for select using (user_id = (select auth.uid()) or app_same_active_household(user_id));
create policy home_journey_events_insert on public.home_journey_events for insert with check (user_id = (select auth.uid()));
create policy home_journey_events_update on public.home_journey_events for update using (user_id = (select auth.uid()));
create policy home_journey_events_delete on public.home_journey_events for delete using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.home_journey_events to authenticated;
