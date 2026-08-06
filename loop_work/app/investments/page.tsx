import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdContext } from "@/lib/auth/household-context";
import { PensionsInvestmentsClient } from "@/components/investments/PensionsInvestmentsClient";
import { investmentDataEntitlementForProfile } from "@/lib/wealth/user-tiers";

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
  contribution_paused?: boolean | null;
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
  price_check_status?: string | null;
  instrument_resolution_status?: string | null;
  instrument_resolution_notes?: string | null;
  last_price_check_at?: string | null;
  updated_at?: string | null;
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
  glossary_id: string | null;
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
  notes: string | null;
};

type InvestmentLot = {
  id: string;
  holding_id: string;
  purchase_date: string;
  units: number;
  purchase_price: number;
  price_quote_unit: string | null;
  external_transaction_id?: string | null;
  external_source?: string | null;
  total_cost?: number | null;
  fees?: number | null;
  notes: string | null;
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const dataOwnerUserId = householdContext.dataOwnerUserId || user.id;

  const [peopleResult, pensionAccountsResult, pensionFundsResult, pensionContributionEventsResult, investmentAccountsResult, investmentAccountOwnersResult, investmentPieSettingsResult, investmentHoldingsResult, investmentLotsResult, dbPensionSchemesResult, dbPensionEventsResult, payEventsResult, profileResult, snapTradeConnectionResult, investmentSnapshotsResult, investmentCoveragePlaceholdersResult] = await Promise.all([
    supabase.from("people").select("id, name, relationship, avatar_url, linked_user_id").eq("user_id", dataOwnerUserId).order("relationship").returns<Person[]>(),
    supabase.from("pension_accounts").select("id, person_id, label, provider, pension_type, contribution_method, employee_contribution_percent, employer_contribution_percent, employer_ni_topup_percent, employer_ni_topup_enabled, fixed_monthly_contribution, annual_platform_fee_percent, fixed_monthly_fee, current_value, value_as_of_date, source_url, contribution_frequency, contribution_day, contribution_paused, contribution_started_on, contribution_ended_on, valuation_mode, notes").eq("user_id", dataOwnerUserId).order("created_at", { ascending: false }).returns<PensionAccount[]>(),
    supabase.from("pension_funds").select("id, pension_account_id, fund_name, fund_code, group_label, target_allocation_percent, monthly_contribution_percent, contribution_active, current_value, units, unit_price, annual_fund_fee_percent, price_as_of_date, fee_source_url, notes, glossary_id").eq("user_id", dataOwnerUserId).order("created_at", { ascending: true }).returns<PensionFund[]>(),
    supabase.from("pension_contribution_events").select("id, pension_account_id, pension_fund_id, contribution_month, contribution_date, contribution_due_date, investment_date, contribution_amount, employee_amount, employer_amount, employer_ni_topup_amount, fixed_amount, allocation_percent, unit_price, units_bought, event_status, source, external_transaction_id, notes, created_at").eq("user_id", dataOwnerUserId).order("investment_date", { ascending: false }).limit(500),
    supabase.from("investment_accounts").select("id, person_id, label, provider, account_type, annual_platform_fee_percent, fixed_monthly_fee, notes, external_provider, external_account_id, external_connection_id, external_account_raw, provider_import_enabled, provider_cash_value, provider_investable_cash_value, provider_dividend_cash_value, provider_cash_source, provider_isa_subscribed_amount, provider_isa_remaining_amount, provider_isa_allowance_year, sync_status, last_provider_sync_at").eq("user_id", dataOwnerUserId).neq("record_status", "archived").order("created_at", { ascending: false }).returns<InvestmentAccount[]>(),
    supabase.from("investment_account_owners").select("investment_account_id, person_id").eq("user_id", dataOwnerUserId).returns<InvestmentAccountOwner[]>(),
    supabase.from("investment_pie_settings").select("id, investment_account_id, group_label, monthly_reinvest_amount, reinvest_frequency, expected_dividend_yield_percent, auto_reinvest_dividends, notes").eq("user_id", dataOwnerUserId).returns<InvestmentPieSetting[]>(),
    supabase.from("investment_holdings").select("id, investment_account_id, asset_name, ticker, exchange, group_label, asset_kind, isin, units, average_buy_price, latest_price, latest_price_date, currency, annual_asset_fee_percent, target_allocation_percent, price_polling_enabled, price_quote_unit, source_url, native_latest_price, native_currency, native_exchange, latest_fx_rate_to_gbp, latest_fx_source, previous_close_price_gbp, previous_close_native_price, previous_close_native_currency, previous_close_at, day_change_gbp, day_change_percent, day_change_native, day_change_native_percent, cost_basis_status, imported_invested_value, imported_current_value, imported_result_value, imported_account_currency, import_source_type, external_provider, external_position_raw, price_check_status, instrument_resolution_status, instrument_resolution_notes, last_price_check_at, updated_at, notes").eq("user_id", dataOwnerUserId).neq("record_status", "archived").order("created_at", { ascending: true }).returns<InvestmentHolding[]>(),
    supabase.from("investment_purchase_lots").select("id, holding_id, purchase_date, units, purchase_price, price_quote_unit, external_transaction_id, external_source, total_cost, fees, notes").eq("user_id", dataOwnerUserId).order("purchase_date", { ascending: true }).returns<InvestmentLot[]>(),
    supabase.from("defined_benefit_pensions").select("id, person_id, scheme_name, provider, scheme_section, accrual_rate, revaluation_rate_percent, rules_source_url, rules_source_type, rules_confidence, notes").eq("user_id", dataOwnerUserId).order("created_at", { ascending: false }).returns<DbPensionScheme[]>(),
    supabase.from("db_pension_service_events").select("id, db_pension_id, band_label, pensionable_pay, contribution_percent, start_date, end_date, notes").eq("user_id", dataOwnerUserId).order("start_date", { ascending: true }).returns<DbPensionServiceEvent[]>(),
    supabase.from("pay_events").select("id, person_id, gross_annual_salary, monthly_take_home_override, effective_from, effective_until").eq("user_id", dataOwnerUserId).order("effective_from", { ascending: true }).returns<PayEvent[]>(),
    supabase.from("app_user_profiles").select("investment_view_mode, payment_tier, payment_tier_status, payment_tier_override, market_data_tier, market_data_tier_override, market_data_provider_status, market_data_realtime_enabled").eq("user_id", user.id).maybeSingle(),
    supabase.from("integration_connections").select("status, external_connection_id, last_synced_at, updated_at").eq("user_id", user.id).eq("provider", "SnapTrade").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("investment_price_snapshots").select("id, holding_id, snapshot_at, snapshot_date, price, units, value, source").eq("user_id", dataOwnerUserId).order("snapshot_at", { ascending: false }).limit(600).returns<InvestmentSnapshot[]>(),
    supabase.from("investment_instrument_coverage_placeholders").select("id, investment_account_id, request_id, query, exchange_hint, status, eta_text, progress, resolved_ticker, resolved_exchange, resolved_asset_name, created_at, updated_at").eq("user_id", dataOwnerUserId).neq("status", "archived").order("created_at", { ascending: false }).limit(100).returns<InvestmentCoveragePlaceholder[]>(),
  ]);

  // "Since last price check" badges on the pension overview: only real,
  // logged price changes for funds resolved against the provider glossary —
  // never fabricated. Funds without a glossary_id, or without an applied
  // change yet, simply show "no data yet" in the UI rather than a number.
  const pensionGlossaryIds = Array.from(
    new Set((pensionFundsResult.data ?? []).map((fund) => fund.glossary_id).filter((id): id is string => Boolean(id))),
  );
  const pensionFundPriceChanges: Record<string, { previousPrice: number; proposedPrice: number; checkedAt: string }> = {};
  if (pensionGlossaryIds.length > 0) {
    const { data: priceChangeLogData } = await supabase
      .from("provider_fund_price_change_log")
      .select("glossary_id, previous_price, proposed_price, checked_at")
      .in("glossary_id", pensionGlossaryIds)
      .eq("applied", true)
      .order("checked_at", { ascending: false });
    for (const row of priceChangeLogData ?? []) {
      // Rows are ordered newest-first; keep only the first (latest) one seen per glossary_id.
      if (!row.glossary_id || pensionFundPriceChanges[row.glossary_id]) continue;
      pensionFundPriceChanges[row.glossary_id] = {
        previousPrice: Number(row.previous_price),
        proposedPrice: Number(row.proposed_price),
        checkedAt: row.checked_at,
      };
    }
  }

  return (
    <>
      <Nav />
      <PensionsInvestmentsClient
        people={peopleResult.data ?? []}
        pensionAccounts={pensionAccountsResult.data ?? []}
        pensionFunds={pensionFundsResult.data ?? []}
        pensionContributionEvents={pensionContributionEventsResult.data ?? []}
        pensionFundPriceChanges={pensionFundPriceChanges}
        investmentAccounts={investmentAccountsResult.data ?? []}
        investmentAccountOwners={investmentAccountOwnersResult.data ?? []}
        investmentPieSettings={investmentPieSettingsResult.data ?? []}
        investmentHoldings={investmentHoldingsResult.data ?? []}
        investmentLots={investmentLotsResult.data ?? []}
        investmentSnapshots={[...(investmentSnapshotsResult.data ?? [])].reverse()}
        investmentCoveragePlaceholders={investmentCoveragePlaceholdersResult.data ?? []}
        dbPensionSchemes={dbPensionSchemesResult.data ?? []}
        dbPensionEvents={dbPensionEventsResult.data ?? []}
        payEvents={payEventsResult.data ?? []}
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
