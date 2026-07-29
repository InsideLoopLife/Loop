begin;

alter table public.app_user_profiles
  add column if not exists ui_navigation_layout_chosen_at timestamptz;

comment on column public.app_user_profiles.ui_navigation_layout_chosen_at is
  'Timestamp when the user explicitly chose top or side primary navigation. Null means LOOP should ask on the next signed-in visit.';

commit;
