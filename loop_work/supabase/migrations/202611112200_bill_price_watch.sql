-- Answers to LOOP's price-change heads-ups on bills: "added to my plan",
-- "not for me", "it's fixed until…", "it isn't fixed", or what the service is
-- ("broadband" / "mobile"), so each question is only asked once.
create table if not exists public.bill_price_watch (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid,
  planned_item_id uuid references public.planned_items(id) on delete cascade,
  watch_key text not null,
  response text not null check (response in ('applied', 'dismissed', 'fixed', 'variable', 'service')),
  value text,
  fixed_until date,
  created_at timestamptz not null default now(),
  unique (user_id, watch_key)
);
create index if not exists bill_price_watch_item_idx on public.bill_price_watch (planned_item_id);
alter table public.bill_price_watch enable row level security;
create policy bill_price_watch_select on public.bill_price_watch for select using (user_id = (select auth.uid()) or app_same_active_household(user_id));
create policy bill_price_watch_insert on public.bill_price_watch for insert with check (user_id = (select auth.uid()));
create policy bill_price_watch_update on public.bill_price_watch for update using (user_id = (select auth.uid()));
create policy bill_price_watch_delete on public.bill_price_watch for delete using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.bill_price_watch to authenticated;
