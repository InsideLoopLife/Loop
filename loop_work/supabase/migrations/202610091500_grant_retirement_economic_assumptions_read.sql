-- The read policy (retirement_economic_assumptions_authenticated_read)
-- existed, but signed-in users had no table-level SELECT grant, so the
-- retirement page's CPIH lookup returned 403 and silently fell back.
-- Applied to production 2026-10-09.
grant select on table public.retirement_economic_assumptions to authenticated;
