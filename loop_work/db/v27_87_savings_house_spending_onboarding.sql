-- v27.87 - Savings ladder, house/spending onboarding refinements

alter table if exists public.financial_accounts
  add column if not exists provider_slug text,
  add column if not exists savings_product_name text,
  add column if not exists interest_rate numeric(7,4),
  add column if not exists interest_rate_end_date date,
  add column if not exists top_up_day integer,
  add column if not exists monthly_top_up_amount numeric(14,2),
  add column if not exists opening_balance_assumption numeric(14,2),
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists account_status text default 'active',
  add column if not exists notes text;

create index if not exists financial_accounts_provider_slug_idx on public.financial_accounts(provider_slug);
create index if not exists financial_accounts_savings_active_idx on public.financial_accounts(user_id, account_type, account_status) where is_liability = false;

create table if not exists public.loop_financial_institution_catalog (
  slug text primary key,
  name text not null,
  institution_type text not null default 'bank',
  country_code text not null default 'GB',
  logo_text text not null,
  brand_class text not null,
  aliases text[] not null default '{}',
  common_savings_types jsonb not null default '[]'::jsonb,
  common_investment_products jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.loop_financial_institution_catalog enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'loop_financial_institution_catalog' and policyname = 'catalog readable by authenticated users'
  ) then
    create policy "catalog readable by authenticated users" on public.loop_financial_institution_catalog
      for select to authenticated using (enabled = true);
  end if;
end $$;

insert into public.loop_financial_institution_catalog(slug, name, institution_type, logo_text, brand_class, aliases, common_savings_types, common_investment_products)
values
  ('nationwide', 'Nationwide', 'building_society', 'NW', 'bg-blue-700 text-white', array['nationwide building society'], '["Flex Regular Saver","Triple Access Saver","Fixed Rate Online Bond"]'::jsonb, '[]'::jsonb),
  ('natwest', 'NatWest', 'bank', 'NW', 'bg-purple-700 text-white', array['national westminster'], '["Digital Regular Saver","Fixed Term Savings","Instant Saver"]'::jsonb, '[]'::jsonb),
  ('santander', 'Santander', 'bank', 'S', 'bg-red-600 text-white', array['santander uk'], '["Edge Saver","Easy Access Saver","Fixed Rate ISA"]'::jsonb, '[]'::jsonb),
  ('barclays', 'Barclays', 'bank', 'B', 'bg-sky-600 text-white', array['barclays bank'], '["Rainy Day Saver","Everyday Saver","Fixed Term Deposit"]'::jsonb, '[]'::jsonb),
  ('lloyds', 'Lloyds Bank', 'bank', 'L', 'bg-emerald-700 text-white', array['lloyds'], '["Club Lloyds Monthly Saver","Easy Saver","Fixed Bond"]'::jsonb, '[]'::jsonb),
  ('halifax', 'Halifax', 'bank', 'H', 'bg-blue-800 text-white', array['halifax bank'], '["Regular Saver","Everyday Saver","Fixed Saver"]'::jsonb, '[]'::jsonb),
  ('hsbc', 'HSBC', 'bank', 'HS', 'bg-red-500 text-white', array['hsbc uk'], '["Online Bonus Saver","Regular Saver","Fixed Rate Saver"]'::jsonb, '[]'::jsonb),
  ('first_direct', 'First Direct', 'bank', 'FD', 'bg-black text-white', array['firstdirect'], '["Regular Saver","Bonus Savings","Cash ISA"]'::jsonb, '[]'::jsonb),
  ('monzo', 'Monzo', 'bank', 'M', 'bg-pink-500 text-white', array['monzo bank'], '["Instant Access Savings Pot","Easy Access Cash ISA","Fixed Pot"]'::jsonb, '[]'::jsonb),
  ('chase', 'Chase', 'bank', 'C', 'bg-blue-900 text-white', array['jp morgan chase'], '["Saver account","Round-up account","Current account saver"]'::jsonb, '[]'::jsonb),
  ('premium_bonds', 'NS&I', 'savings_platform', 'NS', 'bg-teal-700 text-white', array['national savings','premium bonds'], '["Premium Bonds","Direct Saver","Income Bonds"]'::jsonb, '[]'::jsonb),
  ('trading212', 'Trading 212', 'investment_platform', '212', 'bg-slate-950 text-white', array['trading212'], '["Cash ISA","Invest cash interest","Stocks ISA cash"]'::jsonb, '["Stocks ISA","GIA","Cash ISA"]'::jsonb),
  ('vanguard', 'Vanguard', 'investment_platform', 'V', 'bg-red-700 text-white', array['vanguard uk'], '["Cash account","Stocks and Shares ISA","General account"]'::jsonb, '["SIPP","Stocks and Shares ISA","GIA"]'::jsonb)
on conflict (slug) do update set
  name = excluded.name,
  institution_type = excluded.institution_type,
  logo_text = excluded.logo_text,
  brand_class = excluded.brand_class,
  aliases = excluded.aliases,
  common_savings_types = excluded.common_savings_types,
  common_investment_products = excluded.common_investment_products,
  enabled = true,
  updated_at = now();

-- Backfill obvious provider slugs for existing manual savings/account rows.
update public.financial_accounts fa
set provider_slug = c.slug,
    updated_at = now()
from public.loop_financial_institution_catalog c
where fa.provider_slug is null
  and fa.provider is not null
  and (
    lower(fa.provider) = lower(c.name)
    or lower(fa.provider) = c.slug
    or exists (select 1 from unnest(c.aliases) a where lower(fa.provider) like '%' || lower(a) || '%')
  );
