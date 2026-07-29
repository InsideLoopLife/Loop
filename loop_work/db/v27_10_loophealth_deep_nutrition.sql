-- V27.10 — LoopHealth deep nutrition model
-- Adds sub-macro nutrition fields, ingredient mass-ratio transparency, confidence reasons,
-- allergen / dietary flags and commercial-food manufacturing notes.

alter table meals add column if not exists soluble_fibre_g numeric(10,2) not null default 0;
alter table meals add column if not exists insoluble_fibre_g numeric(10,2) not null default 0;
alter table meals add column if not exists added_sugar_g numeric(10,2) not null default 0;
alter table meals add column if not exists natural_sugar_g numeric(10,2) not null default 0;
alter table meals add column if not exists trans_fat_g numeric(10,2) not null default 0;
alter table meals add column if not exists monounsaturated_fat_g numeric(10,2) not null default 0;
alter table meals add column if not exists polyunsaturated_fat_g numeric(10,2) not null default 0;
alter table meals add column if not exists folate_ug numeric(10,2) not null default 0;
alter table meals add column if not exists niacin_mg numeric(10,2) not null default 0;
alter table meals add column if not exists thiamin_mg numeric(10,2) not null default 0;
alter table meals add column if not exists energy_density_kcal_per_g numeric(10,2) not null default 0;
alter table meals add column if not exists glycemic_impact_score integer not null default 0;
alter table meals add column if not exists ingredient_ratio_json jsonb not null default '[]'::jsonb;
alter table meals add column if not exists allergen_flags text[] not null default '{}'::text[];
alter table meals add column if not exists dietary_flags text[] not null default '{}'::text[];
alter table meals add column if not exists manufacturing_notes text[] not null default '{}'::text[];
alter table meals add column if not exists confidence_reason text;
alter table meals add column if not exists processing_level text not null default 'unknown' check (processing_level in ('low','medium','high','unknown'));

alter table food_logs add column if not exists soluble_fibre_g numeric(10,2) not null default 0;
alter table food_logs add column if not exists insoluble_fibre_g numeric(10,2) not null default 0;
alter table food_logs add column if not exists added_sugar_g numeric(10,2) not null default 0;
alter table food_logs add column if not exists natural_sugar_g numeric(10,2) not null default 0;
alter table food_logs add column if not exists trans_fat_g numeric(10,2) not null default 0;
alter table food_logs add column if not exists monounsaturated_fat_g numeric(10,2) not null default 0;
alter table food_logs add column if not exists polyunsaturated_fat_g numeric(10,2) not null default 0;
alter table food_logs add column if not exists folate_ug numeric(10,2) not null default 0;
alter table food_logs add column if not exists niacin_mg numeric(10,2) not null default 0;
alter table food_logs add column if not exists thiamin_mg numeric(10,2) not null default 0;
alter table food_logs add column if not exists energy_density_kcal_per_g numeric(10,2) not null default 0;
alter table food_logs add column if not exists glycemic_impact_score integer not null default 0;

create index if not exists meals_user_processing_idx on meals(user_id, processing_level, created_at desc);
create index if not exists meals_user_allergen_flags_idx on meals using gin(allergen_flags);
create index if not exists meals_user_dietary_flags_idx on meals using gin(dietary_flags);

notify pgrst, 'reload schema';
