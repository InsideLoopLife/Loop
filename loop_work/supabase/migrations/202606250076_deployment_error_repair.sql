-- v27.76 Deployment error repair
-- Fixes:
-- 1) PostgreSQL syntax error from unique(lower(alias)) in old v27.63 bundled SQL.
-- 2) gen_random_bytes lookup when Supabase keeps pgcrypto in the extensions schema.
-- 3) Mortgage numeric field overflow on existing databases with older narrow numeric columns.
-- 4) Makes mortgage/date columns safe if an older database missed later schema columns.

create extension if not exists pgcrypto;

-- Supabase often installs pgcrypto into the `extensions` schema. Some older functions
-- used search_path public, pg_catalog and then called gen_random_bytes(...) unqualified.
-- This wrapper makes unqualified gen_random_bytes(...) safe without editing every old RPC.
do $do$
begin
  if to_regprocedure('public.gen_random_bytes(integer)') is null then
    execute $fn$
      create function public.gen_random_bytes(p_len integer)
      returns bytea
      language plpgsql
      volatile
      security definer
      set search_path = public, extensions, pg_catalog
      as $body$
      declare
        v_result bytea;
        v_fallback bytea := ''::bytea;
      begin
        begin
          execute 'select extensions.gen_random_bytes($1)' into v_result using p_len;
          if v_result is not null then
            return v_result;
          end if;
        exception when others then
          null;
        end;

        begin
          execute 'select pg_catalog.gen_random_bytes($1)' into v_result using p_len;
          if v_result is not null then
            return v_result;
          end if;
        exception when others then
          null;
        end;

        -- Last-resort fallback so invites still work in local/dev databases.
        -- Production Supabase should use pgcrypto above.
        while length(v_fallback) < greatest(1, p_len) loop
          v_fallback := v_fallback || decode(md5(random()::text || clock_timestamp()::text || txid_current()::text), 'hex');
        end loop;

        return substring(v_fallback from 1 for greatest(1, p_len));
      end
      $body$;
    $fn$;
  end if;
end
$do$;

grant execute on function public.gen_random_bytes(integer) to authenticated, anon;

-- Fix the v27.63 alias table if it partially ran or if the combined catch-up file was used.
create table if not exists public.app_food_product_aliases (
  id uuid primary key default gen_random_uuid(),
  alias text not null,
  canonical_name text not null,
  brand_name text,
  product_family text,
  confidence integer not null default 60,
  created_at timestamptz not null default now(),
  constraint app_food_product_aliases_confidence_check check (confidence between 0 and 100)
);

alter table public.app_food_product_aliases
  add column if not exists alias_key text;

update public.app_food_product_aliases
set alias_key = lower(trim(alias))
where alias_key is null or alias_key = '';

delete from public.app_food_product_aliases a
using public.app_food_product_aliases b
where a.alias_key = b.alias_key
  and a.id > b.id;

create unique index if not exists app_food_product_aliases_alias_key_idx
on public.app_food_product_aliases(alias_key);

-- Existing databases may have older, narrower mortgage/home numeric columns.
-- Widen them so normal UK balances and payments do not overflow.
create table if not exists public.home_mortgage_deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  home_id uuid,
  lender text,
  product_name text,
  balance numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.home_mortgage_deals
  add column if not exists balance_as_of_date date,
  add column if not exists interest_rate numeric default 0,
  add column if not exists rate_type text not null default 'fixed',
  add column if not exists repayment_type text not null default 'repayment',
  add column if not exists initial_period_end date,
  add column if not exists term_years integer not null default 25,
  add column if not exists monthly_payment_override numeric,
  add column if not exists start_date date not null default current_date,
  add column if not exists end_date date,
  add column if not exists notes text;

alter table public.home_mortgage_deals
  alter column balance type numeric(18,2) using coalesce(balance,0)::numeric(18,2),
  alter column interest_rate type numeric(9,4) using coalesce(interest_rate,0)::numeric(9,4),
  alter column monthly_payment_override type numeric(18,2) using monthly_payment_override::numeric(18,2);

-- Drop/recreate repayment check to include common values safely.
alter table public.home_mortgage_deals
  drop constraint if exists home_mortgage_deals_repayment_type_check;

alter table public.home_mortgage_deals
  add constraint home_mortgage_deals_repayment_type_check
  check (repayment_type in ('repayment', 'interest_only', 'part_and_part'));


-- Make newer home numeric fields exist before widening them.
alter table if exists public.homes
  add column if not exists estimated_value_low numeric,
  add column if not exists estimated_value_mid numeric,
  add column if not exists estimated_value_high numeric,
  add column if not exists target_purchase_price numeric,
  add column if not exists target_extra_cash numeric,
  add column if not exists property_value numeric default 0,
  add column if not exists purchase_price numeric;

alter table if exists public.homes
  alter column property_value type numeric(18,2) using coalesce(property_value,0)::numeric(18,2),
  alter column purchase_price type numeric(18,2) using purchase_price::numeric(18,2),
  alter column estimated_value_low type numeric(18,2) using estimated_value_low::numeric(18,2),
  alter column estimated_value_mid type numeric(18,2) using estimated_value_mid::numeric(18,2),
  alter column estimated_value_high type numeric(18,2) using estimated_value_high::numeric(18,2),
  alter column target_purchase_price type numeric(18,2) using target_purchase_price::numeric(18,2),
  alter column target_extra_cash type numeric(18,2) using target_extra_cash::numeric(18,2);

-- Helpful healthcheck for the exact issues reported.
drop function if exists public.loop_v2776_deployment_error_repair_healthcheck();
create or replace function public.loop_v2776_deployment_error_repair_healthcheck()
returns table(check_name text, ok boolean, detail text)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select 'gen_random_bytes_wrapper'::text,
    to_regprocedure('public.gen_random_bytes(integer)') is not null,
    'Unqualified gen_random_bytes(integer) is available to household invite RPCs.'
  union all
  select 'food_alias_sql_fixed',
    to_regclass('public.app_food_product_aliases') is not null
    and exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'app_food_product_aliases_alias_key_idx'),
    'Food alias table uses alias_key unique index instead of invalid unique(lower(alias)).'
  union all
  select 'mortgage_balance_wide',
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'home_mortgage_deals'
        and column_name = 'balance'
        and numeric_precision >= 18
    ),
    'Mortgage balance column is widened to numeric(18,2).'
  union all
  select 'mortgage_payment_wide',
    exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'home_mortgage_deals'
        and column_name = 'monthly_payment_override'
        and numeric_precision >= 18
    ),
    'Mortgage payment override column is widened to numeric(18,2).'
$$;

grant execute on function public.loop_v2776_deployment_error_repair_healthcheck() to anon, authenticated;
