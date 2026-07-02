-- v28.34 Market catalogue, realtime UI and provider-cost hotfix
-- Run after v28.33. Safe to run more than once.

create extension if not exists pgcrypto;

-- Make ON CONFLICT targets deterministic on databases that were upgraded from older builds.
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

with ranked as (
  select ctid, row_number() over (partition by upper(venue_code) order by updated_at desc nulls last, created_at desc nulls last) rn
  from public.investment_market_venues
)
delete from public.investment_market_venues v using ranked r where v.ctid = r.ctid and r.rn > 1;

drop index if exists public.investment_market_venues_venue_code_uidx;
create unique index if not exists investment_market_venues_venue_code_uidx on public.investment_market_venues(venue_code);

insert into public.investment_market_venues
  (venue_code, venue_mic, operating_mic, name, country_code, currency, timezone, open_time, close_time, price_scale)
values
  ('LSE','XLON','XLON','London Stock Exchange','GB','GBX','Europe/London','08:00','16:30',0.01),
  ('AIM','AIMX','XLON','AIM','GB','GBX','Europe/London','08:00','16:30',0.01),
  ('NASDAQ','XNAS','XNAS','NASDAQ','US','USD','America/New_York','09:30','16:00',1),
  ('NYSE','XNYS','XNYS','New York Stock Exchange','US','USD','America/New_York','09:30','16:00',1),
  ('AMEX','XASE','XASE','NYSE American','US','USD','America/New_York','09:30','16:00',1),
  ('ARCX','ARCX','XNYS','NYSE Arca','US','USD','America/New_York','09:30','16:00',1),
  ('BATS','BATS','CBOE','Cboe BZX','US','USD','America/New_York','09:30','16:00',1),
  ('OTCM','OTCM','OTCM','OTC Markets','US','USD','America/New_York','09:30','16:00',1),
  ('PINX','PINX','OTCM','OTC Pink','US','USD','America/New_York','09:30','16:00',1),
  ('XETR','XETR','XETR','Xetra','DE','EUR','Europe/Berlin','09:00','17:30',1),
  ('XFRA','XFRA','XFRA','Frankfurt Stock Exchange','DE','EUR','Europe/Berlin','08:00','22:00',1),
  ('XPAR','XPAR','XPAR','Euronext Paris','FR','EUR','Europe/Paris','09:00','17:30',1),
  ('XAMS','XAMS','XAMS','Euronext Amsterdam','NL','EUR','Europe/Amsterdam','09:00','17:30',1),
  ('XMIL','XMIL','XMIL','Borsa Italiana','IT','EUR','Europe/Rome','09:00','17:30',1),
  ('XSWX','XSWX','XSWX','SIX Swiss Exchange','CH','CHF','Europe/Zurich','09:00','17:30',1),
  ('XTSE','XTSE','XTSE','Toronto Stock Exchange','CA','CAD','America/Toronto','09:30','16:00',1),
  ('TSXV','XTSX','XTSE','TSX Venture Exchange','CA','CAD','America/Toronto','09:30','16:00',1),
  ('XSTO','XSTO','XSTO','Nasdaq Stockholm','SE','SEK','Europe/Stockholm','09:00','17:30',1),
  ('XCSE','XCSE','XCSE','Nasdaq Copenhagen','DK','DKK','Europe/Copenhagen','09:00','17:30',1),
  ('XHEL','XHEL','XHEL','Nasdaq Helsinki','FI','EUR','Europe/Helsinki','09:00','17:30',1),
  ('XOSL','XOSL','XOSL','Oslo Børs','NO','NOK','Europe/Oslo','09:00','16:30',1),
  ('XBRU','XBRU','XBRU','Euronext Brussels','BE','EUR','Europe/Brussels','09:00','17:30',1),
  ('XLIS','XLIS','XLIS','Euronext Lisbon','PT','EUR','Europe/Lisbon','08:00','16:30',1),
  ('XWBO','XWBO','XWBO','Vienna Stock Exchange','AT','EUR','Europe/Vienna','09:00','17:30',1),
  ('XWAR','XWAR','XWAR','Warsaw Stock Exchange','PL','PLN','Europe/Warsaw','09:00','17:00',1),
  ('XHKG','XHKG','XHKG','Hong Kong Exchange','HK','HKD','Asia/Hong_Kong','09:30','16:00',1),
  ('XSES','XSES','XSES','Singapore Exchange','SG','SGD','Asia/Singapore','09:00','17:00',1),
  ('XTKS','XTKS','XTKS','Tokyo Stock Exchange','JP','JPY','Asia/Tokyo','09:00','15:00',1),
  ('XASX','XASX','XASX','Australian Securities Exchange','AU','AUD','Australia/Sydney','10:00','16:00',1),
  ('XNZE','XNZE','XNZE','New Zealand Exchange','NZ','NZD','Pacific/Auckland','10:00','16:45',1),
  ('XJSE','XJSE','XJSE','Johannesburg Stock Exchange','ZA','ZAR','Africa/Johannesburg','09:00','17:00',1),
  ('XMEX','XMEX','XMEX','Mexican Stock Exchange','MX','MXN','America/Mexico_City','08:30','15:00',1),
  ('BVMF','BVMF','BVMF','B3 Brazil','BR','BRL','America/Sao_Paulo','10:00','17:00',1),
  ('VANGUARD',null,null,'Provider fund','GB','GBP','Europe/London','00:00','23:59',1)
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
  active = true,
  updated_at = now();

