-- Support real four-weekly household income/payment calendars (for example Child Benefit).
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'planned_items_recurrence_check') then
    alter table public.planned_items drop constraint planned_items_recurrence_check;
  end if;
  alter table public.planned_items add constraint planned_items_recurrence_check
    check (recurrence in ('monthly', 'four_weekly', 'one_off'));
end $$;

notify pgrst, 'reload schema';
