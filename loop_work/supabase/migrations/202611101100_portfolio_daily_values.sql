-- Last recorded whole-portfolio value per day, for the Pensions & investments
-- summary line. SECURITY INVOKER: the caller's RLS decides what's visible.
create or replace function public.loop_portfolio_daily_values(p_user_id uuid, p_days integer default 180)
returns table (day date, value numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (s.snapshot_at::date) s.snapshot_at::date as day, s.total_value_gbp as value
  from public.investment_portfolio_value_snapshots s
  where s.user_id = p_user_id
    and s.scope_key = 'portfolio'
    and s.snapshot_at >= now() - make_interval(days => greatest(1, least(p_days, 1000)))
    and s.total_value_gbp > 0
  order by s.snapshot_at::date, s.snapshot_at desc;
$$;
grant execute on function public.loop_portfolio_daily_values(uuid, integer) to authenticated;
