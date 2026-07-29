-- V23.5 provider glossary and investment lookup hardening

create table if not exists investment_provider_glossary (
  id text primary key,
  provider_name text not null,
  category text not null check (category in ('pension','investment','both')),
  offerings jsonb not null default '[]'::jsonb,
  default_annual_platform_fee_percent numeric(8,4),
  default_fixed_monthly_fee numeric(12,2),
  default_fx_fee_percent numeric(8,4),
  supports_pies boolean not null default false,
  supports_fractional_shares boolean not null default false,
  supports_fund_search boolean not null default false,
  docs jsonb not null default '[]'::jsonb,
  notes text,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists investment_provider_glossary_checks (
  id uuid primary key default gen_random_uuid(),
  provider_id text references investment_provider_glossary(id) on delete cascade,
  check_status text not null default 'queued',
  summary text,
  source_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table investment_provider_glossary enable row level security;
alter table investment_provider_glossary_checks enable row level security;

drop policy if exists "Authenticated users can read provider glossary" on investment_provider_glossary;
create policy "Authenticated users can read provider glossary"
on investment_provider_glossary for select
to authenticated
using (true);

drop policy if exists "Authenticated users can read provider glossary checks" on investment_provider_glossary_checks;
create policy "Authenticated users can read provider glossary checks"
on investment_provider_glossary_checks for select
to authenticated
using (true);

insert into investment_provider_glossary (id, provider_name, category, offerings, default_annual_platform_fee_percent, default_fixed_monthly_fee, default_fx_fee_percent, supports_pies, supports_fractional_shares, supports_fund_search, docs, notes, last_reviewed_at)
values
('legal-general','Legal & General','pension','[{"value":"work","label":"Workplace pension"},{"value":"private","label":"Private/personal pension"}]',null,null,null,false,false,true,'[{"label":"L&G workplace funds","url":"https://www.legalandgeneral.com/retirement/pensions/workplace-pensions/funds/"},{"label":"L&G fund centre","url":"https://fundcentres.landg.com/en/uk/workplace-adviser/fund-centre/"}]','L&G workplace fees are plan/fund-specific. Store source URL and confirmed plan/fund charge.',now()),
('pensionbee','PensionBee','pension','[{"value":"private","label":"Private pension"}]',null,null,null,false,false,true,'[{"label":"PensionBee fees","url":"https://www.pensionbee.com/uk/fees"}]','Plan fees vary by plan and balance; confirm the selected plan fee.',now()),
('trading-212','Trading 212','investment','[{"value":"gia","label":"Invest / GIA"},{"value":"isa","label":"Stocks & Shares ISA"}]',0,0,0.15,true,true,false,'[{"label":"Trading 212 fees","url":"https://helpcentre.trading212.com/hc/en-us/articles/11471996799517-What-are-the-fees-in-the-Invest-and-ISAs"},{"label":"Trading 212 ISA","url":"https://www.trading212.com/isa"}]','No platform/custody fee assumed for Invest/ISA; FX fee may apply.',now()),
('revolut','Revolut','investment','[{"value":"gia","label":"Investment / GIA"},{"value":"isa","label":"Stocks & Shares ISA"}]',0,0,null,false,true,false,'[{"label":"Revolut ISA","url":"https://www.revolut.com/stocks-and-shares-isa/"},{"label":"Revolut trading fees","url":"https://help.revolut.com/help/wealth/stocks/trading-stocks/trading-fees/what-fees-will-i-be-charged-for-my-trading/"}]','Commissions depend on plan/allowance. Store the exact plan note.',now()),
('vanguard','Vanguard','both','[{"value":"isa","label":"Stocks & Shares ISA"},{"value":"gia","label":"General account / GIA"},{"value":"sipp","label":"SIPP"},{"value":"private","label":"Private pension"}]',null,null,null,false,false,true,'[{"label":"Vanguard fees","url":"https://www.vanguardinvestor.co.uk/what-we-offer/fees-explained"}]','Fees depend on account/wrapper and service tier.',now()),
('hargreaves-lansdown','Hargreaves Lansdown','both','[{"value":"isa","label":"Stocks & Shares ISA"},{"value":"gia","label":"Fund & Share Account / GIA"},{"value":"sipp","label":"SIPP"},{"value":"private","label":"Private pension/SIPP"}]',null,null,null,false,false,true,'[{"label":"HL charges","url":"https://www.hl.co.uk/investment-services/isa/savings-interest-rates-and-charges"}]','Charges vary by investment type and wrapper.',now()),
('aj-bell','AJ Bell','both','[{"value":"isa","label":"Stocks & Shares ISA"},{"value":"gia","label":"Dealing account / GIA"},{"value":"sipp","label":"SIPP"},{"value":"private","label":"Private pension/SIPP"}]',null,null,null,false,false,true,'[{"label":"AJ Bell charges","url":"https://www.ajbell.co.uk/charges-and-rates"}]','Charges vary by wrapper and investment type.',now()),
('fidelity','Fidelity','both','[{"value":"isa","label":"Stocks & Shares ISA"},{"value":"gia","label":"Investment account / GIA"},{"value":"sipp","label":"SIPP"},{"value":"private","label":"Private pension/SIPP"}]',null,null,null,false,false,true,'[{"label":"Fidelity fees","url":"https://www.fidelity.co.uk/services/charges-fees/"}]','Confirm current service fee from provider.',now()),
('interactive-investor','interactive investor','both','[{"value":"isa","label":"Stocks & Shares ISA"},{"value":"gia","label":"Trading account / GIA"},{"value":"sipp","label":"SIPP"},{"value":"private","label":"Private pension/SIPP"}]',0,null,null,false,false,false,'[{"label":"ii charges","url":"https://www.ii.co.uk/our-charges"}]','Often subscription-based. Enter chosen monthly plan fee.',now()),
('investengine','InvestEngine','investment','[{"value":"isa","label":"Stocks & Shares ISA"},{"value":"gia","label":"General Investment Account"}]',null,null,null,true,true,false,'[{"label":"InvestEngine costs","url":"https://investengine.com/costs/"}]','ETF-focused. Confirm DIY/managed fee.',now()),
('moneybox','Moneybox','both','[{"value":"isa","label":"Stocks & Shares ISA"},{"value":"gia","label":"GIA"},{"value":"private","label":"Personal Pension"}]',null,null,null,false,false,true,'[{"label":"Moneybox fees","url":"https://www.moneyboxapp.com/fees/"}]','Fees vary by product and balance.',now())
on conflict (id) do update set
  provider_name = excluded.provider_name,
  category = excluded.category,
  offerings = excluded.offerings,
  default_annual_platform_fee_percent = excluded.default_annual_platform_fee_percent,
  default_fixed_monthly_fee = excluded.default_fixed_monthly_fee,
  default_fx_fee_percent = excluded.default_fx_fee_percent,
  supports_pies = excluded.supports_pies,
  supports_fractional_shares = excluded.supports_fractional_shares,
  supports_fund_search = excluded.supports_fund_search,
  docs = excluded.docs,
  notes = excluded.notes,
  last_reviewed_at = excluded.last_reviewed_at,
  updated_at = now();

notify pgrst, 'reload schema';
