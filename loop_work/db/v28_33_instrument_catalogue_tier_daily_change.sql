-- v28.33 Instrument catalogue, tier cadence and daily change baseline
-- Run after v28.32. This upgrades the existing market worker schema safely.

create extension if not exists pgcrypto;

create or replace function public.loop_normalise_investment_venue(p_exchange text, p_ticker text default null)
returns text
language plpgsql
immutable
as $$
declare
  ex text := upper(trim(coalesce(p_exchange, '')));
  tk text := upper(trim(coalesce(p_ticker, '')));
begin
  if ex in ('XLON','XLSE','LON','LSE','LDN','LONDON') or tk like '%.L' or tk like '%.UK' then return 'LSE'; end if;
  if ex in ('XNAS','XNCM','XNGS','NMS','NGM','NAS','NASDAQGS','NASDAQ','NCM') then return 'NASDAQ'; end if;
  if ex in ('XNYS','NYQ','NYSE') then return 'NYSE'; end if;
  if ex in ('XASE','ASE','AMEX','NYSEAMERICAN') then return 'AMEX'; end if;
  if ex in ('OTCM','OTC','OOTC') then return 'OTCM'; end if;
  if ex in ('PINX','PINK','OTC PINK','OTCPK') then return 'PINX'; end if;
  if ex in ('XETR','ETR','IBIS','XETRA') or tk like '%.DE' then return 'XETR'; end if;
  if ex in ('XFRA','FRA','FRANKFURT') or tk like '%.F' then return 'XFRA'; end if;
  if ex in ('XPAR','PAR','EPA','EURONEXT PARIS','PARIS') or tk like '%.PA' then return 'XPAR'; end if;
  if ex in ('XAMS','AMS','AS','EURONEXT AMSTERDAM') or tk like '%.AS' then return 'XAMS'; end if;
  if ex in ('XMIL','MIL','MI','MILAN') or tk like '%.MI' then return 'XMIL'; end if;
  if ex in ('XSWX','SWX','SW','SIX','SWISS') or tk like '%.SW' then return 'XSWX'; end if;
  if ex in ('XTSE','TSE','TO','TSX') or tk like '%.TO' then return 'XTSE'; end if;
  if ex in ('VANGUARD','YAHOO FUND','FUND') then return 'VANGUARD'; end if;
  return nullif(ex, '');
end $$;

