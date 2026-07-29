-- v28.18 - investment pie mapping, provider cash/ISA fields, pension settings and DB rule sources

alter table investment_accounts add column if not exists provider_cash_value numeric(14,2);
alter table investment_accounts add column if not exists provider_isa_subscribed_amount numeric(14,2);
alter table investment_accounts add column if not exists provider_isa_remaining_amount numeric(14,2);
alter table investment_accounts add column if not exists provider_isa_allowance_year text;
alter table investment_accounts add column if not exists provider_last_transactions_sync_at timestamptz;

alter table investment_purchase_lots add column if not exists external_transaction_id text;
alter table investment_purchase_lots add column if not exists external_source text;
alter table investment_purchase_lots add column if not exists total_cost numeric(14,2);
alter table investment_purchase_lots add column if not exists fees numeric(14,2) not null default 0;
create index if not exists idx_investment_purchase_lots_external on investment_purchase_lots(user_id, external_source, external_transaction_id);

alter table pension_accounts add column if not exists contribution_frequency text not null default 'monthly';
alter table pension_accounts add column if not exists contribution_day integer;
alter table pension_accounts add column if not exists contribution_paused boolean not null default false;
alter table pension_accounts add column if not exists contribution_started_on date;
alter table pension_accounts add column if not exists contribution_ended_on date;
alter table pension_accounts add column if not exists valuation_mode text not null default 'fund_units';
alter table pension_accounts add column if not exists provider_logic_mode text not null default 'manual';

alter table defined_benefit_pensions add column if not exists rules_source_url text;
alter table defined_benefit_pensions add column if not exists rules_source_type text not null default 'manual';
alter table defined_benefit_pensions add column if not exists rules_confidence numeric(5,2) not null default 40;
alter table defined_benefit_pensions add column if not exists source_visibility text not null default 'private_user_only';

-- Mark common statutory DB schemes as public-template driven.
update defined_benefit_pensions
set rules_source_type = 'public_template',
    rules_confidence = greatest(coalesce(rules_confidence, 0), 95),
    source_visibility = 'public_template'
where lower(provider) ~ '(nhs|teacher|local government|lgps|civil service)'
  and (rules_source_type is null or rules_source_type = 'manual');

-- PensionBee-style providers should not be forced into fund/unit logic.
update pension_accounts
set valuation_mode = 'provider_value'
where lower(provider) ~ '(pensionbee|nest|people''s pension|standard life|aviva)'
  and (valuation_mode is null or valuation_mode = 'fund_units');
