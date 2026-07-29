-- V18: pension research + lifestyle / deal / food planning

create table if not exists pension_fund_research_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pension_fund_id uuid references pension_funds(id) on delete cascade,
  provider text,
  fund_name text not null,
  status text not null default 'draft' check (status in ('draft', 'reviewed', 'accepted', 'ignored')),
  suggested_fee_percent numeric(7,4),
  suggested_fund_code text,
  suggested_group_label text,
  suggested_source_url text,
  confidence numeric(6,2) not null default 0,
  research_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists deal_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  label text not null,
  provider text not null,
  category text not null default 'utilities',
  monthly_cost numeric(12,2) not null default 0,
  billing_day integer,
  contract_start date,
  contract_end date,
  notice_days integer not null default 45,
  comparison_url text,
  account_reference text,
  auto_recommendation_enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists grocery_supermarkets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  location_label text,
  online_url text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  label text not null,
  source_url text,
  image_url text,
  servings numeric(8,2) not null default 1,
  estimated_cost numeric(12,2) not null default 0,
  supermarket_id uuid references grocery_supermarkets(id) on delete set null,
  calories numeric(10,2) not null default 0,
  protein_g numeric(10,2) not null default 0,
  carbs_g numeric(10,2) not null default 0,
  fat_g numeric(10,2) not null default 0,
  fibre_g numeric(10,2) not null default 0,
  sugar_g numeric(10,2) not null default 0,
  salt_g numeric(10,2) not null default 0,
  ingredients text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists grocery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid references meals(id) on delete cascade,
  name text not null,
  quantity text,
  estimated_price numeric(12,2) not null default 0,
  supermarket text,
  barcode text,
  calories numeric(10,2) not null default 0,
  protein_g numeric(10,2) not null default 0,
  carbs_g numeric(10,2) not null default 0,
  fat_g numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table pension_fund_research_notes enable row level security;
alter table deal_bills enable row level security;
alter table grocery_supermarkets enable row level security;
alter table meals enable row level security;
alter table grocery_items enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['pension_fund_research_notes','deal_bills','grocery_supermarkets','meals','grocery_items'] loop
    execute format('drop policy if exists %I on %I', t || '_select_own', t);
    execute format('create policy %I on %I for select using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('drop policy if exists %I on %I', t || '_insert_own', t);
    execute format('create policy %I on %I for insert with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('drop policy if exists %I on %I', t || '_update_own', t);
    execute format('create policy %I on %I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('drop policy if exists %I on %I', t || '_delete_own', t);
    execute format('create policy %I on %I for delete using ((select auth.uid()) = user_id)', t || '_delete_own', t);
  end loop;
end $$;

create index if not exists pension_fund_research_notes_user_fund_idx on pension_fund_research_notes(user_id, pension_fund_id, created_at desc);
create index if not exists deal_bills_user_end_idx on deal_bills(user_id, contract_end);
create index if not exists deal_bills_user_person_idx on deal_bills(user_id, person_id);
create index if not exists meals_user_person_idx on meals(user_id, person_id, created_at desc);
create index if not exists grocery_items_user_meal_idx on grocery_items(user_id, meal_id);

notify pgrst, 'reload schema';
