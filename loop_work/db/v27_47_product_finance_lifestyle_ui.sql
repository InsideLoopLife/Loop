
-- v27.47 Inside LOOP polish: product label accuracy, health baseline profile fields, UI support

alter table if exists public.app_user_profiles
  add column if not exists health_height_cm numeric,
  add column if not exists health_weight_kg numeric,
  add column if not exists health_sex text default 'not_set',
  add column if not exists health_activity_level text default 'not_set',
  add column if not exists health_goal text default 'general',
  add column if not exists health_training_load text;

alter table if exists public.meals
  add column if not exists product_image_url text,
  add column if not exists product_source_url text,
  add column if not exists product_data_source text,
  add column if not exists product_data_confidence numeric,
  add column if not exists card_kind text,
  add column if not exists carbs_g numeric default 0,
  add column if not exists fat_g numeric default 0,
  add column if not exists sugar_g numeric default 0,
  add column if not exists added_sugar_g numeric default 0,
  add column if not exists saturated_fat_g numeric default 0,
  add column if not exists sodium_mg numeric default 0,
  add column if not exists potassium_mg numeric default 0,
  add column if not exists calcium_mg numeric default 0,
  add column if not exists iron_mg numeric default 0,
  add column if not exists magnesium_mg numeric default 0,
  add column if not exists zinc_mg numeric default 0,
  add column if not exists folate_ug numeric default 0,
  add column if not exists niacin_mg numeric default 0,
  add column if not exists thiamin_mg numeric default 0,
  add column if not exists vitamin_c_mg numeric default 0,
  add column if not exists vitamin_d_ug numeric default 0,
  add column if not exists vitamin_b12_ug numeric default 0,
  add column if not exists caffeine_mg numeric default 0;

update public.meals
set product_image_url = coalesce(product_image_url, image_url)
where product_image_url is null and image_url is not null;

create index if not exists meals_user_card_kind_idx on public.meals(user_id, card_kind);
create index if not exists meals_user_product_data_source_idx on public.meals(user_id, product_data_source);
