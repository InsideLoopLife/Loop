-- V23.9 payment timing, profile image upload support, richer provider/fund glossary seeds.

alter table pay_events add column if not exists pay_timing text not null default 'last_workday';
alter table pay_events add column if not exists pay_day_of_month integer not null default 28;
alter table pay_events add column if not exists pay_adjustment text not null default 'previous_workday';

-- Wider provider-fund glossary seeds. Values marked null are discovery candidates; the app should refresh or source-confirm exact fee/price before relying on them.
insert into investment_provider_fund_glossary (id, provider_id, fund_name, fund_code, group_label, annual_fund_fee_percent, unit_price, unit_price_quote_unit, source_url, confidence, notes, last_reviewed_at)
values
('lg-global-equity-fixed-weights-5050-index-3','legal-general','L&G PMC Global Equity Fixed Weights 50:50 Index 3',null,'Global equity',null,null,'gbx','https://fundcentres.landg.com/en/uk/private-investors/fund-centre/',50,'L&G fund-centre candidate. Exact series, fee and unit price should be refreshed from source before saving.',now()),
('lg-north-america-equity-index-3','legal-general','L&G PMC North America Equity Index 3',null,'North America equity',null,null,'gbx','https://fundcentres.landg.com/en/uk/private-investors/fund-centre/',50,'L&G fund-centre candidate. Exact series, fee and unit price should be refreshed from source before saving.',now()),
('lg-europe-ex-uk-equity-index-3','legal-general','L&G PMC Europe ex UK Equity Index 3',null,'Europe equity',null,null,'gbx','https://fundcentres.landg.com/en/uk/private-investors/fund-centre/',50,'L&G fund-centre candidate. Exact series, fee and unit price should be refreshed from source before saving.',now()),
('lg-japan-equity-index-3','legal-general','L&G PMC Japan Equity Index 3',null,'Japan equity',null,null,'gbx','https://fundcentres.landg.com/en/uk/private-investors/fund-centre/',50,'L&G fund-centre candidate. Exact series, fee and unit price should be refreshed from source before saving.',now()),
('lg-asia-pacific-ex-japan-equity-index-3','legal-general','L&G PMC Asia Pacific ex Japan Equity Index 3',null,'Asia Pacific equity',null,null,'gbx','https://fundcentres.landg.com/en/uk/private-investors/fund-centre/',50,'L&G fund-centre candidate. Exact series, fee and unit price should be refreshed from source before saving.',now()),
('lg-emerging-markets-equity-index-3','legal-general','L&G PMC Emerging Markets Equity Index 3',null,'Emerging markets',null,null,'gbx','https://fundcentres.landg.com/en/uk/private-investors/fund-centre/',50,'L&G fund-centre candidate. Exact series, fee and unit price should be refreshed from source before saving.',now()),
('lg-uk-smaller-companies-3','legal-general','L&G PMC UK Smaller Companies 3',null,'UK smaller companies',null,null,'gbx','https://fundcentres.landg.com/en/uk/private-investors/fund-centre/',45,'L&G fund-centre candidate. Exact series, fee and unit price should be refreshed from source before saving.',now()),
('lg-cash-3','legal-general','L&G PMC Cash 3',null,'Cash',null,null,'gbx','https://fundcentres.landg.com/en/uk/private-investors/fund-centre/',45,'L&G fund-centre candidate. Exact series, fee and unit price should be refreshed from source before saving.',now())
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

notify pgrst, 'reload schema';