create table if not exists public.investment_market_venues (
  id uuid primary key default gen_random_uuid(),
  venue_code text not null unique,
  venue_mic text,
  operating_mic text,
  name text,
  country_code text,
  currency text,
  timezone text,
  open_time time,
  close_time time,
  price_scale numeric not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.investment_market_venues
  (venue_code, venue_mic, operating_mic, name, country_code, currency, timezone, open_time, close_time, price_scale)
values
  ('LSE', 'XLON', 'XLON', 'London Stock Exchange', 'GB', 'GBX', 'Europe/London', '08:00', '16:30', 0.01),
  ('NASDAQ', 'XNAS', 'XNAS', 'NASDAQ', 'US', 'USD', 'America/New_York', '09:30', '16:00', 1),
  ('NYSE', 'XNYS', 'XNYS', 'New York Stock Exchange', 'US', 'USD', 'America/New_York', '09:30', '16:00', 1),
  ('AMEX', 'XASE', 'XASE', 'NYSE American', 'US', 'USD', 'America/New_York', '09:30', '16:00', 1),
  ('OTCM', 'OTCM', 'OTCM', 'OTC Markets', 'US', 'USD', 'America/New_York', '09:30', '16:00', 1),
  ('PINX', 'PINX', 'OTCM', 'OTC Pink', 'US', 'USD', 'America/New_York', '09:30', '16:00', 1),
  ('XETR', 'XETR', 'XETR', 'Xetra', 'DE', 'EUR', 'Europe/Berlin', '09:00', '17:30', 1),
  ('XFRA', 'XFRA', 'XFRA', 'Frankfurt Stock Exchange', 'DE', 'EUR', 'Europe/Berlin', '08:00', '22:00', 1),
  ('XPAR', 'XPAR', 'XPAR', 'Euronext Paris', 'FR', 'EUR', 'Europe/Paris', '09:00', '17:30', 1),
  ('XAMS', 'XAMS', 'XAMS', 'Euronext Amsterdam', 'NL', 'EUR', 'Europe/Amsterdam', '09:00', '17:30', 1),
  ('XMIL', 'XMIL', 'XMIL', 'Borsa Italiana', 'IT', 'EUR', 'Europe/Rome', '09:00', '17:30', 1),
  ('XSWX', 'XSWX', 'XSWX', 'SIX Swiss Exchange', 'CH', 'CHF', 'Europe/Zurich', '09:00', '17:30', 1),
  ('XTSE', 'XTSE', 'XTSE', 'Toronto Stock Exchange', 'CA', 'CAD', 'America/Toronto', '09:30', '16:00', 1),
  ('VANGUARD', null, null, 'Provider fund', 'GB', 'GBP', 'Europe/London', '00:00', '23:59', 1)
on conflict (venue_code) do update set
  venue_mic = excluded.venue_mic,
  operating_mic = excluded.operating_mic,
  name = excluded.name,
  country_code = excluded.country_code,
  currency = excluded.currency,
  timezone = excluded.timezone,
  open_time = excluded.open_time,
  close_time = excluded.close_time,
  price_scale = excluded.price_scale,
  updated_at = now();

create table if not exists public.investment_instruments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.investment_instruments
  add column if not exists ticker text,
  add column if not exists exchange_code text,
  add column if not exists exchange_name text,
  add column if not exists asset_name text,
  add column if not exists asset_kind text default 'share',
  add column if not exists canonical_name text,
  add column if not exists canonical_symbol text,
  add column if not exists isin text,
  add column if not exists currency_code text,
  add column if not exists quote_unit text,
  add column if not exists source_url text,
  add column if not exists coverage_status text default 'active',
  add column if not exists status text default 'active',
  add column if not exists resolution_status text default 'resolved',
  add column if not exists confidence numeric,
  add column if not exists first_seen_at timestamptz default now(),
  add column if not exists last_seen_at timestamptz default now();

create unique index if not exists investment_instruments_ticker_exchange_uidx
  on public.investment_instruments(ticker, exchange_code);
create unique index if not exists investment_instruments_isin_uidx
  on public.investment_instruments(isin) where isin is not null;

create table if not exists public.investment_instrument_listings (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid references public.investment_instruments(id) on delete cascade,
  symbol text not null,
  display_symbol text,
  broker_symbol text,
  broker_market_code text,
  venue_code text not null,
  venue_mic text,
  operating_mic text,
  data_provider text not null default 'market_worker',
  data_provider_symbol text,
  data_provider_exchange text,
  quote_currency text,
  price_currency text,
  price_scale numeric not null default 1,
  timezone text,
  market_open_time time,
  market_close_time time,
  priority integer not null default 100,
  active boolean not null default true,
  resolution_status text not null default 'resolved',
  resolution_notes text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists investment_instrument_listings_provider_symbol_market_uidx
  on public.investment_instrument_listings(data_provider, symbol, venue_code);

create table if not exists public.investment_instrument_aliases (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.investment_instrument_listings(id) on delete cascade,
  instrument_id uuid references public.investment_instruments(id) on delete cascade,
  alias_source text not null,
  alias_symbol text not null,
  alias_market_code text,
  alias_isin text,
  confidence numeric not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists investment_instrument_aliases_source_symbol_market_uidx
  on public.investment_instrument_aliases(alias_source, alias_symbol, alias_market_code);

alter table public.investment_holdings
  add column if not exists instrument_id uuid,
  add column if not exists listing_id uuid,
  add column if not exists instrument_resolution_status text default 'unresolved',
  add column if not exists instrument_resolution_notes text,
  add column if not exists latest_fx_rate_to_gbp numeric,
  add column if not exists latest_fx_source text,
  add column if not exists previous_close_price_gbp numeric,
  add column if not exists previous_close_native_price numeric,
  add column if not exists previous_close_native_currency text,
  add column if not exists previous_close_at timestamptz,
  add column if not exists day_change_gbp numeric,
  add column if not exists day_change_percent numeric,
  add column if not exists day_change_native numeric,
  add column if not exists day_change_native_percent numeric,
  add column if not exists cost_basis_status text default 'unknown';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'investment_holdings_instrument_id_fkey') then
    alter table public.investment_holdings add constraint investment_holdings_instrument_id_fkey foreign key (instrument_id) references public.investment_instruments(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'investment_holdings_listing_id_fkey') then
    alter table public.investment_holdings add constraint investment_holdings_listing_id_fkey foreign key (listing_id) references public.investment_instrument_listings(id);
  end if;
end $$;

create table if not exists public.investment_instrument_price_points (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.investment_instrument_price_points
  add column if not exists listing_id uuid,
  add column if not exists instrument_id uuid,
  add column if not exists ticker text,
  add column if not exists exchange_code text,
  add column if not exists price_gbp numeric,
  add column if not exists gbp_price numeric,
  add column if not exists native_price numeric,
  add column if not exists native_currency text,
  add column if not exists quote_unit text,
  add column if not exists fx_rate_to_gbp numeric,
  add column if not exists point_at timestamptz,
  add column if not exists observed_at timestamptz,
  add column if not exists price_minute timestamptz,
  add column if not exists point_date date,
  add column if not exists source text default 'market_worker',
  add column if not exists source_url text,
  add column if not exists source_confidence numeric,
  add column if not exists quality text default 'live',
  add column if not exists bucket_interval text default 'raw';

update public.investment_instrument_price_points
set point_at = coalesce(point_at, observed_at, created_at, now())
where point_at is null;
update public.investment_instrument_price_points
set observed_at = coalesce(observed_at, point_at, created_at, now())
where observed_at is null;
update public.investment_instrument_price_points
set price_minute = date_trunc('minute', coalesce(price_minute, point_at, observed_at, created_at, now()))
where price_minute is null;
update public.investment_instrument_price_points
set point_date = coalesce(point_date, point_at::date, created_at::date, now()::date)
where point_date is null;
update public.investment_instrument_price_points
set gbp_price = coalesce(gbp_price, price_gbp)
where gbp_price is null and price_gbp is not null;
update public.investment_instrument_price_points
set price_gbp = coalesce(price_gbp, gbp_price)
where price_gbp is null and gbp_price is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'investment_instrument_price_points_listing_id_fkey') then
    alter table public.investment_instrument_price_points add constraint investment_instrument_price_points_listing_id_fkey foreign key (listing_id) references public.investment_instrument_listings(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'investment_instrument_price_points_instrument_id_fkey') then
    alter table public.investment_instrument_price_points add constraint investment_instrument_price_points_instrument_id_fkey foreign key (instrument_id) references public.investment_instruments(id) on delete cascade;
  end if;
end $$;

drop index if exists public.investment_instrument_price_points_listing_minute_uidx;
create unique index if not exists investment_instrument_price_points_listing_minute_uidx
  on public.investment_instrument_price_points(listing_id, price_minute);
create index if not exists investment_instrument_price_points_listing_time_idx
  on public.investment_instrument_price_points(listing_id, price_minute desc);
create index if not exists investment_instrument_price_points_ticker_time_idx
  on public.investment_instrument_price_points(ticker, exchange_code, point_at desc);

alter table public.investment_price_snapshots
  add column if not exists instrument_id uuid,
  add column if not exists listing_id uuid,
  add column if not exists snapshot_minute timestamptz,
  add column if not exists native_price numeric,
  add column if not exists native_value numeric,
  add column if not exists native_currency text,
  add column if not exists fx_rate_to_gbp numeric,
  add column if not exists fx_source text,
  add column if not exists previous_close_price_gbp numeric,
  add column if not exists previous_close_native_price numeric,
  add column if not exists previous_close_at timestamptz,
  add column if not exists day_change_gbp numeric,
  add column if not exists day_change_percent numeric,
  add column if not exists day_change_native numeric,
  add column if not exists day_change_native_percent numeric;

update public.investment_price_snapshots
set snapshot_minute = date_trunc('minute', coalesce(snapshot_at, created_at, now()))
where snapshot_minute is null;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'investment_price_snapshots_user_id_holding_id_snapshot_date_key') then
    alter table public.investment_price_snapshots drop constraint investment_price_snapshots_user_id_holding_id_snapshot_date_key;
  end if;
end $$;
drop index if exists public.investment_price_snapshots_user_id_holding_id_snapshot_date_key;

drop index if exists public.investment_price_snapshots_user_holding_minute_uidx;
create unique index if not exists investment_price_snapshots_user_holding_minute_uidx
  on public.investment_price_snapshots(user_id, holding_id, snapshot_minute);
create index if not exists investment_price_snapshots_listing_time_idx
  on public.investment_price_snapshots(listing_id, snapshot_minute desc);

-- Backfill catalogue from existing holdings.
with holding_keys as (
  select
    upper(trim(ticker)) as ticker,
    coalesce(public.loop_normalise_investment_venue(exchange, ticker), '') as venue_code,
    max(asset_name) as asset_name,
    max(asset_kind) as asset_kind,
    max(isin) as isin,
    max(exchange) as original_exchange
  from public.investment_holdings
  where ticker is not null and trim(ticker) <> ''
  group by upper(trim(ticker)), coalesce(public.loop_normalise_investment_venue(exchange, ticker), '')
), upserted_instruments as (
  insert into public.investment_instruments(ticker, exchange_code, exchange_name, asset_name, asset_kind, canonical_symbol, canonical_name, isin, currency_code, quote_unit, coverage_status, resolution_status, confidence, updated_at, last_seen_at)
  select
    hk.ticker,
    hk.venue_code,
    coalesce(v.name, hk.venue_code),
    coalesce(hk.asset_name, hk.ticker),
    coalesce(hk.asset_kind, 'share'),
    hk.ticker,
    coalesce(hk.asset_name, hk.ticker),
    hk.isin,
    coalesce(v.currency, 'GBP'),
    lower(coalesce(v.currency, 'GBP')),
    'active',
    'resolved',
    80,
    now(),
    now()
  from holding_keys hk
  left join public.investment_market_venues v on v.venue_code = hk.venue_code
  on conflict (ticker, exchange_code) do update set
    asset_name = coalesce(excluded.asset_name, public.investment_instruments.asset_name),
    asset_kind = coalesce(excluded.asset_kind, public.investment_instruments.asset_kind),
    isin = coalesce(public.investment_instruments.isin, excluded.isin),
    updated_at = now(),
    last_seen_at = now()
  returning id, ticker, exchange_code
), all_instruments as (
  select id, ticker, exchange_code from upserted_instruments
  union
  select i.id, i.ticker, i.exchange_code
  from public.investment_instruments i
  join holding_keys hk on hk.ticker = i.ticker and hk.venue_code = i.exchange_code
), upserted_listings as (
  insert into public.investment_instrument_listings(instrument_id, symbol, display_symbol, broker_symbol, broker_market_code, venue_code, venue_mic, operating_mic, data_provider, data_provider_symbol, data_provider_exchange, quote_currency, price_currency, price_scale, timezone, active, resolution_status, last_seen_at, updated_at)
  select
    i.id,
    i.ticker,
    i.ticker,
    i.ticker,
    i.exchange_code,
    nullif(i.exchange_code, ''),
    v.venue_mic,
    v.operating_mic,
    'market_worker',
    i.ticker,
    i.exchange_code,
    coalesce(v.currency, 'GBP'),
    coalesce(v.currency, 'GBP'),
    coalesce(v.price_scale, 1),
    v.timezone,
    true,
    'resolved',
    now(),
    now()
  from all_instruments i
  left join public.investment_market_venues v on v.venue_code = i.exchange_code
  where nullif(i.exchange_code, '') is not null
  on conflict (data_provider, symbol, venue_code) do update set
    instrument_id = excluded.instrument_id,
    quote_currency = excluded.quote_currency,
    price_currency = excluded.price_currency,
    price_scale = excluded.price_scale,
    timezone = excluded.timezone,
    active = true,
    resolution_status = 'resolved',
    last_seen_at = now(),
    updated_at = now()
  returning id, instrument_id, symbol, venue_code
)
update public.investment_holdings h
set
  instrument_id = l.instrument_id,
  listing_id = l.id,
  instrument_resolution_status = 'resolved',
  instrument_resolution_notes = 'Backfilled from existing ticker/exchange into catalogue',
  cost_basis_status = case when coalesce(h.average_buy_price, 0) > 0 then 'known' else 'unknown_provider_import' end,
  updated_at = now()
from public.investment_instrument_listings l
where upper(trim(h.ticker)) = l.symbol
  and coalesce(public.loop_normalise_investment_venue(h.exchange, h.ticker), '') = l.venue_code
  and h.ticker is not null;

insert into public.investment_instrument_aliases(listing_id, instrument_id, alias_source, alias_symbol, alias_market_code, alias_isin, confidence, active)
select distinct h.listing_id, h.instrument_id, coalesce(h.import_source_type, h.external_provider, 'manual'), h.ticker, h.exchange, h.isin, 0.95, true
from public.investment_holdings h
where h.listing_id is not null and h.ticker is not null
on conflict (alias_source, alias_symbol, alias_market_code) do update set
  listing_id = excluded.listing_id,
  instrument_id = excluded.instrument_id,
  alias_isin = coalesce(public.investment_instrument_aliases.alias_isin, excluded.alias_isin),
  active = true;

insert into public.wealth_watch_settings(setting_key, setting_value, description, updated_at)
values
  ('investment_realtime_minutes_between_points', '1', 'Realtime tier/users: save market points every minute while the venue is open.', now()),
  ('investment_plus_pro_minutes_between_points', '10', 'Plus/Pro users: default market point cadence in minutes.', now()),
  ('investment_free_minutes_between_points', '30', 'Free/basic users: default market point cadence in minutes.', now()),
  ('investment_global_raw_price_points', 'true', 'Store one raw price feed per listing and reuse it for matching holdings.', now()),
  ('investment_snapshots_market_hours_only', 'true', 'Only poll shares/ETFs when their exchange is roughly open.', now())
on conflict (setting_key) do update set
  setting_value = excluded.setting_value,
  description = excluded.description,
  updated_at = now();
