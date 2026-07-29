-- v27.44 LoopHealth data quality engine
-- Separates product / drink product / ingredient / recipe logic, persists serving metadata,
-- and adds a correction queue for user-submitted labels/source URLs.

alter table if exists public.meals
  add column if not exists entity_type text not null default 'recipe' check (entity_type in ('ingredient','product','drink_product','meal','recipe','saved_meal_card','logged_serving')),
  add column if not exists canonical_product_name text,
  add column if not exists label_source_text text,
  add column if not exists serving_basis text,
  add column if not exists prepared_volume_ml integer not null default 0,
  add column if not exists fluid_ml_per_serving integer not null default 0,
  add column if not exists powder_weight_g numeric(10,2) not null default 0,
  add column if not exists product_category text,
  add column if not exists correction_status text not null default 'none' check (correction_status in ('none','queued','processing','corrected','rejected')),
  add column if not exists nutrition_version integer not null default 1;

alter table if exists public.food_logs
  add column if not exists entity_type text not null default 'logged_serving' check (entity_type in ('ingredient','product','drink_product','meal','recipe','saved_meal_card','logged_serving')),
  add column if not exists canonical_product_name text,
  add column if not exists label_source_text text,
  add column if not exists serving_basis text,
  add column if not exists prepared_volume_ml integer not null default 0,
  add column if not exists fluid_ml_per_serving integer not null default 0,
  add column if not exists powder_weight_g numeric(10,2) not null default 0,
  add column if not exists product_category text,
  add column if not exists correction_status text not null default 'none' check (correction_status in ('none','queued','processing','corrected','rejected')),
  add column if not exists nutrition_version integer not null default 1;

alter table if exists public.nutrition_ingredients
  add column if not exists entity_type text not null default 'ingredient' check (entity_type in ('ingredient','product','drink_product','meal','recipe','saved_meal_card','logged_serving')),
  add column if not exists canonical_product_name text,
  add column if not exists serving_basis text,
  add column if not exists prepared_volume_ml integer not null default 0,
  add column if not exists fluid_ml_per_serving integer not null default 0,
  add column if not exists powder_weight_g numeric(10,2) not null default 0,
  add column if not exists correction_status text not null default 'none' check (correction_status in ('none','queued','processing','corrected','rejected')),
  add column if not exists nutrition_version integer not null default 1;

create table if not exists public.nutrition_product_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_id uuid references public.meals(id) on delete set null,
  ingredient_id uuid references public.nutrition_ingredients(id) on delete set null,
  label text not null,
  issue_type text not null default 'nutrition_correction',
  source_url text,
  label_image_url text,
  notes text,
  status text not null default 'queued' check (status in ('queued','processing','corrected','rejected','failed')),
  old_payload jsonb not null default '{}'::jsonb,
  corrected_payload jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nutrition_product_corrections enable row level security;

drop policy if exists nutrition_product_corrections_select_own on public.nutrition_product_corrections;
create policy nutrition_product_corrections_select_own
on public.nutrition_product_corrections for select
using (auth.uid() = user_id);

drop policy if exists nutrition_product_corrections_insert_own on public.nutrition_product_corrections;
create policy nutrition_product_corrections_insert_own
on public.nutrition_product_corrections for insert
with check (auth.uid() = user_id);

drop policy if exists nutrition_product_corrections_update_own on public.nutrition_product_corrections;
create policy nutrition_product_corrections_update_own
on public.nutrition_product_corrections for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists meals_user_entity_type_idx on public.meals(user_id, entity_type, updated_at desc);
create index if not exists food_logs_user_entity_type_idx on public.food_logs(user_id, entity_type, eaten_on desc);
create index if not exists nutrition_ingredients_user_entity_type_idx on public.nutrition_ingredients(user_id, entity_type, last_used_at desc nulls last);
create index if not exists nutrition_product_corrections_user_status_idx on public.nutrition_product_corrections(user_id, status, requested_at desc);

-- Repair obvious historical GFuel entries that were logged as freehand/ingredients.
update public.meals
set
  label = 'GFuel Hype Sauce 2.0',
  canonical_product_name = 'GFuel Hype Sauce 2.0',
  entity_type = 'drink_product',
  card_kind = 'product',
  product_category = 'powdered_drink',
  serving_basis = coalesce(serving_basis, 'per_scoop_prepared_drink'),
  prepared_volume_ml = greatest(prepared_volume_ml, 500),
  fluid_ml_per_serving = greatest(fluid_ml_per_serving, 500),
  powder_weight_g = case when powder_weight_g = 0 then 6.2 else powder_weight_g end,
  calories = case when calories > 60 or calories = 0 then 15 else calories end,
  carbs_g = case when carbs_g > 10 then 3 else carbs_g end,
  caffeine_mg = case when caffeine_mg = 0 then 140 else caffeine_mg end,
  nutrition_confidence = greatest(coalesce(nutrition_confidence, 0), 88),
  confidence_reason = 'Auto-repaired by v27.44: recognised as a powdered drink product. Nutrition is per scoop; fluid is prepared volume.',
  updated_at = now()
where user_id is not null
  and lower(label) ~ '(g\s*fuel|gfuel).*hype\s*sauce|hype\s*sauce.*(g\s*fuel|gfuel)';

update public.food_logs
set
  label = 'GFuel Hype Sauce 2.0',
  canonical_product_name = 'GFuel Hype Sauce 2.0',
  entity_type = 'drink_product',
  product_category = 'powdered_drink',
  meal_slot = 'drink',
  serving_basis = coalesce(serving_basis, 'per_scoop_prepared_drink'),
  prepared_volume_ml = greatest(prepared_volume_ml, 500),
  fluid_ml_per_serving = greatest(fluid_ml_per_serving, 500),
  drink_volume_ml = case when drink_volume_ml = 0 then 500 else drink_volume_ml end,
  powder_weight_g = case when powder_weight_g = 0 then 6.2 else powder_weight_g end,
  calories = case when calories > 60 or calories = 0 then 15 else calories end,
  carbs_g = case when carbs_g > 10 then 3 else carbs_g end,
  caffeine_mg = case when caffeine_mg = 0 then 140 else caffeine_mg end,
  nutrition_version = greatest(nutrition_version, 2)
where user_id is not null
  and lower(label) ~ '(g\s*fuel|gfuel).*hype\s*sauce|hype\s*sauce.*(g\s*fuel|gfuel)';

notify pgrst, 'reload schema';
