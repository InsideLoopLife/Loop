-- Daily price history for pension funds, mirroring
-- investment_instrument_price_points (the shared, ticker-keyed price cache
-- the investment worker already writes to). Every day's fetch gets its own
-- row here — nothing is ever overwritten — so:
--   1. A purchase made on any given date can look up the real price on
--      that exact date instead of guessing or using today's price
--   2. Staleness is directly queryable (max(point_date) per fund) instead
--      of inferred from a single mutable "unit_price" column
--   3. Multiple pension accounts holding the same fund (same ISIN) share
--      one price history, not a duplicated fetch per account — same
--      "shared instrument data" principle already used for stocks

create table if not exists pension_fund_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  glossary_id uuid references provider_fund_glossary(id) on delete cascade,
  fund_code text,
  isin text,
  unit_price_gbp numeric(14, 6) not null,
  point_date date not null,
  observed_at timestamptz not null default now(),
  source text not null default 'landg_fund_centre',
  source_url text,
  parse_confidence text,
  created_at timestamptz not null default now()
);

create index if not exists idx_pension_fund_price_snapshots_glossary_date
  on pension_fund_price_snapshots (glossary_id, point_date desc);

create index if not exists idx_pension_fund_price_snapshots_isin_date
  on pension_fund_price_snapshots (isin, point_date desc);

-- One snapshot per fund per day — re-running the daily job on the same day
-- updates the existing row rather than creating duplicates.
create unique index if not exists idx_pension_fund_price_snapshots_glossary_day
  on pension_fund_price_snapshots (glossary_id, point_date);

comment on table pension_fund_price_snapshots is
  'Daily price history per pension fund (by provider_fund_glossary entry), fetched from the provider''s own fund centre. Never overwritten — one row per fund per day, so historical purchase dates can look up the real price on that date instead of guessing.';
