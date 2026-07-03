-- v28.39 chart integrity, market retention, market catalogue seed and child-cost household allocation
-- Safe to run multiple times.

-- -----------------------------------------------------------------------------
-- 1) Investment snapshot settings: 1 minute for realtime/current day, 15m for 5 days, 1h afterwards.
-- -----------------------------------------------------------------------------
create table if not exists public.wealth_watch_settings (
  setting_key text primary key,
  setting_value text,
  updated_at timestamptz not null default now()
);

with desired(setting_key, setting_value) as (
  values
    ('investment_snapshots_enabled','true'),
    ('investment_snapshots_market_hours_only','true'),
    ('investment_global_raw_price_points','true'),
    ('investment_realtime_minutes_between_points','1'),
    ('investment_plus_pro_minutes_between_points','10'),
    ('investment_free_minutes_between_points','30'),
    ('investment_snapshots_min_minutes','1'),
    ('investment_retention_minute_days','1'),
    ('investment_retention_intraday_days','5'),
    ('investment_retention_intraday_bucket_minutes','15'),
    ('investment_retention_hourly_days','36500'),
    ('investment_retention_policy','1m_current_day_15m_first_5_days_1h_after_market_hours_only')
), updated as (
  update public.wealth_watch_settings w
  set setting_value = d.setting_value, updated_at = now()
  from desired d
  where w.setting_key = d.setting_key
  returning w.setting_key
)
insert into public.wealth_watch_settings(setting_key, setting_value, updated_at)
select d.setting_key, d.setting_value, now()
from desired d
where not exists (select 1 from updated u where u.setting_key = d.setting_key)
  and not exists (select 1 from public.wealth_watch_settings w where w.setting_key = d.setting_key);

-- -----------------------------------------------------------------------------
-- 2) Child costs: separate the child the bill relates to from who/what pays it.
--    NULL bill_person_id = Household/shared.
-- -----------------------------------------------------------------------------
alter table public.child_costs
  add column if not exists bill_person_id uuid;

-- Existing nursery/childcare rows are family bills by default. Other child-cost rows stay editable.
update public.child_costs
set bill_person_id = null
where cost_kind = 'nursery';

-- Add FK/index where possible.
do $$
begin
  if to_regclass('public.people') is not null then
    if not exists (select 1 from pg_constraint where conname = 'child_costs_bill_person_id_fkey') then
      alter table public.child_costs
        add constraint child_costs_bill_person_id_fkey
        foreign key (bill_person_id)
        references public.people(id)
        on delete set null;
    end if;
  end if;
exception when duplicate_object then null;
end $$;

create index if not exists child_costs_bill_person_id_idx on public.child_costs(bill_person_id);

-- -----------------------------------------------------------------------------
-- 3) Market catalogue: make recognised markets materially broader than the 6-card default.
--    This powers Trading212/SnapTrade/manual market alias matching without AI.
-- -----------------------------------------------------------------------------
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

