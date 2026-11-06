alter table public.planned_items drop constraint planned_items_recurrence_check;
alter table public.planned_items add constraint planned_items_recurrence_check check (recurrence = any (array['monthly','four_weekly','custom_interval','one_off','quarterly','annual']));
