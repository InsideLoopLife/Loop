-- V27.37: make Vanguard LifeStrategy accumulation share classes visible/searchable as first-class fund candidates.
-- Keeps the blended LifeStrategy funds separate from the individual underlying funds/ETFs.

insert into investment_provider_fund_glossary
  (id, provider_id, fund_name, fund_code, group_label, annual_fund_fee_percent, unit_price, unit_price_quote_unit, source_url, confidence, notes, last_reviewed_at)
values
  ('vanguard-lifestrategy-20-accumulation','vanguard','Vanguard LifeStrategy® 20% Equity Fund - Accumulation',null,'LifeStrategy',0.20,null,'gbp','https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-20-equity-fund-accumulation-shares',90,'Vanguard LifeStrategy accumulation share class. Blended LifeStrategy fund, not an individual underlying fund; refresh latest NAV from Vanguard/provider screen before relying on it.',now()),
  ('vanguard-lifestrategy-40-accumulation','vanguard','Vanguard LifeStrategy® 40% Equity Fund - Accumulation',null,'LifeStrategy',0.20,null,'gbp','https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-40-equity-fund-accumulation-shares',90,'Vanguard LifeStrategy accumulation share class. Blended LifeStrategy fund, not an individual underlying fund; refresh latest NAV from Vanguard/provider screen before relying on it.',now()),
  ('vanguard-lifestrategy-60-accumulation','vanguard','Vanguard LifeStrategy® 60% Equity Fund - Accumulation',null,'LifeStrategy',0.20,null,'gbp','https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-60-equity-fund-accumulation-shares',90,'Vanguard LifeStrategy accumulation share class. Blended LifeStrategy fund, not an individual underlying fund; refresh latest NAV from Vanguard/provider screen before relying on it.',now()),
  ('vanguard-lifestrategy-80-accumulation','vanguard','Vanguard LifeStrategy® 80% Equity Fund - Accumulation','GB00B4PQW151','LifeStrategy',0.20,null,'gbp','https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-80-equity-fund-accumulation-shares',97,'Exact Vanguard LifeStrategy 80 accumulation share class. Blended LifeStrategy fund, not an individual underlying fund; refresh latest NAV from Vanguard/provider screen before relying on it.',now()),
  ('vanguard-lifestrategy-100-accumulation','vanguard','Vanguard LifeStrategy® 100% Equity Fund - Accumulation',null,'LifeStrategy',0.20,null,'gbp','https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-100-equity-fund-accumulation-shares',90,'Vanguard LifeStrategy accumulation share class. Blended LifeStrategy fund, not an individual underlying fund; refresh latest NAV from Vanguard/provider screen before relying on it.',now()),
  ('vanguard-lifestrategy-global-80-accumulation','vanguard','Vanguard LifeStrategy® Global 80% Equity Fund - Accumulation',null,'LifeStrategy Global',0.20,null,'gbp','https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-global-80-equity-fund-a-gbp-accumulation-shares',74,'Newer LifeStrategy Global accumulation candidate. Keep separate from the original LifeStrategy 80 fund unless the provider screen explicitly says Global.',now())
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

-- Preserve older IDs, but rename the old generic 100% entry so fresh installs and existing databases use the clearer Accumulation wording.
update investment_provider_fund_glossary
set fund_name = 'Vanguard LifeStrategy® 100% Equity Fund - Accumulation',
    annual_fund_fee_percent = 0.20,
    unit_price_quote_unit = 'gbp',
    source_url = 'https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-100-equity-fund-accumulation-shares',
    notes = 'Vanguard LifeStrategy accumulation share class. Blended LifeStrategy fund; refresh latest NAV from Vanguard/provider screen before relying on it.',
    updated_at = now()
where id = 'vanguard-lifestrategy-100';

notify pgrst, 'reload schema';
