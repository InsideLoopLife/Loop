-- Applied 2026-11-04. Supabase security advisor: function_search_path_mutable.
alter function public.app_first_working_day_of_month(p_month date) set search_path = public, pg_temp;
