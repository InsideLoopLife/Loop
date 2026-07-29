-- v27.35: food timing, hydration tracking, editable saved images and AI/freehand logging preferences

alter table if exists food_logs
  add column if not exists eaten_at time,
  add column if not exists drink_volume_ml integer not null default 0;

alter table if exists app_user_profiles
  add column if not exists health_prompt_for_time_enabled boolean not null default true;

create index if not exists food_logs_user_eaten_time_idx
  on food_logs(user_id, eaten_on desc, eaten_at);

notify pgrst, 'reload schema';