-- Ensure cost-basis and daily movement columns exist.
alter table public.investment_holdings
  add column if not exists cost_basis_status text default 'unknown',
  add column if not exists latest_fx_rate_to_gbp numeric,
  add column if not exists latest_fx_source text,
  add column if not exists previous_close_price_gbp numeric,
  add column if not exists previous_close_native_price numeric,
  add column if not exists previous_close_native_currency text,
  add column if not exists previous_close_at timestamptz,
  add column if not exists day_change_gbp numeric,
  add column if not exists day_change_percent numeric,
  add column if not exists day_change_native numeric,
  add column if not exists day_change_native_percent numeric;

update public.investment_holdings
set cost_basis_status = 'unknown_provider_import'
where coalesce(import_source_type, external_provider, '') <> ''
  and coalesce(cost_basis_status, 'unknown') in ('unknown', '')
  and coalesce(average_buy_price, 0) <= 0;

-- Ensure global points can store both native and GBP values.
alter table public.investment_instrument_price_points
  add column if not exists gbp_price numeric,
  add column if not exists price_gbp numeric,
  add column if not exists native_price numeric,
  add column if not exists native_currency text,
  add column if not exists quote_unit text,
  add column if not exists fx_rate_to_gbp numeric,
  add column if not exists point_at timestamptz,
  add column if not exists observed_at timestamptz,
  add column if not exists price_minute timestamptz,
  add column if not exists point_date date,
  add column if not exists bucket_interval text default 'raw';

update public.investment_instrument_price_points set point_at = coalesce(point_at, observed_at, created_at, now()) where point_at is null;
update public.investment_instrument_price_points set observed_at = coalesce(observed_at, point_at, created_at, now()) where observed_at is null;
update public.investment_instrument_price_points set price_minute = date_trunc('minute', coalesce(price_minute, point_at, observed_at, created_at, now())) where price_minute is null;
update public.investment_instrument_price_points set point_date = coalesce(point_date, point_at::date, created_at::date, now()::date) where point_date is null;
update public.investment_instrument_price_points set gbp_price = coalesce(gbp_price, price_gbp) where gbp_price is null and price_gbp is not null;
update public.investment_instrument_price_points set price_gbp = coalesce(price_gbp, gbp_price) where price_gbp is null and gbp_price is not null;

-- Make listing/minute uniqueness partial so old/null listing rows never block migration.
drop index if exists public.investment_instrument_price_points_listing_minute_uidx;
create unique index if not exists investment_instrument_price_points_listing_minute_uidx
on public.investment_instrument_price_points(listing_id, price_minute)
where listing_id is not null and price_minute is not null;

create index if not exists investment_instrument_price_points_recent_idx
on public.investment_instrument_price_points(point_at desc);

-- Setting values for tier checks.
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
