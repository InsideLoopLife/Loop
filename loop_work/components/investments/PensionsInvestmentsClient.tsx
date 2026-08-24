"use client";

import { useEffect, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Brain,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileSpreadsheet,
  Info,
  Layers,
  LineChart,
  Loader2,
  PiggyBank,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  CheckCircle2,
  Trash2,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { FormInput } from "@/components/FormInput";
import { AddPensionAccountWizard } from "@/components/investments/AddPensionAccountWizard";
import { AddPensionFundWizard } from "@/components/investments/AddPensionFundWizard";
import { AddInvestmentAccountWizard } from "@/components/investments/AddInvestmentAccountWizard";
import { AddInvestmentHoldingWizard } from "@/components/investments/AddInvestmentHoldingWizard";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { SubmitButton } from "@/components/SubmitButton";
import { formatMoney } from "@/lib/format/money";
import { classifyIsaWrapper, isaAllowanceLimitForPerson, isaAllowanceRule } from "@/lib/wealth/isa-allowance";
import { marketDataQuality } from "@/lib/investments/market-data-quality";
import { calculatePensionSalarySacrifice } from "@/lib/investments/pension-contribution-math";
import { writeRouteSnapshot } from "@/lib/client/route-snapshot-cache";

const InvestmentHistoryChart = dynamic(
  () => import("@/components/investments/InvestmentHistoryChart").then((m) => m.InvestmentHistoryChart),
  { loading: () => <div className="h-48 animate-pulse rounded-3xl bg-slate-100" /> },
);
const AmplifiedInvestmentsDashboard = dynamic(
  () => import("@/components/investments/AmplifiedInvestmentsDashboard").then((m) => m.AmplifiedInvestmentsDashboard),
  { loading: () => <div className="h-72 animate-pulse rounded-3xl bg-slate-100" /> },
);
import {
  investmentProviders,
  pensionProviders,
  findProvider,
  accountOfferingsFor,
  providerValuationMode,
  providerContributionMode,
} from "@/lib/investments/provider-glossary";
import {
  MONEYBOX_ASSETS,
  MONEYBOX_ASSETS_LAST_REVIEWED,
  searchMoneyboxAssets,
  type MoneyboxAsset,
} from "@/lib/investments/moneybox-funds";
import type { InvestmentDataEntitlement } from "@/lib/wealth/user-tiers";
import {
  marketSessionForVenue,
  venueFor,
} from "@/lib/investments/market-venues";
import {
  addInvestmentAccount,
  addInvestmentHolding,
  addDefinedBenefitPension,
  addDbPensionServiceEvent,
  addPensionAccount,
  addPensionFund,
  deleteInvestmentHolding,
  deleteDefinedBenefitPension,
  deleteDbPensionServiceEvent,
  deletePensionAccount,
  deletePensionFund,
  importInvestmentHoldingsBulk,
  refreshInvestmentHoldingPrice,
  refreshAllInvestmentPrices,
  updateInvestmentHolding,
  updateInvestmentAccount,
  updateInvestmentAccountOwners,
  updateInvestmentPieSetting,
  deleteInvestmentAccountWithConfirmation,
  updateInvestmentViewMode,
  updatePensionViewMode,
  updatePensionFund,
  updatePensionAccount,
  quickUpdatePensionValue,
  updateDefinedBenefitPension,
  updateInvestmentHoldingGroups,
  saveMoneyboxInvestmentAccountSetup,
  addPensionContributionEvent,
  updatePensionContributionEvent,
  removePensionContributionEvent,
} from "@/lib/investments/actions";
import {
  pensionAccountValue,
  pensionFundValue,
  totalPensionValue,
} from "@/lib/investments/pension-valuation";

type Person = {
  id: string;
  name: string;
  relationship: string;
  avatar_url?: string | null;
  linked_user_id?: string | null;
};
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
  employer_ni_topup_enabled?: boolean;
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
  native_latest_price?: number | null;
  native_currency?: string | null;
  native_exchange?: string | null;
  latest_fx_rate_to_gbp?: number | null;
  latest_fx_source?: string | null;
  previous_close_price_gbp?: number | null;
  previous_close_native_price?: number | null;
  previous_close_native_currency?: string | null;
  previous_close_at?: string | null;
  day_open_price_gbp?: number | null;
  day_open_native_price?: number | null;
  day_open_at?: string | null;
  day_change_basis?: string | null;
  day_change_gbp?: number | null;
  day_change_percent?: number | null;
  day_change_native?: number | null;
  day_change_native_percent?: number | null;
  cost_basis_status?: string | null;
  imported_invested_value?: number | null;
  imported_current_value?: number | null;
  imported_result_value?: number | null;
  imported_account_currency?: string | null;
  import_source_type?: string | null;
  last_contribution_projection_at?: string | null;
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
  glossary_id?: string | null;
  performance_annualised_5y_percent?: number | null;
  performance_annualised_10y_percent?: number | null;
  performance_planning_rate_percent?: number | null;
  performance_as_of_date?: string | null;
  performance_source_url?: string | null;
  performance_status?: string | null;
  performance_verified_at?: string | null;
  last_provider_refresh_at?: string | null;
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
  id?: string;
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
type InvestmentHolding = {
  id: string;
  investment_account_id: string;
  asset_name: string;
  ticker: string | null;
  exchange: string | null;
  group_label: string | null;
  asset_kind?: string | null;
  isin?: string | null;
  units: number;
  average_buy_price: number;
  latest_price: number;
  latest_price_date: string;
  currency: string;
  price_quote_unit?: string | null;
  native_latest_price?: number | null;
  native_currency?: string | null;
  native_exchange?: string | null;
  latest_fx_rate_to_gbp?: number | null;
  latest_fx_source?: string | null;
  previous_close_price_gbp?: number | null;
  previous_close_native_price?: number | null;
  previous_close_native_currency?: string | null;
  previous_close_at?: string | null;
  day_open_price_gbp?: number | null;
  day_open_native_price?: number | null;
  day_open_at?: string | null;
  day_change_basis?: string | null;
  day_change_gbp?: number | null;
  day_change_percent?: number | null;
  day_change_native?: number | null;
  day_change_native_percent?: number | null;
  cost_basis_status?: string | null;
  imported_invested_value?: number | null;
  imported_current_value?: number | null;
  imported_result_value?: number | null;
  imported_account_currency?: string | null;
  import_source_type?: string | null;
  external_provider?: string | null;
  external_position_raw?: any;
  annual_asset_fee_percent: number;
  target_allocation_percent: number;
  price_polling_enabled?: boolean | null;
  price_check_status?: string | null;
  instrument_resolution_status?: string | null;
  instrument_resolution_notes?: string | null;
  last_price_check_at?: string | null;
  updated_at?: string | null;
  source_url: string | null;
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
  exchange_code?: string | null;
  native_price?: number | null;
  native_currency?: string | null;
  gbp_price?: number | null;
  price_gbp?: number | null;
  point_at?: string | null;
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
  updated_at?: string | null;
  created_at?: string | null;
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
  updated_at?: string | null;
};

type SnapTradeConnectionSummary = {
  connected: boolean;
  status: string | null;
  externalConnectionId: string | null;
  lastSyncedAt: string | null;
};

export type PensionsInvestmentsClientProps = {
  people: Person[];
  pensionAccounts: PensionAccount[];
  pensionFunds: PensionFund[];
  // Passed by the page but not yet consumed here — added to fix a type
  // error; if this was meant to power a feature, that wiring still needs
  // doing separately.
  pensionFundPriceChanges?: Record<string, { previousPrice: number; proposedPrice: number; checkedAt: string }>;
  investmentAccounts: InvestmentAccount[];
  investmentAccountOwners?: InvestmentAccountOwner[];
  investmentPieSettings?: InvestmentPieSetting[];
  investmentHoldings: InvestmentHolding[];
  investmentLots?: InvestmentLot[];
  providerActivities?: InvestmentProviderActivity[];
  investmentSnapshots?: InvestmentSnapshot[];
  popularMarketTicks?: PopularMarketTick[];
  investmentCoveragePlaceholders?: InvestmentCoveragePlaceholder[];
  dbPensionSchemes?: DbPensionScheme[];
  dbPensionEvents?: DbPensionServiceEvent[];
  payEvents?: PayEvent[];
  pensionContributionEvents?: PensionContributionEvent[];
  initialInvestmentViewMode?: "lines" | "squares";
  initialPensionViewMode?: "cards" | "full";
  investmentDataTier?: InvestmentDataEntitlement;
  snapTradeConnection?: SnapTradeConnectionSummary;
};

type Modal =
  | { type: "pension-account"; personId?: string }
  | { type: "edit-pension-account"; account: PensionAccount }
  | { type: "quick-edit-pension-value"; account: PensionAccount }
  | {
      type: "pension-fund";
      accountId?: string;
      defaults?: Partial<PensionFund>;
    }
  | { type: "provider-fund-search"; accountId?: string; provider?: string }
  | { type: "investment-account"; personId?: string }
  | { type: "edit-investment-account"; account: InvestmentAccount }
  | { type: "moneybox-allocation"; account: InvestmentAccount }
  | { type: "db-pension"; personId?: string }
  | { type: "edit-db-pension"; scheme: DbPensionScheme }
  | { type: "db-pension-event"; schemeId?: string }
  | { type: "investment-holding"; accountId?: string }
  | { type: "bulk-holdings"; accountId?: string }
  | { type: "edit-pension-fund"; fund: PensionFund }
  | { type: "research-pension-fund"; fund: PensionFund; provider: string }
  | { type: "edit-investment-holding"; holding: InvestmentHolding }
  | { type: "investment-account-owners"; account: InvestmentAccount }
  | {
      type: "investment-pie-settings";
      account: InvestmentAccount;
      groupLabel: string;
      setting?: InvestmentPieSetting;
      holdings: InvestmentHolding[];
    }
  | { type: "confirm-delete-investment-account"; account: InvestmentAccount }
  | { type: "investment-holding-info"; holding: InvestmentHolding }
  | {
      type: "organise-investment-pies";
      account: InvestmentAccount;
      holdings: InvestmentHolding[];
    }
  | null;

const inputClass =
  "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-orange-500 transition focus:ring-2";
const today = new Date().toISOString().slice(0, 10);

function valueOfFund(fund: PensionFund) {
  return pensionFundValue(fund);
}
function isGbxHolding(holding: InvestmentHolding) {
  const exchange = normalisedExchange(
    holding.exchange || holding.native_exchange,
  );
  const quoteUnit = String(holding.price_quote_unit || "").toLowerCase();
  const nativeCurrency = String(holding.native_currency || "").toUpperCase();
  const importedCurrency = String(
    holding.imported_account_currency || "",
  ).toUpperCase();
  return (
    exchange === "LSE" ||
    exchange === "XLON" ||
    quoteUnit === "gbx" ||
    nativeCurrency === "GBX" ||
    importedCurrency === "GBX"
  );
}
function isProviderImportedHolding(holding: InvestmentHolding) {
  return String(holding.import_source_type || "").toLowerCase() === "snaptrade";
}
function impliedGbpPriceFromProviderValue(holding: InvestmentHolding) {
  const units = Number(holding.units || 0);
  const providerValue = Number(holding.imported_current_value || 0);
  if (units > 0 && providerValue > 0) return providerValue / units;
  return 0;
}
function normaliseStoredPriceToGbp(
  holding: InvestmentHolding,
  value: number,
  kind: "latest" | "average",
) {
  const exchange = normalisedExchange(
    holding.exchange || holding.native_exchange,
  );
  const quoteUnit = String(holding.price_quote_unit || "").toLowerCase();
  const nativeCurrency = String(
    holding.native_currency || marketCurrencyFor(exchange, holding.currency),
  ).toUpperCase();
  if (!Number.isFinite(value) || value <= 0) return 0;
  const providerImplied = impliedGbpPriceFromProviderValue(holding);
  if (kind === "latest" && providerImplied > 0) {
    const rawAsPence = value / 100;
    const rawDistance =
      Math.abs(value - providerImplied) / Math.max(0.01, providerImplied);
    const penceDistance =
      Math.abs(rawAsPence - providerImplied) / Math.max(0.01, providerImplied);
    // Provider value divided by units is the best sanity check. If the saved latest price
    // already matches the provider-implied GBP price, do not divide it again just because
    // the original quote came from a GBX/LSE market.
    if (rawDistance <= 0.1) return value;
    if (penceDistance < rawDistance || rawDistance > 20) return rawAsPence;
    if (rawDistance > 0.5 && penceDistance > 0.5) return providerImplied;
  }
  if (exchange === "LSE" || quoteUnit === "gbx" || nativeCurrency === "GBX") {
    // In provider-imported rows LOOP may already store the converted GBP price while
    // keeping native_currency/quote_unit for display. Only divide values that still look
    // like pence (for example 274p or 29.6p), not values already below £5.
    if (value >= 5) return value / 100;
  }
  return value;
}
function latestPriceGbp(holding: InvestmentHolding) {
  const latest = Number(holding.latest_price ?? 0);
  const normalised = normaliseStoredPriceToGbp(holding, latest, "latest");
  if (normalised > 0) return normalised;
  return impliedGbpPriceFromProviderValue(holding);
}
function averagePriceGbp(holding: InvestmentHolding) {
  return normaliseStoredPriceToGbp(
    holding,
    Number(holding.average_buy_price ?? 0),
    "average",
  );
}
function holdingValue(holding: InvestmentHolding) {
  if (Number(holding.imported_current_value || 0) > 0)
    return Number(holding.imported_current_value);
  return Number(holding.units ?? 0) * latestPriceGbp(holding);
}
function hasVerifiedProviderCostBasis(holding: InvestmentHolding) {
  if (!isProviderImportedHolding(holding)) return true;
  const raw = holding.external_position_raw || {};
  return Boolean(
    raw?.loop_cost_basis_verified === true ||
      raw?.verified_cost_basis === true ||
      raw?.cost_basis_verified === true,
  );
}
function holdingCost(holding: InvestmentHolding) {
  const value = holdingValue(holding);
  if (
    isProviderImportedHolding(holding) &&
    !hasVerifiedProviderCostBasis(holding)
  ) {
    // SnapTrade/Trading 212 cost-basis payloads are not always complete or wrapper-aware.
    // Use current value as the temporary basis so LOOP never shows a false large P/L.
    return value;
  }
  const importedCost = Number(holding.imported_invested_value || 0);
  if (importedCost > 0) {
    const ratio = value > 0 ? importedCost / value : 1;
    if (isProviderImportedHolding(holding) && (ratio > 20 || ratio < 0.02))
      return value;
    return importedCost;
  }
  if (isProviderImportedHolding(holding) && value > 0) return value;
  return Number(holding.units ?? 0) * averagePriceGbp(holding);
}
function hasUnverifiedProviderCostBasis(holdings: InvestmentHolding[]) {
  return holdings.some(
    (holding) =>
      (isProviderImportedHolding(holding) &&
      !hasVerifiedProviderCostBasis(holding)) ||
      isPriceUnverified(holding),
  );
}

function monthlyFeeOn(value: number, annualPercent: number, fixedMonthly = 0) {
  return (
    (value * (Number(annualPercent || 0) / 100)) / 12 +
    Number(fixedMonthly || 0)
  );
}
function ownerName(people: Person[], personId: string | null) {
  if (!personId) return "Shared / household";
  return people.find((person) => person.id === personId)?.name ?? "Person";
}
function accountTypeLabel(type: string) {
  return type === "gia"
    ? "GIA"
    : type === "isa"
      ? "ISA"
      : type === "sipp"
        ? "SIPP"
        : type === "crypto"
          ? "Crypto"
          : "Other";
}
function priceDisplayFromStored(
  price: number,
  unit?: string | null,
  currency = "GBP",
) {
  const cleanUnit = String(unit || "").toLowerCase();
  const cleanCurrency = String(currency || "GBP").toUpperCase();
  if (cleanUnit === "gbx") return `${Number(price).toFixed(2)}p`;
  if (cleanUnit === "usd" || cleanCurrency === "USD")
    return `USD ${Number(price).toFixed(4)}`;
  if (cleanUnit === "eur" || cleanCurrency === "EUR")
    return `EUR ${Number(price).toFixed(4)}`;
  return `${cleanCurrency} ${Number(price).toFixed(4)}`;
}
function gbpPriceLabel(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 4,
  }).format(Number(value || 0));
}
function normalisedExchange(exchange?: string | null) {
  const ex = String(exchange || "")
    .trim()
    .toUpperCase();
  if (
    [
      "NMS",
      "NGM",
      "NAS",
      "NASDAQGS",
      "NASDAQ",
      "XNAS",
      "XNCM",
      "XNGS",
      "NCM",
    ].includes(ex)
  )
    return "NASDAQ";
  if (["NYQ", "NYSE", "XNYS"].includes(ex)) return "NYSE";
  if (["ASE", "AMEX", "NYSEAMERICAN", "XASE"].includes(ex)) return "AMEX";
  if (["LON", "XLON", "LSE", "XLSE", "LDN"].includes(ex)) return "LSE";
  if (["OTCM", "OTC", "OOTC"].includes(ex)) return "OTCM";
  if (["PINX", "PINK", "OTCPK"].includes(ex)) return "PINX";
  if (["XETR", "ETR", "XETRA", "IBIS", "DE"].includes(ex)) return "XETR";
  if (["XFRA", "FRA", "FRANKFURT", "F"].includes(ex)) return "XFRA";
  if (["XPAR", "PAR", "EPA", "PA"].includes(ex)) return "XPAR";
  if (["XAMS", "AMS", "AS"].includes(ex)) return "XAMS";
  if (["XMIL", "MIL", "MI"].includes(ex)) return "XMIL";
  if (["XSWX", "SWX", "SW"].includes(ex)) return "XSWX";
  if (["XTSE", "TSE", "TO", "TSX"].includes(ex)) return "XTSE";
  if (["ARCX", "XARC", "NYSEARCA", "ARCA"].includes(ex)) return "ARCX";
  if (["BATS", "BATS-US", "CBOE", "EDGX", "BZX"].includes(ex)) return "BATS";
  return ex;
}
function exchangeLabel(exchange?: string | null) {
  return normalisedExchange(exchange) || String(exchange || "").toUpperCase();
}

function marketCurrencyFor(exchange?: string | null, fallback?: string | null) {
  const ex = normalisedExchange(exchange);
  const fb = String(fallback || "").toUpperCase();
  if (ex === "LSE" || ex === "AIM") return "GBX";
  if (
    ["NASDAQ", "NYSE", "AMEX", "US", "OTCM", "PINX", "ARCX", "BATS"].includes(
      ex,
    )
  )
    return "USD";
  if (
    [
      "XETR",
      "XFRA",
      "XPAR",
      "XAMS",
      "XMIL",
      "XBRU",
      "XLIS",
      "XHEL",
      "XWBO",
    ].includes(ex)
  )
    return "EUR";
  if (ex === "XSWX") return "CHF";
  if (ex === "XTSE" || ex === "TSXV") return "CAD";
  if (ex === "XASX") return "AUD";
  if (ex === "XHKG") return "HKD";
  if (ex === "XTKS") return "JPY";
  if (fb) return fb;
  return "GBP";
}
function formatPercentExact(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value)))
    return "review";
  return String(Number(value).toFixed(4)).replace(/\.?0+$/, "");
}
function priceDisplay(holding: InvestmentHolding) {
  const exchange = normalisedExchange(
    holding.exchange || holding.native_exchange,
  );
  const nativeCurrency = String(
    holding.native_currency || marketCurrencyFor(exchange, holding.currency),
  ).toUpperCase();
  const gbpPrice = latestPriceGbp(holding);
  const gbp = gbpPriceLabel(gbpPrice);
  if (exchange === "LSE" || nativeCurrency === "GBX") {
    const savedLatest = Number(holding.latest_price || 0);
    const pence =
      holding.native_latest_price !== null &&
      holding.native_latest_price !== undefined
        ? Number(holding.native_latest_price)
        : gbpPrice * 100;
    const prefix =
      savedLatest > 0 || gbpPrice > 0
        ? `${pence.toFixed(2)}p`
        : "price pending";
    return `${prefix} · ${gbp} GBP equiv`;
  }
  if (nativeCurrency && nativeCurrency !== "GBP") {
    const native =
      holding.native_latest_price !== null &&
      holding.native_latest_price !== undefined
        ? Number(holding.native_latest_price)
        : Number(holding.latest_price || 0);
    return `${nativeCurrency} ${native.toFixed(4)} · ${gbp} GBP equiv`;
  }
  return gbp;
}
function fundColour(index: number) {
  const colours = [
    "bg-slate-950",
    "bg-blue-700",
    "bg-sky-300",
    "bg-emerald-700",
    "bg-orange-500",
    "bg-violet-600",
  ];
  return colours[index % colours.length];
}
function PersonOptions({ people }: { people: Person[] }) {
  return (
    <>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name} ({person.relationship})
        </option>
      ))}
      <option value="">Shared / household</option>
    </>
  );
}
function ProviderDocs({ providerName }: { providerName: string }) {
  const provider = findProvider(providerName);
  if (!provider) return null;
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
      <p className="font-black text-slate-950">Provider glossary</p>
      <p className="mt-1">{provider.notes}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {provider.docs.map((doc) => (
          <a
            key={doc.url}
            href={doc.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white px-3 py-2 text-xs font-black text-slate-700"
          >
            {doc.label}
          </a>
        ))}
      </div>
    </div>
  );
}
function ModalShell({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <ModalFrame title={title} description={description} eyebrow="Pensions & investments" onClose={onClose}>
      {children}
    </ModalFrame>
  );
}
function AllocationBar({ funds }: { funds: PensionFund[] }) {
  const total = funds.reduce((sum, fund) => sum + valueOfFund(fund), 0);
  if (total <= 0) return <div className="h-4 rounded-full bg-slate-100" />;
  return (
    <div className="flex h-5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-white">
      {funds.map((fund, index) => {
        const percent = (valueOfFund(fund) / total) * 100;
        return (
          <div
            key={fund.id}
            className={`${fundColour(index)} min-w-[4px]`}
            style={{ width: `${Math.max(2, percent)}%` }}
            title={`${fund.fund_name}: ${percent.toFixed(1)}%`}
          />
        );
      })}
    </div>
  );
}

function ThreadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 12h18" />
      <circle cx="6" cy="12" r="2.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="2.25" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="2.25" fill="currentColor" stroke="none" />
    </svg>
  );
}
function ProviderLogo({ provider }: { provider: string }) {
  const meta = providerLogoMeta(provider);
  return (
    <div
      className={`flex h-12 min-w-12 shrink-0 items-center justify-center rounded-2xl px-2 text-sm font-black shadow-lg shadow-slate-950/15 ring-1 ring-white/15 ${meta.className}`}
      title={meta.sub}
    >
      {meta.label}
    </div>
  );
}

