-- V23.8: robust Trading 212 pie import fields.
-- Keeps exported account-currency cost/current values separate from native quote metadata.

alter table investment_holdings add column if not exists native_latest_price numeric(18,8);
alter table investment_holdings add column if not exists native_currency text;
alter table investment_holdings add column if not exists native_exchange text;
alter table investment_holdings add column if not exists imported_invested_value numeric(14,2);
alter table investment_holdings add column if not exists imported_current_value numeric(14,2);
alter table investment_holdings add column if not exists imported_result_value numeric(14,2);
alter table investment_holdings add column if not exists imported_account_currency text;
alter table investment_holdings add column if not exists import_source_type text;

create index if not exists investment_holdings_import_source_idx on investment_holdings(user_id, import_source_type);

notify pgrst, 'reload schema';
