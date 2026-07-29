-- v27.27 LoopHealth ingredients + daily quick-card fixes
-- Adds a lightweight household ingredient/product database for URL-imported and repeatedly used items.

create table if not exists public.nutrition_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid null,
  meal_id uuid null references public.meals(id) on delete set null,
  label text not null,
  brand_name text null,
  source_url text null,
  image_url text null,
  source_type text not null default 'manual',
  data_confidence integer not null default 0,
  serving_label text null,
  ingredients_text text null,
  ingredients_json jsonb not null default '[]'::jsonb,
  nutrition_json jsonb not null default '{}'::jsonb,
  allergen_flags text[] not null default '{}',
  dietary_flags text[] not null default '{}',
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  fibre_g numeric not null default 0,
  sugar_g numeric not null default 0,
  salt_g numeric not null default 0,
  saturated_fat_g numeric not null default 0,
  caffeine_mg numeric not null default 0,
  use_count integer not null default 0,
  last_used_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nutrition_ingredients enable row level security;

do $$ begin
  create policy "nutrition_ingredients_select_own" on public.nutrition_ingredients for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "nutrition_ingredients_insert_own" on public.nutrition_ingredients for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "nutrition_ingredients_update_own" on public.nutrition_ingredients for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "nutrition_ingredients_delete_own" on public.nutrition_ingredients for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create index if not exists nutrition_ingredients_user_label_idx on public.nutrition_ingredients (user_id, lower(label));
create index if not exists nutrition_ingredients_user_source_idx on public.nutrition_ingredients (user_id, source_url) where source_url is not null;
create index if not exists nutrition_ingredients_user_used_idx on public.nutrition_ingredients (user_id, last_used_at desc nulls last, use_count desc);

alter table public.meals add column if not exists card_kind text not null default 'recipe';
create index if not exists meals_user_card_kind_idx on public.meals (user_id, card_kind, created_at desc);
