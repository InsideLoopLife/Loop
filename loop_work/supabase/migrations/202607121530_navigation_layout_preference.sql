alter table public.app_user_profiles
  add column if not exists ui_navigation_layout text not null default 'side'
  check (ui_navigation_layout in ('top', 'side'));

comment on column public.app_user_profiles.ui_navigation_layout is
  'User-selected primary navigation presentation: top or side.';
