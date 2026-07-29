-- v28.19.1 - future integration task_key hotfix
-- Use this only if the original v28.19 SQL failed at app_future_integration_tasks.task_key.

insert into public.app_future_integration_tasks (product_key, task_key, section, title, description, priority, status, metadata)
values
  ('investments', 'verify-snaptrade-cash-buckets', 'cash-and-lots', 'Verify SnapTrade cash buckets', 'Check whether each broker exposes free cash, dividend cash and ISA subscription data. If not, LOOP should expose manual overrides in pot settings.', 121, 'todo', '{}'::jsonb),
  ('investments', 'launch-manual-pie-mapper', 'pie-mapping', 'Launch manual pie mapper', 'Allow users to select imported holdings and save local Trading 212-style pie/group labels when SnapTrade does not supply pie membership.', 122, 'todo', '{}'::jsonb),
  ('savings', 'expand-uk-provider-catalogue', 'provider-relationships', 'Expand UK provider catalogue', 'Search-based UK bank/building society provider picker replaces fixed visible bank tiles and supports app banks like Revolut.', 123, 'todo', '{}'::jsonb),
  ('savings', 'automate-savings-rate-source-checks', 'source-jobs', 'Automate savings rate source checks', 'Run source check, savings watch and stale deal expiry on cron once admin-reviewed source rules are stable.', 124, 'todo', '{}'::jsonb)
on conflict (product_key, task_key) do update set
  section = excluded.section,
  title = excluded.title,
  description = excluded.description,
  priority = excluded.priority,
  status = case
    when public.app_future_integration_tasks.status = 'done' then public.app_future_integration_tasks.status
    else excluded.status
  end,
  metadata = excluded.metadata,
  updated_at = now();
