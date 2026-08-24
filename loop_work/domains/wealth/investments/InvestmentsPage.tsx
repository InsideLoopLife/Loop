import { Nav } from "@/components/Nav";
import { PageLandingExperience } from "@/components/landing/PageLandingExperience";
import { PensionsInvestmentsClient } from "@/components/investments/PensionsInvestmentsClient";
import { investmentDataEntitlementForProfile } from "@/lib/wealth/user-tiers";
import { requireWealthPageAccess } from "@/domains/wealth/access";
import { getLatestInstrumentPrices, latestPricePerTicker } from "@/domains/market/prices";

type Person = { id: string; name: string; relationship: string; avatar_url: string | null; linked_user_id: string | null };
type PensionAccount = {
  id: string;
  person_id: string | null;
  label: string;
  provider: string;
  pension_type: string;
  contribution_method: string;
  employee_contribution_percent: number;
  employer_contribution_percent: number;
  employer_ni_topup_percent: number;
  employer_ni_topup_enabled: boolean;
  fixed_monthly_contribution: number;
  annual_platform_fee_percent: number;
  fixed_monthly_fee: number;
  current_value: number;
  value_as_of_date: string;
  source_url: string | null;
  contribution_frequency?: string | null;
  contribution_day?: number | null;
  regular_pay_day?: number | null;
  pension_payment_timing?: string | null;
  contribution_delay_days?: number | null;
  pension_investment_day?: number | null;
  pension_investment_timing?: string | null;
  contribution_paused?: boolean | null;
  contribution_auto_apply_enabled?: boolean | null;
  employer_ni_topup_mode?: string | null;
  employer_ni_rate_percent?: number | null;
  employer_ni_passback_percent?: number | null;
  employer_base_salary_basis?: string | null;
  contribution_started_on?: string | null;
  contribution_ended_on?: string | null;
  valuation_mode?: string | null;
  native_latest_price: number | null;
  native_currency: string | null;
  native_exchange: string | null;
  imported_invested_value: number | null;
  imported_current_value: number | null;
  imported_result_value: number | null;
  imported_account_currency: string | null;
  import_source_type: string | null;
  external_provider?: string | null;
  external_position_raw?: any;
  notes: string | null;
};
type PensionFund = {
  id: string;
  pension_account_id: string;
  fund_name: string;
  fund_code: string | null;
  group_label: string | null;
  target_allocation_percent: number;
  monthly_contribution_percent: number;
  contribution_active: boolean;
  current_value: number;
  units: number | null;
  unit_price: number | null;
  annual_fund_fee_percent: number;
  price_as_of_date: string;
  fee_source_url: string | null;
  notes: string | null;
};
type InvestmentAccount = {
  id: string;
  person_id: string | null;
  label: string;
  provider: string;
  account_type: string;
  annual_platform_fee_percent: number;
  fixed_monthly_fee: number;
  notes: string | null;
  external_provider?: string | null;
  external_account_id?: string | null;
  external_connection_id?: string | null;
  external_account_raw?: any;
  provider_import_enabled?: boolean | null;
  provider_cash_value?: number | null;
  provider_investable_cash_value?: number | null;
  provider_dividend_cash_value?: number | null;
  provider_cash_source?: string | null;
  provider_isa_subscribed_amount?: number | null;
  provider_isa_remaining_amount?: number | null;
  provider_isa_allowance_year?: string | null;
  sync_status?: string | null;
  last_provider_sync_at?: string | null;
};
type InvestmentAccountOwner = {
  investment_account_id: string;
  person_id: string | null;
};
type InvestmentPieSetting = {
  id: string;
  investment_account_id: string;
  group_label: string;
  monthly_reinvest_amount: number;
  reinvest_frequency: string;
  expected_dividend_yield_percent: number;
  auto_reinvest_dividends: boolean;
  reinvest_day?: number | null;
  reinvest_delay_days?: number | null;
  auto_materialise_reinvestments_enabled?: boolean | null;
  notes: string | null;
};

type InvestmentLot = {
  id: string;
  holding_id: string;
  purchase_date: string;
  execution_date?: string | null;
  contribution_date?: string | null;
  units: number;
  purchase_price: number;
  native_purchase_price?: number | null;
  native_currency?: string | null;
  price_quote_unit: string | null;
  external_transaction_id?: string | null;
  external_source?: string | null;
  contribution_source?: string | null;
  total_cost?: number | null;
  fees?: number | null;
  estimated?: boolean | null;
  notes: string | null;
};

