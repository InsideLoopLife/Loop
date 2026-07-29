-- v28.53 - Supabase infra + market snapshot + LoopWatch repair
-- Safe to rerun. This removes the recurring 42P10 errors caused by tables that
-- existed without the unique indexes required by ON CONFLICT targets used by
-- workers/actions.

create extension if not exists pgcrypto;
create schema if not exists extensions;

create or replace function pg_temp.loop_v2853_make_unique_index(
  p_table regclass,
  p_index_name text,
  p_columns text[]
) returns void
language plpgsql
as $$
declare
  col text;
  table_text text := p_table::text;
  cols_sql text;
  not_null_sql text;
  idx_exists boolean;
begin
  foreach col in array p_columns loop
    if not exists (
      select 1
      from pg_attribute
      where attrelid = p_table
        and attname = col
        and not attisdropped
    ) then
      raise notice 'Skipping %, missing column %.%', p_index_name, table_text, col;
      return;
    end if;
  end loop;

  select exists(select 1 from pg_class where relkind = 'i' and relname = p_index_name) into idx_exists;
  if idx_exists then
    return;
  end if;

  select string_agg(format('%I', c), ', ') into cols_sql from unnest(p_columns) as c;
  select string_agg(format('%I is not null', c), ' and ') into not_null_sql from unnest(p_columns) as c;

  -- Deduplicate only complete conflict-target rows. PostgreSQL unique indexes allow
  -- duplicate NULLs, and Supabase upserts using these targets generally only send
  -- complete keys.
  execute format(
    'with ranked as (
       select ctid,
              row_number() over (partition by %s order by ctid desc) as rn
       from %s
       where %s
     )
     delete from %s t
     using ranked r
     where t.ctid = r.ctid and r.rn > 1',
    cols_sql,
    table_text,
    not_null_sql,
    table_text
  );

  execute format('create unique index if not exists %I on %s (%s)', p_index_name, table_text, cols_sql);
  raise notice 'Ensured unique index % on % (%)', p_index_name, table_text, cols_sql;
exception when undefined_table then
  raise notice 'Skipping %, table % does not exist', p_index_name, table_text;
when others then
  raise notice 'Could not ensure %: %', p_index_name, sqlerrm;
end;
$$;

