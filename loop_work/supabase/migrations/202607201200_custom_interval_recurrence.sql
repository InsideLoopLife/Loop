-- Support a fully custom "every X days" / "every X weeks" recurrence on planned items,
-- in addition to the existing monthly / four_weekly / one_off options.
alter table public.planned_items
  add column if not exists recurrence_interval_days integer;

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'planned_items_recurrence_check') then
    alter table public.planned_items drop constraint planned_items_recurrence_check;
  end if;
  alter table public.planned_items add constraint planned_items_recurrence_check
    check (recurrence in ('monthly', 'four_weekly', 'custom_interval', 'one_off'));
end $$;

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'planned_items_custom_interval_days_check') then
    alter table public.planned_items drop constraint planned_items_custom_interval_days_check;
  end if;
  alter table public.planned_items add constraint planned_items_custom_interval_days_check
    check (recurrence <> 'custom_interval' or (recurrence_interval_days is not null and recurrence_interval_days > 0));
end $$;

notify pgrst, 'reload schema';
