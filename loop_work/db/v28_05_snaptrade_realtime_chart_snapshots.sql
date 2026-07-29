-- v28.05 - SnapTrade provider snapshots for realtime/intraday charts
-- SnapTrade returns current positions/balances; LOOP stores each refresh as chart history.

alter table if exists public.investment_price_snapshots
  add column if not exists snapshot_at timestamptz not null default now();

create index if not exists investment_price_snapshots_provider_source_idx
  on public.investment_price_snapshots(user_id, source, snapshot_at desc);

create index if not exists investment_accounts_snaptrade_active_idx
  on public.investment_accounts(user_id, external_provider, record_status, last_provider_sync_at desc)
  where external_provider = 'snaptrade';

create index if not exists investment_holdings_snaptrade_active_idx
  on public.investment_holdings(user_id, investment_account_id, external_provider, record_status, last_provider_sync_at desc)
  where external_provider = 'snaptrade';

insert into public.wealth_watch_settings(setting_key, setting_value, description)
values
  ('snaptrade_snapshot_cron_minutes', '15', 'How often the provider snapshot cron should refresh eligible realtime SnapTrade accounts.'),
  ('snaptrade_snapshot_realtime_only', 'true', 'Only create automatic SnapTrade chart snapshots for users entitled to realtime provider-backed tracking.')
on conflict (setting_key) do nothing;

-- Backfill one current snapshot for existing active SnapTrade holdings so newly-imported
-- accounts can display at least one point before the next provider refresh.
insert into public.investment_price_snapshots(user_id, holding_id, price, units, value, snapshot_date, snapshot_at, source)
select
  h.user_id,
  h.id,
  case
    when coalesce(h.latest_price, 0) > 0 then h.latest_price
    when coalesce(h.units, 0) > 0 then coalesce(h.imported_current_value, 0) / nullif(h.units, 0)
    else coalesce(h.imported_current_value, 0)
  end as price,
  case when coalesce(h.units, 0) > 0 then h.units else 1 end as units,
  case
    when coalesce(h.imported_current_value, 0) > 0 then h.imported_current_value
    else coalesce(h.units, 0) * coalesce(h.latest_price, 0)
  end as value,
  current_date,
  now(),
  'snaptrade:backfill-current-value'
from public.investment_holdings h
where lower(coalesce(h.external_provider, '')) = 'snaptrade'
  and coalesce(h.record_status, 'active') <> 'archived'
  and (
    coalesce(h.imported_current_value, 0) > 0
    or (coalesce(h.units, 0) > 0 and coalesce(h.latest_price, 0) > 0)
  )
  and not exists (
    select 1
    from public.investment_price_snapshots s
    where s.user_id = h.user_id
      and s.holding_id = h.id
      and s.snapshot_at >= now() - interval '12 hours'
      and s.source ilike 'snaptrade:%'
  );
