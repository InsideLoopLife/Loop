-- LOOP v28.21.1 - app_future_integration_tasks priority hotfix
-- Use if v28.21 failed with: column "sort_order" does not exist.
-- Safe to run more than once. Preserves completed checklist status.

insert into public.app_future_integration_tasks(product_key, task_key, section, title, description, priority, status, metadata)
values
  ('investments', 'trading212-direct-api-cash-pl', 'cash-and-lots', 'Trading 212 direct API cash and P/L validation', 'Use Trading 212 account summary, positions, historical orders, dividend payments and cash transactions to improve cash buckets, ISA allowance, purchase lots and daily/true P/L when SnapTrade does not expose them.', 122, 'todo', '{}'::jsonb),
  ('savings', 'seed-uk-savings-source-universe', 'source-jobs', 'Seed UK savings source universe', 'Keep the default UK savings provider/best-buy source list active so admins do not have to paste each provider page individually.', 123, 'todo', '{}'::jsonb),
  ('mortgage', 'seed-uk-mortgage-source-universe', 'source-jobs', 'Seed UK mortgage source universe', 'Keep the default UK mortgage lender source list active so the catalogue refresh checks broad lender coverage without manual source entry.', 124, 'todo', '{}'::jsonb)
on conflict (product_key, task_key) do update set
  title = excluded.title,
  description = excluded.description,
  section = excluded.section,
  priority = excluded.priority,
  status = case
    when public.app_future_integration_tasks.status = 'done' then public.app_future_integration_tasks.status
    else excluded.status
  end,
  metadata = excluded.metadata,
  updated_at = now();
