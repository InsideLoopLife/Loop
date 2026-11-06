alter table public.income_entries drop constraint income_entries_frequency_check;
alter table public.income_entries add constraint income_entries_frequency_check check (frequency = any (array['monthly','annual','weekly','quarterly','one_off']));