alter table public.investment_market_venues
  add column if not exists venue_mic text,
  add column if not exists operating_mic text,
  add column if not exists country_code text,
  add column if not exists currency text,
  add column if not exists timezone text,
  add column if not exists open_time time,
  add column if not exists close_time time,
  add column if not exists price_scale numeric not null default 1,
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.investment_market_aliases (
  id uuid primary key default gen_random_uuid(),
  venue_code text not null,
  alias_source text not null default 'manual',
  alias_type text not null default 'broker_market',
  alias_value text not null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.investment_market_aliases
  add column if not exists notes text,
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

-- Remove duplicates before unique aliases.
with ranked as (
  select ctid,
         row_number() over (
           partition by lower(coalesce(alias_source,'')), lower(coalesce(alias_type,'')), upper(coalesce(alias_value,''))
           order by updated_at desc nulls last, created_at desc nulls last, ctid desc
         ) as rn
  from public.investment_market_aliases
)
delete from public.investment_market_aliases a
using ranked r
where a.ctid = r.ctid and r.rn > 1;

create unique index if not exists investment_market_aliases_source_type_value_uidx
on public.investment_market_aliases(alias_source, alias_type, alias_value);

create index if not exists investment_market_aliases_venue_idx
on public.investment_market_aliases(venue_code, alias_value);

with venue_rows(venue_code, venue_mic, operating_mic, name, country_code, currency, timezone, open_time, close_time, price_scale, active) as (
  values
    ('LSE','XLON','XLON','London Stock Exchange','GB','GBX','Europe/London','08:00'::time,'16:30'::time,0.01,true),
    ('AIM','AIMX','XLON','Alternative Investment Market','GB','GBX','Europe/London','08:00'::time,'16:30'::time,0.01,true),
    ('NASDAQ','XNAS','XNAS','Nasdaq','US','USD','America/New_York','09:30'::time,'16:00'::time,1,true),
    ('NYSE','XNYS','XNYS','New York Stock Exchange','US','USD','America/New_York','09:30'::time,'16:00'::time,1,true),
    ('AMEX','XASE','XASE','NYSE American','US','USD','America/New_York','09:30'::time,'16:00'::time,1,true),
    ('ARCX','ARCX','ARCX','NYSE Arca','US','USD','America/New_York','09:30'::time,'16:00'::time,1,true),
    ('BATS','BATS','BATS','Cboe BZX','US','USD','America/New_York','09:30'::time,'16:00'::time,1,true),
    ('OTCM','OTCM','OTCM','OTC Markets','US','USD','America/New_York','09:30'::time,'16:00'::time,1,true),
    ('PINX','PINX','OTCM','OTC Pink','US','USD','America/New_York','09:30'::time,'16:00'::time,1,true),
    ('XTSE','XTSE','XTSE','Toronto Stock Exchange','CA','CAD','America/Toronto','09:30'::time,'16:00'::time,1,true),
    ('TSXV','XTSX','XTSE','TSX Venture Exchange','CA','CAD','America/Toronto','09:30'::time,'16:00'::time,1,true),
    ('XTKS','XTKS','XTKS','Tokyo Stock Exchange','JP','JPY','Asia/Tokyo','09:00'::time,'15:10'::time,1,true),
    ('XSHG','XSHG','XSHG','Shanghai Stock Exchange','CN','CNY','Asia/Shanghai','09:30'::time,'15:00'::time,1,true),
    ('XSHE','XSHE','XSHE','Shenzhen Stock Exchange','CN','CNY','Asia/Shanghai','09:30'::time,'15:00'::time,1,true),
    ('XHKG','XHKG','XHKG','Hong Kong Exchange','HK','HKD','Asia/Hong_Kong','09:30'::time,'16:00'::time,1,true),
    ('XNSE','XNSE','XNSE','National Stock Exchange of India','IN','INR','Asia/Kolkata','09:15'::time,'15:30'::time,1,true),
    ('XBOM','XBOM','XBOM','Bombay Stock Exchange','IN','INR','Asia/Kolkata','09:15'::time,'15:30'::time,1,true),
    ('XASX','XASX','XASX','Australian Securities Exchange','AU','AUD','Australia/Sydney','10:00'::time,'16:10'::time,1,true),
    ('XKRX','XKRX','XKRX','Korea Exchange','KR','KRW','Asia/Seoul','09:00'::time,'15:30'::time,1,true),
    ('XETR','XETR','XETR','Xetra','DE','EUR','Europe/Berlin','09:00'::time,'17:30'::time,1,true),
    ('XFRA','XFRA','XFRA','Frankfurt Stock Exchange','DE','EUR','Europe/Berlin','08:00'::time,'22:00'::time,1,true),
    ('XPAR','XPAR','XPAR','Euronext Paris','FR','EUR','Europe/Paris','09:00'::time,'17:30'::time,1,true),
    ('XAMS','XAMS','XAMS','Euronext Amsterdam','NL','EUR','Europe/Amsterdam','09:00'::time,'17:30'::time,1,true),
    ('XBRU','XBRU','XBRU','Euronext Brussels','BE','EUR','Europe/Brussels','09:00'::time,'17:30'::time,1,true),
    ('XLIS','XLIS','XLIS','Euronext Lisbon','PT','EUR','Europe/Lisbon','08:00'::time,'16:30'::time,1,true),
    ('XMIL','XMIL','XMIL','Borsa Italiana','IT','EUR','Europe/Rome','09:00'::time,'17:30'::time,1,true),
    ('XSWX','XSWX','XSWX','SIX Swiss Exchange','CH','CHF','Europe/Zurich','09:00'::time,'17:30'::time,1,true),
    ('XSTO','XSTO','XSTO','Nasdaq Stockholm','SE','SEK','Europe/Stockholm','09:00'::time,'17:30'::time,1,true),
    ('XCSE','XCSE','XCSE','Nasdaq Copenhagen','DK','DKK','Europe/Copenhagen','09:00'::time,'17:00'::time,1,true),
    ('XHEL','XHEL','XHEL','Nasdaq Helsinki','FI','EUR','Europe/Helsinki','10:00'::time,'18:30'::time,1,true),
    ('XOSL','XOSL','XOSL','Oslo Børs','NO','NOK','Europe/Oslo','09:00'::time,'16:20'::time,1,true),
    ('XWBO','XWBO','XWBO','Vienna Stock Exchange','AT','EUR','Europe/Vienna','09:00'::time,'17:30'::time,1,true),
    ('XWAR','XWAR','XWAR','Warsaw Stock Exchange','PL','PLN','Europe/Warsaw','09:00'::time,'17:00'::time,1,true),
    ('XJSE','XJSE','XJSE','Johannesburg Stock Exchange','ZA','ZAR','Africa/Johannesburg','09:00'::time,'17:00'::time,1,true),
    ('XMEX','XMEX','XMEX','Mexican Stock Exchange','MX','MXN','America/Mexico_City','08:30'::time,'15:00'::time,1,true),
    ('BVMF','BVMF','BVMF','B3 Brasil Bolsa Balcão','BR','BRL','America/Sao_Paulo','10:00'::time,'17:00'::time,1,true),
    ('XSES','XSES','XSES','Singapore Exchange','SG','SGD','Asia/Singapore','09:00'::time,'17:00'::time,1,true),
    ('XNZE','XNZE','XNZE','New Zealand Exchange','NZ','NZD','Pacific/Auckland','10:00'::time,'16:45'::time,1,true),
    ('VANGUARD',null,null,'Provider fund NAV','GB','GBP','Europe/London','00:00'::time,'23:59'::time,1,true)
), deduped as (
  select distinct on (venue_code) *
  from venue_rows
  order by venue_code
), updated as (
  update public.investment_market_venues v
  set venue_mic = d.venue_mic,
      operating_mic = d.operating_mic,
      name = d.name,
      country_code = d.country_code,
      currency = d.currency,
      timezone = d.timezone,
      open_time = d.open_time,
      close_time = d.close_time,
      price_scale = d.price_scale,
      active = d.active,
      updated_at = now()
  from deduped d
  where v.venue_code = d.venue_code
  returning v.venue_code
)
insert into public.investment_market_venues(venue_code, venue_mic, operating_mic, name, country_code, currency, timezone, open_time, close_time, price_scale, active, updated_at)
select d.venue_code, d.venue_mic, d.operating_mic, d.name, d.country_code, d.currency, d.timezone, d.open_time, d.close_time, d.price_scale, d.active, now()
from deduped d
where not exists (select 1 from public.investment_market_venues v where v.venue_code = d.venue_code);

with alias_rows(venue_code, alias_source, alias_type, alias_value, notes) as (
  values
    ('LSE','system','mic','XLON','MIC / broker alias'),('LSE','system','broker_suffix','L','Yahoo suffix'),('LSE','global_market_mapping_csv','broker_index','UK100','FTSE 100 broker index alias'),('LSE','global_market_mapping_csv','index_ticker','^FTSE','FTSE 100'),
    ('AIM','system','mic','AIMX','AIM MIC'),
    ('NASDAQ','system','mic','XNAS','MIC'),('NASDAQ','system','broker_market','NCM','Nasdaq Capital Market'),('NASDAQ','global_market_mapping_csv','broker_index','US100','Nasdaq 100 broker alias'),('NASDAQ','global_market_mapping_csv','broker_index','USTEC','Nasdaq 100 broker alias'),('NASDAQ','global_market_mapping_csv','index_ticker','^IXIC','Nasdaq Composite'),('NASDAQ','global_market_mapping_csv','index_ticker','^NDX','Nasdaq 100'),
    ('NYSE','system','mic','XNYS','MIC'),('NYSE','global_market_mapping_csv','broker_index','US500','S&P 500 broker alias'),('NYSE','global_market_mapping_csv','broker_index','US30','Dow broker alias'),('NYSE','global_market_mapping_csv','index_ticker','^GSPC','S&P 500'),('NYSE','global_market_mapping_csv','index_ticker','^DJI','Dow Jones'),
    ('AMEX','system','mic','XASE','NYSE American'),('ARCX','system','broker_market','ARCA','NYSE Arca alias'),('BATS','system','broker_market','BATS','Cboe BZX alias'),
    ('OTCM','system','broker_market','OTCM','OTC Markets'),('PINX','system','broker_market','PINX','OTC Pink'),('PINX','system','broker_market','PINK','OTC Pink'),
    ('XTSE','system','broker_market','TSX','Toronto alias'),('XTSE','global_market_mapping_csv','broker_index','CA60','S&P/TSX Composite broker alias'),('XTSE','global_market_mapping_csv','index_ticker','^GSPTSE','S&P/TSX Composite'),('TSXV','system','broker_market','TSXV','TSX Venture'),
    ('XTKS','system','broker_market','TYO','Tokyo alias'),('XTKS','global_market_mapping_csv','broker_index','JP225','Nikkei 225 broker alias'),('XTKS','global_market_mapping_csv','broker_index','JPN225','Nikkei 225 broker alias'),('XTKS','global_market_mapping_csv','index_ticker','^N225','Nikkei 225'),
    ('XSHG','system','broker_market','SSE','Shanghai alias'),('XSHG','system','broker_suffix','SS','Yahoo Shanghai suffix'),('XSHG','global_market_mapping_csv','index_ticker','000001.SS','SSE Composite'),('XSHG','global_market_mapping_csv','broker_index','CN50','China A50 proxy'),
    ('XSHE','system','broker_market','SZSE','Shenzhen alias'),('XSHE','system','broker_suffix','SZ','Yahoo Shenzhen suffix'),('XSHE','global_market_mapping_csv','index_ticker','399001.SZ','SZSE Component'),
    ('XHKG','system','broker_market','HKEX','Hong Kong alias'),('XHKG','system','broker_suffix','HK','Yahoo Hong Kong suffix'),('XHKG','global_market_mapping_csv','broker_index','HK50','Hang Seng broker alias'),('XHKG','global_market_mapping_csv','index_ticker','^HSI','Hang Seng'),
    ('XNSE','system','broker_market','NSE','India NSE alias'),('XNSE','system','broker_suffix','NS','Yahoo NSE suffix'),('XNSE','global_market_mapping_csv','broker_index','IN50','NIFTY 50 broker alias'),('XNSE','global_market_mapping_csv','index_ticker','^NSEI','NIFTY 50'),
    ('XASX','system','broker_market','ASX','Australia alias'),('XASX','system','broker_suffix','AX','Yahoo ASX suffix'),('XASX','global_market_mapping_csv','broker_index','AUS200','S&P/ASX 200 broker alias'),('XASX','global_market_mapping_csv','index_ticker','^AXJO','S&P/ASX 200'),
    ('XKRX','system','broker_market','KRX','Korea alias'),('XKRX','system','broker_suffix','KS','Yahoo Korea suffix'),('XKRX','global_market_mapping_csv','broker_index','KR200','KOSPI broker alias'),('XKRX','global_market_mapping_csv','index_ticker','^KS11','KOSPI'),
    ('XETR','system','broker_market','ETR','Xetra alias'),('XETR','global_market_mapping_csv','broker_index','GER40','German large-cap broker alias'),('XETR','global_market_mapping_csv','index_ticker','^GDAXI','DAX'),
    ('XFRA','system','broker_market','FRA','Frankfurt alias'),('XFRA','system','broker_market','FSX','Frankfurt/FSX alias'),
    ('XPAR','system','broker_market','EPA','Euronext Paris alias'),('XPAR','global_market_mapping_csv','broker_index','FRA40','CAC 40 broker alias'),('XPAR','global_market_mapping_csv','index_ticker','^FCHI','CAC 40'),
    ('XAMS','system','broker_market','AMS','Euronext Amsterdam alias'),('XAMS','global_market_mapping_csv','broker_index','NL25','AEX broker alias'),('XAMS','global_market_mapping_csv','index_ticker','^AEX','AEX'),
    ('XMIL','system','broker_market','BIT','Borsa Italiana alias'),('XSWX','system','broker_market','SIX','Swiss alias'),('XSWX','global_market_mapping_csv','broker_index','CH20','SMI broker alias'),('XSWX','global_market_mapping_csv','broker_index','SUI20','SMI broker alias'),('XSWX','global_market_mapping_csv','index_ticker','^SSMI','SMI'),
    ('XBRU','system','broker_market','BRU','Brussels alias'),('XLIS','system','broker_market','LIS','Lisbon alias'),('XSTO','system','broker_market','STO','Stockholm alias'),('XCSE','system','broker_market','CPH','Copenhagen alias'),('XHEL','system','broker_market','HEL','Helsinki alias'),('XOSL','system','broker_market','OSL','Oslo alias'),('XWBO','system','broker_market','VIE','Vienna alias'),('XWAR','system','broker_market','WSE','Warsaw alias'),('XJSE','system','broker_market','JSE','Johannesburg alias'),('XMEX','system','broker_market','BMV','Mexico alias'),('BVMF','system','broker_market','SAO','Brazil/B3 alias'),('XSES','system','broker_market','SGX','Singapore alias'),('XNZE','system','broker_market','NZX','New Zealand alias'),
    ('VANGUARD','system','provider','VANGUARD','Provider fund NAV source')
), deduped as (
  select distinct on (alias_source, alias_type, alias_value)
    venue_code,
    alias_source,
    alias_type,
    upper(trim(alias_value)) as alias_value,
    notes
  from alias_rows
  order by alias_source, alias_type, alias_value, venue_code
), updated as (
  update public.investment_market_aliases a
  set venue_code = d.venue_code,
      notes = d.notes,
      active = true,
      updated_at = now()
  from deduped d
  where a.alias_source = d.alias_source
    and a.alias_type = d.alias_type
    and a.alias_value = d.alias_value
  returning a.alias_source, a.alias_type, a.alias_value
)
insert into public.investment_market_aliases(venue_code, alias_source, alias_type, alias_value, notes, active, updated_at)
select d.venue_code, d.alias_source, d.alias_type, d.alias_value, d.notes, true, now()
from deduped d
where not exists (
  select 1 from public.investment_market_aliases a
  where a.alias_source = d.alias_source and a.alias_type = d.alias_type and a.alias_value = d.alias_value
);

-- Optional index tracker table for admin/source planning.
create table if not exists public.investment_market_index_trackers (
  id uuid primary key default gen_random_uuid(),
  venue_code text not null,
  index_name text not null,
  provider_symbol text,
  broker_aliases text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists investment_market_index_trackers_venue_index_uidx
on public.investment_market_index_trackers(venue_code, index_name);

-- -----------------------------------------------------------------------------
-- 4) Retention functions: 1m today/1d, 15m first 5 days, 1h after.
--    No closed-market points should be written by the worker; these functions compact only.
-- -----------------------------------------------------------------------------
create or replace function public.loop_admin_compact_investment_instrument_price_points()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  minute_days int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_minute_days'), 1);
  intraday_bucket_minutes int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_intraday_bucket_minutes'), 15);
  intraday_days int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_intraday_days'), 5);
  deleted_15m int := 0;
  deleted_hourly int := 0;
begin
  intraday_bucket_minutes := greatest(1, least(intraday_bucket_minutes, 60));
  minute_days := greatest(1, minute_days);
  intraday_days := greatest(minute_days + 1, intraday_days);

  with ranked as (
    select id,
           row_number() over (
             partition by coalesce(ticker, listing_id::text, instrument_id::text),
                          coalesce(exchange_code, ''),
                          (point_at at time zone public.loop_investment_market_timezone(exchange_code))::date,
                          floor(extract(epoch from (point_at - public.loop_investment_market_open_anchor(exchange_code, point_at))) / (intraday_bucket_minutes * 60))
             order by point_at desc, created_at desc
           ) as rn
    from public.investment_instrument_price_points
    where point_at < now() - make_interval(days => minute_days)
      and point_at >= now() - make_interval(days => intraday_days)
      and point_at is not null
  ), deleted as (
    delete from public.investment_instrument_price_points p
    using ranked r
    where p.id = r.id and r.rn > 1
    returning p.id
  ) select count(*) into deleted_15m from deleted;

  update public.investment_instrument_price_points
  set bucket_interval = intraday_bucket_minutes::text || 'm'
  where point_at < now() - make_interval(days => minute_days)
    and point_at >= now() - make_interval(days => intraday_days)
    and point_at is not null
    and coalesce(bucket_interval,'') <> intraday_bucket_minutes::text || 'm';

  with ranked as (
    select id,
           row_number() over (
             partition by coalesce(ticker, listing_id::text, instrument_id::text),
                          coalesce(exchange_code, ''),
                          (point_at at time zone public.loop_investment_market_timezone(exchange_code))::date,
                          floor(extract(epoch from (point_at - public.loop_investment_market_open_anchor(exchange_code, point_at))) / 3600)
             order by point_at desc, created_at desc
           ) as rn
    from public.investment_instrument_price_points
    where point_at < now() - make_interval(days => intraday_days)
      and point_at is not null
  ), deleted as (
    delete from public.investment_instrument_price_points p
    using ranked r
    where p.id = r.id and r.rn > 1
    returning p.id
  ) select count(*) into deleted_hourly from deleted;

  update public.investment_instrument_price_points
  set bucket_interval = '1h'
  where point_at < now() - make_interval(days => intraday_days)
    and point_at is not null
    and coalesce(bucket_interval,'') <> '1h';

  return jsonb_build_object('ok', true, 'policy', '1m current day/24h; 15m to 5 days; 1h after 5 days; market-hours-only logging', 'deleted_15m_duplicates', deleted_15m, 'deleted_hourly_duplicates', deleted_hourly);
end;
$$;

create or replace function public.loop_admin_prune_investment_price_snapshots()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  minute_days int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_minute_days'), 1);
  intraday_bucket_minutes int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_intraday_bucket_minutes'), 15);
  intraday_days int := coalesce((select setting_value::int from public.wealth_watch_settings where setting_key = 'investment_retention_intraday_days'), 5);
  deleted_15m int := 0;
  deleted_hourly int := 0;
begin
  intraday_bucket_minutes := greatest(1, least(intraday_bucket_minutes, 60));
  minute_days := greatest(1, minute_days);
  intraday_days := greatest(minute_days + 1, intraday_days);

  with ranked as (
    select s.id,
           row_number() over (
             partition by s.holding_id,
                          (s.snapshot_at at time zone public.loop_investment_market_timezone(coalesce(h.exchange, h.native_exchange, '')))::date,
                          floor(extract(epoch from (s.snapshot_at - public.loop_investment_market_open_anchor(coalesce(h.exchange, h.native_exchange, ''), s.snapshot_at))) / (intraday_bucket_minutes * 60))
             order by s.snapshot_at desc, s.created_at desc
           ) as rn
    from public.investment_price_snapshots s
    left join public.investment_holdings h on h.id = s.holding_id
    where s.snapshot_at < now() - make_interval(days => minute_days)
      and s.snapshot_at >= now() - make_interval(days => intraday_days)
      and s.snapshot_at is not null
  ), deleted as (
    delete from public.investment_price_snapshots s
    using ranked r
    where s.id = r.id and r.rn > 1
    returning s.id
  ) select count(*) into deleted_15m from deleted;

  update public.investment_price_snapshots
  set bucket_interval = intraday_bucket_minutes::text || 'm'
  where snapshot_at < now() - make_interval(days => minute_days)
    and snapshot_at >= now() - make_interval(days => intraday_days)
    and snapshot_at is not null
    and coalesce(bucket_interval,'') <> intraday_bucket_minutes::text || 'm';

  with ranked as (
    select s.id,
           row_number() over (
             partition by s.holding_id,
                          (s.snapshot_at at time zone public.loop_investment_market_timezone(coalesce(h.exchange, h.native_exchange, '')))::date,
                          floor(extract(epoch from (s.snapshot_at - public.loop_investment_market_open_anchor(coalesce(h.exchange, h.native_exchange, ''), s.snapshot_at))) / 3600)
             order by s.snapshot_at desc, s.created_at desc
           ) as rn
    from public.investment_price_snapshots s
    left join public.investment_holdings h on h.id = s.holding_id
    where s.snapshot_at < now() - make_interval(days => intraday_days)
      and s.snapshot_at is not null
  ), deleted as (
    delete from public.investment_price_snapshots s
    using ranked r
    where s.id = r.id and r.rn > 1
    returning s.id
  ) select count(*) into deleted_hourly from deleted;

  update public.investment_price_snapshots
  set bucket_interval = '1h'
  where snapshot_at < now() - make_interval(days => intraday_days)
    and snapshot_at is not null
    and coalesce(bucket_interval,'') <> '1h';

  return jsonb_build_object('ok', true, 'policy', '1m current day/24h; 15m to 5 days; 1h after 5 days; market-hours-only logging', 'deleted_15m_duplicates', deleted_15m, 'deleted_hourly_duplicates', deleted_hourly, 'deleted_by_age', 0, 'deleted_by_cap', 0);
end;
$$;

notify pgrst, 'reload schema';
