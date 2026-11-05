-- Applied 2026-11-04. Cron jobs (service_role) were failing with
-- "permission denied for table retirement_economic_assumptions".
grant select, insert, update, delete on table public.retirement_economic_assumptions to service_role;
