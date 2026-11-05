-- Applied 2026-11-04. These tables had no service_role access, so cron/worker writes failed.
grant select, insert, update, delete on table
  public.investment_dividend_events,
  public.investment_holding_tags,
  public.investment_reinvestment_allocations,
  public.investment_reinvestment_rules,
  public.investment_reinvestment_runs,
  public.investment_tags,
  public.lender_tracker_products,
  public.loop_briefing_chat_ai_gaps,
  public.loop_briefing_chat_days,
  public.route_boot_snapshots
to service_role;

-- Future tables created by postgres in public get service_role access automatically.
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public grant usage, select on sequences to service_role;
