alter table public.app_user_profiles
  add column if not exists pension_view_mode text not null default 'cards';

alter table public.app_user_profiles
  drop constraint if exists app_user_profiles_pension_view_mode_check;

alter table public.app_user_profiles
  add constraint app_user_profiles_pension_view_mode_check
  check (pension_view_mode in ('cards', 'full'));

comment on column public.app_user_profiles.pension_view_mode is
  'Preferred pension detail layout: compact cards or always-expanded full width.';