do $$
begin
  if to_regclass('public.investment_instruments') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.investment_instruments'::regclass, 'investment_instruments_ticker_exchange_uidx', array['ticker','exchange_code']);
  end if;
  if to_regclass('public.investment_instrument_listings') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.investment_instrument_listings'::regclass, 'investment_listings_provider_symbol_venue_uidx', array['data_provider','symbol','venue_code']);
  end if;
  if to_regclass('public.investment_instrument_aliases') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.investment_instrument_aliases'::regclass, 'investment_alias_source_symbol_market_uidx', array['alias_source','alias_symbol','alias_market_code']);
    perform pg_temp.loop_v2853_make_unique_index('public.investment_instrument_aliases'::regclass, 'investment_alias_source_type_value_uidx', array['alias_source','alias_type','alias_value']);
  end if;
  if to_regclass('public.investment_instrument_price_points') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.investment_instrument_price_points'::regclass, 'investment_price_points_listing_minute_uidx', array['listing_id','price_minute']);
  end if;
  if to_regclass('public.investment_price_snapshots') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.investment_price_snapshots'::regclass, 'investment_snapshots_user_holding_minute_uidx', array['user_id','holding_id','snapshot_minute']);
  end if;
  if to_regclass('public.loopwatch_opportunities') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.loopwatch_opportunities'::regclass, 'loopwatch_opportunities_item_type_uidx', array['loopwatch_item_id','opportunity_type']);
  end if;
  if to_regclass('public.app_beta_flags') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.app_beta_flags'::regclass, 'app_beta_flags_flag_key_uidx', array['flag_key']);
  end if;
  if to_regclass('public.wealth_watch_settings') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.wealth_watch_settings'::regclass, 'wealth_watch_settings_setting_key_uidx', array['setting_key']);
  end if;
  if to_regclass('public.app_future_integration_tasks') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.app_future_integration_tasks'::regclass, 'app_future_integration_tasks_product_task_uidx', array['product_key','task_key']);
  end if;

  -- Other app upsert targets that can produce the same 42P10 error on partially migrated databases.
  if to_regclass('public.app_user_profiles') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.app_user_profiles'::regclass, 'app_user_profiles_user_id_uidx', array['user_id']);
  end if;
  if to_regclass('public.app_notification_preferences') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.app_notification_preferences'::regclass, 'app_notification_preferences_user_id_uidx', array['user_id']);
  end if;
  if to_regclass('public.account_daily_snapshots') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.account_daily_snapshots'::regclass, 'account_daily_snapshots_account_date_uidx', array['account_id','snapshot_date']);
  end if;
  if to_regclass('public.savings_provider_matches') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.savings_provider_matches'::regclass, 'savings_provider_matches_user_provider_uidx', array['user_id','provider_slug']);
  end if;
  if to_regclass('public.mortgage_lender_sources') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.mortgage_lender_sources'::regclass, 'mortgage_lender_sources_slug_url_uidx', array['lender_slug','source_url']);
  end if;
  if to_regclass('public.savings_rate_sources') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.savings_rate_sources'::regclass, 'savings_rate_sources_provider_url_uidx', array['provider_slug','source_url']);
  end if;
  if to_regclass('public.investment_market_coverage') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.investment_market_coverage'::regclass, 'investment_market_coverage_market_code_uidx', array['market_code']);
  end if;
  if to_regclass('public.loop_nutrition_card_facts') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.loop_nutrition_card_facts'::regclass, 'loop_nutrition_card_facts_card_key_uidx', array['card_id','fact_key']);
  end if;
  if to_regclass('public.loop_product_quality_snapshots') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.loop_product_quality_snapshots'::regclass, 'loop_product_quality_snapshots_card_id_uidx', array['card_id']);
  end if;
  if to_regclass('public.app_admin_users') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.app_admin_users'::regclass, 'app_admin_users_email_uidx', array['email']);
  end if;
  if to_regclass('public.app_plan_features') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.app_plan_features'::regclass, 'app_plan_features_feature_key_uidx', array['feature_key']);
  end if;
  if to_regclass('public.app_plan_feature_flags') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.app_plan_feature_flags'::regclass, 'app_plan_feature_flags_plan_feature_uidx', array['plan_slug','feature_key']);
  end if;
  if to_regclass('public.app_email_templates') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.app_email_templates'::regclass, 'app_email_templates_template_key_uidx', array['template_key']);
  end if;
  if to_regclass('public.pension_fund_value_snapshots') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.pension_fund_value_snapshots'::regclass, 'pension_fund_snapshots_user_fund_date_uidx', array['user_id','pension_fund_id','snapshot_date']);
  end if;
  if to_regclass('public.investment_provider_daily_checks') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.investment_provider_daily_checks'::regclass, 'investment_provider_daily_checks_provider_date_type_uidx', array['provider_id','check_date','check_type']);
  end if;
  if to_regclass('public.nutrition_product_catalog') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.nutrition_product_catalog'::regclass, 'nutrition_product_catalog_user_product_key_uidx', array['user_id','product_key']);
    perform pg_temp.loop_v2853_make_unique_index('public.nutrition_product_catalog'::regclass, 'nutrition_product_catalog_user_gtin_uidx', array['user_id','gtin']);
  end if;
  if to_regclass('public.nutrition_global_product_catalog') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.nutrition_global_product_catalog'::regclass, 'nutrition_global_product_catalog_product_key_uidx', array['product_key']);
    perform pg_temp.loop_v2853_make_unique_index('public.nutrition_global_product_catalog'::regclass, 'nutrition_global_product_catalog_gtin_uidx', array['gtin']);
  end if;
  if to_regclass('public.household_pay_events') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.household_pay_events'::regclass, 'household_pay_events_user_pay_month_uidx', array['user_id','pay_event_id','month']);
  end if;
  if to_regclass('public.investment_holding_groups') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.investment_holding_groups'::regclass, 'investment_holding_groups_user_account_label_uidx', array['user_id','investment_account_id','group_label']);
  end if;
  if to_regclass('public.family_leave_settings') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.family_leave_settings'::regclass, 'family_leave_settings_household_person_year_uidx', array['household_id','person_id','leave_year']);
  end if;
  if to_regclass('public.money_deal_watch_runs') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.money_deal_watch_runs'::regclass, 'money_deal_watch_runs_run_key_uidx', array['run_key']);
  end if;
  if to_regclass('public.mortgage_rate_deals') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.mortgage_rate_deals'::regclass, 'mortgage_rate_deals_external_key_uidx', array['external_product_key']);
  end if;
  if to_regclass('public.mortgage_recommendations') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.mortgage_recommendations'::regclass, 'mortgage_recs_user_deal_rate_kind_uidx', array['user_id','mortgage_deal_id','mortgage_rate_deal_id','recommendation_kind']);
  end if;
  if to_regclass('public.savings_recommendations') is not null then
    perform pg_temp.loop_v2853_make_unique_index('public.savings_recommendations'::regclass, 'savings_recs_user_account_deal_uidx', array['user_id','financial_account_id','savings_rate_deal_id']);
  end if;
end $$;

-- Reapply beta seed after constraints exist; this keeps v28.51 safe to rerun.
insert into public.app_beta_flags(flag_key, label, description, scope, enabled, rollout_percent, requires_admin_approval, notes)
select 'private_beta_access_gate', 'Private beta access gate', 'Require a server-validated access code before login/sign-up. Codes are never stored in plain text.', 'site', true, 100, false, 'Use LOOP_BETA_GATE_ENABLED=true, LOOP_BETA_CODE_PEPPER and LOOP_BETA_COOKIE_SECRET in production.'
where to_regclass('public.app_beta_flags') is not null
on conflict (flag_key) do update set
  label = excluded.label,
  description = excluded.description,
  enabled = excluded.enabled,
  rollout_percent = excluded.rollout_percent,
  updated_at = now();

insert into public.wealth_watch_settings(setting_key, setting_value, description)
select 'market_worker_expected_sweep_minutes', '5', 'Realtime users target a one-minute schedule, but stale UI allows a multi-minute provider sweep before warning.'
where to_regclass('public.wealth_watch_settings') is not null
on conflict (setting_key) do update set
  setting_value = excluded.setting_value,
  description = excluded.description,
  updated_at = now();

select pg_notify('pgrst', 'reload schema');
