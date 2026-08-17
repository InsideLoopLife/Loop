alter table public.app_user_profiles
  add column if not exists ui_mobile_navigation_layout text not null default 'bar'
    check (ui_mobile_navigation_layout in ('cards', 'bar')),
  add column if not exists ui_mobile_navigation_layout_chosen_at timestamptz;

comment on column public.app_user_profiles.ui_mobile_navigation_layout is
  'Mobile-only navigation preference. Independent from desktop top/side navigation.';

comment on column public.app_user_profiles.ui_mobile_navigation_layout_chosen_at is
  'When the user explicitly chose their mobile navigation layout.';
