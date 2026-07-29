-- V27.15 LoopHealth logging / menu-source / settings polish
-- Adds health settings used by the Nutrition page. Existing RLS on app_user_profiles continues to protect this data.

alter table if exists app_user_profiles
  add column if not exists health_child_scaling_enabled boolean not null default true,
  add column if not exists health_child_logging_enabled boolean not null default true,
  add column if not exists health_apple_health_enabled boolean not null default false;

create index if not exists app_user_profiles_health_settings_idx on app_user_profiles(user_id, health_child_scaling_enabled, health_child_logging_enabled);