function AccountSourceMark({ account }: { account: InvestmentAccount }) {
  const provider = String(account.external_provider || "").toLowerCase();
  if (provider === "snaptrade") {
    return (
      <span
        className="inline-flex items-center justify-center bg-transparent"
        title={`SnapTrade imported account${account.sync_status ? ` · ${String(account.sync_status).replace(/_/g, " ")}` : ""}`}
      >
        <img
          src="/brand/snaptrade-mark.svg"
          alt="SnapTrade"
          className="h-5 w-5 object-contain"
        />
      </span>
    );
  }
  if (provider) {
    return (
      <span
        className="inline-flex min-h-5 items-center justify-center rounded-full px-1.5 text-[9px] font-black uppercase tracking-wide text-slate-300 ring-1 ring-white/15"
        title={`${account.external_provider} imported account`}
      >
        API
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center text-slate-300"
      title="Manual account"
    >
      <Pencil className="h-3.5 w-3.5" strokeWidth={2.3} />
    </span>
  );
}

function OwnerBadge({
  people,
  personId,
}: {
  people: Person[];
  personId: string | null;
}) {
  const person = personId ? people.find((item) => item.id === personId) : null;
  if (!person)
    return (
      <span className="absolute bottom-4 right-4 rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white shadow-lg">
        Household
      </span>
    );
  return (
    <span className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-black text-slate-700 shadow-lg ring-1 ring-slate-200">
      {person.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={person.avatar_url}
          alt=""
          className="h-5 w-5 rounded-full object-cover"
        />
      ) : (
        <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-100 text-[10px]">
          {person.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      {person.name}
      {person.linked_user_id ? (
        <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-[10px] text-white">
          ✓
        </span>
      ) : null}
    </span>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function accountOwnerIds(
  account: InvestmentAccount,
  ownerRows: InvestmentAccountOwner[] = [],
) {
  const ids = new Set<string>();
  if (account.person_id) ids.add(account.person_id);
  ownerRows
    .filter((row) => row.investment_account_id === account.id && row.person_id)
    .forEach((row) => ids.add(String(row.person_id)));
  return Array.from(ids);
}

function ownerPeopleForAccount(
  account: InvestmentAccount,
  people: Person[],
  ownerRows: InvestmentAccountOwner[] = [],
) {
  const ids = accountOwnerIds(account, ownerRows);
  return ids
    .map((id) => people.find((person) => person.id === id))
    .filter(Boolean) as Person[];
}

function PotOwnerProfiles({
  people,
  account,
  ownerRows,
  onClick,
}: {
  people: Person[];
  account: InvestmentAccount;
  ownerRows?: InvestmentAccountOwner[];
  onClick: () => void;
}) {
  const owners = ownerPeopleForAccount(account, people, ownerRows || []);
  if (!owners.length) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex h-9 items-center gap-2 rounded-full bg-white/10 px-2.5 text-xs font-black text-white ring-1 ring-white/15"
        title="Manage pot owners"
      >
        <UserPlus className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center rounded-full bg-white/10 py-0 pl-1.5 pr-2 text-xs font-black text-white ring-1 ring-white/15"
      title={`Manage pot owners: ${owners.map((person) => person.name).join(", ")}`}
    >
      <span className="flex -space-x-2">
        {owners.slice(0, 5).map((person) => (
          <ProfileAvatar key={person.id} person={person} compact />
        ))}
      </span>
      {owners.length > 5 ? (
        <span className="ml-2 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">
          +{owners.length - 5}
        </span>
      ) : null}
    </button>
  );
}

function shortRelativeTime(value?: string | null) {
  if (!value) return "not updated yet";
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return "unknown";
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function marketStatus(
  exchange?: string | null,
  assetKind?: string | null,
  symbol?: string | null,
) {
  const ex = normalisedExchange(exchange);
  const kind = String(assetKind || "").toLowerCase();
  const state = marketSessionForVenue(ex, new Date(), symbol);
  const venue = state.venue || venueFor(ex, symbol);
  if (kind === "fund" || ex === "VANGUARD" || ex === "YAHOO FUND")
    return {
      label: "priced daily",
      className: "bg-slate-400",
      textClass: "text-slate-600",
      venue,
      session: "daily",
      state,
    };
  if (state.session === "regular")
    return {
      label: "live market",
      className: "bg-emerald-500",
      textClass: "text-emerald-700",
      venue,
      session: "regular",
      state,
    };
  if (state.session === "pre")
    return {
      label: "early market",
      className: "bg-orange-400",
      textClass: "text-orange-700",
      venue,
      session: "pre",
      state,
    };
  if (state.session === "after")
    return {
      label: "sunset market",
      className: "bg-purple-500",
      textClass: "text-purple-700",
      venue,
      session: "after",
      state,
    };
  if (state.session === "holiday")
    return {
      label: "market holiday",
      className: "bg-slate-400",
      textClass: "text-slate-600",
      venue,
      session: "holiday",
      state,
    };
  return {
    label: "closed",
    className: "bg-slate-400",
    textClass: "text-slate-600",
    venue,
    session: state.session,
    state,
  };
}

function MarketStatusPill({ holding }: { holding: InvestmentHolding }) {
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(
      () => setClockNow(Date.now()),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const status = marketStatus(
    holding.exchange || holding.native_exchange,
    holding.asset_kind,
    holding.ticker,
  );
  const dataQuality = marketDataQuality(holding.source_url);
  const updatedAt =
    holding.last_price_check_at ||
    holding.latest_price_date ||
    holding.updated_at ||
    null;
  const checkedMs = updatedAt
    ? clockNow - new Date(updatedAt).getTime()
    : Infinity;
  // The worker runs every minute, but one complete sweep can take several minutes on free
  // delayed providers. Avoid flagging a live market as stale while the worker is still
  // actively cycling through the watchlist.
  // Daily-priced funds (OEICs, Vanguard/Yahoo mutual funds, etc.) only ever get one new price a
  // day, often with a lag over weekends/bank holidays — the few-minute threshold below is for
  // continuously-traded stocks and was wrongly being applied to these too, flagging a fund
  // checked yesterday (completely normal for a fund) as "stale".
  const isDailyPriced = status.session === "daily";
  const staleAfterMs = isDailyPriced ? 36 * 60 * 60_000 : status.state.isExtended ? 10 * 60_000 : 6 * 60_000;
  const isStaleWhileTradable = isDailyPriced
    ? checkedMs > staleAfterMs
    : status.state.isMarketOpen && checkedMs > staleAfterMs;
  const venueName =
    status.venue?.name ||
    exchangeLabel(holding.exchange || holding.native_exchange || "market");
  const displayLabel = isStaleWhileTradable
    ? `${status.label} · stale · ${dataQuality.label}`
    : `${status.label} · ${dataQuality.label}`;
  const dotClass = isStaleWhileTradable ? "bg-amber-400" : status.className;
  const textClass = isStaleWhileTradable ? "text-amber-700" : status.textClass;
  const title = `${displayLabel} · ${venueName} · last price check ${shortRelativeTime(updatedAt)} · ${dataQuality.detail} · local ${status.state.localTimeLabel} · ${status.state.openLabel}-${status.state.closeLabel}${holding.price_check_status ? ` · ${holding.price_check_status}` : ""}`;
  return (
    <span
      className={`group relative inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-black ${textClass}`}
      title={title}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
      {displayLabel}
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-72 -translate-x-1/2 rounded-2xl bg-slate-950 px-3 py-2 text-left text-[11px] font-bold leading-5 text-white shadow-2xl group-hover:block">
        <span className="block font-black">{venueName}</span>
        <span className="block text-blue-200">{dataQuality.detail}</span>
        <span
          className={
            isStaleWhileTradable
              ? "block text-amber-200"
              : "block text-white/75"
          }
        >
          Last checked {shortRelativeTime(updatedAt)}
          {isStaleWhileTradable
            ? " · worker sweep is overdue for this holding"
            : ""}
        </span>
        <span className="block text-white/70">
          Local now {status.state.localTimeLabel}
        </span>
        <span className="block text-white/60">
          Session {status.state.openLabel}–{status.state.closeLabel} ·{" "}
          {status.state.nextStateLabel}
        </span>
        <span className="block text-white/60">
          {status.venue?.currency ||
            holding.native_currency ||
            holding.currency ||
            "GBP"}{" "}
          · {status.venue?.timezone || "market timezone"}
        </span>
        {status.state.session === "closed" ||
        status.state.session === "holiday" ||
        status.state.session === "weekend" ? (
          <span className="block text-white/60">
            Closed or holiday markets are not logged until the next tradeable
            session.
          </span>
        ) : null}
      </span>
    </span>
  );
}

function providerLogoMeta(provider: string) {
  const name = (provider || "Provider").trim();
  const lower = name.toLowerCase();
  if (lower.includes("trading 212"))
    return {
      label: "212",
      className: "bg-blue-700 text-white",
      sub: "Trading 212",
    };
  if (lower.includes("vanguard"))
    return { label: "V", className: "bg-red-700 text-white", sub: "Vanguard" };
  if (lower.includes("legal") || lower.includes("l&g"))
    return {
      label: "L&G",
      className: "bg-blue-950 text-white",
      sub: "Legal & General",
    };
  if (lower.includes("pensionbee"))
    return {
      label: "PB",
      className: "bg-orange-500 text-white",
      sub: "PensionBee",
    };
  if (lower.includes("hargreaves"))
    return { label: "HL", className: "bg-sky-700 text-white", sub: "HL" };
  if (lower.includes("revolut"))
    return { label: "R", className: "bg-slate-950 text-white", sub: "Revolut" };
  return {
    label: name.slice(0, 3).toUpperCase(),
    className: "bg-slate-950 text-white",
    sub: name,
  };
}

function firstRawLogoUrl(raw: any): string | null {
  const direct = [
    raw?.logo_url,
    raw?.logoUrl,
    raw?.logo,
    raw?.image_url,
    raw?.imageUrl,
    raw?.icon_url,
    raw?.symbol?.logo_url,
    raw?.symbol?.logoUrl,
    raw?.universal_symbol?.logo_url,
    raw?.universal_symbol?.logoUrl,
    raw?.security?.logo_url,
    raw?.security?.logoUrl,
    raw?.instrument?.logo_url,
    raw?.instrument?.logoUrl,
  ];
  for (const value of direct) {
    const text = String(value || "").trim();
    if (/^https?:\/\//i.test(text)) return text;
  }
  return null;
}

function rawLogoDomain(raw: any): string | null {
  const values = [
    raw?.logoDomain,
    raw?.logo_domain,
    raw?.domain,
    raw?.website,
    raw?.website_url,
    raw?.symbol?.logo_domain,
    raw?.symbol?.website,
    raw?.universal_symbol?.logo_domain,
    raw?.universal_symbol?.website,
    raw?.security?.logo_domain,
    raw?.instrument?.logo_domain,
  ];
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    try {
      const url = text.includes("://")
        ? new URL(text)
        : new URL(`https://${text}`);
      return url.hostname.replace(/^www\./, "");
    } catch {
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text))
        return text.replace(/^www\./i, "");
    }
  }
  return null;
}

function sourceDomain(value?: string | null) {
  try {
    return value ? new URL(value).hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

function AssetLogo({
  holding,
  size = "md",
}: {
  holding: InvestmentHolding;
  size?: "sm" | "md" | "lg";
}) {
  const ticker =
    String(holding.ticker || holding.asset_name || "?")
      .replace(/\.(L|US)$/i, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 6)
      .toUpperCase() || "?";
  const domainMap: Record<string, string> = {
    AAPL: "apple.com",
    ABBV: "abbvie.com",
    ADC: "agreerealty.com",
    ADM: "adm.com",
    AFL: "aflac.com",
    AMZN: "amazon.com",
    BATS: "bat.com",
    BEN: "franklinresources.com",
    BETR: "better.com",
    BLK: "blackrock.com",
    BMO: "bmo.com",
    BMY: "bms.com",
    BNS: "scotiabank.com",
    C: "citigroup.com",
    CB: "chubb.com",
    CF: "cfindustries.com",
    CNQ: "cnq.com",
    CSCO: "cisco.com",
    CVX: "chevron.com",
    DUK: "duke-energy.com",
    ECL: "ecolab.com",
    EMR: "emerson.com",
    G4M: "gear4music.com",
    GAME: "gamesquare.com",
    GOEV: "canoo.com",
    GOEVQ: "canoo.com",
    GD: "gd.com",
    GFIN: "gfinityplc.com",
    GOOG: "abc.xyz",
    GOOGL: "abc.xyz",
    GOOD: "gladstonecommercial.com",
    IBM: "ibm.com",
    ITW: "itw.com",
    JPM: "jpmorganchase.com",
    JNJ: "jnj.com",
    KMB: "kimberly-clark.com",
    KO: "coca-colacompany.com",
    MNTS: "momentus.space",
    LTC: "ltcproperties.com",
    MA: "mastercard.com",
    MCD: "mcdonalds.com",
    MDT: "medtronic.com",
    MSFT: "microsoft.com",
    NIO: "nio.com",
    NUE: "nucor.com",
    O: "realtyincome.com",
    PEP: "pepsico.com",
    PFE: "pfizer.com",
    PG: "pg.com",
    PLUG: "plugpower.com",
    PNR: "pentair.com",
    PPG: "ppg.com",
    ROP: "ropertech.com",
    RY: "rbc.com",
    SBUX: "starbucks.com",
    SHW: "sherwin-williams.com",
    SLB: "slb.com",
    STHS: "sophiaholdings.com",
    SWW: "sww.com",
    SYY: "sysco.com",
    TD: "td.com",
    THG: "thg.com",
    TRP: "tcenergy.com",
    TROW: "troweprice.com",
    UBSFY: "ubisoft.com",
    VUSA: "vanguardinvestor.co.uk",
    VWRL: "vanguardinvestor.co.uk",
    VWRP: "vanguardinvestor.co.uk",
    WMT: "walmart.com",
    TSLA: "tesla.com",
    NVDA: "nvidia.com",
    AMD: "amd.com",
    AVGO: "broadcom.com",
    COST: "costco.com",
    META: "meta.com",
    NFLX: "netflix.com",
    ORCL: "oracle.com",
    ADBE: "adobe.com",
    CRM: "salesforce.com",
    DIS: "disney.com",
    V: "visa.com",
    HD: "homedepot.com",
    MRK: "merck.com",
    UNH: "unitedhealthgroup.com",
    XOM: "exxonmobil.com",
    BP: "bp.com",
    SHEL: "shell.com",
    AZN: "astrazeneca.com",
    HSBA: "hsbc.com",
    LLOY: "lloydsbankinggroup.com",
    NWG: "natwestgroup.com",
    BARC: "barclays.com",
    DGE: "diageo.com",
    ULVR: "unilever.com",
    RKT: "reckitt.com",
    REL: "relx.com",
    GLEN: "glencore.com",
    RR: "rolls-royce.com",
  };
  const lowerName = String(holding.asset_name || "").toLowerCase();
  const brandDomain = lowerName.includes("ishares")
    ? "blackrock.com"
    : lowerName.includes("vanguard")
      ? "vanguardinvestor.co.uk"
      : lowerName.includes("amundi")
        ? "amundietf.co.uk"
        : lowerName.includes("invesco")
          ? "invesco.com"
          : lowerName.includes("legal & general") || lowerName.includes("l&g")
            ? "legalandgeneral.com"
            : null;
  const raw = holding.external_position_raw || {};
  const explicitLogo = firstRawLogoUrl(raw);
  const domain =
    rawLogoDomain(raw) ||
    domainMap[ticker] ||
    brandDomain ||
    sourceDomain(holding.source_url);
  const sources = [
    explicitLogo,
    domain ? `https://logo.clearbit.com/${domain}?size=128` : null,
    domain
      ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
      : null,
  ].filter(Boolean) as string[];
  const [logoAttempt, setLogoAttempt] = useState(0);
  useEffect(() => {
    setLogoAttempt(0);
  }, [ticker, explicitLogo, domain]);

  const sizeClass =
    size === "lg"
      ? "h-14 w-14 rounded-2xl text-base"
      : size === "sm"
        ? "h-8 w-8 rounded-xl text-[10px]"
        : "h-11 w-11 rounded-2xl text-xs";
  const currentLogo = sources[logoAttempt] || null;
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden bg-white font-black text-slate-700 ring-1 ring-slate-200 ${sizeClass}`}
      title={`${holding.asset_name || ticker}${domain ? ` · ${domain}` : ""}`}
    >
      <span className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-50 to-slate-100 text-slate-700">
        {ticker.slice(0, size === "sm" ? 2 : 4)}
      </span>
      {currentLogo ? (
        <img
          src={currentLogo}
          alt=""
          className="absolute inset-0 h-full w-full bg-white object-contain p-1.5"
          onError={() => {
            setLogoAttempt((attempt) => attempt + 1);
          }}
        />
      ) : null}
    </span>
  );
}
function PensionHistoryChart({ accountId }: { accountId: string }) {
  const [points, setPoints] = useState<Array<{ date: string; value: number }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPoints(null);
    setError(null);
    fetch(`/api/pensions/history?accountId=${encodeURIComponent(accountId)}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.error) setError(data.error);
        else setPoints(Array.isArray(data?.points) ? data.points : []);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load pension history.");
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (error) {
    return <p className="mt-4 text-xs font-semibold text-white/50">{error}</p>;
  }
  if (!points) {
    return <div className="mt-4 h-24 animate-pulse rounded-2xl bg-white/5" />;
  }
  const usable = points.filter((point) => Number.isFinite(point.value) && point.value > 0);
  if (usable.length < 2) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-white/5 p-4 text-center text-xs font-semibold text-white/50">
        Waiting for a second daily value snapshot — this fills in once the pension sync has run more than once.
      </div>
    );
  }

  const values = usable.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const first = values[0];
  const last = values[values.length - 1];
  const positive = last >= first;
  const changePercent = first > 0 ? ((last - first) / first) * 100 : 0;

  const coords = usable.map((point, index) => ({
    x: (index / Math.max(1, usable.length - 1)) * 100,
    y: 84 - ((point.value - min) / spread) * 68,
  }));
  let d = `M${coords[0].x.toFixed(2)},${coords[0].y.toFixed(2)}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? i : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2 < coords.length ? i + 2 : i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-white/60">Pot value history · {usable.length} day(s) tracked</p>
        <p className={`text-xs font-black ${positive ? "text-emerald-300" : "text-red-300"}`}>{positive ? "▲" : "▼"} {Math.abs(changePercent).toFixed(1)}% since first tracked</p>
      </div>
      <svg viewBox="0 0 100 92" preserveAspectRatio="none" className="mt-2 h-24 w-full overflow-visible">
        <defs>
          <linearGradient id={`pension-hist-fill-${accountId}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={positive ? "#34d399" : "#fb7185"} stopOpacity="0.22" />
            <stop offset="100%" stopColor={positive ? "#34d399" : "#fb7185"} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L100,90 L0,90 Z`} fill={`url(#pension-hist-fill-${accountId})`} />
        <path d={d} fill="none" stroke="currentColor" className={positive ? "text-emerald-300" : "text-red-300"} strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function ProfileAvatar({
  person,
  label,
  compact = false,
}: {
  person?: Person | null;
  label?: string;
  compact?: boolean;
}) {
  const size = compact ? "h-9 w-9 rounded-full" : "h-11 w-11 rounded-full";
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden bg-slate-100 text-sm font-black text-slate-700 ${size}`}
    >
      {person?.avatar_url ? (
        <img
          src={person.avatar_url}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        label || (person ? initials(person.name) : "HH")
      )}
      {person?.linked_user_id ? (
        <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-[10px] text-white">
          ✓
        </span>
      ) : null}
    </span>
  );
}

function AccountTypePill({ type }: { type: string }) {
  return (
    <span className="inline-flex h-9 items-center rounded-full bg-emerald-300/15 px-3 text-xs font-black uppercase tracking-wide text-emerald-100 ring-1 ring-white/10">
      {accountTypeLabel(type)}
    </span>
  );
}

function holdingPl(holding: InvestmentHolding) {
  const value = holdingValue(holding);
  const cost = holdingCost(holding);
  const pl = value - cost;
  const pct = cost > 0 ? (pl / cost) * 100 : 0;
  return { value, cost, pl, pct };
}

// BUGFIX: a holding whose price has genuinely never been found (as
// opposed to one with a good last-known price that just failed today's
// refresh) should never show a computed gain at all — that's exactly
// what let a ticker collision (THG plc vs. an unrelated US company also
// ticker THG) show a nonsensical +52344% gain instead of a clear
// "processing" state until a real price actually arrives.
function isPriceUnverified(holding: InvestmentHolding) {
  return holding.price_check_status === "quote_not_found";
}

function changeFromSnapshotsForHoldings(
  holdings: InvestmentHolding[],
  snapshots: InvestmentSnapshot[],
) {
  const points = aggregateSnapshots(snapshots, holdings);
  if (points.length < 2)
    return {
      change: 0,
      pct: 0,
      latest:
        points[0]?.value ||
        holdings.reduce((sum, holding) => sum + holdingValue(holding), 0),
      points,
    };
  const latest = points[points.length - 1].value;
  const previous = points[points.length - 2].value;
  const change = latest - previous;
  return {
    change,
    pct: previous > 0 ? (change / previous) * 100 : 0,
    latest,
    points,
  };
}

function dayMovementFromSnapshots(
  holdings: InvestmentHolding[],
  snapshots: InvestmentSnapshot[],
) {
  const movement = changeFromSnapshotsForHoldings(holdings, snapshots);
  const has = movement.points.length >= 2 && Math.abs(movement.change) >= 0.01;
  return { ...movement, has };
}

function dayMovementLabel(
  holdings: InvestmentHolding[],
  snapshots: InvestmentSnapshot[],
) {
  const day = dayMovementFromSnapshots(holdings, snapshots);
  if (!day.has) return null;
  return `${day.change >= 0 ? "+" : ""}${formatMoney(day.change)} today`;
}

function providerAccountValueFromRaw(account: InvestmentAccount) {
  const raw = account.external_account_raw || {};
  // Prefer provider/account balance over summed positions. Trading 212 account value can include cash,
  // while positions alone only show invested holdings.
  const candidates = [
    raw?.loop_balance_value,
    raw?.balance?.total?.amount,
    raw?.balance?.total,
    raw?.total_value?.amount,
    raw?.total_value,
    raw?.market_value?.amount,
    raw?.market_value,
    raw?.value?.amount,
    raw?.value,
    raw?.loop_holdings_value,
  ];
  for (const item of candidates) {
    const number = Number(item);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}
function providerInvestedValueFromRaw(account: InvestmentAccount) {
  const raw = account.external_account_raw || {};
  const number = Number(raw?.loop_holdings_value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}
function providerCashBreakdown(
  account: InvestmentAccount,
  holdings: InvestmentHolding[],
) {
  const raw = account.external_account_raw || {};
  const dividendCash = Number(
    account.provider_dividend_cash_value ??
      raw?.loop_dividend_cash_value ??
      raw?.loop_pending_reinvestment_cash_value ??
      0,
  );
  const investableCash = Number(
    account.provider_investable_cash_value ??
      raw?.loop_investable_cash_value ??
      raw?.loop_available_cash_value ??
      0,
  );
  const storedTotal = Number(
    account.provider_cash_value ?? raw?.loop_cash_value ?? 0,
  );
  const providerTotal = providerAccountValueFromRaw(account);
  const invested =
    providerInvestedValueFromRaw(account) ||
    holdings.reduce((sum, holding) => sum + holdingValue(holding), 0);
  const inferredTotal = providerTotal > 0 ? providerTotal - invested : 0;
  const explicitParts =
    (Number.isFinite(investableCash) ? investableCash : 0) +
    (Number.isFinite(dividendCash) ? dividendCash : 0);
  const total =
    Math.abs(storedTotal) >= 0.5
      ? storedTotal
      : Math.abs(explicitParts) >= 0.5
        ? explicitParts
        : Math.abs(inferredTotal) >= 0.5
          ? inferredTotal
          : 0;
  return {
    total: Number.isFinite(total) ? total : 0,
    investable:
      Number.isFinite(investableCash) && Math.abs(investableCash) >= 0.01
        ? investableCash
        : Math.max(
            0,
            total - (Number.isFinite(dividendCash) ? dividendCash : 0),
          ),
    dividends:
      Number.isFinite(dividendCash) && Math.abs(dividendCash) >= 0.01
        ? dividendCash
        : 0,
    source: String(
      account.provider_cash_source ||
        raw?.loop_cash_source ||
        (Math.abs(storedTotal) >= 0.5
          ? "provider"
          : Math.abs(inferredTotal) >= 0.5
            ? "inferred"
            : "manual"),
    ),
  };
}
function providerCashValueFromRaw(
  account: InvestmentAccount,
  holdings: InvestmentHolding[],
) {
  if (
    String(account.external_provider || "").toLowerCase() !== "snaptrade" &&
    account.provider_cash_value == null
  )
    return 0;
  return providerCashBreakdown(account, holdings).total;
}
function accountDisplayValue(
  account: InvestmentAccount,
  holdings: InvestmentHolding[],
) {
  const holdingsTotal = holdings.reduce(
    (sum, holding) => sum + holdingValue(holding),
    0,
  );
  const providerTotal = providerAccountValueFromRaw(account);
  if (
    String(account.external_provider || "").toLowerCase() === "snaptrade" &&
    providerTotal > 0
  )
    return providerTotal;
  return holdingsTotal;
}
function accountUnmappedValue(
  account: InvestmentAccount,
  holdings: InvestmentHolding[],
) {
  return providerCashValueFromRaw(account, holdings);
}

function providerIsaInfoFromRaw(account: InvestmentAccount) {
  const raw = account.external_account_raw || {};
  const year = String(
    account.provider_isa_allowance_year || raw?.loop_isa_allowance_year || raw?.isa_allowance_year || isaAllowanceRule().taxYear,
  );
  const subscribed = Number(
    account.provider_isa_subscribed_amount ??
      raw?.loop_isa_subscribed_amount ??
      raw?.isa?.subscribed_amount ??
      raw?.isa_subscribed_amount ??
      0,
  );
  const remaining = Number(
    account.provider_isa_remaining_amount ??
      raw?.loop_isa_remaining_amount ??
      raw?.isa?.remaining_amount ??
      raw?.isa_remaining_amount ??
      NaN,
  );
  const wrapper = classifyIsaWrapper(account.account_type, account.label);
  const centralAllowance = isaAllowanceLimitForPerson(null, wrapper, year);
  const allowance = Number(raw?.loop_isa_allowance ?? raw?.isa_allowance ?? centralAllowance);
  const safeSubscribed = Number.isFinite(subscribed) ? subscribed : 0;
  const safeRemaining = Number.isFinite(remaining)
    ? remaining
    : Math.max(0, allowance - safeSubscribed);
  return {
    year,
    allowance,
    subscribed: safeSubscribed,
    remaining: safeRemaining,
  };
}

function providerCashLabel(
  account: InvestmentAccount,
  holdings: InvestmentHolding[],
) {
  const cash = providerCashBreakdown(account, holdings).total;
  return Math.abs(cash) >= 0.5 ? cash : 0;
}

function performanceUnavailableLabel(holding?: InvestmentHolding) {
  if (holding && isPriceUnverified(holding)) return "Processing — price not yet verified";
  return "Cost price missing";
}

function evidencedInvestmentLots(lots: InvestmentLot[]) {
  const evidenced = lots.filter(
    (lot) => String(lot.external_source || "").toLowerCase() !== "manual_cost_basis",
  );
  // A manual cost-basis row is only a fallback when there is no genuine
  // purchase/import thread. It is not an additional purchase.
  return evidenced.length ? evidenced : lots;
}

function originalCostSummary(
  holding: InvestmentHolding,
  lots: InvestmentLot[],
) {
  const purchaseLots = evidencedInvestmentLots(lots);
  const importedCost = Number(holding.imported_invested_value || 0);
  const lotCost = purchaseLots.reduce((sum, lot) => {
    const explicitCost = Number(lot.total_cost ?? 0);
    const units = Number(lot.units ?? 0);
    const purchasePrice = Number(lot.purchase_price ?? 0);
    const calculatedCost = units * purchasePrice;
    const usableCost =
      explicitCost > 0 ? explicitCost : calculatedCost > 0 ? calculatedCost : 0;
    return sum + usableCost;
  }, 0);
  const averageCost = Number(holding.units || 0) * averagePriceGbp(holding);
  const cost =
    lotCost > 0
      ? lotCost
      : importedCost > 0
        ? importedCost
        : averageCost > 0
          ? averageCost
          : 0;
  const source =
    lotCost > 0
      ? `${purchaseLots.length} purchase lot${purchaseLots.length === 1 ? "" : "s"}`
      : importedCost > 0
        ? "broker/imported cost"
        : averageCost > 0
          ? "average buy price"
          : "missing";
  return { cost, source };
}

function providerSyncLabel(account: InvestmentAccount) {
  if (String(account.external_provider || "").toLowerCase() !== "snaptrade")
    return "Manual pot";
  if (account.sync_status)
    return `SnapTrade · ${String(account.sync_status).replace(/_/g, " ")}`;
  return "SnapTrade synced";
}

function inferredInvestmentGroupLabel(
  account: InvestmentAccount,
  holding: InvestmentHolding,
  accountHoldings: InvestmentHolding[],
) {
  // Only bundle when a real group/pie label exists. Do not invent a single Trading 212
  // bundle from SnapTrade positions: that hides non-pie stocks and creates false allocation.
  const explicit = String(holding.group_label || "").trim();
  if (explicit && !/^Trading 212 .+ bundle$/i.test(explicit)) return explicit;
  return "";
}
function AssetAllocationMosaic({
  holdings,
  total,
  compact = false,
  onSelect,
}: {
  holdings: InvestmentHolding[];
  total?: number;
  compact?: boolean;
  onSelect?: (holding: InvestmentHolding) => void;
}) {
  const potTotal =
    total ?? holdings.reduce((sum, holding) => sum + holdingValue(holding), 0);
  const items = holdings
    .map((holding) => ({
      holding,
      ...holdingPl(holding),
      share: potTotal > 0 ? (holdingValue(holding) / potTotal) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
  if (!items.length)
    return (
      <div className="flex h-48 items-center justify-center rounded-[1.5rem] bg-slate-50 text-sm font-bold text-slate-400">
        No allocation yet
      </div>
    );
  return (
    <div
      className={`${compact ? "h-48" : "h-64"} flex flex-wrap gap-1 overflow-hidden rounded-[1.75rem] bg-slate-100 p-1 ring-1 ring-white/80`}
    >
      {items.map((item) => {
        const positive = item.pl >= 0;
        const basis = `${Math.max(compact ? 12 : 18, Math.min(compact ? 42 : 52, item.share * (compact ? 1.45 : 1.85)))}%`;
        const tileClass = `flex h-full min-h-[4.1rem] flex-col items-center justify-center rounded-[1.35rem] p-2 text-center ring-1 ring-white/70 ${positive ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`;
        const tileStyle = {
          flexGrow: Math.max(5, item.share),
          flexBasis: basis,
        };
        const content = (
          <>
            <AssetLogo holding={item.holding} size="sm" />
            <p className="mt-1 max-w-full truncate text-xs font-black text-slate-950">
              {item.holding.ticker || item.holding.asset_name}
            </p>
            <p className="text-[11px] font-black">
              {item.share.toFixed(1)}% ·{" "}
              {isPriceUnverified(item.holding) ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" /> Processing
                </span>
              ) : (
                <>{item.pct >= 0 ? "+" : ""}{item.pct.toFixed(1)}%</>
              )}
            </p>
          </>
        );
        return onSelect ? (
          <button
            key={item.holding.id}
            type="button"
            onClick={() => onSelect(item.holding)}
            className={`${tileClass} transition hover:scale-[1.01]`}
            style={tileStyle}
            title={`${item.holding.asset_name}: ${item.share.toFixed(1)}% of pot`}
          >
            {content}
          </button>
        ) : (
          <div
            key={item.holding.id}
            className={tileClass}
            style={tileStyle}
            title={`${item.holding.asset_name}: ${item.share.toFixed(1)}% of pot`}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}

function AccountSideInsights({
  holdings,
  snapshots,
  total,
}: {
  holdings: InvestmentHolding[];
  snapshots: InvestmentSnapshot[];
  total: number;
}) {
  const day = changeFromSnapshotsForHoldings(holdings, snapshots);
  const positive = day.change >= 0;
  const denominator = Math.max(0.01, total - day.change);
  const safePct =
    Math.abs(day.pct) > 1000 && total > 0
      ? (day.change / denominator) * 100
      : day.pct;
  return (
    <aside className="grid gap-4">
      <div
        className={`rounded-[1.75rem] border p-5 ${positive ? "border-emerald-100 bg-emerald-50" : "border-red-100 bg-red-50"}`}
      >
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">
          Latest move
        </p>
        <p
          className={`mt-2 text-3xl font-black ${positive ? "text-emerald-700" : "text-red-600"}`}
        >
          {positive ? "+" : ""}
          {formatMoney(day.change)}
        </p>
        <p
          className={`text-sm font-black ${positive ? "text-emerald-700" : "text-red-600"}`}
        >
          {positive ? "+" : ""}
          {safePct.toFixed(2)}%
        </p>
        <p className="mt-2 text-xs font-semibold text-slate-500">
          Calculated from the latest tracked pot movement against the current
          saved value.
        </p>
      </div>
      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">
            Asset allocation
          </p>
          <p className="text-xs font-black text-slate-400">
            {formatMoney(total)}
          </p>
        </div>
        <AssetAllocationMosaic holdings={holdings} total={total} compact />
      </div>
    </aside>
  );
}

function HoldingCard({
  holding,
  lots,
  snapshots = [],
  investmentViewMode,
  onInfo,
  onEdit,
}: {
  holding: InvestmentHolding;
  lots: InvestmentLot[];
  snapshots?: InvestmentSnapshot[];
  investmentViewMode: "lines" | "squares";
  onInfo: () => void;
  onEdit: () => void;
}) {
  const { value, cost, pl, pct } = holdingPl(holding);
  const plReliable =
    (!isProviderImportedHolding(holding) ||
    hasVerifiedProviderCostBasis(holding)) &&
    !isPriceUnverified(holding);
  const providerResult = Number(holding.imported_result_value);
  const dayMove = dayMovementFromSnapshots([holding], snapshots);
  const storedDayChange = Number(holding.day_change_gbp);
  const storedDayValueChange = Number.isFinite(storedDayChange)
    ? storedDayChange * Number(holding.units || 0)
    : 0;
  const fallbackPl =
    Number.isFinite(storedDayChange) && Math.abs(storedDayValueChange) >= 0.01
      ? storedDayValueChange
      : Number.isFinite(providerResult) && Math.abs(providerResult) >= 0.01
        ? providerResult
        : dayMove.has
          ? dayMove.change
          : 0;
  const hasFallbackPl = !plReliable && Math.abs(fallbackPl) >= 0.01;
  function openFromCard(
    event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
  ) {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest(
        "button, form, a, input, select, textarea, [data-no-card-open]",
      )
    )
      return;
    onInfo();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openFromCard}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") openFromCard(event);
      }}
      className="group cursor-pointer rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-2xl hover:shadow-slate-200/70 sm:p-5"
      title="Open detailed chart and holding information"
    >
      <div
        className={
          investmentViewMode === "squares"
            ? "grid gap-4"
            : "grid gap-4 xl:grid-cols-[minmax(300px,1fr)_minmax(300px,420px)_220px] xl:items-center"
        }
      >
        <div>
          <div className="flex items-start gap-3">
            <AssetLogo holding={holding} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-black text-slate-950">
                  {holding.asset_name}
                </p>
                <button
                  type="button"
                  onClick={onInfo}
                  className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-slate-600"
                  title="Holding information"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase text-slate-600">
                  {holding.asset_kind || "share"}
                </span>
                <MarketStatusPill holding={holding} />
              </div>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {holding.ticker || "No ticker"}
                {holding.exchange
                  ? ` · ${exchangeLabel(holding.exchange)}`
                  : ""}
                {holding.isin ? ` · ${holding.isin}` : ""} ·{" "}
                {Number(holding.units).toFixed(8)} units · latest{" "}
                {priceDisplay(holding)}
              </p>
              <p className="mt-1 text-[11px] font-black uppercase tracking-wide text-slate-400">
                Last checked{" "}
                {shortRelativeTime(
                  holding.last_price_check_at ||
                    holding.latest_price_date ||
                    holding.updated_at,
                )}
                {holding.price_check_status
                  ? ` · ${holding.price_check_status}`
                  : ""}
              </p>
              {holding.group_label || lots.length ? (
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {holding.group_label || "Manual holding"}
                  {lots.length ? ` · ${lots.length} purchase lot(s)` : ""}
                </p>
              ) : null}
              {(() => {
                const original = originalCostSummary(holding, lots);
                return (
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {isProviderImportedHolding(holding) &&
                    !hasVerifiedProviderCostBasis(holding)
                      ? "Cost basis not supplied by provider · daily movement uses today's opening baseline"
                      : `Original cost: ${original.cost > 0 ? formatMoney(original.cost) : "not supplied"} · ${original.source}`}
                  </p>
                );
              })()}
              {lots.length ? (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {lots.slice(0, 4).map((lot) => (
                    <div
                      key={lot.id}
                      className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-500"
                    >
                      {lot.purchase_date}: {Number(lot.units).toFixed(8)} @{" "}
                      {String(lot.price_quote_unit || "").toLowerCase() ===
                      "gbx"
                        ? `${(Number(lot.purchase_price || 0) * 100).toFixed(2)}p · ${gbpPriceLabel(Number(lot.purchase_price || 0))}`
                        : gbpPriceLabel(Number(lot.purchase_price || 0))}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="rounded-[1.5rem] bg-white/80 p-3 ring-1 ring-slate-100">
          <InvestmentHistoryChart
            holdingId={holding.id}
            title={`${holding.asset_name} price history`}
            mode="price"
            compact
            bare
            showRange={false}
          />
        </div>
        <div
          className={
            investmentViewMode === "squares"
              ? "text-left"
              : "text-left xl:text-right"
          }
        >
          <p className="text-3xl font-black">{formatMoney(value)}</p>
          {plReliable ? (
            <p
              className={`text-sm font-black ${pl >= 0 ? "text-emerald-700" : "text-red-600"}`}
            >
              {formatMoney(pl)} · {pct.toFixed(1)}%
            </p>
          ) : hasFallbackPl ? (
            <p
              className={`text-sm font-black ${fallbackPl >= 0 ? "text-emerald-700" : "text-red-600"}`}
            >
              {fallbackPl >= 0 ? "+" : ""}
              {formatMoney(fallbackPl)} today
            </p>
          ) : (
            <p className="text-sm font-black text-slate-500">
              {performanceUnavailableLabel(holding)}
            </p>
          )}
          <div
            className={
              investmentViewMode === "squares"
                ? "mt-2 flex flex-wrap gap-2"
                : "mt-2 flex flex-wrap gap-2 xl:justify-end"
            }
          >
            <form action={refreshInvestmentHoldingPrice}>
              <input type="hidden" name="id" value={holding.id} />
              <button className="rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">
                <RefreshCw className="mr-1 inline h-3.5 w-3.5" />
                Check price
              </button>
            </form>
            <button
              type="button"
              onClick={onEdit}
              className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"
            >
              Edit
            </button>
            <form action={deleteInvestmentHolding}>
              <input type="hidden" name="id" value={holding.id} />
              <button className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600">
                Delete
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function PieStackCard({
  label,
  holdings,
  accountTotal,
  investmentViewMode,
  investmentLots,
  pieSetting,
  onInfo,
  onEdit,
  onSettings,
}: {
  label: string;
  holdings: InvestmentHolding[];
  accountTotal: number;
  investmentViewMode: "lines" | "squares";
  investmentLots: InvestmentLot[];
  pieSetting?: InvestmentPieSetting;
  onInfo: (holding: InvestmentHolding) => void;
  onEdit: (holding: InvestmentHolding) => void;
  onSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const value = holdings.reduce(
    (sum, holding) => sum + holdingValue(holding),
    0,
  );
  const cost = holdings.reduce((sum, holding) => sum + holdingCost(holding), 0);
  const pl = value - cost;
  const pct = cost > 0 ? (pl / cost) * 100 : 0;
  const plReliable = !hasUnverifiedProviderCostBasis(holdings);
  const share = accountTotal > 0 ? (value / accountTotal) * 100 : 0;
  const dividendYield = Number(
    pieSetting?.expected_dividend_yield_percent || 0,
  );
  const dividendAnnual = value * (dividendYield / 100);
  const reinvestAmount = Number(pieSetting?.monthly_reinvest_amount || 0);
  const monthlyEquivalent =
    reinvestAmount +
    (pieSetting?.auto_reinvest_dividends ? dividendAnnual / 12 : 0);
  const filteredHoldings = holdings.filter((holding) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${holding.asset_name} ${holding.ticker || ""} ${holding.exchange || ""}`
      .toLowerCase()
      .includes(q);
  });
  const shouldShowHoldings = open || query.trim().length > 0;
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            Grouped stocks
          </p>
          <h3 className="mt-1 text-xl font-black text-slate-950">{label}</h3>
          <p className="text-sm font-semibold text-slate-500">
            {holdings.length} holding(s) · {share.toFixed(1)}% of this pot
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="text-left lg:text-right">
            <p className="text-3xl font-black text-slate-950">
              {formatMoney(value)}
            </p>
            {plReliable ? (
              <p
                className={`text-sm font-black ${pl >= 0 ? "text-emerald-700" : "text-red-600"}`}
              >
                {formatMoney(pl)} · {pct.toFixed(1)}%
              </p>
            ) : (
              <p className="text-sm font-black text-slate-500">
                Performance needs cost price
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onSettings}
            className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
            title="Grouped stock settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
          >
            {open ? "Collapse group" : "Open group"}
          </button>
        </div>
      </div>
      {open ? (
        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <AssetAllocationMosaic
              holdings={holdings}
              total={value}
              compact
              onSelect={(holding) => onInfo(holding)}
            />
            <div className="flex flex-col gap-3 rounded-[1.5rem] bg-slate-50 p-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm font-bold outline-none ring-blue-500 focus:ring-2"
                  placeholder="Search stocks in this group by ticker or name"
                />
              </div>
              <p className="text-xs font-bold text-slate-500">
                Click any allocation tile to open that holding.
              </p>
            </div>
          </div>
          <div className="grid gap-3">
            <div className="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Reinvestment plan
              </p>
              <p className="mt-2 text-2xl font-black text-slate-950">
                {formatMoney(monthlyEquivalent)}
                <span className="text-sm font-bold text-slate-500">
                  {" "}
                  / mo equiv
                </span>
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Manual: {formatMoney(reinvestAmount)}{" "}
                {pieSetting?.reinvest_frequency || "monthly"}. Dividend
                estimate: {formatMoney(dividendAnnual)}/yr at{" "}
                {dividendYield.toFixed(2)}%.
              </p>
            </div>
            <div className="rounded-[1.5rem] bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Projected yearly additions
              </p>
              <p className="mt-2 text-2xl font-black text-slate-950">
                {formatMoney(
                  reinvestAmount * 12 +
                    (pieSetting?.auto_reinvest_dividends ? dividendAnnual : 0),
                )}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Dividends are shown as estimates only and can be marked as
                reinvested.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600">
          This group is bundled by default · {holdings.length} holding(s) hidden · open
          the group to inspect individual stocks and allocation.
        </div>
      )}
      {shouldShowHoldings ? (
        <div
          className={
            investmentViewMode === "squares"
              ? "mt-4 grid gap-3 md:grid-cols-2"
              : "mt-4 max-h-[48rem] space-y-3 overflow-y-auto pr-1"
          }
        >
          {filteredHoldings.map((holding) => (
            <HoldingCard
              key={holding.id}
              holding={holding}
              lots={evidencedInvestmentLots(
                investmentLots.filter((lot) => lot.holding_id === holding.id),
              )}
              investmentViewMode={investmentViewMode}
              onInfo={() => onInfo(holding)}
              onEdit={() => onEdit(holding)}
            />
          ))}
          {filteredHoldings.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">
              No stocks matched that search.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function priceBreakdownRows(holding: InvestmentHolding) {
  const exchange = normalisedExchange(
    holding.exchange || holding.native_exchange,
  );
  const nativeCurrency = String(
    holding.native_currency || marketCurrencyFor(exchange, holding.currency),
  ).toUpperCase();
  const gbp = latestPriceGbp(holding);
  const rows: Array<{ label: string; value: string; note?: string }> = [];
  if (exchange === "LSE" || nativeCurrency === "GBX") {
    const pence =
      holding.native_latest_price !== null &&
      holding.native_latest_price !== undefined
        ? Number(holding.native_latest_price)
        : gbp * 100;
    rows.push({
      label: "Native quote",
      value: `${pence.toFixed(2)}p`,
      note: "GBX / pence",
    });
    rows.push({
      label: "GBP equivalent",
      value: gbpPriceLabel(gbp),
      note: "Used in portfolio totals",
    });
    return rows;
  }
  if (nativeCurrency && nativeCurrency !== "GBP") {
    const native =
      holding.native_latest_price !== null &&
      holding.native_latest_price !== undefined
        ? Number(holding.native_latest_price)
        : Number(holding.latest_price || 0);
    rows.push({
      label: "Native quote",
      value: `${nativeCurrency} ${native.toFixed(4)}`,
      note: exchange || "Market quote",
    });
    rows.push({
      label: "GBP equivalent",
      value: gbpPriceLabel(gbp),
      note: "Used in portfolio totals",
    });
    return rows;
  }
  rows.push({
    label: "GBP quote",
    value: gbpPriceLabel(gbp),
    note: "Used in portfolio totals",
  });
  return rows;
}

function TinySparkline({
  points,
}: {
  points: Array<{ date: string; value: number }>;
}) {
  if (points.length < 2)
    return <div className="h-10 w-24 rounded-2xl bg-slate-50" />;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const d = points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * 100;
      const y = 34 - ((point.value - min) / spread) * 28;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const positive = points[points.length - 1].value >= points[0].value;
  return (
    <svg viewBox="0 0 100 40" className="h-10 w-24">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={positive ? "text-emerald-600" : "text-red-500"}
      />
    </svg>
  );
}

function PotAudienceChooser({
  people,
  value,
  onChange,
}: {
  people: Person[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <button
        type="button"
        onClick={() => onChange("all")}
        className={`rounded-[2rem] border p-4 text-left shadow-sm ${value === "all" ? "border-slate-950 bg-slate-950 text-white" : "border-white/70 bg-white text-slate-700"}`}
      >
        <p className="text-xs font-black uppercase tracking-wide opacity-70">
          View
        </p>
        <p className="mt-1 text-lg font-black">Household</p>
      </button>
      {people.map((person) => (
        <button
          key={person.id}
          type="button"
          onClick={() => onChange(person.id)}
          className={`rounded-[2rem] border p-4 text-left shadow-sm ${value === person.id ? "border-orange-500 bg-orange-500 text-white" : person.relationship === "child" ? "border-sky-100 bg-sky-50 text-sky-900" : "border-orange-100 bg-orange-50 text-orange-950"}`}
        >
          <span className="flex items-center gap-3">
            {person.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={person.avatar_url}
                alt=""
                className="h-10 w-10 rounded-2xl object-cover"
              />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/80 text-sm font-black text-slate-700">
                {person.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span>
              <span className="flex items-center gap-1.5 font-black">
                {person.name}
                {person.linked_user_id ? (
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-[10px] text-white">
                    ✓
                  </span>
                ) : null}
              </span>
              <span className="block text-xs font-bold opacity-70">
                {person.relationship}
              </span>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function WizardProgress({
  step,
  total,
  labels,
}: {
  step: number;
  total: number;
  labels: string[];
}) {
  const pct = Math.max(0, Math.min(100, (step / total) * 100));
  return (
    <div className="rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-100">
      <div className="flex items-center justify-between text-xs font-black uppercase tracking-[0.18em] text-slate-400">
        {labels.map((label, index) => (
          <span
            key={label}
            className={index + 1 <= step ? "text-emerald-700" : ""}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function AddPensionAccountForm({
  people,
  defaultPersonId,
}: {
  people: Person[];
  defaultPersonId?: string;
}) {
  const providers = pensionProviders();
  const [step, setStep] = useState(1);
  const [providerName, setProviderName] = useState(
    providers[0]?.name || "Legal & General",
  );
  const provider = findProvider(providerName);
  const valuationMode = providerValuationMode(providerName);
  const defaultContribution = providerContributionMode(providerName);
  const offerings = accountOfferingsFor(providerName, "pension").filter(
    (item) => item.value !== "defined_benefit",
  );
  const defaultFee =
    provider?.defaultAnnualPlatformFeePercent === null
      ? ""
      : String(provider?.defaultAnnualPlatformFeePercent ?? 0);
  const defaultMonthly =
    provider?.defaultFixedMonthlyFee === null
      ? ""
      : String(provider?.defaultFixedMonthlyFee ?? 0);
  return (
    <form action={addPensionAccount} className="space-y-5">
      <WizardProgress
        step={step}
        total={2}
        labels={["Provider", "Fees & contributions"]}
      />
      {step === 1 ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Provider</span>
              <select
                name="provider"
                value={providerName}
                onChange={(event) => setProviderName(event.target.value)}
                className={inputClass}
              >
                {providers.map((item) => (
                  <option key={item.id} value={item.name}>
                    {item.name}
                  </option>
                ))}
                <option value="Other">Other / manual</option>
              </select>
            </label>
            <FormInput
              label="What do you want to call the pot?"
              name="label"
              placeholder={`${providerName} pension`}
              required
            />
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Who is it for?
              </span>
              <select
                name="person_id"
                defaultValue={defaultPersonId || ""}
                className={inputClass}
              >
                <PersonOptions people={people} />
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Account type
              </span>
              <select name="pension_type" className={inputClass}>
                {(offerings.length
                  ? offerings
                  : [
                      { value: "work", label: "Workplace pension" },
                      { value: "private", label: "Private/personal pension" },
                    ]
                ).map((offering) => (
                  <option key={offering.value} value={offering.value}>
                    {offering.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
            <p className="font-black text-slate-950">
              How {providerName} normally works
            </p>
            <p className="mt-1">
              {valuationMode === "portfolio_value"
                ? "This provider is normally tracked as an overall portfolio/pot value rather than by individual units. You can still add notes or funds later, but the default flow is value-first."
                : valuationMode === "defined_benefit"
                  ? "This is a defined-benefit provider. Use the Defined Benefit button so the app tracks service, pay and scheme section rather than units."
                  : provider?.notes ||
                    "Provider defaults will be suggested in the next step and can be updated."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white"
          >
            Next: fees and contributions
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Contribution method
              </span>
              <select
                name="contribution_method"
                defaultValue={defaultContribution}
                className={inputClass}
              >
                <option value="salary_sacrifice">Salary sacrifice</option>
                <option value="net_pay">Net pay</option>
                <option value="relief_at_source">Relief at source</option>
                <option value="none">No contributions</option>
              </select>
            </label>
            <FormInput
              label="Employee contribution %"
              name="employee_contribution_percent"
              type="number"
              step="any"
              placeholder="e.g. 17.5"
            />
            <FormInput
              label="Employer contribution %"
              name="employer_contribution_percent"
              type="number"
              step="any"
              placeholder="e.g. 3"
            />
            <label className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">
              <input type="checkbox" name="employer_ni_topup_enabled" />{" "}
              Employer NI saving is topped into pension
            </label>
            <FormInput
              label="Fixed employer top-up %"
              name="employer_ni_topup_percent"
              type="number"
              step="any"
              placeholder="Only used for fixed % mode"
            />
            <FormInput
              label="Fixed monthly contribution"
              name="fixed_monthly_contribution"
              type="number"
              step="any"
              placeholder="Use when the NI saving/extra contribution is an actual £ amount"
            />
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Contribution frequency
              </span>
              <select
                name="contribution_frequency"
                defaultValue="monthly"
                className={inputClass}
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
                <option value="one_off">One-off</option>
                <option value="manual">Manual / irregular</option>
              </select>
            </label>
            <FormInput
              label="Contribution / pay-in day"
              name="contribution_day"
              type="number"
              step="1"
              placeholder="1–31 for monthly pensions"
            />
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Pay-in day handling
              </span>
              <select
                name="pension_payment_timing"
                defaultValue="next_working_day"
                className={inputClass}
              >
                <option value="next_working_day">
                  Move weekends to next working day
                </option>
                <option value="previous_working_day">
                  Move weekends to previous working day
                </option>
                <option value="same_day">Use exact calendar day</option>
              </select>
            </label>
            <FormInput
              label="Days until pension is invested"
              name="contribution_delay_days"
              type="number"
              step="1"
              placeholder="e.g. 3"
            />
            <FormInput
              label="Specific investment day"
              name="pension_investment_day"
              type="number"
              step="1"
              placeholder="Optional 1–31"
            />
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Investment day handling
              </span>
              <select
                name="pension_investment_timing"
                defaultValue="next_working_day"
                className={inputClass}
              >
                <option value="next_working_day">
                  Move weekends to next working day
                </option>
                <option value="previous_working_day">
                  Move weekends to previous working day
                </option>
                <option value="same_day">Use exact calendar day</option>
              </select>
            </label>
            <FormInput
              label="Contribution started"
              name="contribution_started_on"
              type="date"
            />
            <FormInput
              label="Contribution ended / left job"
              name="contribution_ended_on"
              type="date"
            />
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Employer NI top-up mode
              </span>
              <select
                name="employer_ni_topup_mode"
                defaultValue="fixed_percent"
                className={inputClass}
              >
                <option value="fixed_percent">
                  Fixed extra % of pensionable pay
                </option>
                <option value="saved_ni">
                  Reinvest employer NI saving from salary sacrifice
                </option>
                <option value="none">No NI top-up</option>
              </select>
            </label>
            <FormInput
              label="Employer NI rate %"
              name="employer_ni_rate_percent"
              type="number"
              step="any"
              defaultValue="15"
              placeholder="2026/27 main employer rate is 15%"
            />
            <FormInput
              label="NI saving passed back %"
              name="employer_ni_passback_percent"
              type="number"
              step="any"
              defaultValue="100"
              placeholder="0, 50 or 100"
            />
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Employer base contribution salary basis</span>
              <select name="employer_base_salary_basis" defaultValue="pre_sacrifice" className={inputClass}>
                <option value="pre_sacrifice">Pre-sacrifice / notional salary</option>
                <option value="post_sacrifice">Post-sacrifice salary</option>
              </select>
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800">
              <input
                type="checkbox"
                name="contribution_auto_apply_enabled"
                defaultChecked
              />{" "}
              Auto-create projected pension investments on the due dates
            </label>
            <FormInput
              label="Platform fee % / year"
              name="annual_platform_fee_percent"
              type="number"
              step="any"
              defaultValue={defaultFee}
              placeholder="Confirm provider fee"
            />
            <FormInput
              label="Fixed monthly fee"
              name="fixed_monthly_fee"
              type="number"
              step="any"
              defaultValue={defaultMonthly}
              placeholder="Subscription/platform monthly cost"
            />
            <FormInput
              label="Current total value"
              name="current_value"
              type="number"
              step="any"
              placeholder="Current pot value from provider"
            />
            <FormInput
              label="Value date"
              name="value_as_of_date"
              type="date"
              defaultValue={today}
            />
            <FormInput
              label="Fee/source URL"
              name="source_url"
              placeholder="Plan/fund charge link"
            />
            <FormInput
              label="Notes"
              name="notes"
              placeholder="Scheme notes, employer NI arrangement, pay-in date behaviour"
            />
          </div>
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
            Salary-sacrifice NI top-up note: if the business pays across
            whatever employer NI is saved, model the sacrifice % and salary
            separately; use fixed monthly contribution only for a fixed known
            extra amount.
          </div>
          <ProviderDocs providerName={providerName} />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-2xl bg-slate-100 px-5 py-3 font-black text-slate-700"
            >
              Back
            </button>
            <SubmitButton>Add pension pot</SubmitButton>
          </div>
        </div>
      )}
    </form>
  );
}

function EditPensionAccountForm({
  people,
  account,
}: {
  people: Person[];
  account: PensionAccount;
}) {
  const providers = pensionProviders();
  const provider = findProvider(account.provider);
  const offerings = accountOfferingsFor(account.provider, "pension").filter(
    (item) => item.value !== "defined_benefit",
  );
  return (
    <form action={updatePensionAccount} className="space-y-5">
      <input type="hidden" name="id" value={account.id} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Provider</span>
          <select
            name="provider"
            defaultValue={account.provider}
            className={inputClass}
          >
            {providers.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
            <option value="Other">Other / manual</option>
          </select>
        </label>
        <FormInput
          label="Pot label"
          name="label"
          defaultValue={account.label}
          required
        />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Owner</span>
          <select
            name="person_id"
            defaultValue={account.person_id || ""}
            className={inputClass}
          >
            <PersonOptions people={people} />
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Account type</span>
          <select
            name="pension_type"
            defaultValue={account.pension_type}
            className={inputClass}
          >
            {(offerings.length
              ? offerings
              : [
                  { value: "work", label: "Workplace pension" },
                  { value: "private", label: "Private/personal pension" },
                ]
            ).map((offering) => (
              <option key={offering.value} value={offering.value}>
                {offering.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">
            Valuation mode
          </span>
          <select
            name="valuation_mode"
            defaultValue={
              account.valuation_mode || providerValuationMode(account.provider)
            }
            className={inputClass}
          >
            <option value="provider_value">
              Provider pot value, like PensionBee/Nest/standard workplace
              accounts
            </option>
            <option value="fund_units">Fund units and fund prices</option>
            <option value="manual_value">Manual value only</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">
            Contribution method
          </span>
          <select
            name="contribution_method"
            defaultValue={account.contribution_method}
            className={inputClass}
          >
            <option value="salary_sacrifice">Salary sacrifice</option>
            <option value="net_pay">Net pay</option>
            <option value="relief_at_source">Relief at source</option>
            <option value="none">No contributions</option>
          </select>
        </label>
        <FormInput
          label="Employee contribution %"
          name="employee_contribution_percent"
          type="number"
          step="any"
          defaultValue={account.employee_contribution_percent}
        />
        <FormInput
          label="Employer contribution %"
          name="employer_contribution_percent"
          type="number"
          step="any"
          defaultValue={account.employer_contribution_percent}
        />
        <label className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">
          <input
            type="checkbox"
            name="employer_ni_topup_enabled"
            defaultChecked={account.employer_ni_topup_enabled === true}
          />{" "}
          Employer NI saving is topped into pension
        </label>
        <FormInput
          label="Fixed employer top-up %"
          name="employer_ni_topup_percent"
          type="number"
          step="any"
          defaultValue={account.employer_ni_topup_percent}
          placeholder="Only used for fixed % mode"
        />
        <FormInput
          label="Fixed monthly contribution"
          name="fixed_monthly_contribution"
          type="number"
          step="any"
          defaultValue={account.fixed_monthly_contribution}
        />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">
            Contribution frequency
          </span>
          <select
            name="contribution_frequency"
            defaultValue={account.contribution_frequency || "monthly"}
            className={inputClass}
          >
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
            <option value="one_off">One-off</option>
            <option value="manual">Manual / irregular</option>
          </select>
        </label>
        <FormInput
          label="Pay-in day of month"
          name="contribution_day"
          type="number"
          step="1"
          defaultValue={
            account.contribution_day ?? account.regular_pay_day ?? ""
          }
          placeholder="1–31"
        />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">
            Pay-in day handling
          </span>
          <select
            name="pension_payment_timing"
            defaultValue={account.pension_payment_timing || "next_working_day"}
            className={inputClass}
          >
            <option value="next_working_day">
              Move weekends to next working day
            </option>
            <option value="previous_working_day">
              Move weekends to previous working day
            </option>
            <option value="same_day">Use exact calendar day</option>
          </select>
        </label>
        <FormInput
          label="Days until pension is invested"
          name="contribution_delay_days"
          type="number"
          step="1"
          defaultValue={account.contribution_delay_days ?? 0}
        />
        <FormInput
          label="Specific investment day"
          name="pension_investment_day"
          type="number"
          step="1"
          defaultValue={account.pension_investment_day ?? ""}
          placeholder="Optional 1–31"
        />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">
            Investment day handling
          </span>
          <select
            name="pension_investment_timing"
            defaultValue={
              account.pension_investment_timing || "next_working_day"
            }
            className={inputClass}
          >
            <option value="next_working_day">
              Move weekends to next working day
            </option>
            <option value="previous_working_day">
              Move weekends to previous working day
            </option>
            <option value="same_day">Use exact calendar day</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">
            Employer NI top-up mode
          </span>
          <select
            name="employer_ni_topup_mode"
            defaultValue={account.employer_ni_topup_mode || "fixed_percent"}
            className={inputClass}
          >
            <option value="fixed_percent">
              Fixed extra % of pensionable pay
            </option>
            <option value="saved_ni">
              Reinvest employer NI saving from salary sacrifice
            </option>
            <option value="none">No NI top-up</option>
          </select>
        </label>
        <FormInput
          label="Employer NI rate %"
          name="employer_ni_rate_percent"
          type="number"
          step="any"
          defaultValue={account.employer_ni_rate_percent ?? 15}
        />
        <FormInput
          label="NI saving passed back %"
          name="employer_ni_passback_percent"
          type="number"
          step="any"
          defaultValue={account.employer_ni_passback_percent ?? 100}
          placeholder="0, 50 or 100"
        />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Employer base contribution salary basis</span>
          <select name="employer_base_salary_basis" defaultValue={account.employer_base_salary_basis || "pre_sacrifice"} className={inputClass}>
            <option value="pre_sacrifice">Pre-sacrifice / notional salary</option>
            <option value="post_sacrifice">Post-sacrifice salary</option>
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800">
          <input
            type="checkbox"
            name="contribution_auto_apply_enabled"
            defaultChecked={account.contribution_auto_apply_enabled !== false}
          />{" "}
          Auto-create projected pension investments on due dates
        </label>
        <FormInput
          label="Contribution started"
          name="contribution_started_on"
          type="date"
          defaultValue={account.contribution_started_on ?? ""}
        />
        <FormInput
          label="Contribution ended / left job"
          name="contribution_ended_on"
          type="date"
          defaultValue={account.contribution_ended_on ?? ""}
        />
        <label className="flex items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">
          <input
            type="checkbox"
            name="contribution_paused"
            defaultChecked={account.contribution_paused === true}
          />{" "}
          Pause regular contribution assumptions
        </label>
        <FormInput
          label="Platform fee % / year"
          name="annual_platform_fee_percent"
          type="number"
          step="any"
          defaultValue={account.annual_platform_fee_percent}
        />
        <FormInput
          label="Fixed monthly fee"
          name="fixed_monthly_fee"
          type="number"
          step="any"
          defaultValue={account.fixed_monthly_fee}
        />
        <FormInput
          label="Current total value"
          name="current_value"
          type="number"
          step="any"
          defaultValue={account.current_value}
        />
        <FormInput
          label="Value date"
          name="value_as_of_date"
          type="date"
          defaultValue={account.value_as_of_date}
        />
        <FormInput
          label="Fee/source URL"
          name="source_url"
          defaultValue={account.source_url ?? ""}
        />
        <FormInput
          label="Notes"
          name="notes"
          defaultValue={account.notes ?? provider?.notes ?? ""}
        />
      </div>
      <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">
        PensionBee/Nest/workplace provider pots can be tracked as provider-value
        accounts: the value still moves up/down, but LOOP does not force
        stock-style units unless the provider exposes them.
      </div>
      <SubmitButton>Save pension settings</SubmitButton>
    </form>
  );
}

function AddPensionFundForm({
  accounts,
  defaultAccountId,
  defaults,
}: {
  accounts: PensionAccount[];
  defaultAccountId?: string;
  defaults?: Partial<PensionFund>;
}) {
  return (
    <form action={addPensionFund} className="grid gap-4 md:grid-cols-2">
      <label className="block md:col-span-2">
        <span className="text-sm font-bold text-slate-700">Pension pot</span>
        <select
          name="pension_account_id"
          defaultValue={defaultAccountId ?? ""}
          className={inputClass}
          required
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label} · {account.provider}
            </option>
          ))}
        </select>
      </label>
      <FormInput
        label="Fund name"
        name="fund_name"
        defaultValue={defaults?.fund_name ?? ""}
        placeholder="L&G PMC Lazard Emerging Markets 3"
        required
      />
      <FormInput
        label="Fund code / ISIN"
        name="fund_code"
        defaultValue={defaults?.fund_code ?? ""}
        placeholder="Optional"
      />
      <FormInput
        label="Group label"
        name="group_label"
        defaultValue={defaults?.group_label ?? ""}
        placeholder="Global equity, Multi asset"
      />
      <FormInput
        label="Current value"
        name="current_value"
        type="number"
        step="any"
        defaultValue={defaults?.current_value ?? ""}
      />
      <FormInput
        label="Units"
        name="units"
        type="number"
        step="any"
        defaultValue={defaults?.units ?? ""}
      />
      <FormInput
        label="Unit price"
        name="unit_price"
        type="number"
        step="any"
        defaultValue={defaults?.unit_price ?? ""}
      />
      <FormInput
        label="Value date"
        name="price_as_of_date"
        type="date"
        defaultValue={today}
      />
      <FormInput
        label="Current allocation target %"
        name="target_allocation_percent"
        type="number"
        step="any"
        defaultValue={defaults?.target_allocation_percent ?? ""}
      />
      <FormInput
        label="Monthly contribution %"
        name="monthly_contribution_percent"
        type="number"
        step="any"
        defaultValue={defaults?.monthly_contribution_percent ?? ""}
      />
      <FormInput
        label="Fund fee % / year"
        name="annual_fund_fee_percent"
        type="number"
        step="any"
        defaultValue={defaults?.annual_fund_fee_percent ?? ""}
      />
      <FormInput
        label="Fee/source URL"
        name="fee_source_url"
        defaultValue={defaults?.fee_source_url ?? ""}
        placeholder="Provider fund factsheet"
      />
      <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">
        <input type="checkbox" name="contribution_active" defaultChecked /> Gets
        monthly allocation
      </label>
      <FormInput
        label="Notes"
        name="notes"
        defaultValue={defaults?.notes ?? ""}
        placeholder="No monthly allocation / switch planned"
      />
      <div className="flex items-end">
        <SubmitButton>Add fund</SubmitButton>
      </div>
    </form>
  );
}
function QuickValueEditForm({
  account,
  onDone,
}: {
  account: PensionAccount;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  // Passing an async local function as the form's action (rather than the
  // server action directly) lets this close the modal itself once the
  // update actually lands — the two things this does are (1) call the
  // server action, which handles both writing the live value and logging a
  // history snapshot, then (2) close the modal on success so there's no
  // "now manually dismiss this" step after a two-field edit. SubmitButton
  // tracks its own pending state via useFormStatus, which works the same
  // way whether the action is this function or a real server action.
  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      await quickUpdatePensionValue(formData);
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save that value.");
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="id" value={account.id} />
      <FormInput
        label="Current value"
        name="current_value"
        type="number"
        step="0.01"
        required
        defaultValue={account.current_value}
      />
      <FormInput
        label="As of"
        name="value_as_of_date"
        type="date"
        required
        defaultValue={account.value_as_of_date || today}
      />
      {error ? (
        <p className="text-xs font-semibold text-red-600">{error}</p>
      ) : null}
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}
function EditPensionFundForm({ fund }: { fund: PensionFund }) {
  return (
    <form action={updatePensionFund} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="id" value={fund.id} />
      <FormInput
        label="Fund name"
        name="fund_name"
        defaultValue={fund.fund_name}
        required
      />
      <FormInput
        label="Fund code / ISIN"
        name="fund_code"
        defaultValue={fund.fund_code ?? ""}
      />
      <FormInput
        label="Group label"
        name="group_label"
        defaultValue={fund.group_label ?? ""}
      />
      <FormInput
        label="Current value"
        name="current_value"
        type="number"
        step="any"
        defaultValue={fund.current_value}
      />
      <FormInput
        label="Units"
        name="units"
        type="number"
        step="any"
        defaultValue={fund.units ?? ""}
      />
      <FormInput
        label="Unit price"
        name="unit_price"
        type="number"
        step="any"
        defaultValue={fund.unit_price ?? ""}
      />
      <FormInput
        label="Value date"
        name="price_as_of_date"
        type="date"
        defaultValue={fund.price_as_of_date}
      />
      <FormInput
        label="Current allocation target %"
        name="target_allocation_percent"
        type="number"
        step="any"
        defaultValue={fund.target_allocation_percent}
      />
      <FormInput
        label="Monthly contribution %"
        name="monthly_contribution_percent"
        type="number"
        step="any"
        defaultValue={fund.monthly_contribution_percent}
      />
      <FormInput
        label="Fund fee % / year"
        name="annual_fund_fee_percent"
        type="number"
        step="any"
        defaultValue={fund.annual_fund_fee_percent}
      />
      <FormInput
        label="Fee/source URL"
        name="fee_source_url"
        defaultValue={fund.fee_source_url ?? ""}
      />
      <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">
        <input
          type="checkbox"
          name="contribution_active"
          defaultChecked={fund.contribution_active}
        />{" "}
        Gets monthly allocation
      </label>
      <FormInput label="Notes" name="notes" defaultValue={fund.notes ?? ""} />
      <div className="flex items-end">
        <SubmitButton>Save fund</SubmitButton>
      </div>
    </form>
  );
}

function MoneyboxAllocationSetupFields({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<
    Array<{ asset: MoneyboxAsset; percent: string }>
  >([]);
  const results = searchMoneyboxAssets(query, MONEYBOX_ASSETS.length).filter(
    (asset) => !selected.some((row) => row.asset.key === asset.key),
  );
  const total = selected.reduce(
    (sum, row) => sum + (Number(row.percent) || 0),
    0,
  );
  const remaining = 100 - total;
  const totalOk = Math.abs(total - 100) <= 0.05;

  function addAsset(asset: MoneyboxAsset) {
    setSelected((rows) =>
      rows.some((row) => row.asset.key === asset.key)
        ? rows
        : [
            ...rows,
            {
              asset,
              percent:
                rows.length === 0
                  ? "100"
                  : Math.max(
                      0,
                      Number(
                        (
                          100 -
                          rows.reduce(
                            (sum, row) => sum + (Number(row.percent) || 0),
                            0,
                          )
                        ).toFixed(3),
                      ),
                    ).toString(),
            },
          ],
    );
    setQuery("");
  }

  function updatePercent(key: string, percent: string) {
    setSelected((rows) =>
      rows.map((row) => (row.asset.key === key ? { ...row, percent } : row)),
    );
  }

  function removeAsset(key: string) {
    setSelected((rows) => rows.filter((row) => row.asset.key !== key));
  }

  function splitEvenly() {
    if (!selected.length) return;
    const each = Number((100 / selected.length).toFixed(3));
    setSelected((rows) =>
      rows.map((row, rowIndex) => ({
        ...row,
        percent:
          rowIndex === rows.length - 1
            ? Number((100 - each * (rows.length - 1)).toFixed(3)).toString()
            : each.toString(),
      })),
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[1.75rem] border border-blue-100 bg-blue-50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
              Moneybox allocation model
            </p>
            <p className="mt-1 text-sm font-bold text-blue-950">
              Moneybox does not behave like a normal live broker import. LOOP
              will infer holdings from the selected fund/ETF/US stock split,
              regular contribution and the estimated buy delay.
            </p>
          </div>
          <div
            className={`rounded-2xl px-4 py-3 text-right ${totalOk ? "bg-emerald-100 text-emerald-800" : "bg-white text-slate-700"}`}
          >
            <p className="text-xs font-black uppercase">Allocated</p>
            <p className="text-2xl font-black">{total.toFixed(1)}%</p>
            <p className="text-[11px] font-bold">
              {remaining >= 0
                ? `${remaining.toFixed(1)}% left`
                : `${Math.abs(remaining).toFixed(1)}% over`}
            </p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] opacity-70">
              {MONEYBOX_ASSETS.length} assets · reviewed{" "}
              {MONEYBOX_ASSETS_LAST_REVIEWED}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormInput
          label="How much goes in?"
          name="moneybox_contribution_amount"
          type="number"
          step="any"
          placeholder="e.g. 200"
        />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">How often?</span>
          <select
            name="moneybox_contribution_frequency"
            defaultValue="weekly"
            className={inputClass}
          >
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="one_off">One-off</option>
            <option value="variable">Variable / round-ups only</option>
          </select>
        </label>
        <FormInput
          label="Start date"
          name="moneybox_start_date"
          type="date"
          defaultValue={today}
        />
        <FormInput
          label="Estimated buy delay in days"
          name="moneybox_execution_lag_days"
          type="number"
          step="1"
          defaultValue="7"
        />
        <FormInput
          label="Current Moneybox total value"
          name="moneybox_current_total_value"
          type="number"
          step="any"
          placeholder="Optional, e.g. 8420"
        />
        <FormInput
          label="Value date"
          name="moneybox_value_date"
          type="date"
          defaultValue={today}
        />
      </div>

      <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <label className="block flex-1">
            <span className="text-sm font-bold text-slate-700">
              Search Moneybox funds, ETFs, stocks or cash
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="mt-1 w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm font-black outline-none ring-orange-500 transition focus:ring-2"
              placeholder="Global Shares, S&P 500, Apple, NVIDIA, gold, AI, cash..."
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                addAsset(
                  MONEYBOX_ASSETS.find(
                    (asset) => asset.key === "moneybox-available-cash-unknown",
                  ) || MONEYBOX_ASSETS[MONEYBOX_ASSETS.length - 1],
                )
              }
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700"
            >
              Add cash/unknown
            </button>
            <button
              type="button"
              onClick={splitEvenly}
              disabled={!selected.length}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black text-white disabled:opacity-40"
            >
              Split evenly
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs font-black uppercase tracking-[0.16em] text-slate-400">
          <span>
            {results.length} available result{results.length === 1 ? "" : "s"}
          </span>
          <span>{selected.length} selected</span>
        </div>
        <div className="mt-3 grid max-h-[32rem] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
          {results.map((asset) => (
            <button
              key={asset.key}
              type="button"
              onClick={() => addAsset(asset)}
              className="rounded-3xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-950">{asset.name}</p>
                  <p className="text-xs font-bold text-slate-500">
                    {asset.provider} · {asset.assetKind.toUpperCase()}{" "}
                    {asset.ticker
                      ? `· ${asset.ticker}${asset.exchange ? ` ${asset.exchange}` : ""}`
                      : ""}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-600">
                  {asset.annualFeePercent ?? 0}% fee
                </span>
              </div>
              {asset.description ? (
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  {asset.description}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {selected.map((row) => (
          <div
            key={row.asset.key}
            className="rounded-[1.5rem] border border-slate-200 bg-white p-4"
          >
            <input
              type="hidden"
              name="moneybox_asset_key"
              value={row.asset.key}
            />
            <div className="grid gap-3 md:grid-cols-[1fr_140px_auto] md:items-center">
              <div>
                <p className="font-black text-slate-950">{row.asset.name}</p>
                <p className="text-xs font-bold text-slate-500">
                  {row.asset.provider} · {row.asset.assetKind.toUpperCase()}{" "}
                  {row.asset.isin ? `· ${row.asset.isin}` : ""}
                </p>
              </div>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">
                  Allocation %
                </span>
                <input
                  name="moneybox_allocation_percent"
                  value={row.percent}
                  onChange={(event) =>
                    updatePercent(row.asset.key, event.target.value)
                  }
                  type="number"
                  step="any"
                  min="0"
                  max="100"
                  className={inputClass}
                  required
                />
              </label>
              <button
                type="button"
                onClick={() => removeAsset(row.asset.key)}
                className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-black text-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {!selected.length ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-sm font-bold text-slate-500">
            Select as many Moneybox assets as needed. Each selected row gets a
            percentage box on the right; the total must equal 100%.
          </div>
        ) : null}
      </div>

      <FormInput
        label="Moneybox model notes"
        name="moneybox_notes"
        placeholder="e.g. payday boost plus round-ups; checked against app on this date"
      />
      {!totalOk && selected.length ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">
          Allocation must equal 100% before saving.
        </p>
      ) : null}
      {compact ? null : (
        <p className="text-xs font-bold text-slate-500">
          Saving creates inferred holdings and estimated purchase lots. User
          edits later are stored as manual corrections/snapshots and can
          override the model.
        </p>
      )}
    </div>
  );
}

function MoneyboxAllocationSetupForm({
  account,
}: {
  account: InvestmentAccount;
}) {
  return (
    <form action={async (formData) => { await saveMoneyboxInvestmentAccountSetup(formData); }} className="space-y-5">
      <input type="hidden" name="investment_account_id" value={account.id} />
      <input type="hidden" name="provider" value="Moneybox" />
      <div className="grid gap-4 md:grid-cols-2">
        <FormInput
          label="Pot label"
          name="label"
          defaultValue={account.label || "Moneybox investments"}
          required
        />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Account type</span>
          <select
            name="account_type"
            defaultValue={account.account_type || "isa"}
            className={inputClass}
          >
            <option value="isa">Stocks & Shares ISA</option>
            <option value="lisa">Stocks & Shares Lifetime ISA</option>
            <option value="gia">General Investment Account</option>
            <option value="private">Personal Pension</option>
            <option value="junior_isa">Junior ISA</option>
            <option value="other">Other / not sure</option>
          </select>
        </label>
        <FormInput
          label="Platform fee % / year"
          name="annual_platform_fee_percent"
          type="number"
          step="any"
          defaultValue={account.annual_platform_fee_percent ?? 0.45}
        />
        <FormInput
          label="Fixed monthly fee"
          name="fixed_monthly_fee"
          type="number"
          step="any"
          defaultValue={account.fixed_monthly_fee ?? 1}
        />
      </div>
      <MoneyboxAllocationSetupFields />
      <FormInput
        label="Pot notes"
        name="notes"
        defaultValue={account.notes ?? "Moneybox allocation model enabled."}
      />
      <SubmitButton>Save Moneybox model</SubmitButton>
    </form>
  );
}

function AddInvestmentAccountForm({
  people,
  defaultPersonId,
}: {
  people: Person[];
  defaultPersonId?: string;
}) {
  const providers = investmentProviders();
  const [providerName, setProviderName] = useState(
    providers.find((p) => p.id === "trading-212")?.name ||
      providers[0]?.name ||
      "Trading 212",
  );
  const provider = findProvider(providerName);
  const offerings = accountOfferingsFor(providerName, "investment");
  const isMoneybox =
    provider?.id === "moneybox" ||
    providerName.toLowerCase().includes("moneybox");
  return (
    <form
      action={async (formData) => {
        if (isMoneybox) await saveMoneyboxInvestmentAccountSetup(formData);
        else await addInvestmentAccount(formData);
      }}
      className="space-y-5"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Provider</span>
          <select
            name="provider"
            value={providerName}
            onChange={(event) => setProviderName(event.target.value)}
            className={inputClass}
          >
            {providers.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
            <option value="Other">Other / manual</option>
          </select>
        </label>
        <FormInput
          label="Pot label"
          name="label"
          placeholder={`${providerName} ISA, GIA or stock group`}
          required
        />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Owner</span>
          <select
            name="person_id"
            defaultValue={defaultPersonId || ""}
            className={inputClass}
          >
            <PersonOptions people={people} />
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Account type</span>
          <select name="account_type" className={inputClass}>
            {(offerings.length
              ? offerings
              : [
                  { value: "gia", label: "GIA" },
                  { value: "isa", label: "Stocks & Shares ISA" },
                ]
            ).map((offering) => (
              <option key={offering.value} value={offering.value}>
                {offering.label}
              </option>
            ))}
          </select>
        </label>
        <FormInput
          label="Platform fee % / year"
          name="annual_platform_fee_percent"
          type="number"
          step="any"
          placeholder={
            provider?.defaultAnnualPlatformFeePercent === null
              ? "Provider-specific"
              : String(provider?.defaultAnnualPlatformFeePercent ?? 0)
          }
        />
        <FormInput
          label="Fixed monthly fee"
          name="fixed_monthly_fee"
          type="number"
          step="any"
          placeholder={
            provider?.defaultFixedMonthlyFee === null
              ? "Provider-specific"
              : String(provider?.defaultFixedMonthlyFee ?? 0)
          }
        />
        <FormInput
          label="Notes"
          name="notes"
          placeholder={provider?.notes || "Manual until API/CSV connected"}
        />
      </div>
      <ProviderDocs providerName={providerName} />
      {isMoneybox ? <MoneyboxAllocationSetupFields compact /> : null}
      <SubmitButton>
        {isMoneybox
          ? "Add Moneybox pot + allocation model"
          : "Add investment pot"}
      </SubmitButton>
    </form>
  );
}
function EditInvestmentAccountForm({
  people,
  account,
  onDelete,
}: {
  people: Person[];
  account: InvestmentAccount;
  onDelete?: () => void;
}) {
  const providers = investmentProviders();
  const provider = findProvider(account.provider);
  const offerings = accountOfferingsFor(account.provider, "investment");
  return (
    <form action={updateInvestmentAccount} className="space-y-5">
      <input type="hidden" name="id" value={account.id} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Provider</span>
          <select
            name="provider"
            defaultValue={account.provider}
            className={inputClass}
          >
            {providers.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
            <option value="Other">Other / manual</option>
          </select>
        </label>
        <FormInput
          label="Pot label"
          name="label"
          defaultValue={account.label}
          required
        />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Owner</span>
          <select
            name="person_id"
            defaultValue={account.person_id || ""}
            className={inputClass}
          >
            <PersonOptions people={people} />
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Account type</span>
          <select
            name="account_type"
            defaultValue={account.account_type}
            className={inputClass}
          >
            {(offerings.length
              ? offerings
              : [
                  { value: "gia", label: "GIA" },
                  { value: "isa", label: "Stocks & Shares ISA" },
                  { value: "sipp", label: "SIPP" },
                  { value: "other", label: "Other" },
                ]
            ).map((offering) => (
              <option key={offering.value} value={offering.value}>
                {offering.label}
              </option>
            ))}
          </select>
        </label>
        <FormInput
          label="Platform fee % / year"
          name="annual_platform_fee_percent"
          type="number"
          step="any"
          defaultValue={account.annual_platform_fee_percent}
        />
        <FormInput
          label="Fixed monthly fee"
          name="fixed_monthly_fee"
          type="number"
          step="any"
          defaultValue={account.fixed_monthly_fee}
        />
        <FormInput
          label="Total cash available"
          name="provider_cash_value"
          type="number"
          step="any"
          defaultValue={account.provider_cash_value ?? ""}
          placeholder="e.g. 5200.75"
        />
        <FormInput
          label="Main cash / free cash"
          name="provider_investable_cash_value"
          type="number"
          step="any"
          defaultValue={account.provider_investable_cash_value ?? ""}
          placeholder="e.g. 5187.98"
        />
        <FormInput
          label="Dividends waiting to reinvest"
          name="provider_dividend_cash_value"
          type="number"
          step="any"
          defaultValue={account.provider_dividend_cash_value ?? ""}
          placeholder="e.g. 12.77"
        />
        <FormInput
          label="ISA allowance used"
          name="provider_isa_subscribed_amount"
          type="number"
          step="any"
          defaultValue={account.provider_isa_subscribed_amount ?? ""}
          placeholder="Optional manual override"
        />
        <FormInput
          label="ISA allowance remaining"
          name="provider_isa_remaining_amount"
          type="number"
          step="any"
          defaultValue={account.provider_isa_remaining_amount ?? ""}
          placeholder="Optional manual override"
        />
        <FormInput
          label="ISA tax year"
          name="provider_isa_allowance_year"
          defaultValue={account.provider_isa_allowance_year ?? ""}
          placeholder="2026/27"
        />
        <FormInput
          label="Notes"
          name="notes"
          defaultValue={account.notes ?? provider?.notes ?? ""}
        />
      </div>
      <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-black text-slate-950">Pot actions</p>
          <p className="text-sm font-semibold text-slate-500">
            Delete stays behind settings and still requires typed confirmation.
          </p>
        </div>
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-600"
          >
            <Trash2 className="h-4 w-4" /> Delete pot
          </button>
        ) : null}
      </div>
      <SubmitButton>Save investment pot</SubmitButton>
    </form>
  );
}

function PriceUnitField({
  value,
  onChange,
  name = "price_input_unit",
}: {
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">Price input unit</span>
      <select
        name={name}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        className={inputClass}
      >
        <option value="gbp">GBP pounds</option>
        <option value="gbx">UK pence / GBX</option>
        <option value="usd">USD dollars</option>
        <option value="eur">EUR euros</option>
      </select>
    </label>
  );
}

function MarketCurrencyHint({
  exchange,
  priceUnit,
  nativeCurrency,
}: {
  exchange?: string | null;
  priceUnit?: string | null;
  nativeCurrency?: string | null;
}) {
  const ex = normalisedExchange(exchange);
  const unit = String(priceUnit || "").toLowerCase();
  const inferred = marketCurrencyFor(ex, nativeCurrency);
  const warnings: string[] = [];
  if (ex === "LSE" && unit !== "gbx")
    warnings.push(
      "LSE quotes are normally entered in pence/GBX. The app stores the GBP equivalent after saving.",
    );
  if (["NASDAQ", "NYSE", "AMEX"].includes(ex) && unit !== "usd")
    warnings.push(
      "US-listed stocks are normally quoted in USD. The app converts the saved value to GBP for portfolio totals.",
    );
  if (!warnings.length)
    warnings.push(
      `Market quote looks like ${inferred}. Portfolio totals are shown in GBP, with the native price kept alongside it.`,
    );
  return (
    <div className="md:col-span-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800">
      {warnings.join(" ")}
    </div>
  );
}

type QuoteResult = null | {
  price: number;
  source: string;
  rawSymbol: string;
  assetName?: string;
  exchange?: string;
  currency?: string;
  priceQuoteUnit?: string;
  note?: string;
  sourceUrl?: string | null;
  assetType?: string | null;
  isin?: string | null;
  annualAssetFeePercent?: number | null;
  confidence?: number | null;
  logoDomain?: string | null;
};
type QuoteCandidate = NonNullable<QuoteResult>;
function normaliseInvestmentSearchText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function tokenOverlapConfidence(candidate: QuoteCandidate, query: string) {
  const explicit = Number(candidate.confidence ?? 0);
  if (explicit >= 50) return explicit;
  const q = normaliseInvestmentSearchText(query);
  const symbol = normaliseInvestmentSearchText(candidate.rawSymbol || "");
  const name = normaliseInvestmentSearchText(
    `${candidate.assetName || ""} ${candidate.isin || ""}`,
  );
  if (!q) return 0;
  if (symbol && (q === symbol || q === symbol.replace(/ l$/, ""))) return 99;
  if (name.includes(q) || q.includes(name)) return 90;
  const qTokens = q.split(" ").filter((t) => t.length > 2);
  if (!qTokens.length) return 0;
  const haystack = `${name} ${symbol}`;
  const hits = qTokens.filter((token) => haystack.includes(token)).length;
  const ratio = hits / qTokens.length;
  if (ratio >= 0.8) return 75;
  if (ratio >= 0.5 && hits >= 2) return 55;
  return Math.round(ratio * 45);
}
function AddInvestmentHoldingForm({
  accounts,
  defaultAccountId,
}: {
  accounts: InvestmentAccount[];
  defaultAccountId?: string;
}) {
  const selectedAccount =
    accounts.find((account) => account.id === defaultAccountId) || accounts[0];
  const [accountId, setAccountId] = useState(
    defaultAccountId || selectedAccount?.id || "",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [ticker, setTicker] = useState("");
  const [exchange, setExchange] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetKind, setAssetKind] = useState("share");
  const [isin, setIsin] = useState("");
  const [priceUnit, setPriceUnit] = useState("gbx");
  const [latestPrice, setLatestPrice] = useState("");
  const [annualAssetFee, setAnnualAssetFee] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [quote, setQuote] = useState<QuoteResult>(null);
  const [matches, setMatches] = useState<QuoteCandidate[]>([]);
  const [quoteNote, setQuoteNote] = useState("");
  const [searching, setSearching] = useState(false);
  const [coverageQueued, setCoverageQueued] = useState("");
  const [entryMode, setEntryMode] = useState<"average" | "lots">("average");
  const [lotRows, setLotRows] = useState([
    { date: today, units: "", price: "", total: "", note: "" },
  ]);
  const account = accounts.find((item) => item.id === accountId);
  const selected = Boolean(quote);

  function updateLot(
    index: number,
    field: "date" | "units" | "price" | "total" | "note",
    value: string,
  ) {
    setLotRows((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row,
      ),
    );
  }

  function stripSymbol(symbol?: string | null) {
    return String(symbol || "")
      .toUpperCase()
      .replace(/\.L$/i, "")
      .replace(/\.UK$/i, "");
  }

  function applyQuote(candidate: QuoteCandidate) {
    setQuote(candidate);
    setTicker(stripSymbol(candidate.rawSymbol));
    setAssetName(
      candidate.assetName || searchQuery || candidate.rawSymbol || "Holding",
    );
    setExchange(candidate.exchange || exchange);
    setAssetKind(candidate.assetType || "share");
    setIsin(candidate.isin || "");
    setPriceUnit(candidate.priceQuoteUnit || priceUnit);
    setAnnualAssetFee(
      candidate.annualAssetFeePercent === null ||
        candidate.annualAssetFeePercent === undefined
        ? ""
        : String(candidate.annualAssetFeePercent),
    );
    setSourceUrl(candidate.sourceUrl || "");
    if (candidate.price > 0) {
      const display = Number(candidate.price);
      setLatestPrice(String(Number(display.toFixed(6))));
    }
  }

  async function searchHolding(mode: "auto" | "manual" = "manual") {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setCoverageQueued("");
    if (mode === "manual") setQuoteNote("");
    setQuote(null);
    try {
      const response = await fetch("/api/investments/quote-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          exchange,
          investmentAccountId: accountId,
        }),
      });
      const payload = await response.json();
      const candidates = Array.isArray(payload.matches)
        ? payload.matches
        : payload.quote
          ? [payload.quote]
          : [];
      const confident = candidates
        .map((candidate: QuoteCandidate) => ({
          ...candidate,
          confidence: tokenOverlapConfidence(candidate, searchQuery),
        }))
        .filter(
          (candidate: QuoteCandidate) =>
            Number(candidate.confidence || 0) >= 25 ||
            /search|openai|yahoo/i.test(String(candidate.source || "")),
        );
      setMatches(confident);
      setQuoteNote(
        payload.note ||
          (confident.length
            ? "Choose the exact stock, ETF or provider fund before adding it. Manual entries are allowed, but are clearly marked as manual."
            : "No confident match found."),
      );
    } catch (error) {
      setQuoteNote(
        error instanceof Error ? error.message : "Investment search failed",
      );
    } finally {
      setSearching(false);
    }
  }

  async function requestCoverage() {
    if (!searchQuery.trim()) return;
    setCoverageQueued("Queueing...");
    try {
      const response = await fetch(
        "/api/investments/request-instrument-coverage",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: searchQuery,
            exchange,
            investmentAccountId: accountId,
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      setCoverageQueued(
        payload.message ||
          (response.ok
            ? "Coverage request queued. This usually takes 2–10 minutes; a placeholder is saved in this pot while LOOP researches it."
            : "Could not queue this yet."),
      );
    } catch (error) {
      setCoverageQueued(
        error instanceof Error ? error.message : "Could not queue this yet.",
      );
    }
  }

  function addManualHolding() {
    const clean = searchQuery.trim();
    const manual: QuoteCandidate = {
      price: 0,
      source: "Manual review",
      rawSymbol: clean.toUpperCase() || "MANUAL",
      assetName: clean || "Manual holding",
      exchange: exchange || "Manual",
      currency: "GBP",
      priceQuoteUnit: priceUnit,
      sourceUrl: null,
      assetType: "other",
      annualAssetFeePercent: 0,
      note: "Manual holding: no live/delayed ticker has been linked yet. Use this only when a quote search is not available.",
    };
    applyQuote(manual);
    setQuoteNote(
      "Manual mode selected. This will not be treated as a tracked market ticker unless you add a supported ticker/exchange later.",
    );
  }

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 3) {
      setMatches([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchHolding("auto");
    }, 550);
    return () => window.clearTimeout(timer);
  }, [searchQuery, exchange]);

  return (
    <form action={addInvestmentHolding} className="space-y-5">
      <label className="block">
        <span className="text-sm font-bold text-slate-700">Investment pot</span>
        <select
          name="investment_account_id"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          className={inputClass}
          required
        >
          {accounts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label} · {item.provider}
            </option>
          ))}
        </select>
      </label>

      <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
          Search first
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          Type a company, ETF full name, ETF ticker, fund name or ISIN.
          Examples: Gear4music, Apple, VWRP, Vanguard FTSE All-World UCITS ETF
          or Vanguard Global All Cap.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="sr-only">Search holding</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void searchHolding();
                }
              }}
              className="w-full rounded-3xl border border-slate-200 bg-white px-5 py-4 text-lg font-black outline-none ring-orange-500 transition focus:ring-2"
              placeholder="Search ticker, ETF full name, fund name or ISIN..."
            />
          </label>
          <button
            type="button"
            onClick={() => void searchHolding()}
            disabled={searching || !searchQuery.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-3xl bg-slate-950 px-6 py-4 text-sm font-black text-white disabled:opacity-50"
          >
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}{" "}
            Search
          </button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-[220px_1fr] sm:items-center">
          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Optional market / venue
            </span>
            <input
              value={exchange}
              onChange={(event) =>
                setExchange(event.target.value.toUpperCase())
              }
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black uppercase outline-none ring-orange-500 transition focus:ring-2"
              placeholder="e.g. LSE, XETR, XFRA, XPAR, NASDAQ, PINX"
            />
          </label>
          <p className="text-xs font-bold text-slate-500">
            Leave blank to search all markets. LOOP can return global venues and
            queue unknown tickers for AI/admin coverage instead of forcing them
            into the UK/US list.
          </p>
        </div>
        {matches.length ? (
          <div className="mt-4 space-y-2">
            {matches.map((candidate, idx) => (
              <button
                type="button"
                key={`${candidate.rawSymbol}-${idx}`}
                onClick={() => applyQuote(candidate)}
                className={`w-full rounded-3xl border px-4 py-3 text-left transition ${quote?.rawSymbol === candidate.rawSymbol && quote?.assetName === candidate.assetName ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
              >
                <div className="grid gap-3 md:grid-cols-[1.1fr_.8fr_.7fr_.7fr_.8fr] md:items-center">
                  <div>
                    <p className="text-xs font-bold text-slate-500">Match</p>
                    <p className="font-black text-slate-950">
                      {candidate.assetName || candidate.rawSymbol}
                    </p>
                    <p className="text-xs font-semibold text-slate-500">
                      {candidate.note}
                    </p>
                    {candidate.confidence !== undefined ? (
                      <p className="mt-1 text-[11px] font-black text-emerald-700">
                        {Number(candidate.confidence).toFixed(0)}% match
                        confidence
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">
                      Ticker / ref
                    </p>
                    <p className="font-black text-slate-950">
                      {candidate.rawSymbol}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">Type</p>
                    <p className="font-black capitalize text-slate-950">
                      {candidate.assetType || "share"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">Exchange</p>
                    <p className="font-black text-slate-950">
                      {candidate.exchange || "Review"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500">
                      Latest / fee
                    </p>
                    <p className="font-black text-emerald-700">
                      {candidate.price > 0
                        ? priceDisplayFromStored(
                            candidate.price,
                            candidate.priceQuoteUnit,
                            candidate.currency || "GBP",
                          )
                        : "Manual"}
                    </p>
                    <p className="text-xs font-bold text-slate-500">
                      {candidate.annualAssetFeePercent
                        ? `${candidate.annualAssetFeePercent}% fee`
                        : "No fee/unknown"}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
        {!searching &&
        searchQuery.trim().length >= 3 &&
        matches.length === 0 ? (
          <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-black text-amber-950">
              No confident market match found
            </p>
            <p className="mt-1 text-xs font-bold text-amber-800">
              Do not save this as a tracked ticker yet. Add it to the coverage
              database so AI/admin can research the correct instrument,
              exchange, logo and quote source.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void requestCoverage()}
                className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
              >
                Add to database
              </button>
              <button
                type="button"
                onClick={addManualHolding}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700"
              >
                Continue manually
              </button>
            </div>
            {coverageQueued ? (
              <div className="mt-3 rounded-2xl bg-white p-3 text-xs font-bold text-slate-600">
                <p className="font-black text-amber-950">{coverageQueued}</p>
                <p className="mt-1 text-[11px] font-bold text-amber-700">
                  You can close this window. The placeholder will remain in the
                  pot and will change to Ready to add when the background
                  coverage job resolves it.
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {[
                    "Ticker/instrument search queued",
                    "Investment profile and logo lookup",
                    "Document/fee information",
                    "Starter history: 1 month minimum",
                  ].map((step, index) => (
                    <span
                      key={step}
                      className={`rounded-full px-3 py-2 ${index === 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500"}`}
                    >
                      {index === 0 ? "✓" : "…"} {step}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {quoteNote ? (
          <p className="mt-3 text-sm font-semibold text-slate-500">
            {quoteNote}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={addManualHolding}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            Add manual instead
          </button>
        </div>
      </div>

      <input type="hidden" name="ticker" value={ticker} />
      <input type="hidden" name="exchange" value={exchange} />
      <input type="hidden" name="asset_kind" value={assetKind} />
      <input type="hidden" name="isin" value={isin} />
      <input
        type="hidden"
        name="currency"
        value={
          quote?.currency ||
          (priceUnit === "usd" ? "USD" : priceUnit === "eur" ? "EUR" : "GBP")
        }
      />
      <input type="hidden" name="source_url" value={sourceUrl} />

      {!selected ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-sm font-bold text-slate-500">
          Select a search result to unlock price, fee and holding details. This
          keeps the add flow cleaner and prevents random manual data from being
          saved too early.
        </div>
      ) : null}

      {selected ? (
        <>
          <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
              Selected
            </p>
            <div className="mt-2 grid gap-3 md:grid-cols-4">
              <div>
                <p className="text-xs font-bold text-emerald-800">Name</p>
                <p className="font-black text-slate-950">{assetName}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-800">Ticker/ref</p>
                <p className="font-black text-slate-950">
                  {ticker || "Manual"}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-800">
                  Exchange/provider
                </p>
                <p className="font-black text-slate-950">
                  {exchange || "Review"}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-800">Type</p>
                <p className="font-black capitalize text-slate-950">
                  {assetKind}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Stock / fund name
              </span>
              <input
                name="asset_name"
                value={assetName}
                onChange={(event) => setAssetName(event.target.value)}
                className={inputClass}
                placeholder="Gear4music"
                required
              />
            </label>
            <FormInput
              label="Group name"
              name="group_label"
              placeholder="Trading 212 Group A, AI, Global ETF"
            />
            <PriceUnitField value={priceUnit} onChange={setPriceUnit} />
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Latest price / unit price
              </span>
              <input
                name="latest_price"
                value={latestPrice}
                onChange={(event) => setLatestPrice(event.target.value)}
                type="number"
                step="any"
                className={inputClass}
                placeholder={
                  assetKind === "fund"
                    ? "Provider unit price or leave 0"
                    : "Search can fill this"
                }
              />
            </label>
            <MarketCurrencyHint
              exchange={exchange || quote?.exchange}
              priceUnit={priceUnit}
              nativeCurrency={quote?.currency}
            />
            <FormInput
              label="Price date"
              name="latest_price_date"
              type="date"
              defaultValue={today}
            />
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Asset / fund fee % / year
              </span>
              <input
                name="annual_asset_fee_percent"
                value={annualAssetFee}
                onChange={(event) => setAnnualAssetFee(event.target.value)}
                type="number"
                step="any"
                className={inputClass}
                placeholder={
                  assetKind === "fund" || assetKind === "etf"
                    ? "OCF / ongoing charge"
                    : "Usually 0 for individual shares"
                }
              />
            </label>
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
              Your holding
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEntryMode("average")}
                className={`rounded-full px-4 py-2 text-xs font-black ${entryMode === "average" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                Use average price
              </button>
              <button
                type="button"
                onClick={() => setEntryMode("lots")}
                className={`rounded-full px-4 py-2 text-xs font-black ${entryMode === "lots" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}
              >
                Enter purchase lots
              </button>
            </div>
            {entryMode === "average" ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <FormInput
                  label="Shares / units owned"
                  name="units"
                  type="number"
                  step="any"
                  required
                />
                <FormInput
                  label="Average purchase price"
                  name="average_buy_price"
                  type="number"
                  step="any"
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-bold text-slate-700">
                  Purchase lots
                </p>
                {lotRows.map((row, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr]">
                      <label className="block">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                          Date
                        </span>
                        <input
                          name="purchase_lot_date"
                          type="date"
                          value={row.date}
                          onChange={(event) =>
                            updateLot(index, "date", event.target.value)
                          }
                          className={inputClass}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                          Amount bought
                        </span>
                        <input
                          name="purchase_lot_units"
                          type="number"
                          step="any"
                          value={row.units}
                          onChange={(event) =>
                            updateLot(index, "units", event.target.value)
                          }
                          className={inputClass}
                          placeholder="414.96"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                          Purchase price
                        </span>
                        <input
                          name="purchase_lot_price"
                          type="number"
                          step="any"
                          value={row.price}
                          onChange={(event) =>
                            updateLot(index, "price", event.target.value)
                          }
                          className={inputClass}
                          placeholder={priceUnit === "gbx" ? "241p" : "2.41"}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                          Total cost paid
                        </span>
                        <input
                          name="purchase_lot_total"
                          type="number"
                          step="any"
                          value={row.total}
                          onChange={(event) =>
                            updateLot(index, "total", event.target.value)
                          }
                          className={inputClass}
                          placeholder="Includes FX/fees"
                        />
                      </label>
                    </div>
                    <label className="mt-3 block">
                      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                        Note
                      </span>
                      <input
                        name="purchase_lot_note"
                        value={row.note}
                        onChange={(event) =>
                          updateLot(index, "note", event.target.value)
                        }
                        className={inputClass}
                        placeholder="Initial buy, top-up, FX charge included"
                      />
                    </label>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setLotRows((rows) => [
                      ...rows,
                      {
                        date: today,
                        units: "",
                        price: "",
                        total: "",
                        note: "",
                      },
                    ])
                  }
                  className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700"
                >
                  + Add another lot
                </button>
                <p className="text-xs font-semibold text-slate-500">
                  The app totals shares, uses total cost where supplied, and
                  calculates a weighted average that includes FX/commission
                  drag.
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormInput
              label="Target allocation % (optional)"
              name="target_allocation_percent"
              type="number"
              step="any"
            />
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">
              <input
                type="checkbox"
                name="price_polling_enabled"
                defaultChecked
              />{" "}
              Include in market price refresh
            </label>
          </div>
          <FormInput
            label="Notes"
            name="notes"
            placeholder={
              account
                ? `Platform fee on ${account.provider}: ${Number(account.annual_platform_fee_percent || 0).toFixed(3)}%/yr + ${formatMoney(account.fixed_monthly_fee || 0)}/month`
                : "Notes"
            }
          />
          <SubmitButton>Add holding</SubmitButton>
        </>
      ) : null}
    </form>
  );
}
function HoldingPriceSourceRemapper({ holding }: { holding: InvestmentHolding }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(
    [holding.asset_name, holding.isin].filter(Boolean).join(" "),
  );
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<QuoteCandidate[]>([]);
  const [selected, setSelected] = useState<QuoteCandidate | null>(null);
  const [message, setMessage] = useState("");

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setSelected(null);
    setMessage("");
    try {
      const response = await fetch("/api/investments/quote-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), exchange: "" }),
      });
      const payload = await response.json();
      const candidates: QuoteCandidate[] = Array.isArray(payload.matches)
        ? payload.matches
        : payload.quote
          ? [payload.quote]
          : [];
      const ranked = candidates
        .map((candidate) => ({
          ...candidate,
          confidence: tokenOverlapConfidence(candidate, query),
        }))
        .filter((candidate) => Number(candidate.price || 0) > 0)
        .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
        .slice(0, 8);
      setMatches(ranked);
      setMessage(
        ranked.length
          ? "Select the exact instrument. Nothing changes until you save the holding."
          : "No priced match was found. Keep the current source and request instrument coverage rather than guessing.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fund search failed.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="md:col-span-2 rounded-3xl border border-violet-200 bg-violet-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-violet-950">Price source and fund mapping</p>
          <p className="mt-1 text-xs font-bold text-violet-700">
            Search and remap this holding without deleting its units, purchase threads or account history.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-full bg-violet-950 px-4 py-2 text-xs font-black text-white"
        >
          {open ? "Close search" : "Find correct price source"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void search();
                }
              }}
              className="min-w-0 flex-1 rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-bold outline-none ring-violet-500 focus:ring-2"
              placeholder="Fund name, ISIN or provider code"
            />
            <button
              type="button"
              onClick={() => void search()}
              disabled={searching || !query.trim()}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
          {message ? <p className="text-xs font-bold text-violet-800">{message}</p> : null}
          {matches.map((candidate) => {
            const active = selected?.rawSymbol === candidate.rawSymbol && selected?.assetName === candidate.assetName;
            return (
              <button
                type="button"
                key={`${candidate.rawSymbol}-${candidate.assetName}`}
                onClick={() => setSelected(candidate)}
                className={`w-full rounded-2xl border p-3 text-left ${active ? "border-emerald-400 bg-emerald-50" : "border-violet-100 bg-white hover:border-violet-300"}`}
              >
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="font-black text-slate-950">{candidate.assetName || candidate.rawSymbol}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {candidate.isin || "No ISIN returned"} · {candidate.rawSymbol} · {candidate.exchange || "Provider"}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="font-black text-emerald-700">{formatMoney(Number(candidate.price || 0))}</p>
                    <p className="text-[11px] font-bold text-slate-500">{Number(candidate.confidence || 0).toFixed(0)}% name match</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {selected ? (
        <div className="mt-4 rounded-2xl border border-emerald-300 bg-white p-3">
          <p className="text-xs font-black uppercase tracking-wider text-emerald-700">New source selected</p>
          <p className="mt-1 font-black text-slate-950">{selected.assetName}</p>
          <p className="text-xs font-bold text-slate-500">{selected.rawSymbol} · {selected.isin || "ISIN not supplied"}</p>
          <input type="hidden" name="remap_confirmed" value="1" />
          <input type="hidden" name="remap_asset_name" value={selected.assetName || holding.asset_name} />
          <input type="hidden" name="remap_ticker" value={selected.rawSymbol} />
          <input type="hidden" name="remap_exchange" value={selected.exchange || "Provider"} />
          <input type="hidden" name="remap_asset_kind" value={selected.assetType || "fund"} />
          <input type="hidden" name="remap_isin" value={selected.isin || holding.isin || ""} />
          <input type="hidden" name="remap_latest_price" value={selected.price} />
          <input type="hidden" name="remap_price_input_unit" value={selected.priceQuoteUnit || "gbp"} />
          <input type="hidden" name="remap_currency" value={selected.currency || "GBP"} />
          <input type="hidden" name="remap_annual_asset_fee_percent" value={selected.annualAssetFeePercent ?? ""} />
          <input type="hidden" name="remap_source" value={selected.source || "verified search"} />
          <input type="hidden" name="remap_source_url" value={selected.sourceUrl || ""} />
        </div>
      ) : null}
    </div>
  );
}

function EditInvestmentHoldingForm({
  holding,
}: {
  holding: InvestmentHolding;
}) {
  const unit =
    holding.price_quote_unit ||
    (holding.exchange?.toUpperCase() === "LSE" ? "gbx" : "gbp");
  const nativePrice =
    holding.native_latest_price !== null &&
    holding.native_latest_price !== undefined
      ? Number(holding.native_latest_price)
      : null;
  const latestDisplay =
    nativePrice !== null
      ? nativePrice
      : unit === "gbx"
        ? Number(holding.latest_price || 0) * 100
        : Number(holding.latest_price || 0);
  const avgDisplay =
    unit === "gbx"
      ? Number(holding.average_buy_price || 0) * 100
      : Number(holding.average_buy_price || 0);
  const sourceLooksWrong =
    ["share", "etf"].includes(
      String(holding.asset_kind || "share").toLowerCase(),
    ) &&
    /factsheet|fund-centre|vanguard|fidelity|hl\.co\.uk|pensionbee/i.test(
      String(holding.source_url || ""),
    );
  const knownTickerLooksWrong =
    String(holding.ticker || "").toUpperCase() === "NIO" &&
    Number(holding.latest_price || 0) > 50;
  return (
    <form
      action={updateInvestmentHolding}
      className="grid gap-4 md:grid-cols-2"
    >
      <input type="hidden" name="id" value={holding.id} />
      <FormInput
        label="Stock / fund name"
        name="asset_name"
        defaultValue={holding.asset_name}
        required
      />
      <FormInput
        label="Ticker"
        name="ticker"
        defaultValue={holding.ticker ?? ""}
      />
      <FormInput
        label="Exchange"
        name="exchange"
        defaultValue={holding.exchange ?? ""}
      />
      <FormInput
        label="Group name"
        name="group_label"
        defaultValue={holding.group_label ?? ""}
      />
      <label className="block">
        <span className="text-sm font-bold text-slate-700">Asset type</span>
        <select
          name="asset_kind"
          defaultValue={holding.asset_kind || "share"}
          className={inputClass}
        >
          <option value="share">Share</option>
          <option value="etf">ETF</option>
          <option value="fund">Provider fund</option>
          <option value="crypto">Crypto</option>
          <option value="other">Other</option>
        </select>
      </label>
      <FormInput
        label="ISIN / fund code"
        name="isin"
        defaultValue={holding.isin ?? ""}
      />
      <FormInput
        label="Shares / units owned"
        name="units"
        type="number"
        step="any"
        defaultValue={holding.units}
        required
      />
      <PriceUnitField value={unit} name="price_input_unit" />
      <MarketCurrencyHint
        exchange={holding.exchange || holding.native_exchange}
        priceUnit={unit}
        nativeCurrency={holding.native_currency}
      />
      <FormInput
        label="Average purchase price"
        name="average_buy_price"
        type="number"
        step="any"
        defaultValue={avgDisplay}
      />
      <FormInput
        label="Latest price"
        name="latest_price"
        type="number"
        step="any"
        defaultValue={latestDisplay}
      />
      <FormInput
        label="Price date"
        name="latest_price_date"
        type="date"
        defaultValue={holding.latest_price_date}
      />
      <FormInput
        label="Asset fee % / year"
        name="annual_asset_fee_percent"
        type="number"
        step="any"
        defaultValue={holding.annual_asset_fee_percent}
      />
      <FormInput
        label="Target allocation %"
        name="target_allocation_percent"
        type="number"
        step="any"
        defaultValue={holding.target_allocation_percent}
      />
      <FormInput
        label="Source URL"
        name="source_url"
        defaultValue={holding.source_url ?? ""}
      />
      <HoldingPriceSourceRemapper holding={holding} />
      {sourceLooksWrong || knownTickerLooksWrong ? (
        <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          This holding looks like it may have inherited a provider/fund NAV
          instead of an exchange quote. Saving will try to repair from market
          data; using Refresh price is safest before relying on totals.
        </div>
      ) : null}
      <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">
        <input
          type="checkbox"
          name="price_polling_enabled"
          defaultChecked={holding.price_polling_enabled !== false}
        />{" "}
        Include in market price refresh
      </label>
      <FormInput
        label="Notes"
        name="notes"
        defaultValue={holding.notes ?? ""}
      />
      <div className="flex items-end">
        <SubmitButton>Save holding</SubmitButton>
      </div>
    </form>
  );
}

function OrganiseInvestmentPiesForm({
  account,
  holdings,
}: {
  account: InvestmentAccount;
  holdings: InvestmentHolding[];
}) {
  const [quickLabel, setQuickLabel] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const existingLabels = Array.from(
    new Set(
      holdings
        .map((holding) => String(holding.group_label || "").trim())
        .filter(Boolean),
    ),
  ).sort();
  const snapTrade =
    String(account.external_provider || "").toLowerCase() === "snaptrade";
  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function applyToSelected() {
    const inputs = document.querySelectorAll<HTMLInputElement>(
      `input[data-pie-account='${account.id}']`,
    );
    inputs.forEach((input) => {
      const id = input.getAttribute("data-holding-id") || "";
      if (selectedIds.has(id)) input.value = quickLabel;
    });
  }
  return (
    <form action={updateInvestmentHoldingGroups} className="space-y-5">
      <input type="hidden" name="investment_account_id" value={account.id} />
      <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">
        {snapTrade
          ? "SnapTrade has returned positions, but not Trading 212 group membership. Select holdings below and group them into your own Daily Dividend, War Ready, income or growth groups. LOOP then uses the normal grouped stocks view."
          : "Select holdings and group them into your own groups/portfolios. Leave a row blank to keep it as a normal standalone holding."}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">
            Quick group name
          </span>
          <input
            value={quickLabel}
            onChange={(event) => setQuickLabel(event.target.value)}
            className={inputClass}
            placeholder="Daily Dividend, War Ready, Growth, Income"
          />
        </label>
        <button
          type="button"
          onClick={() =>
            setSelectedIds(new Set(holdings.map((holding) => holding.id)))
          }
          className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={applyToSelected}
          disabled={!quickLabel.trim() || selectedIds.size === 0}
          className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:opacity-40"
        >
          Apply to selected
        </button>
        <button
          type="button"
          onClick={() => {
            const inputs = document.querySelectorAll<HTMLInputElement>(
              `input[data-pie-account='${account.id}']`,
            );
            inputs.forEach((input) => {
              if (!input.value.trim()) input.value = quickLabel;
            });
          }}
          className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white"
        >
          Fill blanks
        </button>
      </div>
      <p className="text-xs font-bold text-slate-500">
        Selected rows glow from orange to blue so you can quickly build a group,
        apply the label, then save.
      </p>
      <datalist id={`pie-labels-${account.id}`}>
        {existingLabels.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto rounded-3xl border border-slate-200 bg-slate-50 p-3">
        {holdings.map((holding) => {
          const selected = selectedIds.has(holding.id);
          return (
            <div
              key={holding.id}
              className={`grid gap-3 rounded-2xl bg-white p-3 ring-1 transition md:grid-cols-[minmax(220px,1fr)_minmax(220px,360px)] md:items-center ${selected ? "shadow-[0_0_0_3px_rgba(249,115,22,.35),0_0_0_7px_rgba(37,99,235,.18)] ring-blue-200" : "ring-slate-100"}`}
            >
              <input type="hidden" name="holding_id" value={holding.id} />
              <button
                type="button"
                onClick={() => toggle(holding.id)}
                className="flex items-center gap-3 text-left"
              >
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full border text-[10px] font-black ${selected ? "border-blue-500 bg-blue-600 text-white" : "border-orange-200 bg-orange-50 text-orange-700"}`}
                >
                  {selected ? "✓" : "+"}
                </span>
                <AssetLogo holding={holding} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">
                    {holding.asset_name}
                  </p>
                  <p className="text-xs font-bold text-slate-500">
                    {holding.ticker || "No ticker"} ·{" "}
                    {formatMoney(holdingValue(holding))}
                  </p>
                </div>
              </button>
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Group label
                </span>
                <input
                  name="group_label"
                  data-pie-account={account.id}
                  data-holding-id={holding.id}
                  list={`pie-labels-${account.id}`}
                  defaultValue={holding.group_label ?? ""}
                  className={inputClass}
                  placeholder="Leave blank for standalone holding"
                />
              </label>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-semibold text-slate-500">
          Saving updates only your records. It does not write back to Trading
          212/SnapTrade.
        </p>
        <SubmitButton>Save group mapping</SubmitButton>
      </div>
    </form>
  );
}

function BulkHoldingsForm({
  accounts,
  defaultAccountId,
  onComplete,
}: {
  accounts: InvestmentAccount[];
  defaultAccountId?: string;
  onComplete?: (accountId: string) => void;
}) {
  const [status, setStatus] = useState<"editing" | "importing" | "complete">("editing");
  const [preview, setPreview] = useState<string[]>([]);
  const [result, setResult] = useState<Awaited<ReturnType<typeof importInvestmentHoldingsBulk>> | null>(null);
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  function previewText(text: string) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    setPreview(lines.slice(1, 26).map((line) => line.split(",")[0]?.replace(/^"|"$/g, "") || "Holding"));
  }
  async function previewFile(file?: File) {
    if (!file || file.type.startsWith("image/")) return setPreview([]);
    previewText(await file.text());
  }
  async function submit(formData: FormData) {
    setStatus("importing"); setError(null);
    try { const completed = await importInvestmentHoldingsBulk(formData); setResult(completed); setStatus("complete"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "The import could not be completed."); setStatus("editing"); }
  }

  if (status === "importing") return <div className="space-y-5 py-6"><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-3/4 animate-pulse rounded-full bg-emerald-500" /></div><div className="text-center"><Loader2 className="mx-auto h-10 w-10 animate-spin text-emerald-500" /><h3 className="mt-3 text-xl font-black">Adding your investments…</h3><p className="mt-1 text-sm font-semibold text-slate-500">Matching market listings and saving purchase history.</p></div>{preview.length ? <div className="max-h-64 space-y-2 overflow-y-auto rounded-3xl bg-slate-50 p-4">{preview.map((item, index) => <div key={`${item}-${index}`} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm font-bold"><span>{item}</span><Loader2 className="h-4 w-4 animate-spin text-orange-500" /></div>)}</div> : null}</div>;
  if (status === "complete" && result) return <div className="py-6 text-center"><CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" /><h3 className="mt-3 text-2xl font-black">Import complete</h3><div className="mx-auto mt-5 grid max-w-xl gap-3 sm:grid-cols-2"><SummaryTile label="Holdings processed" value={result.holdingsProcessed} /><SummaryTile label="New stocks added" value={result.newHoldings} /><SummaryTile label="Purchase lines added" value={result.purchaseLinesAdded} /><SummaryTile label="Duplicates skipped" value={result.duplicatesSkipped} /></div>{result.dateFrom ? <p className="mt-4 text-sm font-bold text-slate-600">{result.dateFrom} – {result.dateTo} · {formatMoney(result.importedValue)} imported value</p> : null}<button type="button" onClick={() => onComplete?.(accountId)} className="mt-7 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white">View imported pot</button></div>;

  return (
    <form action={submit} className="space-y-4">
      {error ? <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">
            Investment pot
          </span>
          <select
            name="investment_account_id"
            defaultValue={defaultAccountId ?? ""}
            onChange={(event) => setAccountId(event.target.value)}
            className={inputClass}
            required
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label} · {account.provider}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">
            Account/export currency
          </span>
          <select
            name="account_currency"
            className={inputClass}
            defaultValue="GBP"
          >
            <option value="GBP">GBP</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </label>
        <PriceUnitField value="gbp" />
      </div>
      <label className="block">
        <span className="text-sm font-bold text-slate-700">
          Upload CSV/text or screenshot
        </span>
        <input
          name="holdings_file"
          type="file"
          accept=".csv,text/csv,text/plain,image/*"
          className={inputClass}
          onChange={(event) => previewFile(event.target.files?.[0])}
        />
        <span className="mt-1 block text-xs font-semibold text-slate-500">
          CSV/text works without AI. Screenshot extraction uses the saved OpenAI
          token if available.
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-bold text-slate-700">
          Or paste holdings
        </span>
        <textarea
          name="holdings_text"
          rows={12}
          className={inputClass}
          onChange={(event) => previewText(event.target.value)}
          placeholder={
            "Name,Ticker,Exchange,Units,Average Buy Price,Latest Price,Group\nGear4music,G4M,LSE,414.96000000,241,250,My 52-stock group"
          }
        />
      </label>
      <div className="rounded-3xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">
        Trading 212 group exports are auto-detected by the Slice / Invested value
        / Value / Owned quantity columns. The app keeps exported cost/current
        value in the account currency, then separately tries to identify the
        native exchange/quote for each ticker.
      </div>
      {preview.length ? <div className="max-h-52 space-y-2 overflow-y-auto rounded-3xl border border-slate-200 bg-slate-50 p-3"><p className="px-2 text-xs font-black uppercase text-slate-400">Ready to add · {preview.length}{preview.length === 25 ? "+" : ""} detected</p>{preview.map((item, index) => <div key={`${item}-${index}`} className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-700">{item}</div>)}</div> : null}
      <SubmitButton>Import holdings</SubmitButton>
    </form>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-slate-50 p-4 text-left"><p className="text-xs font-black uppercase text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></div>;
}

function formatProviderFundUnitPrice(fund: {
  unit_price?: number | string | null;
  unit_price_quote_unit?: string | null;
}) {
  const price = Number(fund.unit_price || 0);
  if (!price) return "not found";
  const unit = String(fund.unit_price_quote_unit || "gbp").toLowerCase();
  return unit === "gbx"
    ? `${(price * 100).toFixed(2)}p`
    : `£${price.toFixed(2)}`;
}

function ProviderFundSearch({
  accounts,
  defaultAccountId,
  onSelect,
}: {
  accounts: PensionAccount[];
  defaultAccountId?: string;
  onSelect: (accountId: string, fund: Partial<PensionFund>) => void;
}) {
  const account =
    accounts.find((item) => item.id === defaultAccountId) || accounts[0];
  const [accountId, setAccountId] = useState(account?.id || "");
  const selected = accounts.find((item) => item.id === accountId);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/investments/provider-fund-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selected?.provider, query }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Search failed");
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <label>
          <span className="text-sm font-bold text-slate-700">
            Provider/account
          </span>
          <select
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className={inputClass}
          >
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {item.provider}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-bold text-slate-700">Search text</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={inputClass}
            placeholder="LifeStrategy 80 Accumulation, Global All Cap Acc"
          />
        </label>
        <button
          type="button"
          onClick={run}
          disabled={loading || !selected}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Brain className="h-4 w-4" />
          )}{" "}
          Search
        </button>
      </div>
      {error ? (
        <div className="rounded-2xl bg-red-50 p-4 text-sm font-black text-red-700">
          {error}
        </div>
      ) : null}
      {result ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-bold text-slate-500">
            {result.usedOpenAi
              ? "OpenAI-assisted provider search"
              : "Provider helper"}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            {result.summary}
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(result.funds || []).map((fund: any, idx: number) => (
              <article
                key={`${fund.fund_name}-${idx}`}
                className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
              >
                <p className="font-black text-slate-950">{fund.fund_name}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">
                  {fund.group_label || "Review"} · confidence{" "}
                  {fund.confidence || 0}%
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  {fund.note}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-black text-slate-700">
                  <div className="rounded-2xl bg-white p-3">
                    Fee:{" "}
                    {fund.annual_fund_fee_percent !== null &&
                    fund.annual_fund_fee_percent !== undefined
                      ? `${formatPercentExact(fund.annual_fund_fee_percent)}%/yr`
                      : "not found"}
                  </div>
                  <div className="rounded-2xl bg-white p-3">
                    Unit price: {formatProviderFundUnitPrice(fund)}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onSelect(accountId, {
                        fund_name: fund.fund_name,
                        fund_code: fund.fund_code,
                        group_label: fund.group_label,
                        annual_fund_fee_percent:
                          fund.annual_fund_fee_percent ?? undefined,
                        unit_price: fund.unit_price ?? undefined,
                        fee_source_url: fund.source_url,
                        notes: `${fund.note || ""}${
                          fund.unit_price
                            ? `
Suggested unit price: ${formatProviderFundUnitPrice(fund)} (confidence ${fund.confidence || 0}%).`
                            : ""
                        }`,
                      })
                    }
                    className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
                  >
                    Use this fund
                  </button>
                  {fund.source_url ? (
                    <a
                      href={fund.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-700"
                    >
                      Open source
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function activePayForPerson(payEvents: PayEvent[], personId: string | null) {
  if (!personId) return null;
  const now = new Date().toISOString().slice(0, 10);
  return (
    payEvents.find(
      (event) =>
        event.person_id === personId &&
        event.effective_from <= now &&
        (!event.effective_until || event.effective_until >= now),
    ) || null
  );
}
function projectedAccountContributionBreakdown(
  account: PensionAccount,
  payEvents: PayEvent[],
) {
  const pay = activePayForPerson(payEvents, account.person_id);
  // Keep saved-NI pass-back and fixed-percent salary top-ups separate. Older
  // rows can contain 100 in employer_ni_topup_percent to mean "pass back all
  // NI saved"; the calculation helper only applies that to gross salary when
  // the account explicitly uses fixed_percent mode.
  return calculatePensionSalarySacrifice({
    grossSalaryAnnual: pay?.gross_annual_salary || 0,
    employeeContributionPercent: account.employee_contribution_percent,
    employerBaseContributionPercent: account.employer_contribution_percent,
    employerBaseSalaryBasis: account.employer_base_salary_basis,
    employerNiEnabled: account.employer_ni_topup_enabled,
    employerNiRatePercent: account.employer_ni_rate_percent ?? 15,
    employerNiPassbackPercent: account.employer_ni_passback_percent ?? 100,
    fixedMonthlyContribution: account.fixed_monthly_contribution,
    fixedEmployerTopUpPercent: account.employer_ni_topup_percent,
    employerNiTopUpMode: account.employer_ni_topup_mode,
    contributionMethod: account.contribution_method,
  });
}
function projectedAccountMonthlyContribution(
  account: PensionAccount,
  payEvents: PayEvent[],
) {
  return projectedAccountContributionBreakdown(account, payEvents).totalMonthlyPensionInput;
}
function projectedFundContribution(
  account: PensionAccount,
  fund: PensionFund,
  payEvents: PayEvent[],
) {
  if (!fund.contribution_active) return 0;
  return (
    projectedAccountMonthlyContribution(account, payEvents) *
    (Number(fund.monthly_contribution_percent || 0) / 100)
  );
}

function PensionContributionLogicCard({
  account,
  payEvents,
}: {
  account: PensionAccount;
  payEvents: PayEvent[];
}) {
  const result = projectedAccountContributionBreakdown(account, payEvents);
  const activePay = activePayForPerson(payEvents, account.person_id);
  const passback = Number(account.employer_ni_passback_percent ?? 100);
  const niRate = Number(account.employer_ni_rate_percent ?? 15);
  // BUGFIX: this badge used to also require employer_ni_topup_mode === "saved_ni",
  // the same stale check that caused the £0 NI-reinvested bug. The checkbox alone
  // is now authoritative, so the badge matches it directly.
  const niActive = Boolean(account.employer_ni_topup_enabled) && result.employerNiReinvestedMonthly > 0;
  return (
    <div className="mt-4 rounded-[1.5rem] border border-teal-100 bg-white p-4 shadow-sm sm:mt-6 sm:rounded-[2rem] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">Pension contribution logic</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">How the monthly input is calculated</h3>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500 sm:text-sm">
            Uses the active pre-sacrifice salary for {activePay ? "this person" : "the selected owner"}, then separates employee sacrifice, employer base and NI reinvestment.
          </p>
        </div>
        <span className={`rounded-full px-3 py-2 text-xs font-black ${niActive ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-600"}`}>
          {niActive
            ? `Employer NI top-up · ${passback.toFixed(0)}% pass-back`
            : "Employer NI pass-back not active"}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-7">
        {[
          ["Gross salary", result.grossMonthly, "monthly"],
          ["Employee sacrifice", result.employeeSacrificeMonthly, `${Number(account.employee_contribution_percent || 0).toFixed(2)}%`],
          ["Employer base", result.employerBaseMonthly, `${Number(account.employer_contribution_percent || 0).toFixed(2)}% · ${result.employerBaseSalaryBasis === "pre_sacrifice" ? "notional salary" : "post-sacrifice"}`],
          ["Employer NI saved", result.employerNiSavedMonthly, `${niRate.toFixed(2)}% of sacrificed pay`],
          ["NI reinvested", result.employerNiReinvestedMonthly, `${passback.toFixed(0)}% passed back`],
          ["Fixed extra", result.fixedMonthly, "monthly"],
          ["Total input", result.totalMonthlyPensionInput, "per month"],
        ].map(([label, amount, note], index) => (
          <div key={String(label)} className={`rounded-2xl border p-3 ${index === 6 ? "col-span-2 border-teal-200 bg-teal-50 xl:col-span-1" : index === 4 ? "border-emerald-200 bg-emerald-50" : "border-slate-100 bg-slate-50"}`}>
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className={`mt-1 text-base font-black sm:text-lg ${index === 6 ? "text-teal-700" : index === 4 ? "text-emerald-700" : "text-slate-950"}`}>{formatMoney(Number(amount))}</p>
            <p className="mt-1 text-[10px] font-bold text-slate-500">{note}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">
        You sacrifice <strong>{formatMoney(result.employeeSacrificeMonthly)}</strong> each month. Your employer adds <strong>{formatMoney(result.employerBaseMonthly)}</strong>
        {result.employerNiReinvestedMonthly > 0 ? <> and reinvests <strong>{formatMoney(result.employerNiReinvestedMonthly)}</strong> of its NI saving</> : null}. Total projected monthly pension input: <strong>{formatMoney(result.totalMonthlyPensionInput)}</strong>.
      </div>
      {result.warnings.length ? (
        <div className="mt-3 space-y-1 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
          {result.warnings.map((warning) => <p key={warning}>• {warning}</p>)}
          <p>Salary sacrifice must not reduce cash earnings below National Minimum Wage; LOOP cannot verify that without contracted-hours data.</p>
        </div>
      ) : null}
    </div>
  );
}

function personAssetSummary(
  personId: string | null,
  pensionAccounts: PensionAccount[],
  pensionFunds: PensionFund[],
  investmentAccounts: InvestmentAccount[],
  investmentHoldings: InvestmentHolding[],
  dbPensionSchemes: DbPensionScheme[],
  investmentAccountOwners: InvestmentAccountOwner[] = [],
) {
  const pensionAccountIds = new Set(
    pensionAccounts
      .filter((account) => account.person_id === personId)
      .map((account) => account.id),
  );
  const ownedPensionAccounts = pensionAccounts.filter(
    (account) => account.person_id === personId,
  );
  const ownedPensionFunds = pensionFunds.filter((fund) =>
    pensionAccountIds.has(fund.pension_account_id),
  );
  const pensionValue = totalPensionValue(
    ownedPensionAccounts,
    ownedPensionFunds,
  );
  const ownedInvestmentAccountIds = new Set(
    investmentAccountOwners
      .filter((owner) => owner.person_id === personId)
      .map((owner) => owner.investment_account_id),
  );
  const investmentAccountIds = new Set(
    investmentAccounts
      .filter(
        (account) =>
          account.person_id === personId ||
          ownedInvestmentAccountIds.has(account.id),
      )
      .map((account) => account.id),
  );
  const accounts = investmentAccounts.filter((account) =>
    investmentAccountIds.has(account.id),
  );
  const holdings = investmentHoldings.filter((holding) =>
    investmentAccountIds.has(holding.investment_account_id),
  );
  const investmentValue = accounts.reduce(
    (sum, account) =>
      sum +
      accountDisplayValue(
        account,
        holdings.filter(
          (holding) => holding.investment_account_id === account.id,
        ),
      ),
    0,
  );
  const investmentCost = accounts.reduce((sum, account) => {
    const accountHoldings = holdings.filter(
      (holding) => holding.investment_account_id === account.id,
    );
    const unmapped = accountUnmappedValue(account, accountHoldings);
    return (
      sum +
      accountHoldings.reduce(
        (holdingSum, holding) => holdingSum + holdingCost(holding),
        0,
      ) +
      (unmapped > 0 ? unmapped : 0)
    );
  }, 0);
  const dbCount = dbPensionSchemes.filter(
    (scheme) => scheme.person_id === personId,
  ).length;
  return {
    pensionValue,
    investmentValue,
    investmentCost,
    dbCount,
    holdingCount: holdings.length,
    total: pensionValue + investmentValue,
  };
}

function aggregateSnapshots(
  snapshots: InvestmentSnapshot[],
  holdings: InvestmentHolding[],
) {
  const holdingIds = new Set(holdings.map((holding) => holding.id));
  const expectedTotal = holdings.reduce(
    (sum, holding) => sum + holdingValue(holding),
    0,
  );
  const byKey = new Map<string, { value: number; holdings: Set<string> }>();
  snapshots
    .filter((snapshot) => holdingIds.has(snapshot.holding_id))
    .forEach((snapshot) => {
      const key = snapshot.snapshot_at || snapshot.snapshot_date || "";
      if (!key) return;
      const value = Number(
        snapshot.value ||
          Number(snapshot.price || 0) * Number(snapshot.units || 0),
      );
      if (!Number.isFinite(value) || value <= 0) return;
      const entry = byKey.get(key) || { value: 0, holdings: new Set<string>() };
      entry.value += value;
      entry.holdings.add(snapshot.holding_id);
      byKey.set(key, entry);
    });

  const expectedHoldings = holdingIds.size;
  const minimumCoverage =
    expectedHoldings <= 2
      ? expectedHoldings
      : Math.max(2, Math.ceil(expectedHoldings * 0.7));
  const minimumValue = expectedTotal > 0 ? expectedTotal * 0.65 : 0;

  return Array.from(byKey.entries())
    .filter(([, entry]) => {
      if (expectedHoldings <= 1) return true;
      return (
        entry.holdings.size >= minimumCoverage ||
        (minimumValue > 0 && entry.value >= minimumValue)
      );
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entry]) => ({ date, value: entry.value }))
    .slice(-48);
}

function MiniValueLine({
  points,
  emptyLabel = "No price snapshots yet",
}: {
  points: Array<{ date: string; value: number }>;
  emptyLabel?: string;
}) {
  if (points.length < 2)
    return (
      <div className="flex h-36 items-center justify-center rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 text-sm font-bold text-slate-400">
        {emptyLabel}
      </div>
    );
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const d = points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * 100;
      const y = 92 - ((point.value - min) / spread) * 76;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const change = points[points.length - 1].value - points[0].value;
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase text-slate-500">
          Snapshot line
        </p>
        <p
          className={`text-sm font-black ${change >= 0 ? "text-emerald-700" : "text-red-600"}`}
        >
          {change >= 0 ? "+" : ""}
          {formatMoney(change)}
        </p>
      </div>
      <svg viewBox="0 0 100 100" className="h-28 w-full overflow-visible">
        <path
          d="M0,96 L100,96"
          stroke="currentColor"
          className="text-slate-100"
          strokeWidth="2"
        />
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          className={change >= 0 ? "text-emerald-600" : "text-red-500"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        Uses the saved price snapshot table when refresh jobs/manual checks run.
      </p>
    </div>
  );
}

function AddDbPensionForm({
  people,
  defaultPersonId,
}: {
  people: Person[];
  defaultPersonId?: string;
}) {
  const [provider, setProvider] = useState("NHS Pension");
  const isNhs = provider.toLowerCase().includes("nhs");
  return (
    <form action={addDefinedBenefitPension} className="space-y-4">
      <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">
        Public DB schemes use built-in rule templates first. Add service/pay
        logs after the wrapper exists; private schemes can add a rules/source
        link for this user only.
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">
            Provider / scheme type
          </span>
          <select
            name="provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className={inputClass}
          >
            <option value="NHS Pension">NHS Pension</option>
            <option value="Private defined benefit">
              Private defined benefit
            </option>
            <option value="Local government pension">
              Local Government Pension Scheme
            </option>
            <option value="Teachers Pension">Teachers' Pension</option>
            <option value="Other defined benefit">
              Other / manual DB scheme
            </option>
          </select>
        </label>
        <FormInput
          label="Scheme name"
          name="scheme_name"
          defaultValue={isNhs ? "NHS Pension" : "Defined benefit pension"}
          required
        />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Owner</span>
          <select
            name="person_id"
            defaultValue={defaultPersonId || ""}
            className={inputClass}
          >
            <PersonOptions people={people} />
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">
            Scheme section
          </span>
          <select name="scheme_section" className={inputClass}>
            {isNhs ? (
              <>
                <option value="2015 CARE">2015 CARE</option>
                <option value="2008 final salary">2008 final salary</option>
                <option value="1995 final salary">1995 final salary</option>
              </>
            ) : null}
            <option value="CARE">CARE</option>
            <option value="Final salary">Final salary</option>
            <option value="Other DB">Other DB</option>
          </select>
        </label>
        <FormInput
          label="Accrual rate denominator"
          name="accrual_rate"
          type="number"
          step="1"
          defaultValue={isNhs ? "54" : "60"}
        />
        <FormInput
          label="Revaluation % assumption"
          name="revaluation_rate_percent"
          type="number"
          step="any"
          placeholder={isNhs ? "CPI + 1.5 etc" : "CPI / scheme-specific"}
        />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Rules source</span>
          <select
            name="rules_source_type"
            className={inputClass}
            defaultValue={isNhs ? "public_template" : "user_link"}
          >
            <option value="public_template">Public statutory template</option>
            <option value="user_link">User supplied rules link</option>
            <option value="manual">Manual rules</option>
          </select>
        </label>
        <FormInput
          label="Rules/source URL"
          name="rules_source_url"
          placeholder={
            isNhs
              ? "Optional - public NHS template is already available"
              : "Private scheme booklet or provider rules link"
          }
        />
        <FormInput
          label="Notes"
          name="notes"
          placeholder="Employer, membership notes, McCloud/remedy notes"
        />
      </div>
      <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">
        Defined benefit pensions do not use stock units or live market prices.
        Public schemes use template rules; service/pay logs build the estimate
        over time.
      </div>
      <SubmitButton>Add DB pension</SubmitButton>
    </form>
  );
}

function EditDbPensionForm({
  people,
  scheme,
}: {
  people: Person[];
  scheme: DbPensionScheme;
}) {
  const [provider, setProvider] = useState(scheme.provider || "NHS Pension");
  const isPublicTemplate =
    /nhs|teacher|local government|lgps|civil service/i.test(provider);
  return (
    <form action={updateDefinedBenefitPension} className="space-y-4">
      <input type="hidden" name="id" value={scheme.id} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">
            Provider / scheme type
          </span>
          <select
            name="provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className={inputClass}
          >
            <option value="NHS Pension">NHS Pension</option>
            <option value="Local government pension">
              Local Government Pension Scheme
            </option>
            <option value="Teachers Pension">Teachers' Pension</option>
            <option value="Civil Service Pension">Civil Service Pension</option>
            <option value="Private defined benefit">
              Private defined benefit
            </option>
            <option value="Other defined benefit">
              Other / manual DB scheme
            </option>
          </select>
        </label>
        <FormInput
          label="Scheme name"
          name="scheme_name"
          defaultValue={scheme.scheme_name}
          required
        />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Owner</span>
          <select
            name="person_id"
            defaultValue={scheme.person_id || ""}
            className={inputClass}
          >
            <PersonOptions people={people} />
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">
            Scheme section
          </span>
          <input
            name="scheme_section"
            defaultValue={scheme.scheme_section}
            className={inputClass}
            placeholder="2015 CARE, 2008 final salary, CARE"
          />
        </label>
        <FormInput
          label="Accrual rate denominator"
          name="accrual_rate"
          type="number"
          step="1"
          defaultValue={scheme.accrual_rate}
        />
        <FormInput
          label="Revaluation % assumption"
          name="revaluation_rate_percent"
          type="number"
          step="any"
          defaultValue={scheme.revaluation_rate_percent}
        />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Rules source</span>
          <select
            name="rules_source_type"
            defaultValue={
              scheme.rules_source_type ||
              (isPublicTemplate ? "public_template" : "manual")
            }
            className={inputClass}
          >
            <option value="public_template">Public statutory template</option>
            <option value="user_link">User supplied scheme/rules link</option>
            <option value="manual">Manual rules</option>
          </select>
        </label>
        <FormInput
          label="Rules/source URL"
          name="rules_source_url"
          defaultValue={scheme.rules_source_url ?? ""}
          placeholder={
            isPublicTemplate
              ? "Optional - public scheme rules are template driven"
              : "Private scheme booklet / provider rules link"
          }
        />
        <FormInput
          label="Notes"
          name="notes"
          defaultValue={scheme.notes ?? ""}
        />
      </div>
      <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">
        Public DB schemes can use built-in rule templates. Private DB schemes
        can use a member-provided rules URL for that user's account only; the
        source is not shared across households or other users.
      </div>
      <SubmitButton>Save DB pension settings</SubmitButton>
    </form>
  );
}

function AddDbPensionEventForm({
  schemes,
  defaultSchemeId,
}: {
  schemes: DbPensionScheme[];
  defaultSchemeId?: string;
}) {
  return (
    <form
      action={addDbPensionServiceEvent}
      className="grid gap-4 md:grid-cols-2"
    >
      <label className="block md:col-span-2">
        <span className="text-sm font-bold text-slate-700">DB scheme</span>
        <select
          name="db_pension_id"
          defaultValue={defaultSchemeId || schemes[0]?.id}
          className={inputClass}
        >
          {schemes.map((scheme) => (
            <option key={scheme.id} value={scheme.id}>
              {scheme.scheme_name} · {scheme.provider}
            </option>
          ))}
        </select>
      </label>
      <FormInput
        label="Band / role label"
        name="band_label"
        placeholder="Band 7, 3.5d"
        required
      />
      <FormInput
        label="Pensionable pay"
        name="pensionable_pay"
        type="number"
        step="any"
        required
      />
      <FormInput
        label="Member contribution %"
        name="contribution_percent"
        type="number"
        step="any"
        placeholder="9.8"
      />
      <FormInput
        label="Employer contribution %"
        name="employer_contribution_percent"
        type="number"
        step="any"
        placeholder="23.7"
      />
      <FormInput
        label="Start date"
        name="start_date"
        type="date"
        defaultValue={today}
        required
      />
      <FormInput label="End date" name="end_date" type="date" />
      <FormInput
        label="Notes"
        name="notes"
        placeholder="Maternity, part-time, pay award etc"
      />
      <div className="flex items-end">
        <SubmitButton>Add service log</SubmitButton>
      </div>
    </form>
  );
}

function SnapTradeConnectButton({
  enabled,
  connected = false,
}: {
  enabled: boolean;
  connected?: boolean;
}) {
  const [status, setStatus] = useState<string>(
    connected
      ? "Add another broker"
      : enabled
        ? "Ready to connect"
        : "Upgrade required",
  );
  const [busy, setBusy] = useState(false);

  async function connect() {
    if (!enabled || busy) return;
    setBusy(true);
    setStatus("Creating SnapTrade portal…");
    try {
      await fetch("/api/snaptrade/register", { method: "POST" });
      const response = await fetch("/api/snaptrade/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connectionType: "read" }),
      });
      const payload = await response.json().catch(() => ({}));
      const redirectUrl =
        payload.redirectURI ||
        payload.redirectUri ||
        payload.loginRedirectURI ||
        payload.url;
      if (redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
      setStatus(
        payload.error || "SnapTrade portal did not return a redirect URL.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not start SnapTrade connection.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={connect}
      disabled={!enabled || busy}
      className={`mt-4 flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left font-black ${enabled ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" : "bg-slate-100 text-slate-400"}`}
    >
      <span>
        <span className="mr-2 inline-grid h-7 w-7 place-items-center rounded-lg bg-white text-blue-700">
          ST
        </span>
        {enabled
          ? connected
            ? "Connect another broker"
            : "Connect SnapTrade"
          : "SnapTrade requires realtime tier"}
      </span>
      <span className="text-xs opacity-80">{busy ? "Opening…" : status}</span>
    </button>
  );
}

type SnapTradeManualMatchPreview = {
  id: string;
  label: string;
  provider: string;
  accountType: string;
  wrapperLabel: string;
  score: number;
  matchStrength: "strong" | "medium" | "weak";
  defaultArchive: boolean;
  reason: string;
  recommendedAction: string;
  holdingsCount: number;
  estimatedValue: number;
};

type SnapTradePositionPreview = {
  externalPositionId: string;
  name: string;
  ticker: string | null;
  exchange: string | null;
  groupLabel?: string | null;
  assetKind: string;
  units: number;
  latestPrice: number;
  averageBuyPrice: number;
  currency: string;
  value: number;
};

type SnapTradeAccountPreview = {
  externalAccountId: string;
  name: string;
  providerName: string;
  accountType: string;
  wrapperLabel: string;
  rawType: string | null;
  currency: string | null;
  balanceValue: number;
  holdingsValue: number;
  holdingsCount: number;
  syncStatus: string | null;
  alreadyImported: boolean;
  importGuidance: string;
  defaultArchiveManualAccountIds: string[];
  manualMatches?: SnapTradeManualMatchPreview[];
  positions?: SnapTradePositionPreview[];
};

function matchPillClass(strength?: string) {
  if (strength === "strong") return "bg-emerald-100 text-emerald-800";
  if (strength === "medium") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

function formatWrapperLabel(type?: string | null, fallback?: string | null) {
  if (fallback) return fallback;
  if (type === "isa") return "Stocks & Shares ISA";
  if (type === "gia") return "GIA / Invest account";
  if (type === "sipp") return "SIPP / Pension";
  if (type === "crypto") return "Crypto account";
  return "Investment account";
}

function SnapTradeAccountsPanel({
  enabled,
  connection,
}: {
  enabled: boolean;
  connection?: SnapTradeConnectionSummary;
}) {
  const connected = Boolean(connection?.connected);
  const [accounts, setAccounts] = useState<SnapTradeAccountPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [archiveSelections, setArchiveSelections] = useState<
    Record<string, string[]>
  >({});
  const [reviewAccount, setReviewAccount] =
    useState<SnapTradeAccountPreview | null>(null);
  const [reviewTab, setReviewTab] = useState<"summary" | "info">("summary");
  const [error, setError] = useState<string | null>(null);

  async function loadAccounts() {
    if (!enabled || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/snaptrade/accounts", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.error || "Could not load connected broker accounts.",
        );
      const nextAccounts = Array.isArray(payload.accounts)
        ? payload.accounts
        : [];
      setAccounts(nextAccounts);
      setArchiveSelections(
        Object.fromEntries(
          nextAccounts.map((account: SnapTradeAccountPreview) => [
            account.externalAccountId,
            Array.isArray(account.defaultArchiveManualAccountIds)
              ? account.defaultArchiveManualAccountIds
              : (account.manualMatches || [])
                  .filter((match) => match.defaultArchive || match.score >= 75)
                  .map((match) => match.id),
          ]),
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load connected broker accounts.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function importAccount(accountId: string) {
    if (!accountId || importingId) return;
    setImportingId(accountId);
    setError(null);
    try {
      const response = await fetch("/api/snaptrade/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountIds: [accountId],
          archiveManualAccountIds: {
            [accountId]: archiveSelections[accountId] || [],
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.error || "Could not import this SnapTrade account.",
        );
      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not import this SnapTrade account.",
      );
    } finally {
      setImportingId(null);
    }
  }

  async function importAll() {
    if (importingId) return;
    setImportingId("all");
    setError(null);
    try {
      const response = await fetch("/api/snaptrade/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountIds: accounts.map((account) => account.externalAccountId),
          archiveManualAccountIds: archiveSelections,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok)
        throw new Error(
          payload.error || "Could not import connected accounts.",
        );
      window.location.reload();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not import connected accounts.",
      );
    } finally {
      setImportingId(null);
    }
  }

  function toggleManualArchive(accountId: string, manualAccountId: string) {
    setArchiveSelections((current) => {
      const selected = new Set(current[accountId] || []);
      if (selected.has(manualAccountId)) selected.delete(manualAccountId);
      else selected.add(manualAccountId);
      return { ...current, [accountId]: Array.from(selected) };
    });
  }

  useEffect(() => {
    if (enabled && connected) void loadAccounts();
  }, [enabled, connected]);

  if (!enabled) return null;

  return (
    <div
      className={`rounded-[1.5rem] border p-4 ${connected ? "border-blue-100 bg-blue-50" : "border-slate-200 bg-white"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
            SnapTrade account import
          </p>
          <h3 className="mt-1 text-lg font-black text-slate-950">
            {connected
              ? "Broker connected — choose what to track"
              : "Connect before importing accounts"}
          </h3>
          <p className="mt-1 max-w-3xl text-xs font-bold text-slate-600">
            A SnapTrade connection can contain multiple brokerage accounts. LOOP
            will not import every account automatically; review the list and
            choose which Trading 212/ISA/GIA/SIPP accounts you want shown in
            your portfolio.
          </p>
          {connection?.externalConnectionId ? (
            <p className="mt-2 text-[11px] font-black text-slate-400">
              Connection: {connection.externalConnectionId}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {connected ? (
            <button
              type="button"
              onClick={loadAccounts}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 text-xs font-black text-blue-700"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />{" "}
              Refresh accounts
            </button>
          ) : null}
          <SnapTradeConnectButton enabled={enabled} connected={connected} />
        </div>
      </div>
      {error ? (
        <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-black text-red-700">
          {error}
        </div>
      ) : null}
      {connected && loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm font-black text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading broker accounts…
        </div>
      ) : null}
      {connected && !loading && accounts.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-500">
          No brokerage accounts returned yet. SnapTrade may still be completing
          the first sync; click refresh in a minute. If this stays empty, the
          connected login may not expose accounts for this brokerage.
        </div>
      ) : null}
      {accounts.length > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-black uppercase text-slate-400">
              {accounts.length} connected account(s)
            </p>
            <button
              type="button"
              onClick={importAll}
              disabled={importingId !== null}
              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
            >
              {importingId === "all" ? "Importing…" : "Import all shown"}
            </button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {accounts.map((account) => (
              <div
                key={account.externalAccountId}
                className="rounded-3xl border border-white bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
                      {account.providerName || "Broker"}
                    </p>
                    <h4 className="mt-1 text-base font-black text-slate-950">
                      {account.name || account.externalAccountId}
                    </h4>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {account.rawType || account.accountType} ·{" "}
                      {account.currency || "currency n/a"} ·{" "}
                      {account.holdingsCount > 0
                        ? `${account.holdingsCount} holding(s)`
                        : account.holdingsValue || account.balanceValue
                          ? "account value only — positions pending"
                          : "0 holding(s)"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-black ${account.alreadyImported ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"}`}
                  >
                    {account.alreadyImported ? "Imported" : "Not imported"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[11px] font-black uppercase text-slate-400">
                      Holdings value
                    </p>
                    <p className="text-lg font-black text-slate-950">
                      {formatMoney(
                        account.holdingsValue || account.balanceValue || 0,
                      )}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[11px] font-black uppercase text-slate-400">
                      Sync
                    </p>
                    <p className="truncate text-sm font-black text-slate-700">
                      {account.syncStatus || "returned"}
                    </p>
                  </div>
                </div>
                {account.positions?.length ? (
                  <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
                      Position preview
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {account.positions.slice(0, 5).map((position) => (
                        <div
                          key={position.externalPositionId}
                          className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-black text-slate-950">
                              {position.ticker || position.name}
                            </span>
                            {position.groupLabel
                              ? ` · ${position.groupLabel}`
                              : ""}
                          </span>
                          <span className="shrink-0 font-black text-slate-950">
                            {formatMoney(Number(position.value || 0))}
                          </span>
                        </div>
                      ))}
                    </div>
                    {account.positions.length > 5 ? (
                      <p className="mt-2 text-[11px] font-black text-slate-400">
                        +{account.positions.length - 5} more position(s) will
                        import as individual holdings.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {account.manualMatches?.length ? (
                  <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/80 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-amber-800">
                      Possible manual duplicates
                    </p>
                    <p className="mt-1 text-xs font-bold text-amber-900">
                      Tick any manual pots/accounts that this provider account
                      replaces. LOOP will archive them, not delete them, so they
                      can be restored if SnapTrade access is removed.
                    </p>
                    <div className="mt-2 space-y-2">
                      {account.manualMatches.map((match) => (
                        <label
                          key={match.id}
                          className="flex items-start gap-2 rounded-xl bg-white/80 p-2 text-xs font-bold text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={(
                              archiveSelections[account.externalAccountId] || []
                            ).includes(match.id)}
                            onChange={() =>
                              toggleManualArchive(
                                account.externalAccountId,
                                match.id,
                              )
                            }
                            className="mt-1"
                          />
                          <span>
                            <span className="flex flex-wrap items-center gap-2 font-black text-slate-950">
                              Archive manual: {match.label}
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${matchPillClass(match.matchStrength)}`}
                              >
                                {match.matchStrength}
                              </span>
                            </span>
                            <span className="block text-slate-500">
                              {match.provider} ·{" "}
                              {match.wrapperLabel ||
                                formatWrapperLabel(match.accountType)}{" "}
                              · {match.holdingsCount} holding(s) · match{" "}
                              {match.score}/100 · {match.reason}
                            </span>
                            <span className="mt-1 block text-amber-900">
                              {match.recommendedAction ||
                                "Archive only if this SnapTrade account replaces the manual input."}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <button
                    type="button"
                    onClick={() => {
                      setReviewAccount(account);
                      setReviewTab("summary");
                    }}
                    disabled={importingId !== null}
                    className="rounded-full bg-blue-600 px-4 py-2 text-xs font-black text-white"
                  >
                    {account.alreadyImported
                      ? "Review / refresh account"
                      : "Review and import"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReviewAccount(account);
                      setReviewTab("info");
                    }}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700"
                  >
                    Info
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {reviewAccount ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
                  SnapTrade import review
                </p>
                <h3 className="mt-1 text-2xl font-black text-slate-950">
                  {reviewAccount.providerName} ·{" "}
                  {formatWrapperLabel(
                    reviewAccount.accountType,
                    reviewAccount.wrapperLabel,
                  )}
                </h3>
                <p className="mt-1 text-sm font-bold text-slate-600">
                  {reviewAccount.importGuidance}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewAccount(null)}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700"
              >
                Close
              </button>
            </div>
            <div className="mt-5 flex gap-2 rounded-full bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setReviewTab("summary")}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-black ${reviewTab === "summary" ? "bg-slate-950 text-white" : "text-slate-600"}`}
              >
                Import choice
              </button>
              <button
                type="button"
                onClick={() => setReviewTab("info")}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-black ${reviewTab === "info" ? "bg-slate-950 text-white" : "text-slate-600"}`}
              >
                What archive means
              </button>
            </div>
            {reviewTab === "summary" ? (
              <div className="mt-5 space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-black uppercase text-slate-400">
                      Broker account
                    </p>
                    <p className="mt-1 text-lg font-black text-slate-950">
                      {reviewAccount.name}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-black uppercase text-slate-400">
                      Value
                    </p>
                    <p className="mt-1 text-lg font-black text-slate-950">
                      {formatMoney(
                        reviewAccount.holdingsValue ||
                          reviewAccount.balanceValue ||
                          0,
                      )}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-[11px] font-black uppercase text-slate-400">
                      Holdings
                    </p>
                    <p className="mt-1 text-lg font-black text-slate-950">
                      {reviewAccount.holdingsCount > 0
                        ? reviewAccount.holdingsCount
                        : reviewAccount.holdingsValue ||
                            reviewAccount.balanceValue
                          ? "Value only"
                          : 0}
                    </p>
                  </div>
                </div>
                {reviewAccount.positions?.length ? (
                  <div className="rounded-3xl border border-blue-100 bg-blue-50/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-black text-blue-950">
                          Position-level holdings found
                        </p>
                        <p className="mt-1 text-xs font-bold text-blue-900">
                          These will import as normal LOOP holding cards, so the
                          account shows each stock/ETF rather than one summary
                          value. If SnapTrade exposes a group/portfolio label,
                          LOOP uses it as the group label.
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">
                        {reviewAccount.positions.length} position(s)
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {reviewAccount.positions.map((position) => (
                        <div
                          key={position.externalPositionId}
                          className="rounded-2xl bg-white p-3 text-sm font-bold text-slate-600"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-black text-slate-950">
                                {position.name}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {position.ticker || "No ticker"}
                                {position.exchange
                                  ? ` · ${position.exchange}`
                                  : ""}
                                {position.groupLabel
                                  ? ` · ${position.groupLabel}`
                                  : ""}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {Number(position.units || 0).toFixed(8)} units ·
                                latest{" "}
                                {formatMoney(Number(position.latestPrice || 0))}
                              </p>
                            </div>
                            <p className="shrink-0 font-black text-slate-950">
                              {formatMoney(Number(position.value || 0))}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : reviewAccount.holdingsValue ||
                  reviewAccount.balanceValue ? (
                  <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-900">
                    SnapTrade has returned an account-level value, but not the
                    stock/ETF positions yet. You can import the value as a
                    temporary placeholder, then use Refresh SnapTrade account
                    later; when positions become available, LOOP archives the
                    placeholder and replaces it with the individual holding
                    cards.
                  </div>
                ) : null}
                {reviewAccount.manualMatches?.length ? (
                  <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4">
                    <p className="text-sm font-black text-amber-950">
                      Possible manual accounts this could replace
                    </p>
                    <p className="mt-1 text-xs font-bold text-amber-900">
                      Selected rows will be archived during import and excluded
                      from totals. Leave everything unticked to import this as a
                      separate account.
                    </p>
                    <div className="mt-3 space-y-2">
                      {reviewAccount.manualMatches.map((match) => (
                        <label
                          key={match.id}
                          className="flex items-start gap-3 rounded-2xl bg-white p-3 text-sm font-bold text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={(
                              archiveSelections[
                                reviewAccount.externalAccountId
                              ] || []
                            ).includes(match.id)}
                            onChange={() =>
                              toggleManualArchive(
                                reviewAccount.externalAccountId,
                                match.id,
                              )
                            }
                            className="mt-1"
                          />
                          <span>
                            <span className="flex flex-wrap items-center gap-2 font-black text-slate-950">
                              {match.label}
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${matchPillClass(match.matchStrength)}`}
                              >
                                {match.matchStrength} match
                              </span>
                            </span>
                            <span className="mt-1 block text-xs text-slate-500">
                              {match.provider} ·{" "}
                              {match.wrapperLabel ||
                                formatWrapperLabel(match.accountType)}{" "}
                              · {match.holdingsCount} holding(s) · match{" "}
                              {match.score}/100 · {match.reason}
                            </span>
                            <span className="mt-1 block text-xs text-amber-900">
                              {match.recommendedAction}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
                    No likely manual duplicate was found. This will be added as
                    a new active account.
                  </div>
                )}
                <div className="rounded-3xl border border-slate-200 bg-white p-4 text-xs font-bold text-slate-600">
                  LOOP supports an unlimited number of connected broker
                  accounts. Matching is done per account/wrapper, not per
                  provider, so you can import a Trading 212 GIA, Trading 212 ISA
                  and other providers separately.
                </div>
                <button
                  type="button"
                  onClick={() => importAccount(reviewAccount.externalAccountId)}
                  disabled={importingId !== null}
                  className="w-full rounded-full bg-blue-600 px-5 py-3 text-sm font-black text-white"
                >
                  {importingId === reviewAccount.externalAccountId
                    ? "Importing…"
                    : reviewAccount.alreadyImported
                      ? "Refresh SnapTrade account"
                      : "Confirm import"}
                </button>
              </div>
            ) : (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-3xl bg-slate-50 p-4">
                  <h4 className="font-black text-slate-950">
                    Archive does not delete
                  </h4>
                  <p className="mt-1 text-sm font-bold text-slate-600">
                    Manual pots and holdings stay in the database with an
                    archived status. They stop counting in totals, charts,
                    affordability and AI readings while the SnapTrade account is
                    active.
                  </p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <h4 className="font-black text-slate-950">
                    Downgrade restore logic
                  </h4>
                  <p className="mt-1 text-sm font-bold text-slate-600">
                    If the user loses realtime/provider access, LOOP archives
                    the SnapTrade imported account and restores the manual
                    account that was superseded.
                  </p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <h4 className="font-black text-slate-950">
                    Multiple accounts are fine
                  </h4>
                  <p className="mt-1 text-sm font-bold text-slate-600">
                    A provider can return several accounts/wrappers. LOOP
                    imports each SnapTrade account by its external account ID,
                    so repeated syncs update rather than duplicate.
                  </p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <h4 className="font-black text-slate-950">
                    Shared price history continues
                  </h4>
                  <p className="mt-1 text-sm font-bold text-slate-600">
                    Instrument price history remains separate from user
                    holdings. SnapTrade improves user account/position detail
                    while shared ticker history can still support everyone.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PendingCoverageCard({
  item,
}: {
  item: InvestmentCoveragePlaceholder;
}) {
  const status = String(item.status || "queued").replace(/_/g, " ");
  const progress = item.progress || {};
  const steps = [
    ["ticker_found", "Ticker/instrument"],
    ["investment_information_added", "Profile/logo"],
    ["document_fee_information_added", "Fees/docs"],
    ["starter_history_added", "Starter history"],
  ] as const;
  return (
    <article className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            Coverage request
          </p>
          <h3 className="mt-1 text-lg font-black text-slate-950">
            {item.resolved_asset_name || item.query}
          </h3>
          <p className="mt-1 text-xs font-bold text-slate-600">
            {item.resolved_ticker
              ? `${item.resolved_ticker} · ${item.resolved_exchange || item.exchange_hint || "market"}`
              : `${status} · ${item.eta_text || "usually 2–10 minutes"}`}
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-800 ring-1 ring-amber-200">
          {item.eta_text || status}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        {steps.map(([key, label]) => (
          <span
            key={key}
            className={`rounded-full px-3 py-2 text-[11px] font-black ${progress?.[key] ? "bg-emerald-100 text-emerald-800" : "bg-white text-slate-500"}`}
          >
            {progress?.[key] ? "✓" : "…"} {label}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs font-semibold text-amber-900">
        {progress?.current_step ||
          "Queued for AI/admin enrichment. It will not become a tracked holding until the match is safe."}
      </p>
    </article>
  );
}

export function PensionsInvestmentsClient({
  people,
  pensionAccounts,
  pensionFunds,
  investmentAccounts,
  investmentAccountOwners = [],
  investmentPieSettings = [],
  investmentHoldings,
  investmentLots = [],
  providerActivities = [],
  investmentSnapshots = [],
  popularMarketTicks = [],
  investmentCoveragePlaceholders = [],
  dbPensionSchemes = [],
  dbPensionEvents = [],
  payEvents = [],
  pensionContributionEvents = [],
  initialInvestmentViewMode = "lines",
  initialPensionViewMode = "cards",
  investmentDataTier,
  snapTradeConnection,
}: PensionsInvestmentsClientProps) {
  useEffect(() => {
    writeRouteSnapshot<PensionsInvestmentsClientProps>("investments-core", {
      people, pensionAccounts, pensionFunds, investmentAccounts, investmentAccountOwners,
      investmentPieSettings, investmentHoldings, dbPensionSchemes, dbPensionEvents, payEvents,
      pensionContributionEvents, initialInvestmentViewMode, initialPensionViewMode,
      investmentDataTier, snapTradeConnection,
    });
  }, [people, pensionAccounts, pensionFunds, investmentAccounts, investmentAccountOwners, investmentPieSettings, investmentHoldings, dbPensionSchemes, dbPensionEvents, payEvents, pensionContributionEvents, initialInvestmentViewMode, initialPensionViewMode, investmentDataTier, snapTradeConnection]);
  const [area, setArea] = useState<"pensions" | "db" | "investments">(
    "investments",
  );
  const [experience, setExperience] = useState<
    | "overview"
    | "investment-command"
    | "pension-command"
    | "investment-detail"
    | "pension-detail"
    | "db-detail"
  >("overview");
  const [personFilter, setPersonFilter] = useState(
    () =>
      people.find((person) =>
        String(person.relationship || "")
          .toLowerCase()
          .includes("self"),
      )?.id ||
      people[0]?.id ||
      "all",
  );
  const [commandPersonFilters, setCommandPersonFilters] = useState<Set<string>>(
    new Set(["all"]),
  );
  const [modal, setModal] = useState<Modal>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [expandedInvestmentChartId, setExpandedInvestmentChartId] = useState<
    string | null
  >(null);
  const [investmentViewMode, setInvestmentViewMode] = useState<
    "lines" | "squares"
  >(initialInvestmentViewMode);
  const [pensionViewMode, setPensionViewMode] = useState<"cards" | "full">(
    initialPensionViewMode,
  );
  const [expandedPensionAccountIds, setExpandedPensionAccountIds] = useState<
    Set<string>
  >(new Set());
  const [pensionThreadRequest, setPensionThreadRequest] = useState<{
    accountId: string;
    nonce: number;
  } | null>(null);
  const [collapsedInvestmentAccountIds, setCollapsedInvestmentAccountIds] =
    useState<Set<string>>(new Set());
  const [showInvestmentTierInfo, setShowInvestmentTierInfo] = useState(false);
  const [syncingSnapTradeAccountId, setSyncingSnapTradeAccountId] = useState<
    string | null
  >(null);
  const [dismissedPieNoticeAccountIds, setDismissedPieNoticeAccountIds] =
    useState<Set<string>>(new Set());
  const [highlightedAccountId, setHighlightedAccountId] = useState<string | null>(null);

  function revealAccount(accountId: string) {
    setModal(null);
    setHighlightedAccountId(accountId);
    setCollapsedInvestmentAccountIds((current) => { const next = new Set(current); next.delete(accountId); return next; });
    router.refresh();
    window.setTimeout(() => document.getElementById(`investment-account-${accountId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
    window.setTimeout(() => setHighlightedAccountId(null), 2600);
  }

  function openPensionThreads(accountId: string) {
    setPensionThreadRequest((current) => ({
      accountId,
      nonce: (current?.nonce || 0) + 1,
    }));
    setExpandedPensionAccountIds((current) => {
      const next = new Set(current);
      next.add(accountId);
      return next;
    });
    window.setTimeout(
      () =>
        document
          .getElementById(`pension-threads-${accountId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      100,
    );
  }

  useEffect(() => {
    try {
      const raw =
        window.localStorage.getItem("loop-dismissed-pie-notice-accounts") ||
        "[]";
      setDismissedPieNoticeAccountIds(new Set(JSON.parse(raw)));
    } catch {}
  }, []);

  function dismissPieNotice(accountId: string) {
    setDismissedPieNoticeAccountIds((current) => {
      const next = new Set(current);
      next.add(accountId);
      try {
        window.localStorage.setItem(
          "loop-dismissed-pie-notice-accounts",
          JSON.stringify(Array.from(next)),
        );
      } catch {}
      return next;
    });
  }

  const dataTier =
    investmentDataTier ??
    ({
      paymentTier: "free",
      paymentStatus: "inactive",
      marketDataTier: "manual",
      label: "Manual / CSV market data",
      badge: "Manual",
      refreshCadence: "Manual values and imports",
      historyDepth: "Saved app snapshots only",
      chartInteraction: "basic",
      canUseAiInstrumentSearch: false,
      canUseDelayedPrices: false,
      canUseRealtimePrices: false,
      canUsePaidProvider: false,
      canConnectPaidProvider: false,
      maxTrackedSymbols: 25,
      reason: "No tier profile was loaded yet.",
    } satisfies InvestmentDataEntitlement);

  const router = useRouter();
  useEffect(() => {
    if (
      area !== "investments" ||
      !["investment-command", "investment-detail"].includes(experience)
    )
      return;
    const cadenceLabel = String(dataTier.refreshCadence || "").toLowerCase();
    const intervalMs =
      dataTier.canUseRealtimePrices || cadenceLabel.includes("minute")
        ? 60_000
        : 5 * 60_000;
    const timer = window.setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [
    area,
    experience,
    dataTier.canUseRealtimePrices,
    dataTier.refreshCadence,
    router,
  ]);

  function toggleInvestmentAccountCollapse(id: string) {
    setCollapsedInvestmentAccountIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refreshSnapTradeInvestmentAccount(account: InvestmentAccount) {
    if (!account.external_account_id || syncingSnapTradeAccountId) return;
    setSyncingSnapTradeAccountId(account.id);
    try {
      const response = await fetch("/api/snaptrade/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountIds: [account.external_account_id] }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.error || "Could not refresh SnapTrade positions.",
        );
      }
      window.location.reload();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Could not refresh SnapTrade positions.",
      );
    } finally {
      setSyncingSnapTradeAccountId(null);
    }
  }

  const filteredPensionAccounts = pensionAccounts.filter(
    (account) =>
      personFilter === "all" ||
      account.person_id === personFilter ||
      (!account.person_id && personFilter === "household"),
  );
  const filteredInvestmentAccounts = investmentAccounts.filter(
    (account) =>
      personFilter === "all" ||
      account.person_id === personFilter ||
      (!account.person_id && personFilter === "household") ||
      investmentAccountOwners.some(
        (owner) =>
          owner.investment_account_id === account.id &&
          owner.person_id === personFilter,
      ),
  );
  const allVisibleInvestmentPotsCollapsed =
    filteredInvestmentAccounts.length > 0 &&
    filteredInvestmentAccounts.every((account) =>
      collapsedInvestmentAccountIds.has(account.id),
    );
  const filteredInvestmentAccountIds = new Set(
    filteredInvestmentAccounts.map((account) => account.id),
  );
  const filteredInvestmentHoldings = investmentHoldings.filter((holding) =>
    filteredInvestmentAccountIds.has(holding.investment_account_id),
  );
  const filteredInvestmentTotal = filteredInvestmentAccounts.reduce(
    (sum, account) =>
      sum +
      accountDisplayValue(
        account,
        filteredInvestmentHoldings.filter(
          (holding) => holding.investment_account_id === account.id,
        ),
      ),
    0,
  );
  const filteredInvestmentCost = filteredInvestmentAccounts.reduce(
    (sum, account) => {
      const holdings = filteredInvestmentHoldings.filter(
        (holding) => holding.investment_account_id === account.id,
      );
      const unmapped = accountUnmappedValue(account, holdings);
      return (
        sum +
        holdings.reduce(
          (holdingSum, holding) => holdingSum + holdingCost(holding),
          0,
        ) +
        (unmapped > 0 ? unmapped : 0)
      );
    },
    0,
  );
  const filteredInvestmentHasUnverifiedProviderCost =
    hasUnverifiedProviderCostBasis(filteredInvestmentHoldings);
  const filteredDbPensionSchemes = dbPensionSchemes.filter(
    (scheme) =>
      personFilter === "all" ||
      scheme.person_id === personFilter ||
      (!scheme.person_id && personFilter === "household"),
  );

  useEffect(() => {
    if (
      ["overview", "investment-command", "pension-command"].includes(experience)
    )
      return;
    if (area === "investments" && filteredInvestmentAccounts.length === 0) {
      if (filteredPensionAccounts.length > 0) setArea("pensions");
      else if (filteredDbPensionSchemes.length > 0) setArea("db");
    }
    if (area === "pensions" && filteredPensionAccounts.length === 0) {
      if (filteredInvestmentAccounts.length > 0) setArea("investments");
      else if (filteredDbPensionSchemes.length > 0) setArea("db");
    }
    if (area === "db" && filteredDbPensionSchemes.length === 0) {
      if (filteredPensionAccounts.length > 0) setArea("pensions");
      else if (filteredInvestmentAccounts.length > 0) setArea("investments");
    }
  }, [
    area,
    personFilter,
    filteredInvestmentAccounts.length,
    filteredPensionAccounts.length,
    filteredDbPensionSchemes.length,
    experience,
  ]);

  const pensionTotal = totalPensionValue(pensionAccounts, pensionFunds);
  const investmentTotal = investmentAccounts.reduce(
    (sum, account) =>
      sum +
      accountDisplayValue(
        account,
        investmentHoldings.filter(
          (holding) => holding.investment_account_id === account.id,
        ),
      ),
    0,
  );
  const investmentCost = investmentAccounts.reduce((sum, account) => {
    const holdings = investmentHoldings.filter(
      (holding) => holding.investment_account_id === account.id,
    );
    const unmapped = accountUnmappedValue(account, holdings);
    return (
      sum +
      holdings.reduce(
        (holdingSum, holding) => holdingSum + holdingCost(holding),
        0,
      ) +
      (unmapped > 0 ? unmapped : 0)
    );
  }, 0);
  const hasAnyUnverifiedProviderCost =
    hasUnverifiedProviderCostBasis(investmentHoldings);
  const monthlyPensionFees = pensionAccounts.reduce((sum, account) => {
    const funds = pensionFunds.filter(
      (fund) => fund.pension_account_id === account.id,
    );
    const fundTotal =
      funds.reduce((total, fund) => total + valueOfFund(fund), 0) ||
      Number(account.current_value || 0);
    return (
      sum +
      monthlyFeeOn(
        fundTotal,
        account.annual_platform_fee_percent,
        account.fixed_monthly_fee,
      ) +
      funds.reduce(
        (fundSum, fund) =>
          fundSum +
          monthlyFeeOn(valueOfFund(fund), fund.annual_fund_fee_percent),
        0,
      )
    );
  }, 0);
  const monthlyInvestmentFees = investmentAccounts.reduce((sum, account) => {
    const holdings = investmentHoldings.filter(
      (holding) => holding.investment_account_id === account.id,
    );
    const total = accountDisplayValue(account, holdings);
    return (
      sum +
      monthlyFeeOn(
        total,
        account.annual_platform_fee_percent,
        account.fixed_monthly_fee,
      ) +
      holdings.reduce(
        (holdingSum, holding) =>
          holdingSum +
          monthlyFeeOn(holdingValue(holding), holding.annual_asset_fee_percent),
        0,
      )
    );
  }, 0);
  const allInvestmentSnapshotPoints = aggregateSnapshots(
    investmentSnapshots,
    investmentHoldings,
  );
  const ownerCards = [
    ...people.map((person) => ({
      id: person.id,
      name: person.name,
      relationship: person.relationship,
      summary: personAssetSummary(
        person.id,
        pensionAccounts,
        pensionFunds,
        investmentAccounts,
        investmentHoldings,
        dbPensionSchemes,
        investmentAccountOwners,
      ),
    })),
    {
      id: "household",
      name: "Shared / household pots",
      relationship: "shared pots",
      summary: personAssetSummary(
        null,
        pensionAccounts,
        pensionFunds,
        investmentAccounts,
        investmentHoldings,
        dbPensionSchemes,
        investmentAccountOwners,
      ),
    },
    {
      id: "all",
      name: "Whole household",
      relationship: "all users",
      summary: {
        pensionValue: pensionTotal,
        investmentValue: investmentTotal,
        investmentCost,
        dbCount: dbPensionSchemes.length,
        holdingCount: investmentHoldings.length,
        total: pensionTotal + investmentTotal,
      },
    },
  ].filter(
    (card) =>
      card.id === "all" || card.summary.total > 0 || card.summary.dbCount > 0,
  );
  function holdingsForOwnerCard(cardId: string) {
    if (cardId === "all") return investmentHoldings;
    const accountIds = new Set(
      investmentAccounts
        .filter((account) => {
          if (cardId === "household") return !account.person_id;
          return (
            account.person_id === cardId ||
            investmentAccountOwners.some(
              (owner) =>
                owner.investment_account_id === account.id &&
                owner.person_id === cardId,
            )
          );
        })
        .map((account) => account.id),
    );
    return investmentHoldings.filter((holding) =>
      accountIds.has(holding.investment_account_id),
    );
  }

  const commandFilterCards = [
    { id: "all", name: "Whole household", relationship: "all users" },
    ...people.map((person) => ({
      id: person.id,
      name: person.name,
      relationship: person.relationship,
    })),
    {
      id: "household",
      name: "Shared / household pots",
      relationship: "shared pots",
    },
  ];
  const selectedCommandFilterIds = Array.from(commandPersonFilters);
  const commandFilterUsesAll =
    selectedCommandFilterIds.length === 0 ||
    selectedCommandFilterIds.includes("all");
  function openOverview() {
    setExperience("overview");
    setPersonFilter("all");
  }
  function openInvestmentCommand(filters: string[] = ["all"]) {
    setArea("investments");
    setCommandPersonFilters(new Set(filters.length ? filters : ["all"]));
    setExperience("investment-command");
  }
  function openPensionCommand(filters: string[] = ["all"]) {
    setArea("pensions");
    setCommandPersonFilters(new Set(filters.length ? filters : ["all"]));
    setExperience("pension-command");
  }
  function openInvestmentDetail(ownerId: string) {
    setPersonFilter(ownerId);
    setArea("investments");
    setExperience("investment-detail");
  }
  function openPensionDetail(ownerId: string) {
    setPersonFilter(ownerId);
    setArea("pensions");
    setExperience("pension-detail");
  }
  function toggleCommandFilter(id: string) {
    setCommandPersonFilters((current) => {
      if (id === "all") return new Set(["all"]);
      const next = new Set(
        Array.from(current).filter((item) => item !== "all"),
      );
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size ? next : new Set(["all"]);
    });
  }
  function investmentAccountMatchesCommandFilter(account: InvestmentAccount) {
    if (commandFilterUsesAll) return true;
    return selectedCommandFilterIds.some((filterId) => {
      if (filterId === "household") return !account.person_id;
      return (
        account.person_id === filterId ||
        investmentAccountOwners.some(
          (owner) =>
            owner.investment_account_id === account.id &&
            owner.person_id === filterId,
        )
      );
    });
  }
  function pensionAccountMatchesCommandFilter(account: PensionAccount) {
    if (commandFilterUsesAll) return true;
    return selectedCommandFilterIds.some((filterId) => {
      if (filterId === "household") return !account.person_id;
      return account.person_id === filterId;
    });
  }
  function dbSchemeMatchesCommandFilter(scheme: DbPensionScheme) {
    if (commandFilterUsesAll) return true;
    return selectedCommandFilterIds.some((filterId) => {
      if (filterId === "household") return !scheme.person_id;
      return scheme.person_id === filterId;
    });
  }
  const commandInvestmentAccounts = investmentAccounts.filter(
    investmentAccountMatchesCommandFilter,
  );
  const commandInvestmentAccountIds = new Set(
    commandInvestmentAccounts.map((account) => account.id),
  );
  const commandInvestmentHoldings = investmentHoldings.filter((holding) =>
    commandInvestmentAccountIds.has(holding.investment_account_id),
  );
  const commandInvestmentTotal = commandInvestmentAccounts.reduce(
    (sum, account) =>
      sum +
      accountDisplayValue(
        account,
        commandInvestmentHoldings.filter(
          (holding) => holding.investment_account_id === account.id,
        ),
      ),
    0,
  );
  const commandInvestmentCost = commandInvestmentAccounts.reduce(
    (sum, account) => {
      const holdings = commandInvestmentHoldings.filter(
        (holding) => holding.investment_account_id === account.id,
      );
      const unmapped = accountUnmappedValue(account, holdings);
      return (
        sum +
        holdings.reduce(
          (holdingSum, holding) => holdingSum + holdingCost(holding),
          0,
        ) +
        (unmapped > 0 ? unmapped : 0)
      );
    },
    0,
  );
  const commandInvestmentHasUnverifiedCost = hasUnverifiedProviderCostBasis(
    commandInvestmentHoldings,
  );
  const commandPensionAccounts = pensionAccounts.filter(
    pensionAccountMatchesCommandFilter,
  );
  const commandPensionAccountIds = new Set(
    commandPensionAccounts.map((account) => account.id),
  );
  const commandPensionFunds = pensionFunds.filter((fund) =>
    commandPensionAccountIds.has(fund.pension_account_id),
  );
  const commandDbSchemes = dbPensionSchemes.filter(
    dbSchemeMatchesCommandFilter,
  );
  // A pension account is the parent container for its funds, not another
  // asset. Use the shared roll-up helper so parent and child values are never
  // added together in the command view.
  const commandPensionTotal = totalPensionValue(
    commandPensionAccounts,
    commandPensionFunds,
  );
  const commandFilterLabel = commandFilterUsesAll
    ? "Whole household"
    : selectedCommandFilterIds.length === 1
      ? commandFilterCards.find(
          (card) => card.id === selectedCommandFilterIds[0],
        )?.name || "Selected person"
      : `${selectedCommandFilterIds.length} selected people`;

  const areaOptions = [
    {
      value: "investments" as const,
      label: "User investments",
      icon: TrendingUp,
      visible: filteredInvestmentAccounts.length > 0 || area === "investments",
    },
    {
      value: "pensions" as const,
      label: "User pensions",
      icon: PiggyBank,
      visible: filteredPensionAccounts.length > 0 || area === "pensions",
    },
    {
      value: "db" as const,
      label: "Defined benefit",
      icon: PiggyBank,
      visible: filteredDbPensionSchemes.length > 0 || area === "db",
    },
  ].filter((option) => option.visible);

  const isInvestmentLivePage = experience === "investment-command";

  return (
    <main
      className={
        isInvestmentLivePage
          ? "min-h-[calc(100vh-4rem)] w-full space-y-5 bg-[#05070b] px-3 py-4 sm:px-5 lg:px-7"
          : "mx-auto w-[95vw] max-w-[2000px] space-y-7 px-4 py-8 sm:px-6 lg:px-8"
      }
    >
      {showInvestmentTierInfo ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">
                  Investment tier
                </p>
                <h2 className="mt-2 text-3xl font-black text-slate-950">
                  {dataTier.badge} access
                </h2>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  {dataTier.reason}
                </p>
              </div>
              <button
                onClick={() => setShowInvestmentTierInfo(false)}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700"
              >
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase text-slate-400">
                  Plan
                </p>
                <p className="mt-1 text-lg font-black text-slate-950">
                  {dataTier.paymentTier}
                </p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase text-slate-400">
                  Chart mode
                </p>
                <p className="mt-1 text-lg font-black text-slate-950">
                  {dataTier.chartInteraction}
                </p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase text-slate-400">
                  Tracked limit
                </p>
                <p className="mt-1 text-lg font-black text-slate-950">
                  {dataTier.maxTrackedSymbols === null
                    ? "Unlimited"
                    : dataTier.maxTrackedSymbols}
                </p>
              </div>
            </div>
            <ul className="mt-5 space-y-2 text-sm font-semibold text-slate-600">
              <li>
                • Free tier supports manual/on-demand delayed lookup for stocks,
                ETFs and common funds.
              </li>
              <li>
                • Higher tiers can unlock broader limits, broker connections and
                realtime provider data once enabled.
              </li>
              <li>
                • If a provider is degraded, admin can downgrade that feature
                without changing your whole plan.
              </li>
            </ul>
            <a
              href="/account?tab=plan"
              className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white"
            >
              View plans / upgrade
            </a>
            <a
              href="/integrations"
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800"
            >
              <ExternalLink className="h-4 w-4" /> Manage broker imports
            </a>
          </div>
        </div>
      ) : null}

      {experience === "overview" ? (
        <>
          <section className="overflow-hidden rounded-[2.5rem] border border-white/70 bg-[radial-gradient(circle_at_top_left,#0f766e,transparent_28%),linear-gradient(135deg,#020617,#111827_55%,#431407)] p-8 text-white shadow-[0_35px_120px_-70px_rgba(15,23,42,.85)]">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-200">
                  Pensions & investments
                </p>
                <h1 className="mt-4 text-5xl font-black tracking-tight">
                  {formatMoney(pensionTotal + investmentTotal)}
                </h1>
                <p className="mt-3 max-w-3xl text-sm font-semibold text-slate-100">
                  Track pension pots and investment pots separately. Add the
                  provider wrapper first, then add funds, holdings, groups or
                  purchase lots inside the pot.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <button
                  type="button"
                  onClick={() => openPensionCommand()}
                  className="group flex min-h-[118px] flex-col rounded-3xl bg-white/20 p-5 text-left backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/25"
                >
                  <p className="text-xs font-black uppercase text-slate-200">
                    Pensions
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {formatMoney(pensionTotal)}
                  </p>
                  <p className="mt-auto pt-3 text-[11px] font-black uppercase tracking-wide text-slate-300 opacity-0 transition group-hover:opacity-100">
                    Open live view
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => openInvestmentCommand()}
                  className="group flex min-h-[118px] flex-col rounded-3xl bg-white/20 p-5 text-left backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/25"
                >
                  <p className="text-xs font-black uppercase text-slate-200">
                    Investments
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {formatMoney(investmentTotal)}
                  </p>
                  <p className="mt-auto pt-3 text-[11px] font-black uppercase tracking-wide text-slate-300 opacity-0 transition group-hover:opacity-100">
                    Open live view
                  </p>
                </button>
                <div className="rounded-3xl bg-emerald-400/20 p-5 backdrop-blur">
                  <p className="text-xs font-black uppercase text-emerald-100">
                    Investment performance
                  </p>
                  {hasAnyUnverifiedProviderCost ? (
                    <>
                      <p className="mt-2 text-2xl font-black text-white">
                        P/L pending
                      </p>
                      <p className="mt-1 text-xs font-bold text-emerald-100">
                        Awaiting verified broker cost basis
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-2xl font-black text-emerald-100">
                      {formatMoney(investmentTotal - investmentCost)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => setPersonFilter("all")}
              className="group rounded-[2rem] border border-white/70 bg-white p-6 text-left shadow-[0_24px_80px_-60px_rgba(15,23,42,.75)] transition hover:-translate-y-0.5 hover:shadow-[0_30px_90px_-62px_rgba(15,23,42,.85)]"
            >
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                Total wealth
              </p>
              <p className="mt-3 text-3xl font-black text-slate-950">
                {formatMoney(pensionTotal + investmentTotal)}
              </p>
              <div className="mt-5">
                <MiniValueLine
                  points={allInvestmentSnapshotPoints}
                  emptyLabel="Price history starts after refresh"
                />
              </div>
            </button>
            <button
              type="button"
              onClick={() => openInvestmentCommand()}
              className="group flex min-h-[280px] flex-col rounded-[2rem] border border-white/70 bg-white p-6 text-left shadow-[0_24px_80px_-60px_rgba(15,23,42,.75)] transition hover:-translate-y-0.5 hover:shadow-[0_30px_90px_-62px_rgba(15,23,42,.85)]"
            >
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">
                Investments
              </p>
              <p className="mt-3 text-3xl font-black text-slate-950">
                {formatMoney(investmentTotal)}
              </p>
              <p className="mt-2 text-sm font-bold text-slate-500">
                {investmentHoldings.length} tracked holding(s)
              </p>
              <div className="mt-5">
                <TinySparkline points={allInvestmentSnapshotPoints} />
              </div>
              <div className="mt-auto flex justify-end pt-4">
                <span className="rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-white">
                  Live view →
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => openPensionCommand()}
              className="group flex min-h-[280px] flex-col rounded-[2rem] border border-white/70 bg-white p-6 text-left shadow-[0_24px_80px_-60px_rgba(15,23,42,.75)] transition hover:-translate-y-0.5 hover:shadow-[0_30px_90px_-62px_rgba(15,23,42,.85)]"
            >
              <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
                Pensions
              </p>
              <p className="mt-3 text-3xl font-black text-slate-950">
                {formatMoney(pensionTotal)}
              </p>
              <p className="mt-2 text-sm font-bold text-slate-500">
                {pensionAccounts.length} pension pot(s)
              </p>
              <div className="mt-5 h-36 rounded-[1.5rem] bg-[linear-gradient(135deg,#eff6ff,#ecfdf5)] p-4">
                <div className="flex h-full items-end gap-2">
                  {pensionAccounts.slice(0, 8).map((account) => {
                    const value = pensionAccountValue(
                      account,
                      pensionFunds.filter(
                        (fund) => fund.pension_account_id === account.id,
                      ),
                    );
                    const height =
                      pensionTotal > 0
                        ? Math.max(
                            14,
                            Math.min(100, (value / pensionTotal) * 100),
                          )
                        : 14;
                    return (
                      <span
                        key={account.id}
                        className="block flex-1 rounded-t-xl bg-blue-500/80 shadow-[0_12px_30px_-18px_rgba(37,99,235,.75)]"
                        style={{ height: `${height}%` }}
                      />
                    );
                  })}
                  {pensionAccounts.length === 0 ? (
                    <span className="text-sm font-bold text-slate-400">
                      No pension pots yet
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-auto flex justify-end pt-4">
                <span className="rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-white">
                  Live view →
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => openInvestmentCommand()}
              className="group rounded-[2rem] border border-white/70 bg-white p-6 text-left shadow-[0_24px_80px_-60px_rgba(15,23,42,.75)] transition hover:-translate-y-0.5 hover:shadow-[0_30px_90px_-62px_rgba(15,23,42,.85)]"
            >
              <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">
                Performance
              </p>
              {hasAnyUnverifiedProviderCost ? (
                <>
                  <p className="mt-3 text-3xl font-black text-slate-950">
                    P/L pending
                  </p>
                  <p className="mt-2 text-sm font-bold text-slate-500">
                    Awaiting verified broker cost basis
                  </p>
                </>
              ) : (
                <>
                  <p
                    className={`mt-3 text-3xl font-black ${investmentTotal - investmentCost >= 0 ? "text-emerald-700" : "text-red-600"}`}
                  >
                    {formatMoney(investmentTotal - investmentCost)}
                  </p>
                  <p className="mt-2 text-sm font-bold text-slate-500">
                    All-time tracked return
                  </p>
                </>
              )}
            </button>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <div className="rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-lg">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">
                    Pension snapshots
                  </p>
                  <h2 className="text-xl font-black text-slate-950">
                    Tap a person to open pension detail
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => openPensionCommand()}
                  className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
                >
                  Open live view
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {ownerCards
                  .filter(
                    (card) =>
                      card.summary.pensionValue > 0 || card.id === "all",
                  )
                  .map((card) => {
                    const person =
                      card.id !== "all" && card.id !== "household"
                        ? people.find((item) => item.id === card.id)
                        : null;
                    const share =
                      pensionTotal > 0
                        ? (card.summary.pensionValue / pensionTotal) * 100
                        : 0;
                    return (
                      <button
                        key={`pension-${card.id}`}
                        type="button"
                        onClick={() => openPensionDetail(card.id)}
                        className="rounded-[1.5rem] border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200"
                      >
                        <div className="flex items-center gap-3">
                          <ProfileAvatar
                            person={person}
                            label={
                              card.id === "all"
                                ? "WH"
                                : card.id === "household"
                                  ? "SH"
                                  : initials(card.name)
                            }
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black text-slate-950">
                              {card.name}
                            </span>
                            <span className="block text-xs font-bold text-slate-500">
                              {card.summary.dbCount
                                ? `${card.summary.dbCount} DB scheme(s) · `
                                : ""}
                              {formatMoney(card.summary.pensionValue)}
                            </span>
                          </span>
                        </div>
                        <div className="mt-4 h-16 rounded-2xl bg-blue-50 p-2">
                          <div className="flex h-full items-end gap-1">
                            {Array.from({ length: 16 }).map((_, index) => (
                              <span
                                key={index}
                                className="block flex-1 rounded-t-md bg-blue-500/80"
                                style={{
                                  height: `${Math.max(12, Math.min(100, share + (index % 4) * 8))}%`,
                                }}
                              />
                            ))}
                          </div>
                        </div>
                        <p className="mt-3 text-xs font-black text-blue-700">
                          {share.toFixed(1)}% of pension value
                        </p>
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-lg">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">
                    Investment snapshots
                  </p>
                  <h2 className="text-xl font-black text-slate-950">
                    Tap a person to open investment detail
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => openInvestmentCommand()}
                  className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
                >
                  Open live view
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {ownerCards
                  .filter(
                    (card) =>
                      card.summary.investmentValue > 0 || card.id === "all",
                  )
                  .map((card) => {
                    const ownerHoldings = holdingsForOwnerCard(card.id);
                    const cardPoints = aggregateSnapshots(
                      investmentSnapshots,
                      ownerHoldings,
                    );
                    const pl =
                      card.summary.investmentValue -
                      card.summary.investmentCost;
                    const cardHasUnverifiedProviderCost =
                      hasUnverifiedProviderCostBasis(ownerHoldings);
                    const ownerDayMovement = dayMovementFromSnapshots(
                      ownerHoldings,
                      investmentSnapshots,
                    );
                    const person =
                      card.id !== "all" && card.id !== "household"
                        ? people.find((item) => item.id === card.id)
                        : null;
                    return (
                      <button
                        key={`investment-${card.id}`}
                        type="button"
                        onClick={() => openInvestmentDetail(card.id)}
                        className={`rounded-[1.5rem] border-2 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${personFilter === card.id && area === "investments" ? "border-orange-400 shadow-orange-200/60" : "border-slate-100 hover:border-emerald-200"}`}
                      >
                        <div className="flex items-center gap-3">
                          <ProfileAvatar
                            person={person}
                            label={
                              card.id === "all"
                                ? "WH"
                                : card.id === "household"
                                  ? "SH"
                                  : initials(card.name)
                            }
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black text-slate-950">
                              {card.name}
                            </span>
                            <span className="block text-xs font-bold text-slate-500">
                              {formatMoney(card.summary.investmentValue)} ·{" "}
                              {ownerHoldings.length} holding(s)
                            </span>
                          </span>
                        </div>
                        <div className="mt-4 rounded-2xl bg-slate-50 p-2">
                          <TinySparkline points={cardPoints} />
                        </div>
                        <p
                          className={`mt-3 text-xs font-black ${cardHasUnverifiedProviderCost ? "text-slate-500" : pl >= 0 ? "text-emerald-700" : "text-red-600"}`}
                        >
                          {card.summary.investmentValue
                            ? cardHasUnverifiedProviderCost
                              ? ownerDayMovement.has
                                ? `${ownerDayMovement.change >= 0 ? "+" : ""}${formatMoney(ownerDayMovement.change)} today`
                                : performanceUnavailableLabel()
                              : `${formatMoney(pl)} tracked return`
                            : "No investment value yet"}
                        </p>
                      </button>
                    );
                  })}
              </div>
            </div>
          </section>
        </>
      ) : null}

      {experience === "investment-command" ? (
        <section className="space-y-5">
          <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 text-white shadow-[0_30px_120px_-75px_rgba(0,0,0,.95)] backdrop-blur lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={openOverview}
                className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/10"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200/80">
                  Investment live view
                </p>
                <h2 className="text-2xl font-black text-white">
                  Optimise portfolio view
                </h2>
              </div>
            </div>
            <div
              className="flex items-center gap-2 rounded-full bg-white/10 p-1"
              aria-label="Filter live view by household member"
            >
              {commandFilterCards.map((card) => {
                const person =
                  card.id !== "all" && card.id !== "household"
                    ? people.find((item) => item.id === card.id)
                    : null;
                const selected = commandFilterUsesAll
                  ? card.id === "all"
                  : selectedCommandFilterIds.includes(card.id);
                return (
                  <button
                    key={`command-investment-filter-${card.id}`}
                    type="button"
                    title={card.name}
                    aria-label={`Filter investments by ${card.name}`}
                    onClick={() => toggleCommandFilter(card.id)}
                    className={`rounded-full p-1 transition ${selected ? "bg-emerald-400/25 shadow-lg shadow-emerald-950/20 ring-1 ring-emerald-300/25" : "hover:bg-white/10"}`}
                  >
                    <ProfileAvatar
                      person={person}
                      label={
                        card.id === "all"
                          ? "WH"
                          : card.id === "household"
                            ? "SH"
                            : initials(card.name)
                      }
                      compact
                    />
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setExperience("investment-detail")}
                className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-black text-white hover:bg-white/15"
              >
                Open pot breakdown
              </button>
              <form action={refreshAllInvestmentPrices}>
                <button className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">
                  <RefreshCw className="h-4 w-4" /> Refresh prices
                </button>
              </form>
            </div>
          </div>
          <AmplifiedInvestmentsDashboard
            hideHeader
            holdings={commandInvestmentHoldings}
            snapshots={investmentSnapshots}
            totalValue={commandInvestmentTotal}
            costValue={commandInvestmentCost}
            unverifiedCost={commandInvestmentHasUnverifiedCost}
            tierLabel={dataTier.badge}
            popularMarketTicks={popularMarketTicks}
            filterLabel={commandFilterLabel}
            people={people}
            investmentAccountOwners={investmentAccountOwners}
            investmentAccounts={commandInvestmentAccounts}
            investmentPieSettings={investmentPieSettings}
            investmentLots={investmentLots}
            providerActivities={providerActivities}
          />
        </section>
      ) : null}

      {experience === "pension-command" ? (
        <section className="space-y-3 sm:space-y-5">
          <div className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-[radial-gradient(circle_at_top_left,#2563eb,transparent_30%),linear-gradient(135deg,#020617,#172554_62%,#0f766e)] p-4 text-white shadow-[0_35px_120px_-72px_rgba(15,23,42,.9)] sm:rounded-[2.4rem] sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={openOverview}
                  className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/15 sm:h-11 sm:w-11"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-blue-100">
                    Pension live view
                  </p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight sm:mt-3 sm:text-4xl">
                    {formatMoney(commandPensionTotal)}
                  </h2>
                  <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-blue-50 sm:mt-2 sm:text-sm">
                    Review pots, schemes and contribution timing.
                  </p>
                </div>
              </div>
              <div
                className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-white/10 p-1 sm:gap-2"
                aria-label="Filter pension live view by household member"
              >
                {commandFilterCards.map((card) => {
                  const person =
                    card.id !== "all" && card.id !== "household"
                      ? people.find((item) => item.id === card.id)
                      : null;
                  const selected = commandFilterUsesAll
                    ? card.id === "all"
                    : selectedCommandFilterIds.includes(card.id);
                  return (
                    <button
                      key={`command-pension-filter-${card.id}`}
                      type="button"
                      title={card.name}
                      aria-label={`Filter pensions by ${card.name}`}
                      onClick={() => toggleCommandFilter(card.id)}
                      className={`rounded-full p-1 transition ${selected ? "bg-white shadow-lg" : "hover:bg-white/15"}`}
                    >
                      <ProfileAvatar
                        person={person}
                        label={
                          card.id === "all"
                            ? "WH"
                            : card.id === "household"
                              ? "SH"
                              : initials(card.name)
                        }
                        compact
                      />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-6 sm:gap-3">
              <div className="rounded-2xl bg-white/15 p-3 ring-1 ring-white/10 sm:rounded-[1.6rem] sm:p-5">
                <p className="text-xs font-black uppercase tracking-wide text-blue-100">
                  Pots
                </p>
                <p className="mt-1 text-xl font-black sm:mt-2 sm:text-2xl">
                  {commandPensionAccounts.length}
                </p>
              </div>
              <div className="rounded-2xl bg-white/15 p-3 ring-1 ring-white/10 sm:rounded-[1.6rem] sm:p-5">
                <p className="text-xs font-black uppercase tracking-wide text-blue-100">
                  Funds
                </p>
                <p className="mt-1 text-xl font-black sm:mt-2 sm:text-2xl">
                  {commandPensionFunds.length}
                </p>
              </div>
              <div className="rounded-2xl bg-white/15 p-3 ring-1 ring-white/10 sm:rounded-[1.6rem] sm:p-5">
                <p className="text-xs font-black uppercase tracking-wide text-blue-100">
                  DB schemes
                </p>
                <p className="mt-1 text-xl font-black sm:mt-2 sm:text-2xl">
                  {commandDbSchemes.length}
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {commandPensionAccounts.map((account) => {
              const funds = pensionFunds.filter(
                (fund) => fund.pension_account_id === account.id,
              );
              const value =
                funds.reduce((sum, fund) => sum + valueOfFund(fund), 0) ||
                Number(account.current_value || 0);
              return (
                <button
                  key={`pension-command-${account.id}`}
                  type="button"
                  onClick={() =>
                    openPensionDetail(account.person_id || "household")
                  }
                  className="rounded-[2rem] border border-white/70 bg-white p-5 text-left shadow-[0_24px_80px_-60px_rgba(15,23,42,.75)] transition hover:-translate-y-0.5 hover:border-blue-200"
                >
                  <div className="flex items-center gap-3">
                    <ProviderLogo provider={account.provider} />
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black text-slate-950">
                        {account.label}
                      </p>
                      <p className="text-xs font-bold text-slate-500">
                        {account.provider} ·{" "}
                        {ownerName(people, account.person_id)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-5 text-3xl font-black text-slate-950">
                    {formatMoney(value)}
                  </p>
                  <div className="mt-4 flex h-20 items-end gap-1 rounded-2xl bg-blue-50 p-3">
                    {Array.from({ length: 18 }).map((_, index) => (
                      <span
                        key={index}
                        className="block flex-1 rounded-t-md bg-blue-500/80"
                        style={{
                          height: `${Math.max(16, Math.min(96, 30 + ((index * 11) % 52)))}%`,
                        }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
            {commandPensionAccounts.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm font-bold text-slate-500">
                No pension pots for this filter yet.
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setExperience("pension-detail")}
              className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white"
            >
              Open pension breakdown
            </button>
          </div>
        </section>
      ) : null}

      {experience === "investment-detail" ||
      experience === "pension-detail" ||
      experience === "db-detail" ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {areaOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => {
                    setArea(option.value);
                    setExperience(
                      option.value === "investments"
                        ? "investment-detail"
                        : option.value === "pensions"
                          ? "pension-detail"
                          : "db-detail",
                    );
                  }}
                  className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-black shadow-sm ${area === option.value ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
                >
                  <Icon className="h-4 w-4" /> {option.label}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {experience === "investment-detail" ? (
              <form
                action={updateInvestmentViewMode}
                className="inline-flex rounded-full bg-white p-1 ring-1 ring-slate-200"
              >
                <button
                  name="investment_view_mode"
                  value="lines"
                  onClick={() => setInvestmentViewMode("lines")}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-black ${investmentViewMode === "lines" ? "bg-slate-950 text-white" : "text-slate-600"}`}
                >
                  <LineChart className="h-3.5 w-3.5" /> Lines
                </button>
                <button
                  name="investment_view_mode"
                  value="squares"
                  onClick={() => setInvestmentViewMode("squares")}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-black ${investmentViewMode === "squares" ? "bg-slate-950 text-white" : "text-slate-600"}`}
                >
                  <Layers className="h-3.5 w-3.5" /> Squares
                </button>
              </form>
            ) : null}
            {experience === "pension-detail" ? (
              <form
                action={updatePensionViewMode}
                className="inline-flex rounded-full bg-white p-1 ring-1 ring-slate-200"
                aria-label="Pension display preference"
              >
                <button
                  name="pension_view_mode"
                  value="cards"
                  onClick={() => setPensionViewMode("cards")}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-black ${pensionViewMode === "cards" ? "bg-slate-950 text-white" : "text-slate-600"}`}
                >
                  <Layers className="h-3.5 w-3.5" /> Cards
                </button>
                <button
                  name="pension_view_mode"
                  value="full"
                  onClick={() => setPensionViewMode("full")}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-black ${pensionViewMode === "full" ? "bg-slate-950 text-white" : "text-slate-600"}`}
                >
                  <LineChart className="h-3.5 w-3.5" /> Full width
                </button>
              </form>
            ) : null}
            <form action={refreshAllInvestmentPrices}>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
                title="Manually refresh every investment holding price and create a new snapshot."
              >
                <RefreshCw className="h-4 w-4" /> Refresh prices
              </button>
            </form>
            <div className="relative">
              <button
                onClick={() => setAddOpen((open) => !open)}
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-950/15 hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" /> Add pot
              </button>
              {addOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-64 rounded-3xl border border-slate-200 bg-white p-2 shadow-2xl">
                  <button
                    onClick={() => {
                      setModal({
                        type: "pension-account",
                        personId:
                          personFilter !== "all" && personFilter !== "household"
                            ? personFilter
                            : undefined,
                      });
                      setAddOpen(false);
                    }}
                    className="block w-full rounded-2xl px-3 py-3 text-left text-sm font-black hover:bg-slate-50"
                  >
                    Add pension pot
                  </button>
                  <button
                    onClick={() => {
                      setModal({
                        type: "investment-account",
                        personId:
                          personFilter !== "all" && personFilter !== "household"
                            ? personFilter
                            : undefined,
                      });
                      setAddOpen(false);
                    }}
                    className="block w-full rounded-2xl px-3 py-3 text-left text-sm font-black hover:bg-slate-50"
                  >
                    Add investment pot
                  </button>
                  {/* NEW: there was no way to start a brokerage connection
                      (SnapTrade) from this menu at all — only manual pots.
                      This links through to the real connect flow at
                      /integrations rather than duplicating it inline here. */}
                  <button
                    onClick={() => {
                      setAddOpen(false);
                      router.push("/integrations");
                    }}
                    className="block w-full rounded-2xl px-3 py-3 text-left text-sm font-black hover:bg-slate-50"
                  >
                    Connect a broker (Trading integration)
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {experience === "pension-detail" && area === "pensions" ? (
        <section className="space-y-5">
          <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 text-white shadow-[0_30px_120px_-75px_rgba(0,0,0,.95)] backdrop-blur lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={openOverview}
                className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/10"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-blue-200/80">
                  Pension breakdown
                </p>
                <h2 className="text-2xl font-black text-white">
                  {personFilter === "all"
                    ? "Whole household"
                    : personFilter === "household"
                      ? "Shared pots"
                      : ownerName(people, personFilter)}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openPensionCommand([personFilter])}
              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
            >
              Open live view
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-500">
                Total pension value
              </p>
              <p className="mt-3 text-3xl font-black">
                {formatMoney(pensionTotal)}
              </p>
            </div>
            <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-500">
                Fixed monthly top-up
              </p>
              <p className="mt-3 text-3xl font-black">
                {formatMoney(
                  pensionAccounts.reduce(
                    (sum, account) =>
                      sum + Number(account.fixed_monthly_contribution || 0),
                    0,
                  ),
                )}
              </p>
            </div>
            <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-500">
                Estimated monthly fees
              </p>
              <p className="mt-3 text-3xl font-black">
                {formatMoney(monthlyPensionFees)}
              </p>
            </div>
          </div>
          {filteredPensionAccounts.map((account) => {
            const funds = pensionFunds.filter(
              (fund) => fund.pension_account_id === account.id,
            );
            const fundTotal = funds.reduce(
              (sum, fund) => sum + valueOfFund(fund),
              0,
            );
            const accountContributionEvents = pensionContributionEvents.filter(
              (event) =>
                event.pension_account_id === account.id ||
                funds.some((fund) => fund.id === event.pension_fund_id),
            );
            const total = pensionAccountValue(account, funds);
            const monthlyInput = projectedAccountMonthlyContribution(
              account,
              payEvents,
            );
            const estimatedMonthlyFees =
              monthlyFeeOn(
                total,
                account.annual_platform_fee_percent,
                account.fixed_monthly_fee,
              ) +
              funds.reduce(
                (sum, fund) =>
                  sum +
                  monthlyFeeOn(
                    valueOfFund(fund),
                    fund.annual_fund_fee_percent,
                  ),
                0,
              );
            const isExpanded =
              pensionViewMode === "full" ||
              expandedPensionAccountIds.has(account.id);

            if (!isExpanded) {
              return (
                <article
                  key={account.id}
                  id={`investment-account-${account.id}`}
                  className={`relative min-w-0 overflow-hidden rounded-[1.75rem] border bg-white shadow-[0_28px_90px_-62px_rgba(15,23,42,.75)] transition duration-700 sm:rounded-[2.25rem] ${highlightedAccountId === account.id ? "scale-[1.01] border-emerald-400 ring-4 ring-emerald-300/70" : "border-white/70"}`}
                >
                  <OwnerBadge people={people} personId={account.person_id} />
                  <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="min-w-0 p-5 sm:p-7">
                      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                          <ProviderLogo provider={account.provider} />
                          <div className="min-w-0">
                            <p className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
                              {account.pension_type === "work"
                                ? "Work pension"
                                : "Private pension"}
                            </p>
                            <h2 className="mt-3 truncate text-xl font-black text-slate-950 sm:text-2xl">
                              {account.label}
                            </h2>
                            <p className="mt-1 text-sm font-semibold text-slate-500">
                              {account.provider} · {ownerName(people, account.person_id)}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPensionAccountIds((current) => {
                                const next = new Set(current);
                                next.add(account.id);
                                return next;
                              })
                            }
                            aria-expanded="false"
                            className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white"
                          >
                            <ChevronDown className="h-3.5 w-3.5" /> Expand
                          </button>
                          <button
                            type="button"
                            onClick={() => openPensionThreads(account.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"
                            title="Open the complete contribution thread"
                          >
                            <ThreadIcon className="h-3.5 w-3.5" /> Threads
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setModal({ type: "edit-pension-account", account })
                            }
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"
                          >
                            <Settings className="h-3.5 w-3.5" /> Settings
                          </button>
                          <form action={deletePensionAccount}>
                            <input type="hidden" name="id" value={account.id} />
                            <button className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600">
                              Delete
                            </button>
                          </form>
                        </div>
                      </div>

                      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                            Monthly input
                          </p>
                          <p className="mt-1 text-xl font-black text-slate-950">
                            {formatMoney(monthlyInput)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                            Est. fees
                          </p>
                          <p className="mt-1 text-xl font-black text-slate-950">
                            {formatMoney(estimatedMonthlyFees)}
                            <span className="text-xs text-slate-500"> /mo</span>
                          </p>
                        </div>
                        <div className="col-span-2 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100 sm:col-span-1">
                          <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                            Funds
                          </p>
                          <p className="mt-1 text-xl font-black text-emerald-900">
                            {funds.length}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5" aria-label="Current pension fund allocation">
                        <AllocationBar funds={funds} />
                      </div>
                    </div>
                    <aside className="relative min-w-0 bg-gradient-to-br from-teal-950 to-slate-900 p-5 text-white sm:p-7">
                      <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-300">
                        Pot value
                      </p>
                      <div className="relative mt-2 inline-block">
                        <p className="text-4xl font-black">
                          {formatMoney(total)}
                        </p>
                        {account.valuation_mode === "provider_value" ? (
                          <button
                            type="button"
                            onClick={() =>
                              setModal({ type: "quick-edit-pension-value", account })
                            }
                            aria-label="Quick edit pot value"
                            title="Quick edit"
                            className="absolute -right-8 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white"
                          >
                            <Settings className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                      <PensionHistoryChart accountId={account.id} />
                    </aside>
                  </div>
                </article>
              );
            }
            return (
              <div
                key={account.id}
                id={`investment-account-${account.id}`}
                className={`relative min-w-0 overflow-hidden rounded-[1.75rem] border bg-white shadow-[0_28px_90px_-62px_rgba(15,23,42,.75)] transition duration-700 sm:rounded-[2.25rem] ${highlightedAccountId === account.id ? "scale-[1.01] border-emerald-400 ring-4 ring-emerald-300/70" : "border-white/70"}`}
              >
                {highlightedAccountId === account.id ? <span className="absolute right-5 top-5 z-20 rounded-full bg-emerald-500 px-3 py-1 text-xs font-black text-white shadow-lg">New pot</span> : null}
                <OwnerBadge people={people} personId={account.person_id} />
                <div className="grid lg:grid-cols-[1fr_340px]">
                  <div className="min-w-0 p-4 sm:p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex gap-4">
                        <ProviderLogo provider={account.provider} />
                        <div>
                          <p className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-slate-600">
                            {account.pension_type === "work"
                              ? "Work pension"
                              : "Private pension"}
                          </p>
                          <h2 className="mt-3 text-2xl font-black text-slate-950">
                            {account.label}
                          </h2>
                          <p className="text-sm font-semibold text-slate-500">
                            {account.provider} ·{" "}
                            {ownerName(people, account.person_id)} ·{" "}
                            {account.contribution_method.replace(/_/g, " ")}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        {pensionViewMode === "cards" ? (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPensionAccountIds((current) => {
                                const next = new Set(current);
                                next.delete(account.id);
                                return next;
                              })
                            }
                            aria-expanded="true"
                            className="inline-flex items-center gap-1 rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white"
                          >
                            <ChevronUp className="h-3.5 w-3.5" /> Collapse
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openPensionThreads(account.id)}
                          className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"
                          title="Open the complete contribution thread"
                        >
                          <ThreadIcon className="h-3.5 w-3.5" /> Threads
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setModal({ type: "edit-pension-account", account })
                          }
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"
                        >
                          <Settings className="h-3.5 w-3.5" /> Settings
                        </button>
                        <form action={deletePensionAccount}>
                          <input type="hidden" name="id" value={account.id} />
                          <button className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600">
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                    <PensionContributionLogicCard account={account} payEvents={payEvents} />
                    <div className="mt-6">
                      <AllocationBar funds={funds} />
                    </div>
                    <div
                      id={`pension-threads-${account.id}`}
                      className="scroll-mt-28"
                    >
                      <CollapsibleSection
                        key={`pension-summary-${account.id}-${pensionThreadRequest?.accountId === account.id ? pensionThreadRequest.nonce : 0}`}
                        title="Pension contribution summary"
                        subtitle="Combined employee, employer and NI contributions across this pension"
                        defaultOpen={pensionThreadRequest?.accountId === account.id}
                        badge={
                          <span className="rounded-full bg-teal-600 px-3 py-1.5 text-xs font-black text-white">
                            {accountContributionEvents.filter((event) => event.event_status !== "removed" && event.event_status !== "superseded" && (event.pension_account_id === account.id || (event.pension_fund_id ? funds.some((fund) => fund.id === event.pension_fund_id) : false))).length
                              ? "Has events"
                              : "No events yet"}
                          </span>
                        }
                      >
                        <PensionContributionThread
                          account={account}
                          funds={funds}
                          events={accountContributionEvents}
                        />
                      </CollapsibleSection>
                    </div>
                    <div className="mt-5 space-y-3">
                      {funds.map((fund) => (
                        <article
                          key={fund.id}
                          className="group min-w-0 rounded-[1.5rem] border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-slate-200/70 sm:rounded-[2rem] sm:p-5"
                        >
                          {(() => {
                            const fundEvents = accountContributionEvents
                              .filter((event) => event.pension_fund_id === fund.id && event.event_status !== "removed" && event.event_status !== "superseded")
                              .sort((a, b) => String(b.investment_date || b.contribution_date || "").localeCompare(String(a.investment_date || a.contribution_date || "")));
                            const latestFundEvent = fundEvents.find((event) => event.source === "provider_statement" || event.source === "manual_reconciliation") || fundEvents[0];
                            return (
                              <div className="mb-4 grid gap-2 sm:grid-cols-3">
                                <div className="rounded-2xl bg-teal-50 px-3 py-2 ring-1 ring-teal-100">
                                  <p className="text-[10px] font-black uppercase tracking-wide text-teal-700">Latest confirmed purchase</p>
                                  <p className="mt-1 text-sm font-black text-slate-950">{latestFundEvent ? formatMoney(Number(latestFundEvent.contribution_amount || 0)) : "No purchase yet"}</p>
                                </div>
                                <div className="rounded-2xl bg-blue-50 px-3 py-2 ring-1 ring-blue-100">
                                  <p className="text-[10px] font-black uppercase tracking-wide text-blue-700">Purchase date</p>
                                  <p className="mt-1 text-sm font-black text-slate-950">{latestFundEvent ? formatThreadDate(latestFundEvent.investment_date || latestFundEvent.contribution_date) : "Pending"}</p>
                                </div>
                                <div className="rounded-2xl bg-orange-50 px-3 py-2 ring-1 ring-orange-100">
                                  <p className="text-[10px] font-black uppercase tracking-wide text-orange-700">Thread records</p>
                                  <p className="mt-1 text-sm font-black text-slate-950">{fundEvents.length}</p>
                                </div>
                              </div>
                            );
                          })()}
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <p className="text-lg font-black text-slate-950">
                                {fund.fund_name}
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-500">
                                {fund.group_label || "Fund"} ·{" "}
                                {formatMoney(valueOfFund(fund))} · contribution{" "}
                                {fund.contribution_active
                                  ? `${Number(fund.monthly_contribution_percent).toFixed(1)}%`
                                  : "off"}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                Fee{" "}
                                {Number(
                                  fund.annual_fund_fee_percent || 0,
                                ).toFixed(3)}
                                %/yr
                              </p>
                              <p className="mt-1 text-xs font-black text-emerald-700">
                                Projected monthly top-up:{" "}
                                {formatMoney(
                                  projectedFundContribution(
                                    account,
                                    fund,
                                    payEvents,
                                  ),
                                )}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2 lg:justify-end">
                              <button
                                onClick={() =>
                                  setModal({
                                    type: "research-pension-fund",
                                    fund,
                                    provider: account.provider,
                                  })
                                }
                                className="rounded-full bg-orange-100 px-3 py-2 text-xs font-black text-orange-700"
                              >
                                AI check
                              </button>
                              <button
                                onClick={() =>
                                  setModal({ type: "edit-pension-fund", fund })
                                }
                                className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"
                              >
                                Edit
                              </button>
                              <form action={deletePensionFund}>
                                <input
                                  type="hidden"
                                  name="id"
                                  value={fund.id}
                                />
                                <button className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600">
                                  Delete
                                </button>
                              </form>
                            </div>
                          </div>
                          <CollapsibleSection
                            title={`${fund.fund_name} purchase thread`}
                            subtitle="Dated purchase amounts, unit prices and units—editable against the provider statement"
                          >
                            <PensionContributionThread
                              account={account}
                              funds={[fund]}
                              events={accountContributionEvents.filter((event) => event.pension_fund_id === fund.id)}
                              fund={fund}
                            />
                          </CollapsibleSection>
                        </article>
                      ))}
                      {funds.length === 0 ? (
                        <div className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-500">
                          No funds yet. Use provider search or add funds
                          manually inside this pot.
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <aside className="relative bg-gradient-to-br from-teal-950 to-slate-900 p-6 text-white">
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-300">
                      Pot value
                    </p>
                    <div className="relative mt-2 inline-block">
                      <p className="text-4xl font-black">
                        {formatMoney(total)}
                      </p>
                      {account.valuation_mode === "provider_value" ? (
                        <button
                          type="button"
                          onClick={() =>
                            setModal({ type: "quick-edit-pension-value", account })
                          }
                          aria-label="Quick edit pot value"
                          title="Quick edit"
                          className="absolute -right-8 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-300">
                      {account.valuation_mode === "provider_value"
                        ? "No live provider feed — update manually via the cog above"
                        : "Provider/fund values update when refreshed or edited"}
                    </p>
                    <PensionHistoryChart accountId={account.id} />
                    <div className="mt-6 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                      <p className="text-sm font-bold text-slate-200">
                        Estimated fees
                      </p>
                      <p className="mt-1 text-2xl font-black">
                        {formatMoney(estimatedMonthlyFees)}
                        <span className="text-sm font-bold text-slate-300">
                          {" "}
                          / month
                        </span>
                      </p>
                    </div>
                    {account.employer_ni_topup_enabled ? (
                      <div className="mt-4 rounded-3xl bg-emerald-400/15 p-4 text-sm font-bold text-emerald-100">
                        Employer NI reinvestment enabled · {Number(account.employer_ni_passback_percent ?? 100).toFixed(0)}% of the {Number(account.employer_ni_rate_percent ?? 15).toFixed(2)}% employer NI saving passed back
                      </div>
                    ) : null}
                    <button
                      onClick={() =>
                        setModal({
                          type: "provider-fund-search",
                          accountId: account.id,
                          provider: account.provider,
                        })
                      }
                      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950"
                    >
                      <Search className="h-4 w-4" /> Find funds
                    </button>
                    <button
                      onClick={() =>
                        setModal({
                          type: "pension-fund",
                          accountId: account.id,
                        })
                      }
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 px-4 py-3 text-sm font-black text-white"
                    >
                      <Plus className="h-4 w-4" /> Add fund manually
                    </button>
                  </aside>
                </div>
              </div>
            );
          })}
          {filteredPensionAccounts.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-8 text-center">
              <PiggyBank className="mx-auto h-10 w-10 text-slate-400" />
              <p className="mt-3 font-black text-slate-950">
                No pension pots yet
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Add “Company pension · Legal & General” first, then add each
                fund and monthly allocation.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {experience === "db-detail" && area === "db" ? (
        <section className="space-y-5">
          <div className="rounded-[2rem] border border-white/70 bg-white/85 p-6 shadow-[0_28px_90px_-62px_rgba(15,23,42,.75)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-950">
                  Defined benefit pension tracker
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  For NHS/CARE-style schemes: log banding, pensionable pay,
                  contribution rate and dates. Later this can be enriched with
                  full NHS pay-band history.
                </p>
              </div>
              <button
                onClick={() =>
                  setModal({
                    type: "db-pension",
                    personId: personFilter !== "all" ? personFilter : undefined,
                  })
                }
                className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
              >
                + Add DB scheme
              </button>
            </div>
          </div>
          {filteredDbPensionSchemes.map((scheme) => {
            const events = dbPensionEvents.filter(
              (event) => event.db_pension_id === scheme.id,
            );
            const accruedAnnual = events.reduce((sum, event) => {
              const start = new Date(event.start_date).getTime();
              const end = event.end_date
                ? new Date(event.end_date).getTime()
                : Date.now();
              const years = Math.max(
                0,
                (end - start) / (365.25 * 24 * 60 * 60 * 1000),
              );
              return (
                sum +
                (Number(event.pensionable_pay || 0) * years) /
                  Math.max(1, Number(scheme.accrual_rate || 54))
              );
            }, 0);
            return (
              <article
                key={scheme.id}
                className="rounded-[2.25rem] border border-white/70 bg-white p-6 shadow-[0_28px_90px_-62px_rgba(15,23,42,.75)]"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-blue-700">
                      {scheme.scheme_section}
                    </p>
                    <h3 className="mt-3 text-2xl font-black text-slate-950">
                      {scheme.scheme_name}
                    </h3>
                    <p className="text-sm font-semibold text-slate-500">
                      {scheme.provider} · {ownerName(people, scheme.person_id)}{" "}
                      · accrual 1/{Number(scheme.accrual_rate || 54).toFixed(0)}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-sm font-bold text-slate-500">
                      Rough accrued annual pension
                    </p>
                    <p className="text-3xl font-black text-slate-950">
                      {formatMoney(accruedAnnual)}
                    </p>
                    <div className="mt-2 flex gap-2 md:justify-end">
                      <button
                        onClick={() =>
                          setModal({
                            type: "db-pension-event",
                            schemeId: scheme.id,
                          })
                        }
                        className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
                      >
                        Add service log
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setModal({ type: "edit-db-pension", scheme })
                        }
                        className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700"
                      >
                        Settings
                      </button>
                      <form action={deleteDefinedBenefitPension}>
                        <input type="hidden" name="id" value={scheme.id} />
                        <button className="rounded-full bg-red-50 px-4 py-2 text-xs font-black text-red-600">
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
                <div className="mt-5 space-y-2">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-black text-slate-950">
                            {event.band_label}
                          </p>
                          <p className="text-sm font-semibold text-slate-500">
                            {event.start_date} → {event.end_date || "present"} ·
                            pensionable pay {formatMoney(event.pensionable_pay)}{" "}
                            · member contribution{" "}
                            {Number(event.contribution_percent || 0).toFixed(2)}
                            %
                          </p>
                        </div>
                        <form action={deleteDbPensionServiceEvent}>
                          <input type="hidden" name="id" value={event.id} />
                          <button className="text-xs font-black text-red-600">
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                  {events.length === 0 ? (
                    <p className="text-sm font-semibold text-slate-500">
                      No service logs yet. Add NHS banding/pay periods to build
                      up the history.
                    </p>
                  ) : null}
                </div>
              </article>
            );
          })}
          {filteredDbPensionSchemes.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-8 text-center">
              <PiggyBank className="mx-auto h-10 w-10 text-slate-400" />
              <p className="mt-3 font-black text-slate-950">
                No defined benefit pensions yet
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Choose the person who owns the scheme, then add NHS/public DB
                rules or a private scheme-rules link and log service/pay periods
                over time.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {experience === "investment-detail" && area === "investments" ? (
        <section className="space-y-5">
          <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 text-white shadow-[0_30px_120px_-75px_rgba(0,0,0,.95)] backdrop-blur lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={openOverview}
                className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/10"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-600">
                  Investment breakdown
                </p>
                <h2 className="text-2xl font-black text-slate-950">
                  {personFilter === "all"
                    ? "Whole household"
                    : personFilter === "household"
                      ? "Shared pots"
                      : ownerName(people, personFilter)}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openInvestmentCommand([personFilter])}
              className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
            >
              Open live view
            </button>
          </div>
          {filteredInvestmentAccounts.length ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setCollapsedInvestmentAccountIds(
                    allVisibleInvestmentPotsCollapsed
                      ? new Set()
                      : new Set(
                          filteredInvestmentAccounts.map(
                            (account) => account.id,
                          ),
                        ),
                  )
                }
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm"
              >
                {allVisibleInvestmentPotsCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
                {allVisibleInvestmentPotsCollapsed
                  ? "Open all pots"
                  : "Collapse all pots"}
              </button>
            </div>
          ) : null}
          {filteredInvestmentAccounts.map((account) => {
            const holdings = investmentHoldings.filter(
              (holding) => holding.investment_account_id === account.id,
            );
            const pendingCoverage = investmentCoveragePlaceholders.filter(
              (item) =>
                item.investment_account_id === account.id &&
                !["archived", "dismissed"].includes(
                  String(item.status || "").toLowerCase(),
                ),
            );
            const total = accountDisplayValue(account, holdings);
            const unmappedProviderValue = accountUnmappedValue(
              account,
              holdings,
            );
            const groupNames = Array.from(
              new Set(
                holdings.map((holding) => holding.group_label).filter(Boolean),
              ),
            ) as string[];
            const accountCost =
              holdings.reduce((sum, holding) => sum + holdingCost(holding), 0) +
              (unmappedProviderValue > 0 ? unmappedProviderValue : 0);
            const accountPl = total - accountCost;
            const accountPlReliable = !hasUnverifiedProviderCostBasis(holdings);
            const accountDayMovement = dayMovementFromSnapshots(
              holdings,
              investmentSnapshots,
            );
            const cashBreakdown = providerCashBreakdown(account, holdings);
            const providerCash = providerCashLabel(account, holdings);
            const isaInfo = providerIsaInfoFromRaw(account);
            const isIsaAccount = classifyIsaWrapper(account.account_type, account.label) !== "not_isa";
            const fundCount = holdings.filter(
              (holding) =>
                holding.asset_kind === "fund" || holding.asset_kind === "etf",
            ).length;
            const collapsed = collapsedInvestmentAccountIds.has(account.id);
            const groupedByPie = new Map<string, InvestmentHolding[]>();
            holdings.forEach((holding) => {
              const label = inferredInvestmentGroupLabel(
                account,
                holding,
                holdings,
              );
              if (!label) return;
              const existing = groupedByPie.get(label) || [];
              existing.push(holding);
              groupedByPie.set(label, existing);
            });
            const pieGroups = Array.from(groupedByPie.entries()).filter(
              ([, items]) => items.length > 1,
            );
            const pieHoldingIds = new Set(
              pieGroups.flatMap(([, items]) => items.map((item) => item.id)),
            );
            const visibleHoldings = holdings.filter(
              (holding) => !pieHoldingIds.has(holding.id),
            );
            return (
              <div
                key={account.id}
                className="relative overflow-hidden rounded-[2.25rem] border border-white/70 bg-white shadow-[0_28px_90px_-62px_rgba(15,23,42,.75)]"
              >
                <div className="border-b border-slate-100 bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 p-6 text-white">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex gap-4">
                      <ProviderLogo provider={account.provider} />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <AccountTypePill type={account.account_type} />
                          <PotOwnerProfiles
                            people={people}
                            account={account}
                            ownerRows={investmentAccountOwners}
                            onClick={() =>
                              setModal({
                                type: "investment-account-owners",
                                account,
                              })
                            }
                          />
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <h2 className="text-3xl font-black tracking-tight">
                            {account.label}
                          </h2>
                          <button
                            type="button"
                            onClick={() =>
                              setModal({
                                type: "edit-investment-account",
                                account,
                              })
                            }
                            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-slate-100 ring-1 ring-white/15 hover:bg-white/15"
                            title="Pot settings"
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                          {holdings.length > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setModal({
                                  type: "organise-investment-pies",
                                  account,
                                  holdings,
                                })
                              }
                              className="grid h-9 w-9 place-items-center rounded-full bg-orange-400/20 text-orange-100 ring-1 ring-orange-200/30 hover:bg-orange-400/30"
                              title="Edit all assets / organise into groups"
                            >
                              <Layers className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm font-semibold text-slate-300">
                          {account.provider} · {holdings.length} holding(s) ·{" "}
                          {fundCount} fund/ETF item(s)
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs font-black">
                          {providerCash > 0.5 ? (
                            <span className="rounded-full bg-amber-300/15 px-3 py-1 text-amber-100 ring-1 ring-amber-200/20">
                              Cash available {formatMoney(providerCash)}
                            </span>
                          ) : null}
                          {cashBreakdown.investable > 0.01 &&
                          cashBreakdown.dividends > 0.01 ? (
                            <span className="rounded-full bg-white/10 px-3 py-1 text-slate-100 ring-1 ring-white/15">
                              main {formatMoney(cashBreakdown.investable)} ·
                              dividends {formatMoney(cashBreakdown.dividends)}
                            </span>
                          ) : null}
                          {isIsaAccount ? (
                            <span className="rounded-full bg-blue-300/15 px-3 py-1 text-blue-100 ring-1 ring-blue-200/20">
                              ISA {isaInfo.year}: used{" "}
                              {formatMoney(isaInfo.subscribed)} · remaining{" "}
                              {formatMoney(isaInfo.remaining)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[160px_1fr_1fr_64px] lg:min-w-[580px]">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedInvestmentChartId(
                            expandedInvestmentChartId === account.id
                              ? null
                              : account.id,
                          )
                        }
                        className="rounded-3xl bg-white/10 p-2 text-left transition hover:bg-white/15"
                        title="Open larger pot history chart"
                      >
                        <InvestmentHistoryChart
                          accountId={account.id}
                          title="Pot sparkline"
                          mode="value"
                          compact
                          bare
                          showRange={false}
                        />
                      </button>
                      <div className="rounded-3xl bg-white/10 p-4 text-right">
                        <p className="text-xs font-black uppercase text-slate-300">
                          Value
                        </p>
                        <p className="mt-1 text-2xl font-black">
                          {formatMoney(total)}
                        </p>
                      </div>
                      <div className="rounded-3xl bg-white/10 p-4 text-right">
                        <p className="text-xs font-black uppercase text-slate-300">
                          Performance
                        </p>
                        {accountPlReliable ? (
                          <p
                            className={`mt-1 text-2xl font-black ${accountPl >= 0 ? "text-emerald-100" : "text-red-100"}`}
                          >
                            {formatMoney(accountPl)}
                          </p>
                        ) : (
                          <>
                            <p
                              className={`mt-1 text-2xl font-black ${accountDayMovement.has ? (accountDayMovement.change >= 0 ? "text-emerald-100" : "text-red-100") : "text-slate-100"}`}
                            >
                              {accountDayMovement.has
                                ? `${accountDayMovement.change >= 0 ? "+" : ""}${formatMoney(accountDayMovement.change)}`
                                : "—"}
                            </p>
                            <p className="mt-1 text-[11px] font-bold text-slate-300">
                              {accountDayMovement.has
                                ? "Today from stored movement"
                                : "True P/L needs broker cost basis"}
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex h-full min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-3xl bg-white/10 py-2 ring-1 ring-white/10">
                        <button
                          type="button"
                          onClick={() =>
                            toggleInvestmentAccountCollapse(account.id)
                          }
                          className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/10 text-white hover:bg-white/15"
                          title={collapsed ? "Open pot" : "Collapse pot"}
                        >
                          {collapsed ? (
                            <Plus className="h-3.5 w-3.5" />
                          ) : (
                            <span className="text-xl leading-none">−</span>
                          )}
                        </button>
                        <AccountSourceMark account={account} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {collapsed ? (
                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">
                      Pot collapsed · {holdings.length} holding(s) ·{" "}
                      {formatMoney(total)} current value. Use the + button in
                      the header to reopen holdings and actions.
                    </div>
                  ) : (
                    <>
                      {expandedInvestmentChartId === account.id ? (
                        <div className="mb-5 grid gap-4 2xl:grid-cols-[minmax(0,1fr)_480px]">
                          <InvestmentHistoryChart
                            accountId={account.id}
                            title="Pot value history"
                          mode="value"
                          prefetchRanges
                          refreshMs={60_000}
                        />
                          <AccountSideInsights
                            holdings={holdings}
                            snapshots={investmentSnapshots}
                            total={total}
                          />
                        </div>
                      ) : null}
                      <div
                        className={
                          investmentViewMode === "squares"
                            ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                            : "space-y-3"
                        }
                      >
                        {pieGroups.length === 0 &&
                        String(
                          account.external_provider || "",
                        ).toLowerCase() === "snaptrade" &&
                        holdings.length > 10 &&
                        !dismissedPieNoticeAccountIds.has(account.id) ? (
                          <div
                            className={
                              investmentViewMode === "squares"
                                ? "md:col-span-2 xl:col-span-3"
                                : ""
                            }
                          >
                            <div className="flex flex-col gap-3 rounded-[1.75rem] border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600 md:flex-row md:items-center md:justify-between">
                              <span>
                                SnapTrade has not supplied verified Trading 212
                                group for this account. LOOP is showing
                                individual holdings until you map them yourself.
                              </span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setModal({
                                      type: "organise-investment-pies",
                                      account,
                                      holdings,
                                    })
                                  }
                                  className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
                                >
                                  Map groups
                                </button>
                                <button
                                  type="button"
                                  onClick={() => dismissPieNotice(account.id)}
                                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-600"
                                >
                                  Hide
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {pendingCoverage.map((item) => (
                          <PendingCoverageCard key={item.id} item={item} />
                        ))}
                        {pieGroups.map(([label, items]) => {
                          const setting = investmentPieSettings.find(
                            (item) =>
                              item.investment_account_id === account.id &&
                              item.group_label === label,
                          );
                          return (
                            <div
                              key={label}
                              className={
                                investmentViewMode === "squares"
                                  ? "md:col-span-2 xl:col-span-3"
                                  : ""
                              }
                            >
                              <PieStackCard
                                label={label}
                                holdings={items}
                                accountTotal={total}
                                investmentViewMode={investmentViewMode}
                                investmentLots={investmentLots}
                                pieSetting={setting}
                                onInfo={(holding) =>
                                  setModal({
                                    type: "investment-holding-info",
                                    holding,
                                  })
                                }
                                onEdit={(holding) =>
                                  setModal({
                                    type: "edit-investment-holding",
                                    holding,
                                  })
                                }
                                onSettings={() =>
                                  setModal({
                                    type: "investment-pie-settings",
                                    account,
                                    groupLabel: label,
                                    setting,
                                    holdings: items,
                                  })
                                }
                              />
                            </div>
                          );
                        })}
                        {visibleHoldings.map((holding) => (
                          <HoldingCard
                            key={holding.id}
                            holding={holding}
                            lots={evidencedInvestmentLots(
                              investmentLots.filter((lot) => lot.holding_id === holding.id),
                            )}
                            snapshots={investmentSnapshots}
                            investmentViewMode={investmentViewMode}
                            onInfo={() =>
                              setModal({
                                type: "investment-holding-info",
                                holding,
                              })
                            }
                            onEdit={() =>
                              setModal({
                                type: "edit-investment-holding",
                                holding,
                              })
                            }
                          />
                        ))}
                        {holdings.length === 0 &&
                        pendingCoverage.length === 0 ? (
                          <div className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-500">
                            No holdings yet. Search a stock, ETF or provider
                            fund and then add the units you own.
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          onClick={() =>
                            setModal({
                              type: "investment-holding",
                              accountId: account.id,
                            })
                          }
                          className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
                        >
                          <Plus className="h-4 w-4" /> Add holding
                        </button>
                        {String(account.provider || "")
                          .toLowerCase()
                          .includes("moneybox") ? (
                          <button
                            type="button"
                            onClick={() =>
                              setModal({ type: "moneybox-allocation", account })
                            }
                            className="inline-flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700"
                            title="Set the Moneybox fund/ETF allocation, regular contribution, estimated buy delay and optional current value anchor."
                          >
                            <PiggyBank className="h-4 w-4" /> Configure Moneybox
                            allocation
                          </button>
                        ) : null}
                        {String(
                          account.external_provider || "",
                        ).toLowerCase() === "snaptrade" ? (
                          <button
                            type="button"
                            onClick={() =>
                              refreshSnapTradeInvestmentAccount(account)
                            }
                            disabled={syncingSnapTradeAccountId !== null}
                            className="inline-flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-700"
                            title="Refresh this imported broker account and replace any account-value placeholder with position-level stock/ETF holdings when SnapTrade returns them."
                          >
                            <RefreshCw
                              className={`h-4 w-4 ${syncingSnapTradeAccountId === account.id ? "animate-spin" : ""}`}
                            />
                            {syncingSnapTradeAccountId === account.id
                              ? "Refreshing positions…"
                              : "Refresh SnapTrade positions"}
                          </button>
                        ) : null}
                        {holdings.length > 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setModal({
                                type: "organise-investment-pies",
                                account,
                                holdings,
                              })
                            }
                            className="inline-flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700"
                            title="Assign imported holdings into your own Trading 212 groups when the broker does not expose group membership."
                          >
                            <Layers className="h-4 w-4" /> Organise into pies
                          </button>
                        ) : null}
                        {account.provider
                          .toLowerCase()
                          .includes("trading 212") ? (
                          <button
                            onClick={() =>
                              setModal({
                                type: "bulk-holdings",
                                accountId: account.id,
                              })
                            }
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"
                          >
                            <FileSpreadsheet className="h-4 w-4" /> Bulk import
                            Trading 212 group
                          </button>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {filteredInvestmentAccounts.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-8 text-center">
              <LineChart className="mx-auto h-10 w-10 text-slate-400" />
              <p className="mt-3 font-black text-slate-950">
                No investment pots yet
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Add “Investment · GIA · Revolut”, “Investment · GIA · Trading
                212” or “Investment · ISA · Trading 212”, then add holdings
                inside it.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-amber-200 bg-amber-50/80 p-5 text-sm font-semibold text-amber-950">
        <div className="flex gap-3">
          <Sparkles className="mt-0.5 h-5 w-5" />
          <p>
            End-of-day/delayed prices are fine for tracking. Provider tokens
            improve coverage, but the app can still use manual values, bulk
            imports and source notes while you avoid full broker integrations.
          </p>
        </div>
      </section>

      {modal?.type === "db-pension" ? (
        <ModalShell
          title="Add defined benefit pension"
          description="Start the DB/NHS wrapper, then add service/banding logs over time."
          onClose={() => setModal(null)}
        >
          <AddDbPensionForm people={people} defaultPersonId={modal.personId} />
        </ModalShell>
      ) : null}

      {modal?.type === "edit-db-pension" ? (
        <ModalShell
          title="Defined benefit settings"
          description="Use public scheme templates where available, or attach a private scheme-rules link for this user only."
          onClose={() => setModal(null)}
        >
          <EditDbPensionForm people={people} scheme={modal.scheme} />
        </ModalShell>
      ) : null}
      {modal?.type === "db-pension-event" ? (
        <ModalShell
          title="Add DB service / banding log"
          description="Log NHS banding, pensionable pay and dates. This can be updated as pay changes."
          onClose={() => setModal(null)}
        >
          {dbPensionSchemes.length ? (
            <AddDbPensionEventForm
              schemes={dbPensionSchemes}
              defaultSchemeId={modal.schemeId}
            />
          ) : (
            <p className="text-sm font-semibold text-slate-500">
              Add a defined benefit pension first.
            </p>
          )}
        </ModalShell>
      ) : null}
      {modal?.type === "pension-account" ? (
        <ModalShell
          title="Add pension pot"
          description="Create the provider wrapper first: Company pension · Legal & General, Private pension · PensionBee, etc."
          onClose={() => setModal(null)}
        >
          <AddPensionAccountWizard
            people={people}
            defaultPersonId={modal.personId}
          />
        </ModalShell>
      ) : null}

      {modal?.type === "edit-pension-account" ? (
        <ModalShell
          title="Pension pot settings"
          description="Change provider, valuation mode, fees, contribution dates and job-leaver/manual assumptions."
          onClose={() => setModal(null)}
        >
          <AddPensionAccountWizard people={people} account={modal.account} />
        </ModalShell>
      ) : null}
      {modal?.type === "quick-edit-pension-value" ? (
        <ModalShell
          title="Quick value update"
          description="For manually-priced pots (no live provider feed) — just the number and the date, nothing else."
          onClose={() => setModal(null)}
        >
          <QuickValueEditForm
            account={modal.account}
            onDone={() => setModal(null)}
          />
        </ModalShell>
      ) : null}
      {modal?.type === "provider-fund-search" ? (
        <ModalShell
          title="Find pension fund"
          description="Search provider options, then select the likely fund to pre-fill the add form."
          onClose={() => setModal(null)}
        >
          {pensionAccounts.length ? (
            <ProviderFundSearch
              accounts={pensionAccounts}
              defaultAccountId={modal.accountId}
              onSelect={(accountId, fund) =>
                setModal({ type: "pension-fund", accountId, defaults: fund })
              }
            />
          ) : (
            <p className="text-sm font-semibold text-slate-500">
              Add a pension pot first.
            </p>
          )}
        </ModalShell>
      ) : null}
      {modal?.type === "pension-fund" ? (
        <ModalShell
          title="Add pension fund"
          description="Add each fund and set whether it receives a monthly contribution allocation."
          onClose={() => setModal(null)}
        >
          {pensionAccounts.length ? (
            <AddPensionFundWizard
              accounts={pensionAccounts}
              defaultAccountId={modal.accountId}
              defaults={modal.defaults}
            />
          ) : (
            <p className="text-sm font-semibold text-slate-500">
              Add a pension pot first.
            </p>
          )}
        </ModalShell>
      ) : null}
      {modal?.type === "edit-pension-fund" ? (
        <ModalShell
          title="Edit pension fund"
          description="Update value, allocation, monthly contribution split and fees."
          onClose={() => setModal(null)}
        >
          <EditPensionFundForm fund={modal.fund} />
        </ModalShell>
      ) : null}
      {modal?.type === "research-pension-fund" ? (
        <ModalShell
          title="AI fund fee / option check"
          description="Use this for funds that are not already in your assumptions."
          onClose={() => setModal(null)}
        >
          <PensionFundResearch fund={modal.fund} provider={modal.provider} />
        </ModalShell>
      ) : null}
      {modal?.type === "investment-account" ? (
        <ModalShell
          title="Add investment pot"
          description="Create the platform wrapper first: Trading 212 ISA, Trading 212 GIA, Revolut GIA, etc."
          onClose={() => setModal(null)}
        >
          <AddInvestmentAccountWizard
            people={people}
            defaultPersonId={modal.personId}
            onCreated={revealAccount}
          />
        </ModalShell>
      ) : null}
      {modal?.type === "edit-investment-account" ? (
        <ModalShell
          title="Pot settings"
          description="Change provider, wrapper type, fee assumptions, owners and notes for this pot."
          onClose={() => setModal(null)}
        >
          <EditInvestmentAccountForm
            people={people}
            account={modal.account}
            onDelete={() =>
              setModal({
                type: "confirm-delete-investment-account",
                account: modal.account,
              })
            }
          />
        </ModalShell>
      ) : null}
      {modal?.type === "moneybox-allocation" ? (
        <ModalShell
          title="Moneybox allocation setup"
          description="Choose the Moneybox funds/stocks, set each allocation %, add contribution timing, then LOOP creates inferred lots and value snapshots."
          onClose={() => setModal(null)}
        >
          <MoneyboxAllocationSetupForm account={modal.account} />
        </ModalShell>
      ) : null}
      {modal?.type === "investment-account-owners" ? (
        <ModalShell
          title="Pot owners"
          description="Choose who this pot belongs to. Use Household / shared when it is not owned by one specific person."
          onClose={() => setModal(null)}
        >
          <InvestmentAccountOwnersForm
            people={people}
            account={modal.account}
            ownerRows={investmentAccountOwners}
          />
        </ModalShell>
      ) : null}

      {modal?.type === "organise-investment-pies" ? (
        <ModalShell
          title="Organise imported holdings into pies"
          description="Assign provider-imported holdings into your own Trading 212 groups/groups. This is local to LOOP and does not change your broker account."
          onClose={() => setModal(null)}
        >
          <OrganiseInvestmentPiesForm
            account={modal.account}
            holdings={modal.holdings}
          />
        </ModalShell>
      ) : null}
      {modal?.type === "investment-pie-settings" ? (
        <ModalShell
          title={`${modal.groupLabel} settings`}
          description="Set regular reinvestment assumptions and dividend reinvestment for this group."
          onClose={() => setModal(null)}
        >
          <InvestmentPieSettingsForm
            account={modal.account}
            groupLabel={modal.groupLabel}
            setting={modal.setting}
            holdings={modal.holdings}
          />
        </ModalShell>
      ) : null}
      {modal?.type === "confirm-delete-investment-account" ? (
        <ModalShell
          title="Delete investment pot"
          description="This uses a typed confirmation so pots cannot be deleted by accident."
          onClose={() => setModal(null)}
        >
          <ConfirmDeleteInvestmentAccountForm account={modal.account} />
        </ModalShell>
      ) : null}
      {modal?.type === "investment-holding-info" ? (
        <ModalShell
          title={modal.holding.asset_name}
          description="Core holding, pricing and source information."
          onClose={() => setModal(null)}
        >
          <HoldingInfoPanel
            holding={modal.holding}
            lots={evidencedInvestmentLots(
              investmentLots.filter((lot) => lot.holding_id === modal.holding.id),
            )}
          />
        </ModalShell>
      ) : null}
      {modal?.type === "investment-holding" ? (
        <ModalShell
          title="Add holding inside investment pot"
          description="Search by company, ETF full name, ticker, ISIN or provider fund first, then add units and purchase price."
          onClose={() => setModal(null)}
        >
          {investmentAccounts.length ? (
            <AddInvestmentHoldingWizard
              accounts={investmentAccounts}
              defaultAccountId={modal.accountId}
            />
          ) : (
            <p className="text-sm font-semibold text-slate-500">
              Add an investment pot first.
            </p>
          )}
        </ModalShell>
      ) : null}
      {modal?.type === "bulk-holdings" ? (
        <ModalShell
          title="Bulk import group holdings"
          description="Paste many holdings at once from Trading 212/Revolut exports or text extracted from a screenshot."
          onClose={() => setModal(null)}
        >
          {investmentAccounts.length ? (
            <BulkHoldingsForm
              accounts={investmentAccounts}
              defaultAccountId={modal.accountId}
              onComplete={revealAccount}
            />
          ) : (
            <p className="text-sm font-semibold text-slate-500">
              Add an investment pot first.
            </p>
          )}
        </ModalShell>
      ) : null}
      {modal?.type === "edit-investment-holding" ? (
        <ModalShell
          title="Edit holding"
          description="Update shares, price, fund type, target allocation, fees and price logging."
          onClose={() => setModal(null)}
        >
          <EditInvestmentHoldingForm holding={modal.holding} />
        </ModalShell>
      ) : null}
    </main>
  );
}

function InvestmentPieSettingsForm({
  account,
  groupLabel,
  setting,
  holdings,
}: {
  account: InvestmentAccount;
  groupLabel: string;
  setting?: InvestmentPieSetting;
  holdings: InvestmentHolding[];
}) {
  const value = holdings.reduce(
    (sum, holding) => sum + holdingValue(holding),
    0,
  );
  const dividendYield = Number(setting?.expected_dividend_yield_percent || 0);
  const estimatedDividend = value * (dividendYield / 100);
  const [reinvestFrequency, setReinvestFrequency] = useState(setting?.reinvest_frequency || "monthly");
  const isWeeklyStyle = reinvestFrequency === "weekly" || reinvestFrequency === "fortnightly";
  const WEEKDAY_OPTIONS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return (
    <form action={updateInvestmentPieSetting} className="space-y-5">
      <input type="hidden" name="investment_account_id" value={account.id} />
      <input type="hidden" name="group_label" value={groupLabel} />
      <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">
        This controls the assumptions for this Trading 212 group only. It does not
        show as a public tag on the pot; it is used for reinvestment and
        dividend projections.
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormInput
          label="Regular reinvest amount"
          name="monthly_reinvest_amount"
          type="number"
          step="any"
          defaultValue={String(setting?.monthly_reinvest_amount ?? 0)}
        />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">How often?</span>
          <select
            name="reinvest_frequency"
            defaultValue={setting?.reinvest_frequency || "monthly"}
            onChange={(event) => setReinvestFrequency(event.target.value)}
            className={inputClass}
          >
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
            <option value="manual">Manual / do not auto-create lots</option>
          </select>
        </label>
        {isWeeklyStyle ? (
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Reinvest day</span>
            <select
              name="reinvest_day"
              defaultValue={String(Math.min(6, Math.max(0, Number(setting?.reinvest_day ?? 0))))}
              className={inputClass}
            >
              {WEEKDAY_OPTIONS.map((label, index) => (
                <option key={label} value={index}>{label}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs font-semibold text-slate-400">The day of the week money is taken, e.g. Wednesday. It reinvests on the same weekday, "Days after reinvest date" later.</span>
          </label>
        ) : (
          <FormInput
            label="Reinvest day"
            name="reinvest_day"
            type="number"
            step="1"
            defaultValue={String(setting?.reinvest_day ?? 1)}
            placeholder="1–31"
          />
        )}
        <FormInput
          label="Days after reinvest date"
          name="reinvest_delay_days"
          type="number"
          step="1"
          defaultValue={String(setting?.reinvest_delay_days ?? 0)}
          placeholder="Useful where provider invests later"
        />
        <FormInput
          label="Estimated dividend yield %"
          name="expected_dividend_yield_percent"
          type="number"
          step="any"
          defaultValue={String(setting?.expected_dividend_yield_percent ?? 0)}
        />
        <label className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-700">
          <input
            type="checkbox"
            name="auto_reinvest_dividends"
            defaultChecked={setting?.auto_reinvest_dividends ?? true}
            className="h-4 w-4"
          />{" "}
          Reinvest dividends back into this group
        </label>
        <label className="flex items-center gap-3 rounded-3xl border border-blue-200 bg-blue-50 p-4 text-sm font-black text-blue-800">
          <input
            type="checkbox"
            name="auto_materialise_reinvestments_enabled"
            defaultChecked={
              setting?.auto_materialise_reinvestments_enabled === true
            }
            className="h-4 w-4"
          />{" "}
          Auto-create estimated purchase lots on the reinvestment date
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-slate-400">
            Current group value
          </p>
          <p className="mt-1 text-xl font-black text-slate-950">
            {formatMoney(value)}
          </p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-slate-400">
            Dividend estimate
          </p>
          <p className="mt-1 text-xl font-black text-slate-950">
            {formatMoney(estimatedDividend)} / yr
          </p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-slate-400">
            Holdings in group
          </p>
          <p className="mt-1 text-xl font-black text-slate-950">
            {holdings.length}
          </p>
        </div>
      </div>
      <label className="block">
        <span className="text-sm font-bold text-slate-700">Notes</span>
        <textarea
          name="notes"
          rows={4}
          defaultValue={setting?.notes || ""}
          className={inputClass}
          placeholder="Why you reinvest here, target weighting, dividend assumptions, etc."
        />
      </label>
      <SubmitButton>Save group settings</SubmitButton>
    </form>
  );
}

function InvestmentAccountOwnersForm({
  account,
  people,
  ownerRows,
}: {
  account: InvestmentAccount;
  people: Person[];
  ownerRows: InvestmentAccountOwner[];
}) {
  const initialOwners = accountOwnerIds(account, ownerRows);
  const [selected, setSelected] = useState<string[]>(initialOwners);
  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  return (
    <form action={updateInvestmentAccountOwners} className="space-y-5">
      <input type="hidden" name="investment_account_id" value={account.id} />
      <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
        Select everyone who should see this pot as theirs. Selecting nobody
        makes it Household / shared.
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelected(people.map((person) => person.id))}
          className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={() => setSelected([])}
          className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700"
        >
          Household / shared
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {people.map((person) => (
          <label
            key={person.id}
            className={`flex items-center gap-3 rounded-3xl border-2 p-4 ${selected.includes(person.id) ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white"}`}
          >
            <input
              type="checkbox"
              name="owner_person_ids"
              value={person.id}
              checked={selected.includes(person.id)}
              onChange={() => toggle(person.id)}
              className="h-4 w-4"
            />
            <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
              {person.avatar_url ? (
                <img
                  src={person.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                initials(person.name)
              )}
              {person.linked_user_id ? (
                <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-[10px] text-white">
                  ✓
                </span>
              ) : null}
            </span>
            <span>
              <span className="block text-sm font-black text-slate-950">
                {person.name}
              </span>
              <span className="block text-xs font-bold text-slate-500">
                {person.relationship}
              </span>
            </span>
          </label>
        ))}
      </div>
      <SubmitButton>Save pot owners</SubmitButton>
    </form>
  );
}

function ConfirmDeleteInvestmentAccountForm({
  account,
}: {
  account: InvestmentAccount;
}) {
  return (
    <form
      action={deleteInvestmentAccountWithConfirmation}
      className="space-y-5"
    >
      <input type="hidden" name="id" value={account.id} />
      <div className="rounded-3xl border border-red-100 bg-red-50 p-5 text-sm font-bold text-red-800">
        This deletes the pot and its holdings. Type{" "}
        <span className="font-black">DELETE</span> to confirm.
      </div>
      <FormInput label="Type DELETE" name="confirmation" required />
      <SubmitButton>Delete pot</SubmitButton>
    </form>
  );
}

function signedGbp(value?: number | null) {
  const num = Number(value || 0);
  const label = gbpPriceLabel(Math.abs(num));
  if (!Number.isFinite(num) || num === 0) return label;
  return `${num > 0 ? "+" : "-"}${label}`;
}

function signedPercent(value?: number | null) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `${num > 0 ? "+" : ""}${num.toFixed(2)}%`;
}

function holdingDayMoveValue(holding: InvestmentHolding) {
  const priceMove = Number(holding.day_change_gbp);
  const units = Number(holding.units || 0);
  if (!Number.isFinite(priceMove)) return null;
  return priceMove * units;
}

function holdingDayMoveLabel(holding: InvestmentHolding) {
  const move = holdingDayMoveValue(holding);
  if (move === null || move === undefined)
    return "Waiting for today’s opening point";
  return `${signedGbp(move)} · ${signedPercent(holding.day_change_percent)}`;
}

function holdingMoveBasisLabel(holding: InvestmentHolding) {
  return "market open / first point today";
}

function formatThreadDate(value?: string | null) {
  if (!value) return "Date pending";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function InvestmentOwnershipThread({
  holding,
  lots,
}: {
  holding: InvestmentHolding;
  lots: InvestmentLot[];
}) {
  const sortedLots = [...lots].sort((a, b) =>
    String(b.purchase_date || "").localeCompare(String(a.purchase_date || "")),
  );
  const latestPrice = latestPriceGbp(holding);
  const currentValue = holdingValue(holding);
  const cost = holdingCost(holding);
  return (
    <div className="space-y-4">
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Current value
          </p>
          <p className="mt-1 text-xl font-black text-slate-950">
            {formatMoney(currentValue)}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {Number(holding.units || 0).toFixed(8)} units at{" "}
            {gbpPriceLabel(latestPrice)}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Cost basis
          </p>
          <p className="mt-1 text-xl font-black text-slate-950">
            {cost > 0 ? formatMoney(cost) : "Pending"}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {holding.cost_basis_status === "known"
              ? "Verified average price"
              : "Manual/imported cost awaiting verification"}
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Tracked return
          </p>
          <p
            className={`mt-1 text-xl font-black ${currentValue - cost >= 0 ? "text-emerald-700" : "text-red-700"}`}
          >
            {cost > 0 ? signedGbp(currentValue - cost) : "—"}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            Value minus purchase thread cost
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {sortedLots.map((lot) => {
          const units = Number(lot.units || 0);
          const price = normaliseStoredPriceToGbp(
            holding,
            Number(lot.purchase_price || 0),
            "average",
          );
          const explicitCost = Number(lot.total_cost || 0);
          const calculatedCost = units * price;
          const total = explicitCost > 0 ? explicitCost : calculatedCost;
          return (
            <div
              key={lot.id}
              className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm sm:grid-cols-[150px_1fr_130px] sm:items-center"
            >
              <div>
                <p className="font-black text-slate-950">
                  {formatThreadDate(lot.purchase_date)}
                </p>
                <p className="text-xs font-bold text-slate-500">
                  {lot.external_source ||
                    (lot.external_transaction_id
                      ? "broker import"
                      : "manual lot")}
                </p>
              </div>
              <div>
                <p className="font-bold text-slate-700">
                  Bought{" "}
                  {units.toLocaleString(undefined, {
                    maximumFractionDigits: 8,
                  })}{" "}
                  units at {gbpPriceLabel(price)}
                </p>
                <p className="text-xs font-bold text-slate-500">
                  Fees {formatMoney(Number(lot.fees || 0))}
                  {lot.notes ? ` · ${lot.notes}` : ""}
                </p>
              </div>
              <p className="font-black text-slate-950 sm:text-right">
                {formatMoney(total)}
              </p>
            </div>
          );
        })}
        {sortedLots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
            No purchase lots yet. Add or import lots to see exactly when each
            tranche was bought and how the average price was built.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PensionContributionThread({
  account,
  funds,
  events,
  fund,
}: {
  account: PensionAccount;
  funds: PensionFund[];
  events: PensionContributionEvent[];
  fund?: PensionFund;
}) {
  const fundIds = new Set(funds.map((fund) => fund.id));
  const rows = events
    .filter(
      (event) =>
        event.event_status !== "removed" &&
        event.event_status !== "superseded" &&
        (fund
          ? event.pension_fund_id === fund.id
          : event.pension_account_id === account.id ||
            (event.pension_fund_id ? fundIds.has(event.pension_fund_id) : false)),
    )
    .sort((a, b) =>
      String(
        b.investment_date || b.contribution_date || b.created_at || "",
      ).localeCompare(
        String(a.investment_date || a.contribution_date || a.created_at || ""),
      ),
    );
  const confirmedKeys = new Set(
    rows
      .filter((event) => event.source === "provider_statement")
      .map((event) => `${event.pension_fund_id || "account"}:${event.investment_date || event.contribution_date}`),
  );
  const visibleRows = rows.filter((event) => {
    if (event.source === "provider_statement" || event.source === "manual_reconciliation") return true;
    return !confirmedKeys.has(`${event.pension_fund_id || "account"}:${event.investment_date || event.contribution_date}`);
  });
  const allThreadRows = fund
    ? visibleRows.map((event) => ({
        key: event.id,
        date: event.investment_date || event.contribution_date,
        events: [event],
        amount: Number(event.contribution_amount || 0),
      }))
    : Array.from(
        visibleRows.reduce((groups, event) => {
          const date = String(event.investment_date || event.contribution_date || event.created_at || "Unknown");
          groups.set(date, [...(groups.get(date) || []), event]);
          return groups;
        }, new Map<string, PensionContributionEvent[]>()),
      ).map(([date, groupedEvents]) => ({
        key: `pension-thread-${account.id}-${date}`,
        date,
        events: groupedEvents,
        amount: groupedEvents.reduce(
          (sum, event) => sum + Number(event.contribution_amount || 0),
          0,
        ),
      }));
  const years = Array.from(new Set(allThreadRows.map((row) => String(row.date || "").slice(0, 4)).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  const [selectedYear, setSelectedYear] = useState(years[0] || String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState("all");
  const months = Array.from(new Set(allThreadRows.filter((row) => String(row.date || "").startsWith(selectedYear)).map((row) => String(row.date || "").slice(5, 7)).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  const threadRows = allThreadRows.filter((row) => {
    const key = String(row.date || "");
    return key.startsWith(selectedYear) && (selectedMonth === "all" || key.slice(5, 7) === selectedMonth);
  });
  const latestThread = allThreadRows.find((row) => row.amount > 0 && row.events.every((event) => event.source === "provider_statement" || event.source === "manual_reconciliation")) || allThreadRows.find((row) => row.amount > 0);
  const latest = latestThread?.events[0];
  const accountValue =
    funds.reduce((sum, fund) => sum + valueOfFund(fund), 0) ||
    Number(account.current_value || 0);
  const fundAverage =
    funds.reduce((sum, fund) => sum + Number(fund.units || 0), 0) > 0
      ? accountValue /
        funds.reduce((sum, fund) => sum + Number(fund.units || 0), 0)
      : null;
  const weightedReturn = (field: "performance_annualised_5y_percent" | "performance_annualised_10y_percent") => {
    const known = funds.filter((item) => Number.isFinite(Number(item[field])));
    if (!known.length) return null;
    const weight = known.reduce((sum, item) => sum + Math.max(0, valueOfFund(item)), 0);
    return weight > 0
      ? known.reduce((sum, item) => sum + Number(item[field]) * Math.max(0, valueOfFund(item)), 0) / weight
      : known.reduce((sum, item) => sum + Number(item[field]), 0) / known.length;
  };
  const return5y = weightedReturn("performance_annualised_5y_percent");
  const return10y = weightedReturn("performance_annualised_10y_percent");
  const lastChecked = [account.last_contribution_projection_at, ...funds.flatMap((item) => [item.performance_verified_at, item.last_provider_refresh_at, item.price_as_of_date])].filter((value): value is string => Boolean(value)).sort().at(-1);
  const activeFundCount = funds.filter((item) => item.contribution_active).length;
  const monthLabel = (month: string) => new Date(Date.UTC(2026, Number(month) - 1, 1)).toLocaleDateString("en-GB", { month: "short" });
  return (
    <div className="space-y-4">
      <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:grid-cols-3 sm:gap-3">
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100 sm:p-4">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 sm:text-xs">
            Last confirmed
          </p>
          <p className="mt-1 text-lg font-black text-slate-950 sm:text-xl">
            {latestThread
              ? formatMoney(latestThread.amount)
              : "Pending"}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {latest
              ? formatThreadDate(
                  latest.investment_date || latest.contribution_date,
                )
              : "Run pension daily or add manual events"}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100 sm:p-4">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 sm:text-xs">
            {fund ? "Last unit price" : "Active funds"}
          </p>
          <p className="mt-1 text-lg font-black text-slate-950 sm:text-xl">
            {fund
              ? latest?.unit_price
                ? gbpPriceLabel(Number(latest.unit_price))
                : funds[0]?.unit_price
                  ? gbpPriceLabel(Number(funds[0].unit_price))
                  : "Pending"
              : activeFundCount}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {fund ? "Provider statement remains source of truth" : `${activeFundCount} active · ${funds.length} held in this pot`}
          </p>
        </div>
        <div className="col-span-2 rounded-2xl bg-white p-3 ring-1 ring-slate-100 sm:col-span-1 sm:p-4">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 sm:text-xs">
            {fund ? "Average value/unit" : "Current pot"}
          </p>
          <p className="mt-1 text-lg font-black text-slate-950 sm:text-xl">
            {fund
              ? fundAverage
                ? gbpPriceLabel(fundAverage)
                : "Pending"
              : formatMoney(accountValue)}
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {fund ? "Derived from current value ÷ stored units" : "Provider-confirmed funds counted once"}
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">5-year annual return</p>
          <p className="mt-1 text-xl font-black">{return5y == null ? "Building history" : `${return5y.toFixed(2)}%`}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-400">Value-weighted, verified fund history</p>
        </div>
        <div className="rounded-2xl bg-slate-950 p-4 text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">10-year annual return</p>
          <p className="mt-1 text-xl font-black">{return10y == null ? "Building history" : `${return10y.toFixed(2)}%`}</p>
          <p className="mt-1 text-[11px] font-semibold text-slate-400">Historical return, not a guarantee</p>
        </div>
        <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Last checked</p>
          <p className="mt-1 text-sm font-black text-emerald-950">{lastChecked ? new Date(lastChecked).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Not checked yet"}</p>
          <p className="mt-1 text-[11px] font-semibold text-emerald-800">Rules, prices and return evidence</p>
        </div>
      </div>
      {!fund ? (
        <details className="rounded-2xl bg-white p-4 ring-1 ring-slate-100">
          <summary className="cursor-pointer text-sm font-black text-slate-950">Fund return evidence</summary>
          <div className="mt-3 divide-y divide-slate-100">
            {funds.map((item) => (
              <div key={item.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
                <div className="min-w-0"><p className="truncate text-sm font-black text-slate-950">{item.fund_name}</p><p className="text-xs font-semibold text-slate-500">{item.contribution_active ? "Active for new contributions" : "Held · no new contributions"} · {item.performance_as_of_date || item.performance_status || "history building"}</p></div>
                <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">5y {item.performance_annualised_5y_percent == null ? "—" : `${Number(item.performance_annualised_5y_percent).toFixed(2)}%`}</span>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">10y {item.performance_annualised_10y_percent == null ? "—" : `${Number(item.performance_annualised_10y_percent).toFixed(2)}%`}</span>
                {item.performance_source_url ? <a href={item.performance_source_url} target="_blank" rel="noreferrer" className="text-xs font-black text-teal-700">Evidence ↗</a> : <span className="text-xs font-black text-amber-700">Needs evidence</span>}
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {funds.length ? (
        <details className="rounded-2xl border border-dashed border-teal-200 bg-teal-50/60 p-4">
          <summary className="cursor-pointer text-sm font-black text-teal-900">
            Add a dated pension purchase
          </summary>
          <form action={addPensionContributionEvent} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input type="hidden" name="pension_account_id" value={account.id} />
            <label className="text-xs font-black uppercase text-slate-500">
              Fund
              {fund ? (
                <><input type="hidden" name="pension_fund_id" value={fund.id} /><span className={`${inputClass} block bg-slate-50 normal-case`}>{fund.fund_name}</span></>
              ) : (
                <select name="pension_fund_id" required className={inputClass}>
                  {funds.map((item) => (
                    <option key={item.id} value={item.id}>{item.fund_name}</option>
                  ))}
                </select>
              )}
            </label>
            <label className="text-xs font-black uppercase text-slate-500">
              Contribution date
              <input name="contribution_date" type="date" required defaultValue={today} className={inputClass} />
            </label>
            <label className="text-xs font-black uppercase text-slate-500">
              Investment date
              <input name="investment_date" type="date" required defaultValue={today} className={inputClass} />
            </label>
            <label className="text-xs font-black uppercase text-slate-500">
              Purchase amount (£)
              <input name="contribution_amount" type="number" min="0" step="0.01" required className={inputClass} />
            </label>
            <label className="text-xs font-black uppercase text-slate-500">
              Unit price (£)
              <input name="unit_price" type="number" min="0" step="0.000001" className={inputClass} />
            </label>
            <label className="text-xs font-black uppercase text-slate-500">
              Units bought
              <input name="units_bought" type="number" min="0" step="0.000001" className={inputClass} />
            </label>
            <label className="text-xs font-black uppercase text-slate-500 sm:col-span-2">
              Reconciliation note
              <input name="notes" placeholder="Matched to provider statement…" className={inputClass} />
            </label>
            <div className="flex items-end lg:col-span-4">
              <SubmitButton pendingLabel="Adding purchase…">Add to pension thread</SubmitButton>
            </div>
          </form>
          <p className="mt-3 text-xs font-bold text-slate-600">
            This records the provider purchase evidence. It does not add the amount to today&apos;s pot again.
          </p>
        </details>
      ) : null}
      <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Contribution history</p><p className="mt-1 text-sm font-bold text-slate-600">Choose a year, then narrow to a month.</p></div>
          <div className="flex flex-wrap gap-2">
            {years.map((year) => <button key={year} type="button" onClick={() => { setSelectedYear(year); setSelectedMonth("all"); }} className={`rounded-full px-4 py-2 text-xs font-black ${selectedYear === year ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>{year}</button>)}
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setSelectedMonth("all")} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black ${selectedMonth === "all" ? "bg-teal-600 text-white" : "bg-teal-50 text-teal-800"}`}>All months</button>
          {months.map((month) => <button key={month} type="button" onClick={() => setSelectedMonth(month)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black ${selectedMonth === month ? "bg-teal-600 text-white" : "bg-teal-50 text-teal-800"}`}>{monthLabel(month)}</button>)}
        </div>
      </div>
      <div className="mt-3 space-y-2 sm:mt-4">
        {threadRows.map((row) => {
          const event = row.events[0];
          const rowFund = funds.find((item) => item.id === event.pension_fund_id);
          const providerConfirmed = row.events.every((item) => item.source === "provider_statement");
          const userConfirmed = row.events.every((item) => item.source === "manual_reconciliation");
          const units = row.events.reduce((sum, item) => sum + Number(item.units_bought || 0), 0);
          const fundNames = Array.from(new Set(row.events.map((item) => funds.find((candidate) => candidate.id === item.pension_fund_id)?.fund_name).filter(Boolean)));
          return (
            <details
              key={row.key}
              className="overflow-hidden rounded-2xl bg-white p-3 text-sm ring-1 ring-slate-100 sm:p-4"
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-slate-950">{formatThreadDate(row.date)}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${providerConfirmed || userConfirmed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {providerConfirmed ? "Provider confirmed" : userConfirmed ? "User confirmed" : "Projected"}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs font-bold text-slate-600 sm:text-sm">
                    {fund ? rowFund?.fund_name || account.label : `${row.events.length} fund purchases`}
                  </p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                    {units > 0 ? `${units.toFixed(4)} units recorded` : providerConfirmed ? "Contribution confirmed; purchase units not supplied" : String(event.event_status || "invested").replace(/_/g, " ")}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-black text-slate-950">{formatMoney(row.amount)}</p>
              </summary>
              <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                {!fund ? <p className="text-xs font-bold text-slate-500">{fundNames.join(" · ")}</p> : null}
                {row.events.map((purchase) => {
                  const purchaseFund = funds.find((item) => item.id === purchase.pension_fund_id);
                  const exact = purchase.source === "provider_statement" || purchase.source === "manual_reconciliation";
                  return (
                    <details key={purchase.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                      <summary className="grid cursor-pointer list-none gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center">
                        <div className="min-w-0"><p className="truncate text-xs font-black text-slate-950">{purchaseFund?.fund_name || "Pension fund"}</p><p className="text-[11px] font-semibold text-slate-500">{exact ? "Recorded purchase" : "Expected allocation"} · {Number(purchase.allocation_percent || 0).toFixed(2)}%</p></div>
                        <span className="text-xs font-black text-slate-700">{formatMoney(Number(purchase.contribution_amount || 0))}</span>
                        <span className="text-xs font-bold text-slate-500">{purchase.unit_price ? `${exact ? "Price" : "Indicative"} ${gbpPriceLabel(Number(purchase.unit_price))}` : "Price not supplied"}</span>
                        <span className="text-xs font-bold text-slate-500">{purchase.units_bought ? `${Number(purchase.units_bought).toFixed(4)} units` : "Units not supplied"}</span>
                      </summary>
                      <form action={updatePensionContributionEvent} className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                        <input type="hidden" name="id" value={purchase.id} /><input type="hidden" name="pension_account_id" value={account.id} />
                        <input type="hidden" name="employee_amount" value={Number(purchase.employee_amount || 0)} /><input type="hidden" name="employer_amount" value={Number(purchase.employer_amount || 0)} /><input type="hidden" name="employer_ni_topup_amount" value={Number(purchase.employer_ni_topup_amount || 0)} /><input type="hidden" name="fixed_amount" value={Number(purchase.fixed_amount || 0)} /><input type="hidden" name="allocation_percent" value={Number(purchase.allocation_percent ?? 100)} />
                        <label className="text-xs font-black uppercase text-slate-500">Fund<select name="pension_fund_id" required defaultValue={purchase.pension_fund_id || purchaseFund?.id} className={inputClass}>{funds.map((item) => <option key={item.id} value={item.id}>{item.fund_name}</option>)}</select></label>
                        <label className="text-xs font-black uppercase text-slate-500">Contribution date<input name="contribution_date" type="date" required defaultValue={purchase.contribution_date || today} className={inputClass} /></label>
                        <label className="text-xs font-black uppercase text-slate-500">Investment date<input name="investment_date" type="date" required defaultValue={purchase.investment_date || purchase.contribution_date || today} className={inputClass} /></label>
                        <label className="text-xs font-black uppercase text-slate-500">Status<select name="event_status" defaultValue={exact ? "invested" : purchase.event_status || "awaiting_provider_confirmation"} className={inputClass}><option value="invested">Exact purchase</option><option value="awaiting_provider_confirmation">Awaiting provider</option><option value="pending_investment">Pending investment</option></select></label>
                        <label className="text-xs font-black uppercase text-slate-500">Amount purchased (£)<input name="contribution_amount" type="number" min="0" step="0.01" required defaultValue={Number(purchase.contribution_amount || 0)} className={inputClass} /></label>
                        <label className="text-xs font-black uppercase text-slate-500">Exact unit price (£)<input name="unit_price" type="number" min="0" step="0.000001" defaultValue={purchase.unit_price ?? ""} className={inputClass} /></label>
                        <label className="text-xs font-black uppercase text-slate-500">Exact units bought<input name="units_bought" type="number" min="0" step="0.000001" defaultValue={purchase.units_bought ?? ""} className={inputClass} /></label>
                        <label className="text-xs font-black uppercase text-slate-500">Evidence note<input name="notes" defaultValue={purchase.notes || ""} className={inputClass} /></label>
                        <div className="flex items-end lg:col-span-4"><SubmitButton pendingLabel="Saving exact purchase…">Save exact purchase</SubmitButton></div>
                      </form>
                      <form action={removePensionContributionEvent} className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <input type="hidden" name="id" value={purchase.id} /><input type="hidden" name="removal_reason" value="Removed from the pension thread by the user." />
                        <p className="text-[11px] font-semibold text-slate-500">Last edited {new Date(purchase.updated_at || purchase.created_at || row.date || today).toLocaleString("en-GB")}</p>
                        <button type="submit" onClick={(clickEvent) => { if (!window.confirm("Remove this transaction from the pension thread? The audit note will be retained.")) clickEvent.preventDefault(); }} className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700">Remove transaction</button>
                      </form>
                    </details>
                  );
                })}
              </div>
            </details>
          );
        })}
        {threadRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm font-bold text-slate-500">
            No contribution events have been stored yet. The daily pension job
            will create these from pay, salary sacrifice and fund allocation
            rules; manual provider-value pensions can still be confirmed via pot
            value.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HoldingInfoPanel({
  holding,
  lots,
}: {
  holding: InvestmentHolding;
  lots: InvestmentLot[];
}) {
  const priceRows = priceBreakdownRows(holding);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <AssetLogo holding={holding} size="lg" />
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Ticker / exchange
          </p>
          <p className="mt-1 text-lg font-black text-slate-950">
            {holding.ticker || "No ticker"}
            {holding.exchange ? ` · ${exchangeLabel(holding.exchange)}` : ""}
          </p>
          <p className="text-sm font-semibold text-slate-500">
            {holding.asset_kind || "share"}
            {holding.isin ? ` · ${holding.isin}` : ""}
          </p>
        </div>
      </div>

      <CollapsibleSection title="Interactive history" subtitle="Hover the chart to inspect the exact point, value and timestamp." defaultOpen badge={<MarketStatusPill holding={holding} />}>
        <InvestmentHistoryChart
          holdingId={holding.id}
          title={`${holding.asset_name} market price history`}
          mode="price"
          refreshMs={60_000}
          prefetchRanges
        />
      </CollapsibleSection>

      <CollapsibleSection title="Pricing" subtitle="Native and GBP price, movement today, FX/cost basis" defaultOpen>
        <div>
          <p className="text-xs font-black uppercase text-slate-400">Native / GBP price</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {priceRows.map((row) => (
              <div key={row.label} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">{row.label}</p>
                <p className="mt-1 text-xl font-black text-slate-950">{row.value}</p>
                {row.note ? <p className="mt-1 text-xs font-bold text-slate-500">{row.note}</p> : null}
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-black uppercase text-slate-400">Today from market open</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Movement</p>
              <p className={`mt-1 text-xl font-black ${Number(holdingDayMoveValue(holding) || 0) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{holdingDayMoveLabel(holding)}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">Current holding value vs the opening/first stored market point today.</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Open / baseline</p>
              <p className="mt-1 text-xl font-black text-slate-950">
                {holding.day_open_price_gbp ? gbpPriceLabel(Number(holding.day_open_price_gbp)) : holding.previous_close_price_gbp ? gbpPriceLabel(Number(holding.previous_close_price_gbp)) : "—"}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-500">{holding.day_open_at ? new Date(holding.day_open_at).toLocaleString("en-GB") : `Basis: ${holdingMoveBasisLabel(holding)}`}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">FX / cost basis</p>
              <p className="mt-1 text-xl font-black text-slate-950">{holding.latest_fx_rate_to_gbp ? Number(holding.latest_fx_rate_to_gbp).toFixed(4) : "1.0000"}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {holding.latest_fx_source || "Native GBP / pence conversion"} · {holding.cost_basis_status === "known" ? "avg buy known" : "avg buy unknown"}
              </p>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Holding details" subtitle="Units, fee, allocation, source">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase text-slate-400">Units held</p>
            <p className="mt-1 font-black text-slate-950">{Number(holding.units || 0).toFixed(8)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase text-slate-400">Fee / asset type</p>
            <p className="mt-1 font-black text-slate-950">
              {Number(holding.annual_asset_fee_percent || 0).toFixed(3)}% · {holding.asset_kind || "share"}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase text-slate-400">Target allocation</p>
            <p className="mt-1 font-black text-slate-950">{Number(holding.target_allocation_percent || 0).toFixed(2)}%</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase text-slate-400">Source</p>
            <p className="mt-1 font-black text-slate-950">{holding.price_polling_enabled === false ? "Manual / no polling" : "Market worker"}</p>
          </div>
        </div>
        {holding.source_url ? (
          <a href={holding.source_url} target="_blank" rel="noreferrer" className="inline-flex rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">
            Open source
          </a>
        ) : null}
        {holding.notes ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase text-slate-400">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-600">{holding.notes}</p>
          </div>
        ) : null}
      </CollapsibleSection>

      {/* Purchase history thread — collapsed by default so the modal opens
          short; expand to see every purchase lot and ownership detail. */}
      <CollapsibleSection
        title="Purchase history"
        subtitle={`${lots.length} purchase lot${lots.length === 1 ? "" : "s"} · reconcile tranches against broker values`}
        defaultOpen={false}
        badge={<span className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white">Avg {gbpPriceLabel(averagePriceGbp(holding))}</span>}
      >
        <InvestmentOwnershipThread holding={holding} lots={lots} />
      </CollapsibleSection>
    </div>
  );
}

function PensionFundResearch({
  fund,
  provider,
}: {
  fund: PensionFund;
  provider: string;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | {
    suggested_fee_percent?: number | null;
    suggested_unit_price?: number | null;
    suggested_unit_price_quote_unit?: string | null;
    suggested_fund_code?: string | null;
    suggested_group_label?: string | null;
    suggested_source_url?: string | null;
    confidence?: number;
    research_summary?: string;
    options?: { label: string; note: string }[];
    usedOpenAi?: boolean;
  }>(null);
  const [error, setError] = useState<string | null>(null);

  async function runResearch() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/investments/fund-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pensionFundId: fund.id,
          fundName: fund.fund_name,
          provider,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Research check failed");
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Research check failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-orange-100 bg-orange-50 p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-1 h-5 w-5 text-orange-600" />
          <div>
            <p className="font-black text-orange-950">
              Server-side research helper
            </p>
            <p className="mt-1 text-sm font-semibold text-orange-900">
              Checks saved OpenAI tokens only on the server. It can suggest fee
              assumptions and source links, but you should review provider
              factsheets before accepting fees.
            </p>
          </div>
        </div>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-bold text-slate-500">Fund</p>
        <h3 className="mt-1 text-2xl font-black text-slate-950">
          {fund.fund_name}
        </h3>
        <p className="text-sm font-semibold text-slate-500">
          {provider} · current saved fee{" "}
          {formatPercentExact(fund.annual_fund_fee_percent)}% / year
        </p>
        <button
          onClick={runResearch}
          disabled={loading}
          className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Brain className="h-4 w-4" />
          )}{" "}
          {loading ? "Checking..." : "Check fund fees / options"}
        </button>
      </div>
      {error ? (
        <div className="rounded-2xl bg-red-50 p-4 text-sm font-black text-red-700">
          {error}
        </div>
      ) : null}
      {result ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                Research result{" "}
                {result.usedOpenAi
                  ? "· OpenAI-assisted"
                  : "· planning fallback"}
              </p>
              <h3 className="mt-1 text-xl font-black text-slate-950">
                Suggested fee:{" "}
                {result.suggested_fee_percent !== null &&
                result.suggested_fee_percent !== undefined
                  ? `${formatPercentExact(result.suggested_fee_percent)}% / year`
                  : "review"}
              </h3>
              <p className="mt-1 text-sm font-semibold text-slate-600">
                Unit price:{" "}
                {result.suggested_unit_price
                  ? `${(Number(result.suggested_unit_price) * 100).toFixed(2)}p`
                  : "not confidently found"}{" "}
                · Confidence: {Number(result.confidence ?? 0).toFixed(0)}%
              </p>
            </div>
            {result.suggested_source_url ? (
              <a
                href={result.suggested_source_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-orange-100 px-4 py-2 text-sm font-black text-orange-700"
              >
                Open source
              </a>
            ) : null}
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm font-semibold text-slate-700">
            {result.research_summary}
          </p>
          {result.options?.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {result.options.map((option, idx) => (
                <div
                  key={`${option.label}-${idx}`}
                  className="rounded-2xl bg-slate-50 p-4"
                >
                  <p className="font-black text-slate-950">{option.label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    {option.note}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
