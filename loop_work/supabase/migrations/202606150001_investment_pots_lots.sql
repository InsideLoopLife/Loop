-- V23.4 investment pot/holding purchase lot model
-- Run after V23.3.

create table if not exists investment_purchase_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  holding_id uuid not null references investment_holdings(id) on delete cascade,
  purchase_date date not null default current_date,
  units numeric(22,8) not null default 0,
  purchase_price numeric(18,8) not null default 0,
  price_quote_unit text not null default 'gbp',
  currency text not null default 'GBP',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table investment_purchase_lots enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'investment_purchase_lots' and policyname = 'Users can read their own investment purchase lots') then
    create policy "Users can read their own investment purchase lots" on investment_purchase_lots for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'investment_purchase_lots' and policyname = 'Users can insert their own investment purchase lots') then
    create policy "Users can insert their own investment purchase lots" on investment_purchase_lots for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'investment_purchase_lots' and policyname = 'Users can update their own investment purchase lots') then
    create policy "Users can update their own investment purchase lots" on investment_purchase_lots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'investment_purchase_lots' and policyname = 'Users can delete their own investment purchase lots') then
    create policy "Users can delete their own investment purchase lots" on investment_purchase_lots for delete using (auth.uid() = user_id);
  end if;
end $$;

create index if not exists investment_purchase_lots_user_idx on investment_purchase_lots(user_id);
create index if not exists investment_purchase_lots_holding_idx on investment_purchase_lots(holding_id);
create index if not exists investment_purchase_lots_date_idx on investment_purchase_lots(purchase_date);

notify pgrst, 'reload schema';