type InvestmentProviderActivity = {
  id: string;
  investment_account_id: string | null;
  provider: string;
  external_activity_id: string;
  activity_type: string;
  activity_date: string;
  ticker?: string | null;
  units?: number | null;
  unit_price?: number | null;
  amount?: number | null;
  currency?: string | null;
};

type DbPensionScheme = {
  id: string;
  person_id: string | null;
  scheme_name: string;
  provider: string;
  scheme_section: string;
  accrual_rate: number;
  revaluation_rate_percent: number;
  rules_source_url?: string | null;
  rules_source_type?: string | null;
  rules_confidence?: number | null;
  notes: string | null;
};
type DbPensionServiceEvent = {
  id: string;
  db_pension_id: string;
  band_label: string;
  pensionable_pay: number;
  contribution_percent: number;
  start_date: string;
  end_date: string | null;
  notes: string | null;
};
type PayEvent = {
  id: string;
  person_id: string | null;
  gross_annual_salary: number;
  monthly_take_home_override: number | null;
  effective_from: string;
  effective_until: string | null;
};

type PensionContributionEvent = {
  id: string;
  pension_account_id: string | null;
  pension_fund_id: string | null;
  contribution_month: string | null;
  contribution_date: string | null;
  contribution_due_date?: string | null;
  investment_date?: string | null;
  contribution_amount: number | null;
  employee_amount?: number | null;
  employer_amount?: number | null;
  employer_ni_topup_amount?: number | null;
  fixed_amount?: number | null;
  allocation_percent?: number | null;
  unit_price?: number | null;
  units_bought?: number | null;
  event_status?: string | null;
  source?: string | null;
  external_transaction_id?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

type InvestmentHolding = {
  id: string;
  investment_account_id: string;
  asset_name: string;
  ticker: string | null;
  exchange: string | null;
  group_label: string | null;
  asset_kind: string | null;
  isin: string | null;
  units: number;
  average_buy_price: number;
  latest_price: number;
  latest_price_date: string;
  currency: string;
  annual_asset_fee_percent: number;
  target_allocation_percent: number;
  price_polling_enabled: boolean | null;
  price_quote_unit: string | null;
  source_url: string | null;
  native_latest_price: number | null;
  native_currency: string | null;
  native_exchange: string | null;
  imported_invested_value: number | null;
  imported_current_value: number | null;
  imported_result_value: number | null;
  imported_account_currency: string | null;
  import_source_type: string | null;
  external_provider?: string | null;
  external_position_raw?: any;
  cost_basis_status?: string | null;
  logo_url?: string | null;
  notes: string | null;
};

type InvestmentSnapshot = {
  id: string;
  holding_id: string;
  snapshot_at: string | null;
  snapshot_date: string | null;
  price: number | null;
  units: number | null;
  value: number | null;
  source: string | null;
};
type PopularMarketTick = {
  ticker: string | null;
  exchange_code: string | null;
  native_price: number | null;
  native_currency: string | null;
  gbp_price: number | null;
  price_gbp: number | null;
  point_at: string | null;
};
type InvestmentCoveragePlaceholder = {
  id: string;
  investment_account_id: string;
  request_id: string | null;
  query: string;
  exchange_hint: string | null;
  status: string;
  eta_text: string | null;
  progress: any;
  resolved_ticker?: string | null;
  resolved_exchange?: string | null;
  resolved_asset_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export default async function InvestmentsPage() {
  const { supabase, user, householdContext } = await requireWealthPageAccess({
    anyFeature: ["investments", "pensions"],
    deniedRedirect: "/account?tab=wealth&feature=investments",
  });
  const dataOwnerUserId = householdContext.dataOwnerUserId || user.id;

  const [peopleResult, pensionAccountsResult, pensionFundsResult, investmentAccountsResult, investmentAccountOwnersResult, investmentPieSettingsResult, investmentHoldingsResult, investmentLotsResult, investmentProviderActivitiesResult, dbPensionSchemesResult, dbPensionEventsResult, payEventsResult, pensionContributionEventsResult, profileResult, snapTradeConnectionResult] = await Promise.all([
    supabase.from("people").select("id, name, relationship, avatar_url, linked_user_id").eq("user_id", dataOwnerUserId).order("relationship").returns<Person[]>(),
    supabase.from("pension_accounts").select("id, person_id, label, provider, pension_type, contribution_method, employee_contribution_percent, employer_contribution_percent, employer_ni_topup_percent, employer_ni_topup_enabled, employer_ni_topup_mode, employer_ni_rate_percent, employer_ni_passback_percent, employer_base_salary_basis, fixed_monthly_contribution, annual_platform_fee_percent, fixed_monthly_fee, current_value, value_as_of_date, source_url, contribution_frequency, contribution_day, regular_pay_day, pension_payment_timing, contribution_delay_days, pension_investment_day, pension_investment_timing, contribution_paused, contribution_auto_apply_enabled, contribution_started_on, contribution_ended_on, valuation_mode, notes").eq("user_id", dataOwnerUserId).order("created_at", { ascending: false }).returns<PensionAccount[]>(),
    supabase.from("pension_funds").select("id, pension_account_id, fund_name, fund_code, group_label, target_allocation_percent, monthly_contribution_percent, contribution_active, current_value, units, unit_price, annual_fund_fee_percent, price_as_of_date, fee_source_url, notes").eq("user_id", dataOwnerUserId).order("created_at", { ascending: true }).returns<PensionFund[]>(),
    supabase.from("investment_accounts").select("id, person_id, label, provider, account_type, annual_platform_fee_percent, fixed_monthly_fee, notes, external_provider, external_account_id, external_connection_id, external_account_raw, provider_import_enabled, provider_cash_value, provider_investable_cash_value, provider_dividend_cash_value, provider_cash_source, provider_isa_subscribed_amount, provider_isa_remaining_amount, provider_isa_allowance_year, sync_status, last_provider_sync_at").eq("user_id", dataOwnerUserId).neq("record_status", "archived").order("created_at", { ascending: false }).returns<InvestmentAccount[]>(),
    supabase.from("investment_account_owners").select("investment_account_id, person_id").eq("user_id", dataOwnerUserId).returns<InvestmentAccountOwner[]>(),
    supabase.from("investment_pie_settings").select("id, investment_account_id, group_label, monthly_reinvest_amount, reinvest_frequency, expected_dividend_yield_percent, auto_reinvest_dividends, reinvest_day, reinvest_delay_days, auto_materialise_reinvestments_enabled, notes").eq("user_id", dataOwnerUserId).returns<InvestmentPieSetting[]>(),
    supabase.from("investment_holdings").select("id, investment_account_id, asset_name, ticker, exchange, group_label, asset_kind, isin, units, average_buy_price, latest_price, latest_price_date, currency, annual_asset_fee_percent, target_allocation_percent, price_polling_enabled, price_check_status, instrument_resolution_status, instrument_resolution_notes, last_price_check_at, price_quote_unit, source_url, native_latest_price, native_currency, native_exchange, latest_fx_rate_to_gbp, latest_fx_source, previous_close_price_gbp, previous_close_native_price, previous_close_native_currency, previous_close_at, day_open_price_gbp, day_open_native_price, day_open_at, day_change_basis, day_change_gbp, day_change_percent, day_change_native, day_change_native_percent, cost_basis_status, imported_invested_value, imported_current_value, imported_result_value, imported_account_currency, import_source_type, external_provider, external_position_raw, logo_url, updated_at, notes").eq("user_id", dataOwnerUserId).neq("record_status", "archived").order("created_at", { ascending: true }).returns<InvestmentHolding[]>(),
    supabase.from("investment_purchase_lots").select("id, holding_id, purchase_date, execution_date, contribution_date, units, purchase_price, native_purchase_price, native_currency, price_quote_unit, external_transaction_id, external_source, contribution_source, total_cost, fees, estimated, notes").eq("user_id", dataOwnerUserId).order("purchase_date", { ascending: true }).returns<InvestmentLot[]>(),
    supabase.from("investment_provider_activities").select("id, investment_account_id, provider, external_activity_id, activity_type, activity_date, ticker, units, unit_price, amount, currency").eq("user_id", dataOwnerUserId).order("activity_date", { ascending: false }).limit(1000).returns<InvestmentProviderActivity[]>(),
    supabase.from("defined_benefit_pensions").select("id, person_id, scheme_name, provider, scheme_section, accrual_rate, revaluation_rate_percent, rules_source_url, rules_source_type, rules_confidence, notes").eq("user_id", dataOwnerUserId).order("created_at", { ascending: false }).returns<DbPensionScheme[]>(),
    supabase.from("db_pension_service_events").select("id, db_pension_id, band_label, pensionable_pay, contribution_percent, start_date, end_date, notes").eq("user_id", dataOwnerUserId).order("start_date", { ascending: true }).returns<DbPensionServiceEvent[]>(),
    supabase.from("pay_events").select("id, person_id, gross_annual_salary, monthly_take_home_override, effective_from, effective_until").eq("user_id", dataOwnerUserId).order("effective_from", { ascending: true }).returns<PayEvent[]>(),
    supabase.from("pension_contribution_events").select("id, pension_account_id, pension_fund_id, contribution_month, contribution_date, contribution_due_date, investment_date, contribution_amount, employee_amount, employer_amount, employer_ni_topup_amount, fixed_amount, allocation_percent, unit_price, units_bought, event_status, source, external_transaction_id, notes, created_at").eq("user_id", dataOwnerUserId).order("investment_date", { ascending: false }).limit(300).returns<PensionContributionEvent[]>(),
    supabase.from("app_user_profiles").select("investment_view_mode, payment_tier, payment_tier_status, payment_tier_override, market_data_tier, market_data_tier_override, market_data_provider_status, market_data_realtime_enabled").eq("user_id", user.id).maybeSingle(),
    supabase.from("integration_connections").select("status, external_connection_id, last_synced_at, updated_at").eq("user_id", user.id).eq("provider", "SnapTrade").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  // Chart history, instrument-resolution state and the market ticker are independent.
  // Run them together so Investments avoids three extra server-latency steps.
  const popularSymbols = ["SPY", "QQQ", "AAPL", "NVDA", "MSFT", "AMZN", "META", "VUSA"];

  const [
    { data: investmentSnapshotsLatest },
    { data: investmentCoveragePlaceholdersData },
    popularMarketRows,
  ] = await Promise.all([
    supabase
      .from("investment_price_snapshots")
      .select("id, holding_id, snapshot_at, snapshot_date, price, units, value, source")
      .eq("user_id", dataOwnerUserId)
      .order("snapshot_at", { ascending: false })
      .limit(2500)
      .returns<InvestmentSnapshot[]>(),
    supabase
      .from("investment_instrument_coverage_placeholders")
      .select("id, investment_account_id, request_id, query, exchange_hint, status, eta_text, progress, resolved_ticker, resolved_exchange, resolved_asset_name, created_at, updated_at")
      .eq("user_id", dataOwnerUserId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<InvestmentCoveragePlaceholder[]>(),
    getLatestInstrumentPrices(supabase, popularSymbols, 120),
  ]);

  // Query newest snapshots, but keep chart input oldest-to-newest.
  const investmentSnapshotsData = (investmentSnapshotsLatest ?? []).slice().sort((a, b) => {
    const left = String(a.snapshot_at || a.snapshot_date || "");
    const right = String(b.snapshot_at || b.snapshot_date || "");
    return left.localeCompare(right);
  });

  const latestPopularMarketTicks = latestPricePerTicker(
    popularMarketRows,
  ) as PopularMarketTick[];

  return (
    <>
      <Nav />
      {((investmentAccountsResult.data ?? []).length + (investmentHoldingsResult.data ?? []).length + (pensionAccountsResult.data ?? []).length) === 0 ? (
        <main className="mx-auto w-[95vw] max-w-[2000px] px-4 py-6 sm:px-6 lg:px-8">
          <PageLandingExperience kind="investments" />
        </main>
      ) : null}
      <PensionsInvestmentsClient
        people={peopleResult.data ?? []}
        pensionAccounts={pensionAccountsResult.data ?? []}
        pensionFunds={pensionFundsResult.data ?? []}
        investmentAccounts={investmentAccountsResult.data ?? []}
        investmentAccountOwners={investmentAccountOwnersResult.data ?? []}
        investmentPieSettings={investmentPieSettingsResult.data ?? []}
        investmentHoldings={investmentHoldingsResult.data ?? []}
        investmentLots={investmentLotsResult.data ?? []}
        providerActivities={investmentProviderActivitiesResult.data ?? []}
        investmentSnapshots={investmentSnapshotsData ?? []}
        popularMarketTicks={latestPopularMarketTicks}
        investmentCoveragePlaceholders={investmentCoveragePlaceholdersData ?? []}
        dbPensionSchemes={dbPensionSchemesResult.data ?? []}
        dbPensionEvents={dbPensionEventsResult.data ?? []}
        payEvents={payEventsResult.data ?? []}
        pensionContributionEvents={pensionContributionEventsResult.data ?? []}
        initialInvestmentViewMode={profileResult.data?.investment_view_mode === "squares" ? "squares" : "lines"}
        investmentDataTier={investmentDataEntitlementForProfile(profileResult.data)}
        snapTradeConnection={{
          connected: String(snapTradeConnectionResult.data?.status || "").toLowerCase() === "connected" || profileResult.data?.market_data_provider_status === "connected",
          status: snapTradeConnectionResult.data?.status || null,
          externalConnectionId: snapTradeConnectionResult.data?.external_connection_id || null,
          lastSyncedAt: snapTradeConnectionResult.data?.last_synced_at || null,
        }}
      />
    </>
  );
}
