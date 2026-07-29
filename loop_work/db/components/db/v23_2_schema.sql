-- V23.2: UI/platform polish for people, date display and profile metadata

alter table if exists people
  add column if not exists avatar_url text;

alter table if exists app_user_profiles
  add column if not exists date_display_format text not null default 'age_and_date',
  add column if not exists default_person_image_mode text not null default 'avatar_url';

-- Keep values predictable for the UI
alter table if exists app_user_profiles
  drop constraint if exists app_user_profiles_date_display_format_check;
alter table if exists app_user_profiles
  add constraint app_user_profiles_date_display_format_check
  check (date_display_format in ('ddmmyyyy', 'long', 'age', 'age_and_date'));

alter table if exists app_user_profiles
  drop constraint if exists app_user_profiles_default_person_image_mode_check;
alter table if exists app_user_profiles
  add constraint app_user_profiles_default_person_image_mode_check
  check (default_person_image_mode in ('avatar_url', 'initials'));

notify pgrst, 'reload schema';
