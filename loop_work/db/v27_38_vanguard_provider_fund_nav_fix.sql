-- V27.38: correct Vanguard LifeStrategy 80 Accumulation pricing.
-- This is an OEIC/provider fund with GBP NAV/unit pricing, not an LSE GBX traded stock.

alter table if exists investment_holdings add column if not exists native_latest_price numeric;
alter table if exists investment_holdings add column if not exists native_currency text;
alter table if exists investment_holdings add column if not exists native_exchange text;
alter table if exists investment_holdings add column if not exists price_quote_unit text;
alter table if exists investment_holdings add column if not exists asset_kind text;
alter table if exists investment_holdings add column if not exists isin text;

insert into investment_provider_fund_glossary
  (id, provider_id, fund_name, fund_code, group_label, annual_fund_fee_percent, unit_price, unit_price_quote_unit, source_url, confidence, notes, last_reviewed_at)
values
  (
    'vanguard-lifestrategy-80-accumulation',
    'vanguard',
    'Vanguard LifeStrategy® 80% Equity Fund - Accumulation',
    'GB00B4PQW151',
    'LifeStrategy',
    0.20,
    389.0662,
    'gbp',
    'https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-80-equity-fund-accumulation-shares/overview',
    99,
    'Exact Vanguard LifeStrategy 80 Accumulation share class. This is a GBP NAV/provider fund price, not an LSE pence quote. Reviewed against public fund listings dated 2026-06-18; refresh from Vanguard/provider screen when available.',
    now()
  )
on conflict (id) do update set
  provider_id = excluded.provider_id,
  fund_name = excluded.fund_name,
  fund_code = excluded.fund_code,
  group_label = excluded.group_label,
  annual_fund_fee_percent = excluded.annual_fund_fee_percent,
  unit_price = excluded.unit_price,
  unit_price_quote_unit = excluded.unit_price_quote_unit,
  source_url = excluded.source_url,
  confidence = excluded.confidence,
  notes = excluded.notes,
  last_reviewed_at = excluded.last_reviewed_at,
  updated_at = now();

-- Repair any existing holdings that were accidentally saved as LSE/GBX or as the text ticker.
with corrected as (
  update investment_holdings
  set
    asset_name = 'Vanguard LifeStrategy® 80% Equity Fund - Accumulation',
    ticker = 'GB00B4PQW151',
    exchange = 'Vanguard',
    native_exchange = 'Vanguard',
    asset_kind = 'fund',
    isin = 'GB00B4PQW151',
    price_quote_unit = 'gbp',
    currency = 'GBP',
    latest_price = 389.0662,
    native_latest_price = 389.0662,
    native_currency = 'GBP',
    latest_price_date = date '2026-06-18',
    annual_asset_fee_percent = case when annual_asset_fee_percent is null or annual_asset_fee_percent = 0 then 0.20 else annual_asset_fee_percent end,
    source_url = 'https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-80-equity-fund-accumulation-shares/overview',
    price_check_status = 'ok',
    updated_at = now(),
    notes = trim(both E'\n' from concat_ws(E'\n', nullif(notes, ''), 'V27.38 corrected this holding to Vanguard LifeStrategy 80 Accumulation GBP NAV pricing; previous LSE/GBX quote matches were ignored.'))
  where
    upper(coalesce(isin, '')) = 'GB00B4PQW151'
    or upper(coalesce(ticker, '')) = 'GB00B4PQW151'
    or upper(coalesce(ticker, '')) like '%LIFESTRATEGY%80%ACC%'
    or upper(coalesce(asset_name, '')) like '%LIFESTRATEGY%80%EQUITY%ACC%'
  returning id, user_id, units, latest_price
)
insert into investment_price_snapshots (user_id, holding_id, price, units, value, snapshot_date, snapshot_at, source)
select user_id, id, latest_price, units, units * latest_price, date '2026-06-18', now(), 'v27_38_vanguard_nav_correction'
from corrected;

notify pgrst, 'reload schema';
