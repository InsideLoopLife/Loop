-- v28.19 - savings bank search, investment cash/dividend cash split, market status + manual pie mapping polish

alter table investment_accounts add column if not exists provider_investable_cash_value numeric(14,2);
alter table investment_accounts add column if not exists provider_dividend_cash_value numeric(14,2);
alter table investment_accounts add column if not exists provider_cash_source text;

comment on column investment_accounts.provider_cash_value is 'Total provider cash available for this account/wrapper where supplied or manually overridden.';
comment on column investment_accounts.provider_investable_cash_value is 'Free/main cash available to invest; useful when provider splits main cash and dividends waiting to reinvest.';
comment on column investment_accounts.provider_dividend_cash_value is 'Cash/dividends waiting to be reinvested inside the wrapper, where provider or user supplies it.';
comment on column investment_accounts.provider_cash_source is 'provider_cash_field, balance_minus_positions, manual_override or other source label.';

-- Existing rows keep provider_cash_value. Users can edit the pot settings to split it into main cash and dividend cash.
update investment_accounts
set provider_cash_source = coalesce(provider_cash_source, 'existing_or_manual')
where provider_cash_value is not null
  and provider_cash_source is null;

-- Optional launch checklist rows for the admin Future Integrations panel.
-- app_future_integration_tasks.task_key is NOT NULL and has a unique(product_key, task_key) constraint,
-- so every seed row needs a stable key.
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
