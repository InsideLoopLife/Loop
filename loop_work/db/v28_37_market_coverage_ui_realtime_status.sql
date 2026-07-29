-- v28.37 market coverage admin + realtime status metadata
-- Safe/idempotent additions for the admin coverage browser and investment cards.

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

update public.investment_market_aliases
set alias_value = upper(trim(alias_value)),
    venue_code = upper(trim(venue_code))
where alias_value is not null;

-- Remove duplicate aliases before adding unique key.
with ranked as (
  select ctid,
         row_number() over (
           partition by upper(coalesce(alias_source,'')), upper(coalesce(alias_type,'')), upper(coalesce(alias_value,''))
           order by updated_at desc nulls last, created_at desc nulls last, ctid desc
         ) as rn
  from public.investment_market_aliases
)
delete from public.investment_market_aliases a
using ranked r
where a.ctid = r.ctid and r.rn > 1;

create unique index if not exists investment_market_aliases_source_type_value_uidx
on public.investment_market_aliases (alias_source, alias_type, alias_value);

create index if not exists investment_market_aliases_venue_idx
on public.investment_market_aliases (venue_code, alias_value);

alter table public.investment_holdings
  add column if not exists price_check_status text,
  add column if not exists instrument_resolution_status text,
  add column if not exists instrument_resolution_notes text,
  add column if not exists last_price_check_at timestamptz,
  add column if not exists price_polling_enabled boolean;

-- Seed/repair core venues used by Trading 212, SnapTrade and manual imports.
insert into public.investment_market_venues
  (venue_code, venue_mic, operating_mic, name, country_code, currency, timezone, open_time, close_time, price_scale, active, updated_at)
values
  ('LSE','XLON','XLON','London Stock Exchange','GB','GBX','Europe/London','08:00','16:30',0.01,true,now()),
  ('AIM','AIMX','XLON','Alternative Investment Market','GB','GBX','Europe/London','08:00','16:30',0.01,true,now()),
  ('NASDAQ','XNAS','XNAS','Nasdaq','US','USD','America/New_York','09:30','16:00',1,true,now()),
  ('NYSE','XNYS','XNYS','New York Stock Exchange','US','USD','America/New_York','09:30','16:00',1,true,now()),
  ('AMEX','XASE','XASE','NYSE American','US','USD','America/New_York','09:30','16:00',1,true,now()),
  ('OTCM','OTCM','OTCM','OTC Markets','US','USD','America/New_York','09:30','16:00',1,true,now()),
  ('PINX','PINX','OTCM','OTC Pink','US','USD','America/New_York','09:30','16:00',1,true,now()),
  ('XETR','XETR','XETR','Xetra','DE','EUR','Europe/Berlin','09:00','17:30',1,true,now()),
  ('XFRA','XFRA','XFRA','Frankfurt Stock Exchange','DE','EUR','Europe/Berlin','08:00','22:00',1,true,now()),
  ('XPAR','XPAR','XPAR','Euronext Paris','FR','EUR','Europe/Paris','09:00','17:30',1,true,now()),
  ('XAMS','XAMS','XAMS','Euronext Amsterdam','NL','EUR','Europe/Amsterdam','09:00','17:30',1,true,now()),
  ('XMIL','XMIL','XMIL','Borsa Italiana','IT','EUR','Europe/Rome','09:00','17:30',1,true,now()),
  ('XSWX','XSWX','XSWX','SIX Swiss Exchange','CH','CHF','Europe/Zurich','09:00','17:30',1,true,now()),
  ('XTSE','XTSE','XTSE','Toronto Stock Exchange','CA','CAD','America/Toronto','09:30','16:00',1,true,now()),
  ('XHKG','XHKG','XHKG','Hong Kong Exchange','HK','HKD','Asia/Hong_Kong','09:30','16:00',1,true,now()),
  ('XTKS','XTKS','XTKS','Tokyo Stock Exchange','JP','JPY','Asia/Tokyo','09:00','15:10',1,true,now()),
  ('XASX','XASX','XASX','Australian Securities Exchange','AU','AUD','Australia/Sydney','10:00','16:10',1,true,now()),
  ('VANGUARD',null,null,'Provider fund NAV','GB','GBP','Europe/London','00:00','23:59',1,true,now())
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
  active = excluded.active,
  updated_at = now();

insert into public.investment_market_aliases (venue_code, alias_source, alias_type, alias_value, notes, updated_at)
values
  ('LSE','system','mic','XLON','Canonical MIC / broker alias',now()),
  ('LSE','system','broker_suffix','L','Yahoo/Trading suffix',now()),
  ('NASDAQ','system','mic','XNAS','Canonical MIC / broker alias',now()),
  ('NASDAQ','system','broker_market','NCM','Nasdaq Capital Market',now()),
  ('NYSE','system','mic','XNYS','Canonical MIC / broker alias',now()),
  ('AMEX','system','mic','XASE','NYSE American',now()),
  ('OTCM','system','broker_market','OTCM','OTC Markets',now()),
  ('PINX','system','broker_market','PINX','OTC Pink',now()),
  ('XETR','system','broker_market','ETR','Xetra alias',now()),
  ('XETR','system','index_alias','GER40','German large-cap index alias; canonical venue XETR',now()),
  ('XFRA','system','broker_market','FRA','Frankfurt alias',now()),
  ('XPAR','system','broker_market','EPA','Euronext Paris alias',now()),
  ('XAMS','system','broker_market','AMS','Euronext Amsterdam alias',now()),
  ('XMIL','system','broker_market','BIT','Borsa Italiana alias',now()),
  ('XSWX','system','broker_market','SIX','Swiss alias',now()),
  ('XTSE','system','broker_market','TSX','Toronto alias',now()),
  ('XTKS','system','broker_market','TYO','Tokyo alias',now()),
  ('XASX','system','broker_market','ASX','Australia alias',now())
on conflict (alias_source, alias_type, alias_value) do update set
  venue_code = excluded.venue_code,
  notes = excluded.notes,
  active = true,
  updated_at = now();
