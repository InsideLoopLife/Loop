-- V14: polish mortgage/affordability/net-worth/income UX and add Tax-Free Childcare support.
-- Safe to run after any previous V build.

-- Childcare: Tax-Free Childcare planning fields.
alter table child_costs add column if not exists tax_free_childcare_enabled boolean not null default false;
alter table child_costs add column if not exists tax_free_childcare_cap_per_quarter numeric(12,2) not null default 500;

-- Income/net-worth ownership assignments.
alter table income_entries add column if not exists person_id uuid references people(id) on delete set null;
alter table assets add column if not exists person_id uuid references people(id) on delete set null;
alter table assets add column if not exists source_type text not null default 'manual';
alter table liabilities add column if not exists person_id uuid references people(id) on delete set null;
alter table liabilities add column if not exists source_type text not null default 'manual';

-- Affordability saved-search enrichments.
alter table affordability_scenarios add column if not exists target_property_url text;
alter table affordability_scenarios add column if not exists selected_rate_label text;
alter table affordability_scenarios add column if not exists selected_lender text;
alter table affordability_scenarios add column if not exists selected_rate_type text;
alter table affordability_scenarios add column if not exists affordability_score text;
alter table affordability_scenarios add column if not exists monthly_buffer numeric(14,2);

create index if not exists income_entries_user_person_idx on income_entries(user_id, person_id, entry_date);
create index if not exists assets_user_person_idx on assets(user_id, person_id, type);
create index if not exists liabilities_user_person_idx on liabilities(user_id, person_id, type);

notify pgrst, 'reload schema';
