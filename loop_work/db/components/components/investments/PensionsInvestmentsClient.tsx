"use client";

import { useEffect, useState } from "react";
import {
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
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Trash2,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { formatMoney } from "@/lib/format/money";
import { InvestmentHistoryChart } from "@/components/investments/InvestmentHistoryChart";
import {
  investmentProviders,
  pensionProviders,
  findProvider,
  accountOfferingsFor,
  providerValuationMode,
  providerContributionMode,
} from "@/lib/investments/provider-glossary";
import type { InvestmentDataEntitlement } from "@/lib/wealth/user-tiers";
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
  updatePensionFund,
} from "@/app/investments/actions";

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
  native_latest_price?: number | null;
  native_currency?: string | null;
  native_exchange?: string | null;
  imported_invested_value?: number | null;
  imported_current_value?: number | null;
  imported_result_value?: number | null;
  imported_account_currency?: string | null;
  import_source_type?: string | null;
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
  imported_invested_value?: number | null;
  imported_current_value?: number | null;
  imported_result_value?: number | null;
  imported_account_currency?: string | null;
  import_source_type?: string | null;
  annual_asset_fee_percent: number;
  target_allocation_percent: number;
  price_polling_enabled?: boolean | null;
  source_url: string | null;
  notes: string | null;
};
type InvestmentLot = {
  id: string;
  holding_id: string;
  purchase_date: string;
  units: number;
  purchase_price: number;
  price_quote_unit: string | null;
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
type DbPensionScheme = {
  id: string;
  person_id: string | null;
  scheme_name: string;
  provider: string;
  scheme_section: string;
  accrual_rate: number;
  revaluation_rate_percent: number;
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

type SnapTradeConnectionSummary = {
  connected: boolean;
  status: string | null;
  externalConnectionId: string | null;
  lastSyncedAt: string | null;
};

type Props = {
  people: Person[];
  pensionAccounts: PensionAccount[];
  pensionFunds: PensionFund[];
  investmentAccounts: InvestmentAccount[];
  investmentAccountOwners?: InvestmentAccountOwner[];
  investmentPieSettings?: InvestmentPieSetting[];
  investmentHoldings: InvestmentHolding[];
  investmentLots?: InvestmentLot[];
  investmentSnapshots?: InvestmentSnapshot[];
  dbPensionSchemes?: DbPensionScheme[];
  dbPensionEvents?: DbPensionServiceEvent[];
  payEvents?: PayEvent[];
  initialInvestmentViewMode?: "lines" | "squares";
  investmentDataTier?: InvestmentDataEntitlement;
  snapTradeConnection?: SnapTradeConnectionSummary;
};

type Modal =
  | { type: "pension-account"; personId?: string }
  | {
      type: "pension-fund";
      accountId?: string;
      defaults?: Partial<PensionFund>;
    }
  | { type: "provider-fund-search"; accountId?: string; provider?: string }
  | { type: "investment-account"; personId?: string }
  | { type: "edit-investment-account"; account: InvestmentAccount }
  | { type: "db-pension"; personId?: string }
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
  | null;

const inputClass =
  "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-orange-500 transition focus:ring-2";
const today = new Date().toISOString().slice(0, 10);

function valueOfFund(fund: PensionFund) {
  if (Number(fund.current_value) > 0) return Number(fund.current_value);
  return Number(fund.units ?? 0) * Number(fund.unit_price ?? 0);
}
function isGbxHolding(holding: InvestmentHolding) {
  const exchange = normalisedExchange(holding.exchange || holding.native_exchange);
  const quoteUnit = String(holding.price_quote_unit || "").toLowerCase();
  const nativeCurrency = String(holding.native_currency || "").toUpperCase();
  const importedCurrency = String(holding.imported_account_currency || "").toUpperCase();
  return exchange === "LSE" || exchange === "XLON" || quoteUnit === "gbx" || nativeCurrency === "GBX" || importedCurrency === "GBX";
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
function normaliseStoredPriceToGbp(holding: InvestmentHolding, value: number, kind: "latest" | "average") {
  const exchange = normalisedExchange(holding.exchange || holding.native_exchange);
  const quoteUnit = String(holding.price_quote_unit || "").toLowerCase();
  const nativeCurrency = String(holding.native_currency || marketCurrencyFor(exchange, holding.currency)).toUpperCase();
  if (!Number.isFinite(value) || value <= 0) return 0;
  const providerImplied = impliedGbpPriceFromProviderValue(holding);
  if (kind === "latest" && providerImplied > 0) {
    const rawAsPence = value / 100;
    const rawDistance = Math.abs(value - providerImplied) / Math.max(0.01, providerImplied);
    const penceDistance = Math.abs(rawAsPence - providerImplied) / Math.max(0.01, providerImplied);
    if (penceDistance < rawDistance || rawDistance > 20) return rawAsPence;
    if (rawDistance > 0.5 && penceDistance > 0.5) return providerImplied;
  }
  if (exchange === "LSE" || quoteUnit === "gbx" || nativeCurrency === "GBX") {
    if (quoteUnit === "gbx" || nativeCurrency === "GBX" || value >= 5) return value / 100;
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
  return normaliseStoredPriceToGbp(holding, Number(holding.average_buy_price ?? 0), "average");
}
function holdingValue(holding: InvestmentHolding) {
  if (Number(holding.imported_current_value || 0) > 0) return Number(holding.imported_current_value);
  return Number(holding.units ?? 0) * latestPriceGbp(holding);
}
function holdingCost(holding: InvestmentHolding) {
  const value = holdingValue(holding);
  const importedCost = Number(holding.imported_invested_value || 0);
  if (importedCost > 0) {
    const ratio = value > 0 ? importedCost / value : 1;
    if (isProviderImportedHolding(holding) && (ratio > 20 || ratio < 0.02)) return value;
    return importedCost;
  }
  if (isProviderImportedHolding(holding) && value > 0) return value;
  return Number(holding.units ?? 0) * averagePriceGbp(holding);
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
  if (["NMS", "NGM", "NAS", "NASDAQGS", "NASDAQ"].includes(ex)) return "NASDAQ";
  if (["NYQ", "NYSE"].includes(ex)) return "NYSE";
  if (["ASE", "AMEX", "NYSEAMERICAN"].includes(ex)) return "AMEX";
  if (["LON", "XLON", "LSE"].includes(ex)) return "LSE";
  return ex;
}
function marketCurrencyFor(exchange?: string | null, fallback?: string | null) {
  const ex = normalisedExchange(exchange);
  const fb = String(fallback || "").toUpperCase();
  if (ex === "LSE") return "GBX";
  if (["NASDAQ", "NYSE", "AMEX", "US"].includes(ex)) return "USD";
  if (fb) return fb;
  return "GBP";
}
function formatPercentExact(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value)))
    return "review";
  return String(Number(value).toFixed(4)).replace(/\.?0+$/, "");
}
function priceDisplay(holding: InvestmentHolding) {
  const exchange = normalisedExchange(holding.exchange || holding.native_exchange);
  const nativeCurrency = String(holding.native_currency || marketCurrencyFor(exchange, holding.currency)).toUpperCase();
  const gbpPrice = latestPriceGbp(holding);
  const gbp = gbpPriceLabel(gbpPrice);
  if (exchange === "LSE" || nativeCurrency === "GBX") {
    const savedLatest = Number(holding.latest_price || 0);
    const pence = holding.native_latest_price !== null && holding.native_latest_price !== undefined
      ? Number(holding.native_latest_price)
      : gbpPrice * 100;
    const prefix = savedLatest > 0 || gbpPrice > 0 ? `${pence.toFixed(2)}p` : "price pending";
    return `${prefix} · ${gbp} GBP equiv`;
  }
  if (nativeCurrency && nativeCurrency !== "GBP") {
    const native = holding.native_latest_price !== null && holding.native_latest_price !== undefined ? Number(holding.native_latest_price) : Number(holding.latest_price || 0);
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
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-t-[2rem] border border-white/70 bg-white p-6 shadow-2xl sm:rounded-[2rem]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
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

function ProviderSyncDot({ account }: { account: InvestmentAccount }) {
  const provider = String(account.external_provider || "").toLowerCase();
  if (!provider) return null;
  const isSnapTrade = provider === "snaptrade";
  const status = String(account.sync_status || "connected").toLowerCase();
  const healthy = status === "connected" || status === "synced" || status === "true";
  const dotClass = healthy ? "bg-emerald-400" : "bg-amber-300";
  const label = isSnapTrade ? "SnapTrade imported account" : `${account.external_provider} imported account`;
  return (
    <span
      className="absolute right-4 top-4 z-20 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white ring-1 ring-white/20"
      title={`${label}. Status: ${account.sync_status || "connected"}. External account: ${account.external_account_id || "saved"}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${dotClass} shadow-[0_0_0_3px_rgba(255,255,255,.18)]`} />
      {isSnapTrade ? "ST" : "API"}
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

function marketStatus(exchange?: string | null, assetKind?: string | null) {
  const ex = normalisedExchange(exchange);
  const kind = String(assetKind || "").toLowerCase();
  if (kind === "fund" || ex === "VANGUARD" || ex === "YAHOO FUND") return { label: "priced daily", className: "bg-slate-400", textClass: "text-slate-600" };
  const now = new Date();
  const day = now.getUTCDay();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (day === 0 || day === 6) return { label: "closed", className: "bg-slate-400", textClass: "text-slate-600" };
  if (ex === "LSE") {
    if (minutes >= 8 * 60 && minutes <= 16 * 60 + 30) return { label: "live market", className: "bg-emerald-500", textClass: "text-emerald-700" };
    if (minutes >= 7 * 60 && minutes < 8 * 60) return { label: "early market", className: "bg-orange-400", textClass: "text-orange-700" };
    if (minutes > 16 * 60 + 30 && minutes <= 17 * 60 + 30) return { label: "after market", className: "bg-purple-500", textClass: "text-purple-700" };
    return { label: "closed", className: "bg-slate-400", textClass: "text-slate-600" };
  }
  if (["NASDAQ", "NYSE", "AMEX", "US"].includes(ex)) {
    if (minutes >= 14 * 60 + 30 && minutes <= 21 * 60) return { label: "live market", className: "bg-emerald-500", textClass: "text-emerald-700" };
    if (minutes >= 9 * 60 && minutes < 14 * 60 + 30) return { label: "early market", className: "bg-orange-400", textClass: "text-orange-700" };
    if (minutes > 21 * 60 && minutes <= 23 * 60 + 30) return { label: "after market", className: "bg-purple-500", textClass: "text-purple-700" };
    return { label: "closed", className: "bg-slate-400", textClass: "text-slate-600" };
  }
  return { label: "quote source", className: "bg-slate-400", textClass: "text-slate-600" };
}

function MarketStatusPill({ holding }: { holding: InvestmentHolding }) {
  const status = marketStatus(
    holding.exchange || holding.native_exchange,
    holding.asset_kind,
  );
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-black ${status.textClass}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${status.className}`} />
      {status.label}
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
    AAPL: "apple.com", ABBV: "abbvie.com", ADC: "agreerealty.com", ADM: "adm.com", AFL: "aflac.com", AMZN: "amazon.com", BATS: "bat.com", BEN: "franklinresources.com", BETR: "better.com", BLK: "blackrock.com", BMO: "bmo.com", BMY: "bms.com", BNS: "scotiabank.com", C: "citigroup.com", CB: "chubb.com", CF: "cfindustries.com", CNQ: "cnq.com", CSCO: "cisco.com", CVX: "chevron.com", DUK: "duke-energy.com", ECL: "ecolab.com", EMR: "emerson.com", G4M: "gear4music.com", GAME: "gamesquare.com", GD: "gd.com", GFIN: "gfinityplc.com", GOOG: "abc.xyz", GOOGL: "abc.xyz", GOOD: "gladstonecommercial.com", IBM: "ibm.com", ITW: "itw.com", JPM: "jpmorganchase.com", JNJ: "jnj.com", KMB: "kimberly-clark.com", KO: "coca-colacompany.com", LTC: "ltcproperties.com", MA: "mastercard.com", MCD: "mcdonalds.com", MDT: "medtronic.com", MSFT: "microsoft.com", NIO: "nio.com", NUE: "nucor.com", O: "realtyincome.com", PEP: "pepsico.com", PFE: "pfizer.com", PG: "pg.com", PLUG: "plugpower.com", PNR: "pentair.com", PPG: "ppg.com", ROP: "ropertech.com", RY: "rbc.com", SBUX: "starbucks.com", SHW: "sherwin-williams.com", SLB: "slb.com", STHS: "sophiaholdings.com", SWW: "sww.com", SYY: "sysco.com", TD: "td.com", THG: "thg.com", TRP: "tcenergy.com", TROW: "troweprice.com", UBSFY: "ubisoft.com", VUSA: "vanguardinvestor.co.uk", VWRL: "vanguardinvestor.co.uk", VWRP: "vanguardinvestor.co.uk", WMT: "walmart.com",
  };
  const domain = domainMap[ticker];
  const sizeClass =
    size === "lg"
      ? "h-14 w-14 rounded-2xl text-base"
      : size === "sm"
        ? "h-8 w-8 rounded-xl text-[10px]"
        : "h-11 w-11 rounded-2xl text-xs";
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden bg-white font-black text-slate-700 ring-1 ring-slate-200 ${sizeClass}`}
    >
      <span className="grid h-full w-full place-items-center">
        {ticker.slice(0, size === "sm" ? 2 : 4)}
      </span>
      {domain ? (
        <img
          src={`https://logo.clearbit.com/${domain}`}
          alt=""
          className="absolute inset-0 h-full w-full bg-white object-contain p-1.5"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </span>
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

function providerAccountValueFromRaw(account: InvestmentAccount) {
  const raw = account.external_account_raw || {};
  const candidates = [raw?.loop_holdings_value, raw?.loop_balance_value, raw?.balance?.total?.amount, raw?.balance?.total, raw?.total_value?.amount, raw?.total_value, raw?.market_value?.amount, raw?.market_value, raw?.value?.amount, raw?.value];
  for (const item of candidates) {
    const number = Number(item);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}
function accountDisplayValue(account: InvestmentAccount, holdings: InvestmentHolding[]) {
  const holdingsTotal = holdings.reduce((sum, holding) => sum + holdingValue(holding), 0);
  const providerTotal = providerAccountValueFromRaw(account);
  if (String(account.external_provider || "").toLowerCase() === "snaptrade" && providerTotal > 0) return providerTotal;
  return holdingsTotal;
}
function accountUnmappedValue(account: InvestmentAccount, holdings: InvestmentHolding[]) {
  const providerTotal = providerAccountValueFromRaw(account);
  const holdingsTotal = holdings.reduce((sum, holding) => sum + holdingValue(holding), 0);
  if (String(account.external_provider || "").toLowerCase() !== "snaptrade" || providerTotal <= 0) return 0;
  const diff = providerTotal - holdingsTotal;
  return Math.abs(diff) >= 0.5 ? diff : 0;
}
function providerSyncLabel(account: InvestmentAccount) {
  if (String(account.external_provider || "").toLowerCase() !== "snaptrade") return "Manual pot";
  if (account.sync_status) return `SnapTrade · ${String(account.sync_status).replace(/_/g, " ")}`;
  return "SnapTrade synced";
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
              {item.share.toFixed(1)}% · {item.pct >= 0 ? "+" : ""}
              {item.pct.toFixed(1)}%
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
  investmentViewMode,
  onInfo,
  onEdit,
}: {
  holding: InvestmentHolding;
  lots: InvestmentLot[];
  investmentViewMode: "lines" | "squares";
  onInfo: () => void;
  onEdit: () => void;
}) {
  const { value, cost, pl, pct } = holdingPl(holding);
  return (
    <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5">
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
                {holding.exchange ? ` · ${holding.exchange}` : ""}
                {holding.isin ? ` · ${holding.isin}` : ""} ·{" "}
                {Number(holding.units).toFixed(8)} units · latest{" "}
                {priceDisplay(holding)}
              </p>
              {holding.import_source_type ? (
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Provider-synced holding · values refresh through Integrations.
                </p>
              ) : null}
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {holding.group_label || (holding.import_source_type ? "Provider synced" : "Holding")} · fee{" "}
                {Number(holding.annual_asset_fee_percent).toFixed(3)}%/yr{" "}
                {lots.length ? `· ${lots.length} purchase lot(s)` : ""}
              </p>
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
            title={`${holding.asset_name} history`}
            mode="value"
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
          <p
            className={`text-sm font-black ${pl >= 0 ? "text-emerald-700" : "text-red-600"}`}
          >
            {formatMoney(pl)} · {pct.toFixed(1)}%
          </p>
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
            Pie allocation
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
            <p
              className={`text-sm font-black ${pl >= 0 ? "text-emerald-700" : "text-red-600"}`}
            >
              {formatMoney(pl)} · {pct.toFixed(1)}%
            </p>
          </div>
          <button
            type="button"
            onClick={onSettings}
            className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
            title="Pie settings"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
          >
            {open ? "Collapse pie" : "Open pie"}
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
                  placeholder="Search stocks in this pie by ticker or name"
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
              {pieSetting?.reinvest_frequency || "monthly"}. Dividend estimate:{" "}
              {formatMoney(dividendAnnual)}/yr at {dividendYield.toFixed(2)}%.
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
          Pie is bundled by default · {holdings.length} holding(s) hidden · open pie to inspect individual stocks and allocation.
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
              lots={investmentLots.filter(
                (lot) => lot.holding_id === holding.id,
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
              step="0.001"
              placeholder="e.g. 17.5"
            />
            <FormInput
              label="Employer contribution %"
              name="employer_contribution_percent"
              type="number"
              step="0.001"
              placeholder="e.g. 3"
            />
            <label className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">
              <input type="checkbox" name="employer_ni_topup_enabled" />{" "}
              Employer NI saving is topped into pension
            </label>
            <FormInput
              label="Employer NI top-up %"
              name="employer_ni_topup_percent"
              type="number"
              step="0.001"
              placeholder="Use only if the top-up is a fixed %"
            />
            <FormInput
              label="Fixed monthly contribution"
              name="fixed_monthly_contribution"
              type="number"
              step="0.01"
              placeholder="Use when the NI saving/extra contribution is an actual £ amount"
            />
            <FormInput
              label="Platform fee % / year"
              name="annual_platform_fee_percent"
              type="number"
              step="0.0001"
              defaultValue={defaultFee}
              placeholder="Confirm provider fee"
            />
            <FormInput
              label="Fixed monthly fee"
              name="fixed_monthly_fee"
              type="number"
              step="0.01"
              defaultValue={defaultMonthly}
              placeholder="Subscription/platform monthly cost"
            />
            <FormInput
              label="Current total value"
              name="current_value"
              type="number"
              step="0.01"
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
        step="0.01"
        defaultValue={defaults?.current_value ?? ""}
      />
      <FormInput
        label="Units"
        name="units"
        type="number"
        step="0.00000001"
        defaultValue={defaults?.units ?? ""}
      />
      <FormInput
        label="Unit price"
        name="unit_price"
        type="number"
        step="0.00000001"
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
        step="0.001"
        defaultValue={defaults?.target_allocation_percent ?? ""}
      />
      <FormInput
        label="Monthly contribution %"
        name="monthly_contribution_percent"
        type="number"
        step="0.001"
        defaultValue={defaults?.monthly_contribution_percent ?? ""}
      />
      <FormInput
        label="Fund fee % / year"
        name="annual_fund_fee_percent"
        type="number"
        step="0.0001"
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
        step="0.01"
        defaultValue={fund.current_value}
      />
      <FormInput
        label="Units"
        name="units"
        type="number"
        step="0.00000001"
        defaultValue={fund.units ?? ""}
      />
      <FormInput
        label="Unit price"
        name="unit_price"
        type="number"
        step="0.00000001"
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
        step="0.001"
        defaultValue={fund.target_allocation_percent}
      />
      <FormInput
        label="Monthly contribution %"
        name="monthly_contribution_percent"
        type="number"
        step="0.001"
        defaultValue={fund.monthly_contribution_percent}
      />
      <FormInput
        label="Fund fee % / year"
        name="annual_fund_fee_percent"
        type="number"
        step="0.0001"
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
  return (
    <form action={addInvestmentAccount} className="space-y-5">
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
          placeholder={`${providerName} ISA, GIA or pie`}
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
          step="0.0001"
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
          step="0.01"
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
      <SubmitButton>Add investment pot</SubmitButton>
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
          step="0.0001"
          defaultValue={account.annual_platform_fee_percent}
        />
        <FormInput
          label="Fixed monthly fee"
          name="fixed_monthly_fee"
          type="number"
          step="0.01"
          defaultValue={account.fixed_monthly_fee}
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
};
type QuoteCandidate = NonNullable<QuoteResult>;
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
    if (mode === "manual") setQuoteNote("");
    setQuote(null);
    try {
      const response = await fetch("/api/investments/quote-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, exchange }),
      });
      const payload = await response.json();
      const candidates = Array.isArray(payload.matches)
        ? payload.matches
        : payload.quote
          ? [payload.quote]
          : [];
      setMatches(candidates);
      setQuoteNote(
        payload.note ||
          (candidates.length
            ? "Choose the exact stock, ETF or provider fund before adding it. Manual entries are allowed, but are clearly marked as manual."
            : "No match found."),
      );
    } catch (error) {
      setQuoteNote(
        error instanceof Error ? error.message : "Investment search failed",
      );
    } finally {
      setSearching(false);
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
              label="Group / pie label"
              name="group_label"
              placeholder="Trading 212 Pie A, AI, Global ETF"
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
                step="0.000001"
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
                step="0.0001"
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
                  step="0.00000001"
                  required
                />
                <FormInput
                  label="Average purchase price"
                  name="average_buy_price"
                  type="number"
                  step="0.000001"
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
                          step="0.00000001"
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
                          step="0.000001"
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
                          step="0.01"
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
              step="0.001"
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
        label="Group / pie label"
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
        step="0.00000001"
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
        step="0.000001"
        defaultValue={avgDisplay}
      />
      <FormInput
        label="Latest price"
        name="latest_price"
        type="number"
        step="0.000001"
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
        step="0.0001"
        defaultValue={holding.annual_asset_fee_percent}
      />
      <FormInput
        label="Target allocation %"
        name="target_allocation_percent"
        type="number"
        step="0.001"
        defaultValue={holding.target_allocation_percent}
      />
      <FormInput
        label="Source URL"
        name="source_url"
        defaultValue={holding.source_url ?? ""}
      />
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
function BulkHoldingsForm({
  accounts,
  defaultAccountId,
}: {
  accounts: InvestmentAccount[];
  defaultAccountId?: string;
}) {
  return (
    <form action={importInvestmentHoldingsBulk} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">
            Investment pot
          </span>
          <select
            name="investment_account_id"
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
          placeholder={
            "Name,Ticker,Exchange,Units,Average Buy Price,Latest Price,Group\nGear4music,G4M,LSE,414.96000000,241,250,My 52-stock pie"
          }
        />
      </label>
      <div className="rounded-3xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">
        Trading 212 pie exports are auto-detected by the Slice / Invested value
        / Value / Owned quantity columns. The app keeps exported cost/current
        value in the account currency, then separately tries to identify the
        native exchange/quote for each ticker.
      </div>
      <SubmitButton>Import holdings</SubmitButton>
    </form>
  );
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
function projectedAccountMonthlyContribution(
  account: PensionAccount,
  payEvents: PayEvent[],
) {
  const pay = activePayForPerson(payEvents, account.person_id);
  const grossMonthly = pay ? Number(pay.gross_annual_salary || 0) / 12 : 0;
  const totalPercent =
    Number(account.employee_contribution_percent || 0) +
    Number(account.employer_contribution_percent || 0) +
    (account.employer_ni_topup_enabled
      ? Number(account.employer_ni_topup_percent || 0)
      : 0);
  return (
    Number(account.fixed_monthly_contribution || 0) +
    grossMonthly * (totalPercent / 100)
  );
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
  const pensionValue =
    pensionAccounts
      .filter((account) => account.person_id === personId)
      .reduce((sum, account) => sum + Number(account.current_value || 0), 0) +
    pensionFunds
      .filter((fund) => pensionAccountIds.has(fund.pension_account_id))
      .reduce((sum, fund) => sum + valueOfFund(fund), 0);
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
  const accounts = investmentAccounts.filter((account) => investmentAccountIds.has(account.id));
  const holdings = investmentHoldings.filter((holding) =>
    investmentAccountIds.has(holding.investment_account_id),
  );
  const investmentValue = accounts.reduce(
    (sum, account) => sum + accountDisplayValue(account, holdings.filter((holding) => holding.investment_account_id === account.id)),
    0,
  );
  const investmentCost = accounts.reduce((sum, account) => {
    const accountHoldings = holdings.filter((holding) => holding.investment_account_id === account.id);
    const unmapped = accountUnmappedValue(account, accountHoldings);
    return sum + accountHoldings.reduce((holdingSum, holding) => holdingSum + holdingCost(holding), 0) + (unmapped > 0 ? unmapped : 0);
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
  const byKey = new Map<string, number>();
  snapshots
    .filter((snapshot) => holdingIds.has(snapshot.holding_id))
    .forEach((snapshot) => {
      const key = snapshot.snapshot_at || snapshot.snapshot_date || "";
      if (!key) return;
      byKey.set(
        key,
        (byKey.get(key) || 0) +
          Number(
            snapshot.value ||
              Number(snapshot.price || 0) * Number(snapshot.units || 0),
          ),
      );
    });
  return Array.from(byKey.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }))
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
      <WizardProgress step={2} total={2} labels={["Scheme", "Service setup"]} />
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
          step="0.01"
          placeholder={isNhs ? "CPI + 1.5 etc" : "CPI / scheme-specific"}
        />
        <FormInput
          label="Notes"
          name="notes"
          placeholder="Employer, membership notes, McCloud/remedy notes"
        />
      </div>
      <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">
        Defined benefit pensions do not use stock units or live market prices.
        After this, add service/banding logs so LOOP can estimate accrued annual
        pension.
      </div>
      <SubmitButton>Add DB pension</SubmitButton>
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
        step="0.01"
        required
      />
      <FormInput
        label="Member contribution %"
        name="contribution_percent"
        type="number"
        step="0.001"
        placeholder="9.8"
      />
      <FormInput
        label="Employer contribution %"
        name="employer_contribution_percent"
        type="number"
        step="0.001"
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
                            {position.groupLabel ? ` · ${position.groupLabel}` : ""}
                          </span>
                          <span className="shrink-0 font-black text-slate-950">
                            {formatMoney(Number(position.value || 0))}
                          </span>
                        </div>
                      ))}
                    </div>
                    {account.positions.length > 5 ? (
                      <p className="mt-2 text-[11px] font-black text-slate-400">
                        +{account.positions.length - 5} more position(s) will import as individual holdings.
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
                        : reviewAccount.holdingsValue || reviewAccount.balanceValue
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
                          These will import as normal LOOP holding cards, so the account shows each stock/ETF rather than one summary value. If SnapTrade exposes a pie/portfolio label, LOOP uses it as the group/pie label.
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
                                {position.exchange ? ` · ${position.exchange}` : ""}
                                {position.groupLabel ? ` · ${position.groupLabel}` : ""}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {Number(position.units || 0).toFixed(8)} units · latest {formatMoney(Number(position.latestPrice || 0))}
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
                ) : (reviewAccount.holdingsValue || reviewAccount.balanceValue) ? (
                  <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4 text-sm font-bold text-amber-900">
                    SnapTrade has returned an account-level value, but not the stock/ETF positions yet. You can import the value as a temporary placeholder, then use Refresh SnapTrade account later; when positions become available, LOOP archives the placeholder and replaces it with the individual holding cards.
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

export function PensionsInvestmentsClient({
  people,
  pensionAccounts,
  pensionFunds,
  investmentAccounts,
  investmentAccountOwners = [],
  investmentPieSettings = [],
  investmentHoldings,
  investmentLots = [],
  investmentSnapshots = [],
  dbPensionSchemes = [],
  dbPensionEvents = [],
  payEvents = [],
  initialInvestmentViewMode = "lines",
  investmentDataTier,
  snapTradeConnection,
}: Props) {
  const [area, setArea] = useState<"pensions" | "db" | "investments">(
    "investments",
  );
  const [personFilter, setPersonFilter] = useState(() => people.find((person) => String(person.relationship || "").toLowerCase().includes("self"))?.id || people[0]?.id || "all");
  const [modal, setModal] = useState<Modal>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [expandedInvestmentChartId, setExpandedInvestmentChartId] = useState<
    string | null
  >(null);
  const [investmentViewMode, setInvestmentViewMode] = useState<
    "lines" | "squares"
  >(initialInvestmentViewMode);
  const [collapsedInvestmentAccountIds, setCollapsedInvestmentAccountIds] =
    useState<Set<string>>(new Set());
  const [showInvestmentTierInfo, setShowInvestmentTierInfo] = useState(false);
  const [syncingSnapTradeAccountId, setSyncingSnapTradeAccountId] =
    useState<string | null>(null);

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
        throw new Error(payload.error || "Could not refresh SnapTrade positions.");
      }
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not refresh SnapTrade positions.");
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
  const filteredDbPensionSchemes = dbPensionSchemes.filter(
    (scheme) =>
      personFilter === "all" ||
      scheme.person_id === personFilter ||
      (!scheme.person_id && personFilter === "household"),
  );

  useEffect(() => {
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
  ]);

  const pensionTotal =
    pensionFunds.reduce((sum, fund) => sum + valueOfFund(fund), 0) +
    pensionAccounts.reduce(
      (sum, account) => sum + Number(account.current_value || 0),
      0,
    );
  const investmentTotal = investmentAccounts.reduce(
    (sum, account) => sum + accountDisplayValue(account, investmentHoldings.filter((holding) => holding.investment_account_id === account.id)),
    0,
  );
  const investmentCost = investmentAccounts.reduce((sum, account) => {
    const holdings = investmentHoldings.filter((holding) => holding.investment_account_id === account.id);
    const unmapped = accountUnmappedValue(account, holdings);
    return sum + holdings.reduce((holdingSum, holding) => holdingSum + holdingCost(holding), 0) + (unmapped > 0 ? unmapped : 0);
  }, 0);
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

  return (
    <main className="mx-auto w-[95vw] max-w-[2000px] space-y-7 px-4 py-8 sm:px-6 lg:px-8">
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
              provider wrapper first, then add funds, holdings, pies or purchase
              lots inside the pot.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl bg-white/20 p-5 backdrop-blur">
              <p className="text-xs font-black uppercase text-slate-200">
                Pensions
              </p>
              <p className="mt-2 text-2xl font-black">
                {formatMoney(pensionTotal)}
              </p>
            </div>
            <div className="rounded-3xl bg-white/20 p-5 backdrop-blur">
              <p className="text-xs font-black uppercase text-slate-200">
                Investments
              </p>
              <p className="mt-2 text-2xl font-black">
                {formatMoney(investmentTotal)}
              </p>
            </div>
            <div className="rounded-3xl bg-emerald-400/20 p-5 backdrop-blur">
              <p className="text-xs font-black uppercase text-emerald-100">
                Investment P/L
              </p>
              <p className="mt-2 text-2xl font-black text-emerald-100">
                {formatMoney(investmentTotal - investmentCost)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowInvestmentTierInfo(true)}
              className="rounded-3xl bg-white/20 p-5 text-left backdrop-blur transition hover:bg-white/25"
            >
              <p className="text-xs font-black uppercase text-slate-200">
                Market data tier
              </p>
              <p className="mt-2 text-2xl font-black">{dataTier.badge}</p>
              <p className="mt-1 text-xs font-bold text-slate-200">
                Tap to view tier and upgrade options
              </p>
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-lg">
        <div className="flex w-full flex-col gap-4 rounded-[1.5rem] bg-slate-50 p-4 text-left lg:flex-row lg:items-center lg:justify-between">
          <button
            type="button"
            onClick={() => setShowInvestmentTierInfo(true)}
            className="text-left"
          >
            <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">
              Market data tier
            </p>
            <h2 className="text-xl font-black text-slate-950">
              {dataTier.label}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Click to see what your investment tier includes.
            </p>
            {dataTier.canConnectPaidProvider &&
            !dataTier.canUseRealtimePrices ? (
              <p className="mt-2 text-xs font-black text-blue-700">
                Your tier can connect a provider. Realtime prices activate once
                SnapTrade is connected and admin/provider status is healthy.
              </p>
            ) : null}
          </button>
          <div className="flex min-w-[260px] flex-col gap-2 lg:items-end">
            <button
              type="button"
              onClick={() => setShowInvestmentTierInfo(true)}
              className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white"
            >
              View tier / upgrade
            </button>
            {dataTier.canConnectPaidProvider ? (
              <a
                href="/integrations"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-5 py-3 text-sm font-black text-blue-700"
              >
                <ExternalLink className="h-4 w-4" /> Manage broker imports
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {dataTier.canConnectPaidProvider ? (
        <section className="rounded-[2rem] border border-blue-100 bg-blue-50/80 p-4 shadow-lg">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-700">Broker imports</p>
              <h2 className="text-xl font-black text-slate-950">Manage Trading 212 / SnapTrade accounts in Integrations</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">Import each ISA, GIA or SIPP separately from the Integrations page. This portfolio view only shows the pots you have chosen to track.</p>
            </div>
            <a href="/integrations" className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-black text-white"><ExternalLink className="h-4 w-4" /> Open integrations</a>
          </div>
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-lg">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">
              Users
            </p>
            <h2 className="text-xl font-black text-slate-950">
              Portfolio view
            </h2>
          </div>
          <p className="text-xs font-bold text-slate-500">
            Tap a member to filter. Tap the mini chart to open that person’s
            tracked movement.
          </p>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {ownerCards.map((card) => {
            const cardPoints = aggregateSnapshots(
              investmentSnapshots,
              holdingsForOwnerCard(card.id),
            );
            const pl =
              card.summary.investmentValue - card.summary.investmentCost;
            const person =
              card.id !== "all" && card.id !== "household"
                ? people.find((item) => item.id === card.id)
                : null;
            return (
              <button
                key={card.id}
                onClick={() => setPersonFilter(card.id)}
                className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[1.5rem] border-2 bg-white px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 ${personFilter === card.id ? "border-orange-400 shadow-orange-200/60" : "border-slate-100"}`}
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
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-slate-950">
                    {card.name}
                  </span>
                  <span className="block text-xs font-bold text-slate-500">
                    Investments {formatMoney(card.summary.investmentValue)} · Pensions {formatMoney(card.summary.pensionValue)}
                  </span>
                  <span
                    className={`block text-xs font-black ${pl >= 0 ? "text-emerald-700" : "text-red-600"}`}
                  >
                    {card.summary.investmentValue
                      ? `${formatMoney(pl)} P/L`
                      : "No investment value yet"}
                  </span>
                </span>
                <span className="justify-self-end">
                  <TinySparkline points={cardPoints} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {areaOptions.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                onClick={() => setArea(option.value)}
                className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-black shadow-sm ${area === option.value ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
              >
                <Icon className="h-4 w-4" /> {option.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {area === "pensions" ? (
        <section className="space-y-5">
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
            const total = fundTotal || Number(account.current_value || 0);
            return (
              <div
                key={account.id}
                className="relative overflow-hidden rounded-[2.25rem] border border-white/70 bg-white shadow-[0_28px_90px_-62px_rgba(15,23,42,.75)]"
              >
                <OwnerBadge people={people} personId={account.person_id} />
                <div className="grid lg:grid-cols-[1fr_340px]">
                  <div className="p-6">
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
                      <form action={deletePensionAccount}>
                        <input type="hidden" name="id" value={account.id} />
                        <button className="text-sm font-bold text-red-600">
                          Delete
                        </button>
                      </form>
                    </div>
                    <div className="mt-6">
                      <AllocationBar funds={funds} />
                    </div>
                    <div className="mt-5 space-y-3">
                      {funds.map((fund) => (
                        <article
                          key={fund.id}
                          className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5"
                        >
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
                  <aside className="bg-gradient-to-br from-slate-950 to-slate-800 p-6 text-white">
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-300">
                      Pot value
                    </p>
                    <p className="mt-2 text-4xl font-black">
                      {formatMoney(total)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-300">
                      Provider/fund values update when refreshed or edited
                    </p>
                    <div className="mt-6 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                      <p className="text-sm font-bold text-slate-200">
                        Estimated fees
                      </p>
                      <p className="mt-1 text-2xl font-black">
                        {formatMoney(
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
                            ),
                        )}
                        <span className="text-sm font-bold text-slate-300">
                          {" "}
                          / month
                        </span>
                      </p>
                    </div>
                    {account.employer_ni_topup_enabled ? (
                      <div className="mt-4 rounded-3xl bg-emerald-400/15 p-4 text-sm font-bold text-emerald-100">
                        Employer NI top-up enabled ·{" "}
                        {Number(account.employer_ni_topup_percent || 0).toFixed(
                          2,
                        )}
                        %
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

      {area === "db" ? (
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
                Choose Bethany, then add her NHS pension and log banding/pay
                periods over time.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {area === "investments" ? (
        <section className="space-y-5">
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_2fr]">
            <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-500">Market value</p>
              <p className="mt-3 text-3xl font-black">
                {formatMoney(investmentTotal)}
              </p>
            </div>
            <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-500">Cost basis</p>
              <p className="mt-3 text-3xl font-black">
                {formatMoney(investmentCost)}
              </p>
            </div>
            <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-sm">
              <p className="text-sm font-bold text-slate-500">Gain / loss</p>
              <p
                className={`mt-3 text-3xl font-black ${investmentTotal - investmentCost >= 0 ? "text-emerald-700" : "text-red-600"}`}
              >
                {formatMoney(investmentTotal - investmentCost)}
              </p>
            </div>
            <MiniValueLine
              points={allInvestmentSnapshotPoints}
              emptyLabel="No portfolio snapshots yet — run a price refresh to fill this chart."
            />
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
            const total = accountDisplayValue(account, holdings);
            const unmappedProviderValue = accountUnmappedValue(account, holdings);
            const groupNames = Array.from(
              new Set(
                holdings.map((holding) => holding.group_label).filter(Boolean),
              ),
            ) as string[];
            const accountCost = holdings.reduce(
              (sum, holding) => sum + holdingCost(holding),
              0,
            ) + (unmappedProviderValue > 0 ? unmappedProviderValue : 0);
            const accountPl = total - accountCost;
            const fundCount = holdings.filter(
              (holding) =>
                holding.asset_kind === "fund" || holding.asset_kind === "etf",
            ).length;
            const collapsed = collapsedInvestmentAccountIds.has(account.id);
            const groupedByPie = new Map<string, InvestmentHolding[]>();
            holdings.forEach((holding) => {
              const label = String(holding.group_label || "").trim();
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
                <ProviderSyncDot account={account} />
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
                        </div>
                        <p className="mt-1 text-sm font-semibold text-slate-300">
                          {account.provider} · {holdings.length} holding(s) · {fundCount} fund/ETF item(s) · {providerSyncLabel(account)}
                        </p>
                        {unmappedProviderValue > 0.5 ? (
                          <p className="mt-1 text-xs font-bold text-amber-200">
                            Provider total includes {formatMoney(unmappedProviderValue)} cash/unmapped value not returned as positions yet.
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[160px_1fr_1fr_1fr_48px] lg:min-w-[680px]">
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
                          Gain / loss
                        </p>
                        <p
                          className={`mt-1 text-2xl font-black ${accountPl >= 0 ? "text-emerald-100" : "text-red-100"}`}
                        >
                          {formatMoney(accountPl)}
                        </p>
                      </div>
                      <div className="rounded-3xl bg-white/10 p-4 text-right">
                        <p className="text-xs font-black uppercase text-slate-300">
                          Fees
                        </p>
                        <p className="mt-1 text-lg font-black">
                          {Number(
                            account.annual_platform_fee_percent || 0,
                          ).toFixed(3)}
                          %
                        </p>
                        <p className="text-xs font-bold text-slate-300">
                          + {formatMoney(account.fixed_monthly_fee || 0)}/mo
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          toggleInvestmentAccountCollapse(account.id)
                        }
                        className="inline-flex h-full min-h-[5.5rem] items-center justify-center rounded-3xl bg-white/10 text-white ring-1 ring-white/10 hover:bg-white/15"
                        title={collapsed ? "Open pot" : "Collapse pot"}
                      >
                        {collapsed ? (
                          <Plus className="h-4 w-4" />
                        ) : (
                          <span className="text-2xl leading-none">−</span>
                        )}
                      </button>
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
                            lots={investmentLots.filter(
                              (lot) => lot.holding_id === holding.id,
                            )}
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
                        {holdings.length === 0 ? (
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
                        {String(account.external_provider || "").toLowerCase() === "snaptrade" ? (
                          <button
                            type="button"
                            onClick={() => refreshSnapTradeInvestmentAccount(account)}
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
                            Trading 212 pie
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
          <AddPensionAccountForm
            people={people}
            defaultPersonId={modal.personId}
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
            <AddPensionFundForm
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
          <AddInvestmentAccountForm
            people={people}
            defaultPersonId={modal.personId}
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
      {modal?.type === "investment-pie-settings" ? (
        <ModalShell
          title={`${modal.groupLabel} settings`}
          description="Set regular reinvestment assumptions and dividend reinvestment for this pie."
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
          <HoldingInfoPanel holding={modal.holding} />
        </ModalShell>
      ) : null}
      {modal?.type === "investment-holding" ? (
        <ModalShell
          title="Add holding inside investment pot"
          description="Search by company, ETF full name, ticker, ISIN or provider fund first, then add units and purchase price."
          onClose={() => setModal(null)}
        >
          {investmentAccounts.length ? (
            <AddInvestmentHoldingForm
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
          title="Bulk import pie holdings"
          description="Paste many holdings at once from Trading 212/Revolut exports or text extracted from a screenshot."
          onClose={() => setModal(null)}
        >
          {investmentAccounts.length ? (
            <BulkHoldingsForm
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
  return (
    <form action={updateInvestmentPieSetting} className="space-y-5">
      <input type="hidden" name="investment_account_id" value={account.id} />
      <input type="hidden" name="group_label" value={groupLabel} />
      <div className="rounded-3xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold text-blue-900">
        This controls the assumptions for this Trading 212 pie only. It does not
        show as a public tag on the pot; it is used for reinvestment and
        dividend projections.
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormInput
          label="Regular reinvest amount"
          name="monthly_reinvest_amount"
          type="number"
          step="0.01"
          defaultValue={String(setting?.monthly_reinvest_amount ?? 0)}
        />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">How often?</span>
          <select
            name="reinvest_frequency"
            defaultValue={setting?.reinvest_frequency || "monthly"}
            className={inputClass}
          >
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
          </select>
        </label>
        <FormInput
          label="Estimated dividend yield %"
          name="expected_dividend_yield_percent"
          type="number"
          step="0.01"
          defaultValue={String(setting?.expected_dividend_yield_percent ?? 0)}
        />
        <label className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 text-sm font-black text-slate-700">
          <input
            type="checkbox"
            name="auto_reinvest_dividends"
            defaultChecked={setting?.auto_reinvest_dividends ?? true}
            className="h-4 w-4"
          />{" "}
          Reinvest dividends back into this pie
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-slate-400">
            Current pie value
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
            Holdings in pie
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
      <SubmitButton>Save pie settings</SubmitButton>
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

function HoldingInfoPanel({ holding }: { holding: InvestmentHolding }) {
  const priceRows = priceBreakdownRows(holding);
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <AssetLogo holding={holding} size="lg" />
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Ticker / exchange
          </p>
          <p className="mt-1 text-lg font-black text-slate-950">
            {holding.ticker || "No ticker"}
            {holding.exchange ? ` · ${holding.exchange}` : ""}
          </p>
          <p className="text-sm font-semibold text-slate-500">
            {holding.asset_kind || "share"}
            {holding.isin ? ` · ${holding.isin}` : ""}
          </p>
        </div>
      </div>
      <div className="rounded-3xl bg-slate-50 p-4">
        <p className="text-xs font-black uppercase text-slate-400">
          Native / GBP price
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {priceRows.map((row) => (
            <div
              key={row.label}
              className="rounded-2xl bg-white p-4 ring-1 ring-slate-100"
            >
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                {row.label}
              </p>
              <p className="mt-1 text-xl font-black text-slate-950">
                {row.value}
              </p>
              {row.note ? (
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {row.note}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-slate-400">
            Units held
          </p>
          <p className="mt-1 font-black text-slate-950">
            {Number(holding.units || 0).toFixed(8)}
          </p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-slate-400">
            Fee / asset type
          </p>
          <p className="mt-1 font-black text-slate-950">
            {Number(holding.annual_asset_fee_percent || 0).toFixed(3)}% ·{" "}
            {holding.asset_kind || "share"}
          </p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-slate-400">
            Target allocation
          </p>
          <p className="mt-1 font-black text-slate-950">
            {Number(holding.target_allocation_percent || 0).toFixed(2)}%
          </p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-slate-400">Source</p>
          <p className="mt-1 font-black text-slate-950">
            {holding.source_url ? "Saved" : "Not saved"}
          </p>
        </div>
      </div>
      {holding.source_url ? (
        <a
          href={holding.source_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white"
        >
          Open source
        </a>
      ) : null}
      {holding.notes ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase text-slate-400">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-600">
            {holding.notes}
          </p>
        </div>
      ) : null}
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
