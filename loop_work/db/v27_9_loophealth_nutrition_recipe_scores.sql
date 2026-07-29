-- V27.9 — LoopHealth nutrition score, recipe cards and food logging
-- Extends the existing lifestyle meal table with per-serving macro/micro estimates.
-- Adds a food log so the daily score can swing based on what was actually eaten/drunk.

alter table meals add column if not exists meal_category text not null default 'recipe';
alter table meals add column if not exists image_prompt text;
alter table meals add column if not exists adult_serving_multiplier numeric(8,2) not null default 1;
alter table meals add column if not exists child_serving_multiplier numeric(8,2) not null default 0.55;
alter table meals add column if not exists saturated_fat_g numeric(10,2) not null default 0;
alter table meals add column if not exists sodium_mg numeric(10,2) not null default 0;
alter table meals add column if not exists potassium_mg numeric(10,2) not null default 0;
alter table meals add column if not exists calcium_mg numeric(10,2) not null default 0;
alter table meals add column if not exists iron_mg numeric(10,2) not null default 0;
alter table meals add column if not exists magnesium_mg numeric(10,2) not null default 0;
alter table meals add column if not exists zinc_mg numeric(10,2) not null default 0;
alter table meals add column if not exists vitamin_c_mg numeric(10,2) not null default 0;
alter table meals add column if not exists vitamin_d_ug numeric(10,2) not null default 0;
alter table meals add column if not exists vitamin_b12_ug numeric(10,2) not null default 0;
alter table meals add column if not exists omega_3_g numeric(10,2) not null default 0;
alter table meals add column if not exists caffeine_mg numeric(10,2) not null default 0;
alter table meals add column if not exists nutrition_score integer not null default 0;
alter table meals add column if not exists nutrition_confidence integer not null default 0;
alter table meals add column if not exists ingredients_json jsonb not null default '[]'::jsonb;
alter table meals add column if not exists nutrition_json jsonb not null default '{}'::jsonb;

create table if not exists food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  meal_id uuid references meals(id) on delete set null,
  eaten_on date not null default current_date,
  meal_slot text not null default 'meal' check (meal_slot in ('breakfast','lunch','dinner','snack','drink','meal')),
  serving_multiplier numeric(8,2) not null default 1,
  label text not null,
  image_url text,
  calories numeric(10,2) not null default 0,
  protein_g numeric(10,2) not null default 0,
  carbs_g numeric(10,2) not null default 0,
  fat_g numeric(10,2) not null default 0,
  fibre_g numeric(10,2) not null default 0,
  sugar_g numeric(10,2) not null default 0,
  salt_g numeric(10,2) not null default 0,
  saturated_fat_g numeric(10,2) not null default 0,
  sodium_mg numeric(10,2) not null default 0,
  potassium_mg numeric(10,2) not null default 0,
  calcium_mg numeric(10,2) not null default 0,
  iron_mg numeric(10,2) not null default 0,
  magnesium_mg numeric(10,2) not null default 0,
  zinc_mg numeric(10,2) not null default 0,
  vitamin_c_mg numeric(10,2) not null default 0,
  vitamin_d_ug numeric(10,2) not null default 0,
  vitamin_b12_ug numeric(10,2) not null default 0,
  omega_3_g numeric(10,2) not null default 0,
  caffeine_mg numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table food_logs enable row level security;

drop policy if exists food_logs_select_own on food_logs;
create policy food_logs_select_own on food_logs for select using ((select auth.uid()) = user_id);
drop policy if exists food_logs_insert_own on food_logs;
create policy food_logs_insert_own on food_logs for insert with check ((select auth.uid()) = user_id);
drop policy if exists food_logs_update_own on food_logs;
create policy food_logs_update_own on food_logs for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists food_logs_delete_own on food_logs;
create policy food_logs_delete_own on food_logs for delete using ((select auth.uid()) = user_id);

create index if not exists food_logs_user_date_idx on food_logs(user_id, eaten_on desc);
create index if not exists food_logs_user_person_date_idx on food_logs(user_id, person_id, eaten_on desc);
create index if not exists food_logs_user_meal_idx on food_logs(user_id, meal_id);
create index if not exists meals_user_nutrition_idx on meals(user_id, nutrition_score desc, created_at desc);

notify pgrst, 'reload schema';
