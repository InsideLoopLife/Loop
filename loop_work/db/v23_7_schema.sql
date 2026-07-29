-- V23.7 investment/pension usability hardening.
-- Adds provider/fund catalogue storage and purchase-lot total-cost fields so purchase costs can include FX/commission drag.

create table if not exists investment_provider_fund_glossary (
  id text primary key,
  provider_id text references investment_provider_glossary(id) on delete cascade,
  fund_name text not null,
  fund_code text,
  group_label text,
  annual_fund_fee_percent numeric(10,6),
  unit_price numeric(18,8),
  unit_price_quote_unit text default 'gbp',
  source_url text,
  confidence integer not null default 50,
  notes text,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table investment_provider_fund_glossary enable row level security;
drop policy if exists "Authenticated users can read provider fund glossary" on investment_provider_fund_glossary;
create policy "Authenticated users can read provider fund glossary"
on investment_provider_fund_glossary for select
to authenticated
using (true);

alter table investment_purchase_lots add column if not exists total_cost numeric(14,2);
alter table investment_purchase_lots add column if not exists fees numeric(14,2) not null default 0;

insert into investment_provider_fund_glossary (id, provider_id, fund_name, fund_code, group_label, annual_fund_fee_percent, unit_price, unit_price_quote_unit, source_url, confidence, notes, last_reviewed_at)
values
('lg-hsbc-islamic-global-equity-index-3','legal-general','L&G PMC HSBC Islamic Global Equity Index Fund 3','GB00BJXRF945','Global equity',0.2,47.9037,'gbx','https://fundcentres.landg.com/en/uk/workplace-employer/fund-centre/HSBC-Islamic-Global-Equity-Index-Fund/?isin_code=GB00BJXRF945',97,'Reviewed user supplied/provider screen value: unit 4,790.37p; fund management charge 0.2%. Confirm scheme-specific charges before relying on it.',now()),
('lg-lazard-emerging-markets-3','legal-general','L&G PMC Lazard Emerging Markets 3',null,'Emerging markets',0.94,23.4455,'gbx','https://fundcentres.landg.com/en/uk/workplace-employer/fund-centre/Lazard-Emerging-Markets-Fund/',96,'Reviewed user supplied/provider screen value: unit 2,344.55p; fund management charge 0.94%. Confirm scheme-specific charges before relying on it.',now()),
('lg-ct-responsible-global-equity-3','legal-general','L&G PMC CT Responsible Global Equity Fund 3','GB00BGYBV072','Responsible global equity',0.74,19.6497,'gbx','https://fundcentres.landg.com/en/uk/workplace-employee/fund-centre/BMO-Responsible-Global-Equity-Fund/?isin_code=GB00BGYBV072',96,'Reviewed user supplied/provider screen value: unit 1,964.97p; fund management charge 0.74%. Confirm scheme-specific charges before relying on it.',now()),
('lg-multi-asset-3','legal-general','L&G PMC Multi-Asset 3','GB00B5W2CB33','Multi-asset',0.13,2.6582,'gbx','https://fundcentres.landg.com/en/uk/workplace-employee/fund-centre/Multi-Asset-Fund/?isin_code=GB00B5W2CB33',96,'Reviewed user supplied/provider screen value: unit 265.82p; fund management charge 0.13%. Confirm scheme-specific charges before relying on it.',now()),
('vanguard-ftse-global-all-cap','vanguard','Vanguard FTSE Global All Cap Index Fund','GB00BD3RZ582','Global equity',0.23,null,'gbp','https://www.vanguardinvestor.co.uk/investments/vanguard-ftse-global-all-cap-index-fund-gbp-acc/overview',70,'Common Vanguard fund candidate. Fund OCF and platform/account fee are separate; check current factsheet.',now()),
('vanguard-lifestrategy-100','vanguard','Vanguard LifeStrategy 100% Equity Fund',null,'LifeStrategy',0.22,null,'gbp','https://www.vanguardinvestor.co.uk/investments/vanguard-lifestrategy-100-equity-fund-gbp-acc/overview',70,'Common Vanguard fund candidate. Check exact share class and OCF before saving.',now()),
('vanguard-sp500-etf','vanguard','Vanguard S&P 500 UCITS ETF','VUSA','US equity ETF',0.07,null,'gbp','https://www.vanguardinvestor.co.uk/investments/vanguard-s-and-p-500-ucits-etf-usd-distributing/overview',70,'Common Vanguard ETF candidate. Platform/account fee is separate.',now()),
('pensionbee-tailored','pensionbee','PensionBee Tailored Plan',null,'Managed pension plan',null,null,'gbp','https://www.pensionbee.com/uk/fees',60,'Plan fee depends on selected plan and balance. Store exact annual management fee after checking the provider page.',now()),
('pensionbee-tracker','pensionbee','PensionBee Tracker Plan',null,'Tracker pension plan',null,null,'gbp','https://www.pensionbee.com/uk/fees',60,'Plan fee depends on selected plan and balance. Store exact annual management fee after checking the provider page.',now()),
('pensionbee-shariah','pensionbee','PensionBee Shariah Plan',null,'Shariah pension plan',null,null,'gbp','https://www.pensionbee.com/uk/fees',60,'Plan fee depends on selected plan and balance. Store exact annual management fee after checking the provider page.',now())
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

create table if not exists investment_provider_daily_checks (
  id uuid primary key default gen_random_uuid(),
  provider_id text references investment_provider_glossary(id) on delete cascade,
  check_date date not null default current_date,
  check_type text not null default 'fees_terms_names',
  status text not null default 'queued',
  summary text,
  changed_fields jsonb not null default '[]'::jsonb,
  source_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(provider_id, check_date, check_type)
);

alter table investment_provider_daily_checks enable row level security;
drop policy if exists "Authenticated users can read provider daily checks" on investment_provider_daily_checks;
create policy "Authenticated users can read provider daily checks"
on investment_provider_daily_checks for select
to authenticated
using (true);

notify pgrst, 'reload schema';
