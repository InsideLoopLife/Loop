"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { SubmitButton } from "@/components/SubmitButton";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { HomeWizard } from "@/components/mortgage/HomeWizard";
import { MortgageWizard } from "@/components/mortgage/MortgageWizard";
import { ValuationWizard } from "@/components/mortgage/ValuationWizard";
import { MoveQueryWizard } from "@/components/mortgage/MoveQueryWizard";
import { formatMoney } from "@/lib/format/money";
import {
  calculateMonthlyMortgagePayment,
  calculateProjectedMortgageBalance,
  estimateTotalInterest,
} from "@/lib/calculations/mortgage";
import { calculateStampDutyEngland } from "@/lib/calculations/property";
import type { MonthPlan } from "@/lib/planning/month-plan";
import {
  addHome,
  addHomeMortgageDeal,
  addHomeValuationSource,
  addMortgageScenario,
  addPropertyMoveQuery,
  archivePropertyMoveQuery,
  deleteHome,
  deleteHomeMortgageDeal,
  deleteHomeValuationSource,
  deleteMortgageScenario,
  reportMortgageRecommendationIssue,
  saveMortgageDealPreference,
  updateMortgageWorkspacePreference,
  updateHome,
  updateHomeMortgageDeal,
  updateHomeValuationSource,
} from "@/app/mortgage/actions";

export type MortgageScenario = {
  id: string;
  name: string;
  balance: number;
  interest_rate: number;
  term_years: number;
  monthly_overpayment: number;
};

export type Person = {
  id: string;
  name: string;
  relationship: string;
  birth_date?: string | null;
};

export type Home = {
  id: string;
  label: string;
  house_number: string | null;
  address_line: string | null;
  postcode: string | null;
  full_address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  map_url: string | null;
  lookup_source: string | null;
  uprn: string | null;
  property_type: string | null;
  purchase_source_url: string | null;
  last_lookup_at: string | null;
  ownership_status: string;
  property_value: number;
  estimated_value_low: number | null;
  estimated_value_mid: number | null;
  estimated_value_high: number | null;
  estimated_value_date: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  target_purchase_price: number | null;
  target_extra_cash: number | null;
  target_interest_rate: number | null;
  target_term_years: number | null;
  notes: string | null;
};

export type HomeOwner = {
  id: string;
  home_id: string;
  person_id: string;
  ownership_percent: number | null;
};

export type HomeMortgageLiabilityAllocation = {
  id: string;
  home_mortgage_deal_id: string;
  person_id: string;
  liability_percent: number | null;
};

export type MortgageDealPreference = {
  id: string;
  home_id: string | null;
  source_kind: "market" | "recommendation";
  source_id: string;
  is_shortlisted: boolean;
  is_starred: boolean;
};

export type MortgageWorkspacePreference = {
  moving_home_label: string;
  moving_home_description: string;
};

type MortgageComparisonBubble = {
  lender: string;
  product: string;
  rate: number;
  payment: number;
  monthlyDelta: number;
  sourceKind: "market" | "recommendation" | "fallback";
  sourceId: string;
} | null;

export type HomeMortgageDeal = {
  id: string;
  home_id: string | null;
  lender: string | null;
  product_name: string | null;
  balance: number;
  balance_as_of_date: string | null;
  interest_rate: number;
  rate_type: string;
  repayment_type: string | null;
  initial_period_end: string | null;
  term_years: number;
  monthly_payment_override: number | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
};

export type HomeValuationSource = {
  id: string;
  home_id: string;
  source_name: string;
  source_type: string;
  valuation_low: number | null;
  valuation_mid: number | null;
  valuation_high: number | null;
  valuation_amount: number | null;
  confidence: string | null;
  valuation_date: string | null;
  source_url: string | null;
  notes: string | null;
};

export type MortgageRenewalRecommendation = {
  id: string;
  home_id: string | null;
  mortgage_deal_id: string | null;
  mortgage_rate_deal_id: string | null;
  recommendation_kind: string | null;
  lender_name: string | null;
  product_name: string | null;
  current_lender: string | null;
  current_rate: number | null;
  suggested_rate: number | null;
  rate_delta: number | null;
  estimated_current_payment: number | null;
  estimated_new_payment: number | null;
  estimated_monthly_saving: number | null;
  product_fee: number | null;
  ltv: number | null;
  months_until_end: number | null;
  source_url: string | null;
  reason: string | null;
  status: string | null;
  created_at: string | null;
  payload?: Record<string, any> | null;
};

export type MortgageMarketDeal = {
  id: string;
  lender_name: string | null;
  product_name: string | null;
  rate_percent: number | null;
  initial_term_months: number | null;
  product_fee: number | null;
  ltv_max: number | null;
  source_url: string | null;
  status: string | null;
  catalogue_status: string | null;
  existing_customer_only?: boolean | null;
};

export type PropertyMoveQuery = {
  id: string;
  home_id: string | null;
  title: string;
  property_url: string | null;
  asking_price: number | null;
  postcode: string | null;
  address_hint: string | null;
  bedrooms: number | null;
  council_tax_band: string | null;
  council_tax_estimate_annual: number | null;
  epc_rating: string | null;
  epc_energy_cost_estimate_annual: number | null;
  expected_heating_cost_monthly: number | null;
  stamp_duty_estimate: number | null;
  moving_cost_estimate: number | null;
  target_deposit: number | null;
  expected_mortgage_balance: number | null;
  expected_rate: number | null;
  expected_term_years: number | null;
  expected_payment: number | null;
  affordability_score: number | null;
  status: string | null;
  source_status: string | null;
  source_confidence?: number | null;
  image_url?: string | null;
  archived_at?: string | null;
  delete_after?: string | null;
  notes: string | null;
  payload?: Record<string, any> | null;
  property_use?: string | null;
  council_tax_confidence?: number | null;
  council_tax_authority?: string | null;
  council_tax_source_url?: string | null;
  map_latitude?: number | null;
  map_longitude?: number | null;
  map_embed_url?: string | null;
  service_charge_monthly?: number | null;
  maintenance_allowance_monthly?: number | null;
  running_cost_breakdown?: Record<string, any> | null;
  created_at: string | null;
  updated_at: string | null;
};

type Props = {
  scenarios: MortgageScenario[];
  people: Person[];
  homes: Home[];
  owners: HomeOwner[];
  deals: HomeMortgageDeal[];
  valuations: HomeValuationSource[];
  monthPlan: MonthPlan;
  normalMonthPlan?: MonthPlan;
  emergencySavings?: number;
  childProfileCount?: number;
  renewalRecommendations?: MortgageRenewalRecommendation[];
  marketDeals?: MortgageMarketDeal[];
  moveQueries?: PropertyMoveQuery[];
  liabilityAllocations?: HomeMortgageLiabilityAllocation[];
  dealPreferences?: MortgageDealPreference[];
  workspacePreference?: MortgageWorkspacePreference | null;
};

type HomeDashboardTab =
  | "overview"
  | "mortgage_deals"
  | "moving_home"
  | "valuation_sources";

type ModalState =
  | null
  | { type: "add_home" }
  | { type: "edit_home"; home: Home }
  | { type: "add_mortgage"; homeId?: string }
  | { type: "edit_mortgage"; deal: HomeMortgageDeal }
  | { type: "mortgage_details"; deal: HomeMortgageDeal }
  | { type: "workspace_preferences" }
  | { type: "add_valuation"; homeId?: string }
  | { type: "edit_valuation"; valuation: HomeValuationSource }
  | { type: "add_scenario" }
  | { type: "add_move_query" }
  | { type: "move_query_details"; query: PropertyMoveQuery }
  | { type: "affordability_breakdown" };

type AddressLookupResult = {
  houseNumber: string;
  postcode: string;
  fullAddress: string;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  mapUrl: string;
  purchasePrice: number | null;
  purchaseDate: string | null;
  lookupSource: string;
  lastLookupAt: string;
  sourceNotes: string[];
  landRegistrySearchUrl: string;
  error?: string;
};

const inputClass =
  "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 focus:border-orange-400 focus:ring-2";
const softInputClass =
  "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 focus:border-orange-400 focus:ring-2";

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}

function numberValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value)))
    return "";
  return String(value);
}

function numberOrZero(value: number | null | undefined) {
  return Number(value ?? 0) || 0;
}

function displayMoveTitle(query: PropertyMoveQuery) {
  const candidate = String(
    query.address_hint || query.title || query.postcode || "Move search",
  )
    .replace(/\s*Skip to content\s*!?.*$/i, "")
    .replace(/\s*It appears that JavaScript is disabled.*$/i, "")
    .replace(/^\d+\s+bedroom\s+[^\s]+\s+house\s+for\s+sale\s+in\s+/i, "")
    .replace(/^\d+\s+bed(?:room)?\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return candidate || "Move search";
}

function moveCouncilTaxMonthly(query: PropertyMoveQuery) {
  return Number(query.council_tax_estimate_annual || 0) / 12;
}

function moveManagementMonthly(query: PropertyMoveQuery) {
  const payload = (query.payload || {}) as Record<string, any>;
  return (
    Number(
      query.service_charge_monthly ??
        payload.service_charge_monthly ??
        payload.management_charge_monthly ??
        0,
    ) || 0
  );
}

function moveMaintenanceMonthly(query: PropertyMoveQuery) {
  if (
    query.maintenance_allowance_monthly !== null &&
    query.maintenance_allowance_monthly !== undefined
  )
    return Number(query.maintenance_allowance_monthly) || 0;
  const price = Number(query.asking_price || 0);
  return price > 0 ? Math.round((price * 0.0075) / 12) : 0;
}

function moveMapEmbedUrl(query: PropertyMoveQuery) {
  if (query.map_embed_url) return query.map_embed_url;
  const payload = (query.payload || {}) as Record<string, any>;
  if (payload.map_embed_url) return String(payload.map_embed_url);
  const lat = Number(query.map_latitude ?? payload.map_latitude ?? 0);
  const lon = Number(query.map_longitude ?? payload.map_longitude ?? 0);
  if (!lat || !lon) return null;
  const delta = 0.01;
  const bbox = [lon - delta, lat - delta, lon + delta, lat + delta].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`;
}

function mortgagePaymentRange(query: PropertyMoveQuery) {
  const balance = Number(query.expected_mortgage_balance || 0);
  const baseRate = Number(query.expected_rate || 4.75);
  const termYears = Math.max(1, Number(query.expected_term_years || 30));
  const rates = [Math.max(0.5, baseRate - 0.75), baseRate, baseRate + 1.25];
  return rates.map((rate, index) => ({
    label:
      index === 0
        ? "Cheapest range"
        : index === 1
          ? "Selected estimate"
          : "Stress range",
    rate,
    payment:
      balance > 0
        ? calculateMonthlyMortgagePayment({
            balance,
            annualInterestRate: rate,
            termYears,
          })
        : 0,
  }));
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function mortgagePaymentForDeal(deal: HomeMortgageDeal) {
  if (
    deal.monthly_payment_override !== null &&
    deal.monthly_payment_override !== undefined
  ) {
    return Number(deal.monthly_payment_override);
  }

  return calculateMonthlyMortgagePayment({
    balance: Number(deal.balance),
    annualInterestRate: Number(deal.interest_rate),
    termYears: Number(deal.term_years),
  });
}

function projectedMortgageForDeal(
  deal: HomeMortgageDeal,
  asOfDate: Date = new Date(),
) {
  return calculateProjectedMortgageBalance({
    openingBalance: Number(deal.balance),
    annualInterestRate: Number(deal.interest_rate),
    termYears: Number(deal.term_years),
    balanceAsOfDate: deal.balance_as_of_date ?? deal.start_date,
    asOfDate,
    monthlyPayment: deal.monthly_payment_override,
    repaymentType: deal.repayment_type ?? "repayment",
  });
}

function currentMortgageBalanceForDeal(deal: HomeMortgageDeal) {
  return projectedMortgageForDeal(deal).projectedBalance;
}

function balanceAsOfLabel(deal: HomeMortgageDeal) {
  return deal.balance_as_of_date ?? deal.start_date ?? "Not set";
}

function mapQueryForHome(home: Home) {
  if (home.latitude && home.longitude)
    return `${home.latitude},${home.longitude}`;
  return [
    home.full_address,
    home.address_line,
    home.postcode,
    home.city,
    home.country,
  ]
    .filter(Boolean)
    .join(" ");
}

function mapUrlForHome(home: Home) {
  if (home.map_url) return home.map_url;
  const query = mapQueryForHome(home);
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null;
}

function embedMapUrlForHome(home: Home) {
  if (home.latitude && home.longitude) {
    const lat = Number(home.latitude);
    const lon = Number(home.longitude);
    const delta = 0.006;
    const bbox = [lon - delta, lat - delta, lon + delta, lat + delta].join(",");
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`;
  }
  return null;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function confidenceWeight(confidence: string | null) {
  if (confidence === "high") return 1.25;
  if (confidence === "low") return 0.75;
  return 1;
}

function weightedAverage(
  values: { value: number; confidence: string | null }[],
) {
  const usable = values.filter((item) => item.value > 0);
  if (usable.length === 0) return 0;
  const totalWeight = usable.reduce(
    (sum, item) => sum + confidenceWeight(item.confidence),
    0,
  );
  return (
    usable.reduce(
      (sum, item) => sum + item.value * confidenceWeight(item.confidence),
      0,
    ) / totalWeight
  );
}

function valuationSummary(home: Home, valuations: HomeValuationSource[]) {
  const sourceLows = valuations.map((item) => ({
    value: Number(
      item.valuation_low ?? item.valuation_mid ?? item.valuation_amount ?? 0,
    ),
    confidence: item.confidence,
  }));
  const sourceMids = valuations.map((item) => ({
    value: Number(item.valuation_mid ?? item.valuation_amount ?? 0),
    confidence: item.confidence,
  }));
  const sourceHighs = valuations.map((item) => ({
    value: Number(
      item.valuation_high ?? item.valuation_mid ?? item.valuation_amount ?? 0,
    ),
    confidence: item.confidence,
  }));

  const sourceLow = weightedAverage(sourceLows);
  const sourceMid = weightedAverage(sourceMids);
  const sourceHigh = weightedAverage(sourceHighs);

  const low =
    Number(home.estimated_value_low ?? 0) ||
    sourceLow ||
    Number(home.property_value ?? 0);
  const mid =
    Number(home.estimated_value_mid ?? 0) ||
    sourceMid ||
    Number(home.property_value ?? 0);
  const high =
    Number(home.estimated_value_high ?? 0) ||
    sourceHigh ||
    Number(home.property_value ?? 0);

  return {
    low,
    mid,
    high,
    sourceLow,
    sourceMid,
    sourceHigh,
    sourceCount: valuations.length,
    hasManualOverride: Boolean(
      home.estimated_value_low ||
        home.estimated_value_mid ||
        home.estimated_value_high,
    ),
  };
}

function ltvBand(ltv: number) {
  if (ltv <= 0) return "Add value/mortgage";
  if (ltv <= 60) return "60% LTV band";
  if (ltv <= 75) return "75% LTV band";
  if (ltv <= 80) return "80% LTV band";
  if (ltv <= 85) return "85% LTV band";
  if (ltv <= 90) return "90% LTV band";
  if (ltv <= 95) return "95% LTV band";
  return "Above 95% LTV / specialist check";
}

type AffordabilityCriterion = {
  group: string;
  label: string;
  points: number;
  max: number;
  reason: string;
};

type AffordabilityScore = {
  score: number;
  label: "Green" | "Amber" | "Red";
  tone: string;
  incomeMode: "single" | "dual";
  numberOfIncomes: number;
  notes: string;
  criteria: AffordabilityCriterion[];
};

function pointsForRatio(
  value: number,
  green: number,
  amber: number,
  max: number,
) {
  if (value <= green) return max;
  if (value <= amber) return Math.round(max / 2);
  return 0;
}

function buildAffordabilityScore(input: {
  monthPlan: MonthPlan;
  mortgagePayment: number;
  mortgageBalance: number;
  propertyValue: number;
  futureOutgoings: number;
  futureSurplus: number;
  emergencySavings?: number;
  ownerPersonIds?: string[];
  childProfileCount?: number;
  includeTemporaryIncomeNote?: boolean;
}): AffordabilityScore {
  const incomeItems = input.monthPlan.incomeItems.filter(
    (item) =>
      Number(item.value || 0) > 100 &&
      !/dividend|side income|interest/i.test(item.label),
  );
  const distinctIncomeLabels = new Set(
    incomeItems.map(
      (item) => item.personId || item.label.split(" · ")[0] || item.label,
    ),
  );
  const incomePersonIds = new Set(
    incomeItems.map((item) => item.personId).filter(Boolean) as string[],
  );
  const ownerIncomeCount = (input.ownerPersonIds || []).filter(
    (id, index, array) =>
      id && array.indexOf(id) === index && incomePersonIds.has(id),
  ).length;
  const numberOfIncomes = Math.max(
    1,
    ownerIncomeCount,
    distinctIncomeLabels.size || incomeItems.length,
  );
  const incomeMode = numberOfIncomes >= 2 ? "dual" : "single";
  const netIncome = Math.max(0, Number(input.monthPlan.income || 0));
  const paymentRatio = netIncome > 0 ? input.mortgagePayment / netIncome : 1;
  const dtiRatio = netIncome > 0 ? input.futureOutgoings / netIncome : 1;
  const ltv =
    input.propertyValue > 0 ? input.mortgageBalance / input.propertyValue : 1;
  const hasChildcare = input.monthPlan.outgoingItems.some((item) =>
    /child|nursery|childcare|wraparound|school/i.test(item.label),
  );
  const childProfileCount = Number(input.childProfileCount || 0);
  const hasMaternity = input.monthPlan.incomeItems.some((item) =>
    /maternity/i.test(`${item.label} ${item.helper}`),
  );
  const monthlyEssential = Math.max(1, input.futureOutgoings);
  const cashBufferMonths =
    Number(input.emergencySavings || 0) > 0
      ? Number(input.emergencySavings || 0) / monthlyEssential
      : 0;
  const surplusMonthsProxy =
    cashBufferMonths > 0
      ? cashBufferMonths
      : input.futureSurplus > 0
        ? (input.futureSurplus * 3) / monthlyEssential
        : 0;
  const maintenanceRequiredMonthly =
    input.propertyValue > 0 ? (input.propertyValue * 0.01) / 12 : 0;
  const sortedIncomes = [...incomeItems].sort(
    (a, b) => Number(b.value || 0) - Number(a.value || 0),
  );
  const highestIncome = Number(sortedIncomes[0]?.value || netIncome);

  const criteria: AffordabilityCriterion[] = [];
  const housingMax =
    incomeMode === "dual"
      ? { green: 0.28, amber: 0.38 }
      : { green: 0.25, amber: 0.35 };
  criteria.push({
    group: "Cash flow & debt allocation",
    label: "Housing costs vs net income",
    max: 20,
    points: pointsForRatio(
      paymentRatio,
      housingMax.green,
      housingMax.amber,
      20,
    ),
    reason: `${(paymentRatio * 100).toFixed(1)}% of net income. ${incomeMode === "dual" ? "Dual-income threshold: green under 28%, amber up to 38%." : "Single-income threshold: green under 25%, amber up to 35%."}`,
  });
  criteria.push({
    group: "Cash flow & debt allocation",
    label: "Total debt/outgoing load",
    max: 20,
    points: pointsForRatio(dtiRatio, 0.35, 0.45, 20),
    reason: `${(dtiRatio * 100).toFixed(1)}% of net income after tracked outgoings${hasChildcare ? "; childcare appears to be included." : childProfileCount > 0 ? `; ${childProfileCount} child profile${childProfileCount === 1 ? "" : "s"} detected, but no childcare/wraparound cost row is currently tracked.` : "; no child profiles or childcare lines are currently detected."}${input.includeTemporaryIncomeNote && hasMaternity ? " Maternity income is detected, so this is a temporary exposure view rather than the normal salary basis." : ""}`,
  });

  const emergencyNeeded =
    incomeMode === "dual" ? { green: 3, amber: 1.5 } : { green: 6, amber: 3 };
  criteria.push({
    group: "Liquidity & buffer",
    label: "Post-purchase emergency fund proxy",
    max: 15,
    points:
      surplusMonthsProxy >= emergencyNeeded.green
        ? 15
        : surplusMonthsProxy >= emergencyNeeded.amber
          ? 7
          : 0,
    reason: `${cashBufferMonths > 0 ? "Uses tracked Savings balances as the emergency-fund proxy" : "Savings are not fully modelled yet, so LOOP uses monthly surplus as a provisional buffer proxy"}: ${surplusMonthsProxy.toFixed(1)} month(s). ${incomeMode === "single" ? "Single-income households should target 6+ months." : "Dual-income households should target 3+ months."}`,
  });
  criteria.push({
    group: "Liquidity & buffer",
    label: "Loan-to-value",
    max: 10,
    points: ltv < 0.8 ? 10 : ltv <= 0.9 ? 5 : 0,
    reason: `${(ltv * 100).toFixed(1)}% LTV. Green below 80%, amber 80–90%, red above 90%.`,
  });
  criteria.push({
    group: "Liquidity & buffer",
    label: "Maintenance runway",
    max: 10,
    points:
      input.futureSurplus >= maintenanceRequiredMonthly
        ? 10
        : input.futureSurplus >= maintenanceRequiredMonthly / 2
          ? 5
          : 0,
    reason: `A 1% annual maintenance guide is about ${formatMoney(maintenanceRequiredMonthly)}/month for this property value. Current projected surplus is ${formatMoney(input.futureSurplus)}.`,
  });

  if (incomeMode === "dual") {
    criteria.push({
      group: "Stress testing & lifestyle margin",
      label: "Income shock stress test",
      max: 15,
      points:
        highestIncome >= input.futureOutgoings
          ? 15
          : highestIncome >= input.mortgagePayment
            ? 7
            : 0,
      reason: `Higher income alone is ${formatMoney(highestIncome)}. Full tracked outgoings are ${formatMoney(input.futureOutgoings)} and mortgage payment is ${formatMoney(input.mortgagePayment)}.`,
    });
  } else {
    criteria.push({
      group: "Stress testing & lifestyle margin",
      label: "Single-income shock stress test",
      max: 15,
      points: 7,
      reason:
        "Income protection / employment-security details are not captured yet, so this is marked amber by default. Add insurance/employment stability later to improve this.",
    });
  }
  const residualGreen = incomeMode === "dual" ? 1500 : 900;
  const residualAmber = incomeMode === "dual" ? 750 : 350;
  criteria.push({
    group: "Stress testing & lifestyle margin",
    label: "Absolute residual income",
    max: 10,
    points:
      input.futureSurplus >= residualGreen
        ? 10
        : input.futureSurplus >= residualAmber
          ? 5
          : 0,
    reason: `${formatMoney(input.futureSurplus)} left after tracked income/outgoings. ${incomeMode === "dual" ? "Dual-income baseline uses a higher lifestyle buffer." : "Single-income baseline uses a lower household-size buffer but higher redundancy caution."}`,
  });

  const score = Math.max(
    0,
    Math.min(
      100,
      criteria.reduce((sum, item) => sum + item.points, 0),
    ),
  );
  const label = score >= 80 ? "Green" : score >= 50 ? "Amber" : "Red";
  return {
    score,
    label,
    tone:
      label === "Green"
        ? "bg-emerald-100 text-emerald-800"
        : label === "Amber"
          ? "bg-amber-100 text-amber-800"
          : "bg-red-100 text-red-800",
    incomeMode,
    numberOfIncomes,
    notes:
      label === "Green"
        ? "Resilient against the data currently tracked."
        : label === "Amber"
          ? "Caution: workable but vulnerable to shocks."
          : "High risk based on current tracked data.",
    criteria,
  };
}

function legacyAffordabilityLabel(score: AffordabilityScore) {
  return {
    label:
      score.label === "Green"
        ? "Strong"
        : score.label === "Amber"
          ? "Caution"
          : "High risk",
    className: score.tone,
    notes: score.notes,
  };
}

function safePercent(value: number | null | undefined) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return number;
}

function sourceStatusDisplay(status: string | null | undefined) {
  const value = String(status || "manual_price");
  if (value === "url_ingested") return "Listing";
  if (value === "url_partial") return "Partial listing";
  if (value === "manual_price") return "Manual scenario";
  return statusLabel(value);
}

function moveQueryConfidence(query: PropertyMoveQuery) {
  const payloadConfidence = Number(query.payload?.sourceConfidence || 0);
  const confidence = Number(query.source_confidence || payloadConfidence || 0);
  return Math.max(0, Math.min(99, confidence || 40));
}

function moveQueryRunningMonthly(query: PropertyMoveQuery) {
  return (
    Number(query.expected_payment || 0) +
    Number(query.expected_heating_cost_monthly || 0) +
    moveCouncilTaxMonthly(query) +
    moveManagementMonthly(query)
  );
}

function moveQueryScore(
  query: PropertyMoveQuery,
  currentAffordabilityScore?: AffordabilityScore | null,
  currentMonthlyCost = 0,
) {
  const supplied = Number(query.affordability_score || 0);
  if (supplied > 0) return supplied;
  const monthly = moveQueryRunningMonthly(query);
  const confidence = moveQueryConfidence(query);
  let score = currentAffordabilityScore?.score ?? 70;
  if (currentMonthlyCost > 0 && monthly > 0) {
    const delta = (monthly - currentMonthlyCost) / currentMonthlyCost;
    if (delta > 0.75) score -= 24;
    else if (delta > 0.45) score -= 18;
    else if (delta > 0.25) score -= 10;
    else if (delta < -0.1) score += 6;
  }
  const band = String(query.council_tax_band || "").toUpperCase();
  if (!band) score -= 8;
  else if (["F", "G", "H"].includes(band)) score -= 6;
  const epc = String(query.epc_rating || "").toUpperCase();
  if (!epc) score -= 6;
  else if (["E", "F", "G"].includes(epc)) score -= 10;
  else if (["A", "B"].includes(epc)) score += 4;
  if (confidence < 95) score -= Math.ceil((95 - confidence) / 5);
  return Math.max(1, Math.min(100, Math.round(score)));
}

function moveScoreReasons(
  query: PropertyMoveQuery,
  currentAffordabilityScore?: AffordabilityScore | null,
  currentMonthlyCost = 0,
) {
  const monthly = moveQueryRunningMonthly(query);
  const confidence = moveQueryConfidence(query);
  const reasons = [
    {
      label: "Monthly running cost",
      score:
        currentMonthlyCost > 0 && monthly > 0
          ? Math.max(
              1,
              Math.min(
                100,
                Math.round(
                  100 -
                    Math.max(
                      0,
                      ((monthly - currentMonthlyCost) / currentMonthlyCost) *
                        55,
                    ),
                ),
              ),
            )
          : 60,
      current:
        currentMonthlyCost > 0
          ? `${formatMoney(currentMonthlyCost)}/mo current`
          : "Current cost not fully tracked",
      reason:
        monthly > 0
          ? `Estimated ${formatMoney(monthly)}/mo including mortgage, heating and council tax where known.`
          : "Add mortgage, EPC and council tax values to score monthly running cost.",
    },
    {
      label: "Council tax confidence",
      score: query.council_tax_band ? confidence : 35,
      current: "Current home shown in orange when tracked",
      reason: query.council_tax_band
        ? `Band ${query.council_tax_band} detected${confidence >= 95 ? " with high confidence" : "; confirm before relying on it"}.`
        : "Council tax band missing. Confirm from listing/council source.",
    },
    {
      label: "Energy / EPC",
      score: query.epc_rating
        ? ["A", "B", "C"].includes(String(query.epc_rating).toUpperCase())
          ? 90
          : ["D"].includes(String(query.epc_rating).toUpperCase())
            ? 70
            : 45
        : 40,
      current: "Compare against current EPC once tracked",
      reason: query.epc_rating
        ? `EPC ${query.epc_rating}; monthly energy estimate ${formatMoney(query.expected_heating_cost_monthly)}/mo.`
        : "EPC missing. New builds can be entered manually until a certificate/listing source exists.",
    },
    {
      label: "Upfront cash drag",
      score:
        Number(query.stamp_duty_estimate || 0) +
          Number(query.moving_cost_estimate || 0) >
        0
          ? 70
          : 50,
      current: `${currentAffordabilityScore?.score ?? "—"}/100 current property`,
      reason: `Stamp duty ${formatMoney(query.stamp_duty_estimate)} and moving costs ${formatMoney(query.moving_cost_estimate)} before any renovation or furnishing buffer.`,
    },
  ];
  return reasons;
}

function ltvForMortgageAmount(
  balance: number,
  value: number | null | undefined,
) {
  const price = Number(value || 0);
  if (!price) return 0;
  return (Number(balance || 0) / price) * 100;
}

type RateSuggestion = {
  lender: string;
  productName: string;
  rate: number;
  rateType: string;
  termYears: number;
  score: number;
  notes: string;
  sourceUrl?: string;
};

function lenderAccent(lender: string | null) {
  const name = (lender || "").toLowerCase();
  if (name.includes("natwest")) return "from-purple-600 to-pink-500";
  if (name.includes("halifax")) return "from-blue-700 to-cyan-500";
  if (name.includes("nationwide")) return "from-blue-600 to-red-500";
  if (name.includes("santander")) return "from-red-600 to-red-400";
  return "from-slate-900 to-slate-600";
}

function monthsBetweenToday(dateString: string | null | undefined) {
  if (!dateString) return null;
  const end = new Date(dateString);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  return Math.max(
    0,
    (end.getFullYear() - today.getFullYear()) * 12 +
      (end.getMonth() - today.getMonth()),
  );
}

function ageFromBirthDate(birthDate: string | null | undefined) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate()))
    age -= 1;
  return age;
}

function planningMaxTermYears(people: Person[]) {
  const adultAges = people
    .filter((person) => ["self", "partner"].includes(person.relationship))
    .map((person) => ageFromBirthDate(person.birth_date))
    .filter((age): age is number => age !== null);
  if (adultAges.length === 0)
    return {
      maxTerm: 35,
      helper:
        "Add adult birth dates in Household to check the term against age.",
    };
  const oldest = Math.max(...adultAges);
  const maxTerm = Math.max(5, Math.min(40, 75 - oldest));
  return {
    maxTerm,
    helper: `Planning guide: oldest borrower is ${oldest}, so age 75 implies roughly ${maxTerm} years max. Lenders vary.`,
  };
}

function SelectField({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className={inputClass}
      >
        {children}
      </select>
    </label>
  );
}

function TextField({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  step,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  placeholder?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={
          placeholder ||
          (type === "number"
            ? "0"
            : type === "date"
              ? undefined
              : `Enter ${label.toLowerCase()}`)
        }
        step={step}
        required={required}
        className={inputClass}
      />
    </label>
  );
}

function ControlledField({
  label,
  name,
  value,
  onChange,
  type = "text",
  placeholder,
  step,
  required,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <input
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          placeholder ||
          (type === "number"
            ? "0"
            : type === "date"
              ? undefined
              : `Enter ${label.toLowerCase()}`)
        }
        step={step}
        required={required}
        className={inputClass}
      />
    </label>
  );
}

function Modal({
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
    <ModalFrame title={title} description={description} eyebrow="House" onClose={onClose}>
      {children}
    </ModalFrame>
  );
}

function HomeForm({
  people,
  owners,
  home,
  action,
}: {
  people: Person[];
  owners: HomeOwner[];
  home?: Home;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const ownersForHome = owners.filter((owner) => owner.home_id === home?.id);
  const assignedOwners = new Set(ownersForHome.map((owner) => owner.person_id));
  const ownerPercentByPerson = new Map(
    ownersForHome.map((owner) => [owner.person_id, owner.ownership_percent]),
  );
  const [houseNumber, setHouseNumber] = useState(
    home?.house_number ?? home?.address_line?.split(" ")[0] ?? "",
  );
  const [postcode, setPostcode] = useState(home?.postcode ?? "");
  const [label, setLabel] = useState(home?.label ?? "");
  const [addressLine, setAddressLine] = useState(home?.address_line ?? "");
  const [fullAddress, setFullAddress] = useState(home?.full_address ?? "");
  const [city, setCity] = useState(home?.city ?? "");
  const [region, setRegion] = useState(home?.region ?? "");
  const [country, setCountry] = useState(home?.country ?? "United Kingdom");
  const [latitude, setLatitude] = useState(numberValue(home?.latitude));
  const [longitude, setLongitude] = useState(numberValue(home?.longitude));
  const [mapUrl, setMapUrl] = useState(
    home?.map_url ?? (home ? (mapUrlForHome(home) ?? "") : ""),
  );
  const [purchasePrice, setPurchasePrice] = useState(
    numberValue(home?.purchase_price),
  );
  const [purchaseDate, setPurchaseDate] = useState(home?.purchase_date ?? "");
  const [lowEstimate, setLowEstimate] = useState(
    numberValue(home?.estimated_value_low),
  );
  const [midEstimate, setMidEstimate] = useState(
    numberValue(home?.estimated_value_mid ?? home?.property_value),
  );
  const [highEstimate, setHighEstimate] = useState(
    numberValue(home?.estimated_value_high),
  );
  const [lookupSource, setLookupSource] = useState(
    home?.lookup_source ?? "manual",
  );
  const [lastLookupAt, setLastLookupAt] = useState(home?.last_lookup_at ?? "");
  const [purchaseSourceUrl, setPurchaseSourceUrl] = useState(
    home?.purchase_source_url ?? "",
  );
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);

  async function runLookup() {
    setLookupBusy(true);
    setLookupMessage(null);
    try {
      const response = await fetch(
        `/api/property/address-lookup?postcode=${encodeURIComponent(postcode)}&houseNumber=${encodeURIComponent(houseNumber)}`,
      );
      const data = (await response.json()) as AddressLookupResult;
      if (!response.ok || data.error)
        throw new Error(data.error || "Address lookup failed");

      const suggestedLabel = houseNumber
        ? `${houseNumber} ${postcode.toUpperCase()}`
        : postcode.toUpperCase();
      setLabel((current) => current || suggestedLabel);
      setAddressLine(data.addressLine || houseNumber || "");
      setFullAddress(
        data.fullAddress || [houseNumber, postcode].filter(Boolean).join(" "),
      );
      setCity(data.city || "");
      setRegion(data.region || "");
      setCountry(data.country || "United Kingdom");
      setLatitude(data.latitude === null ? "" : String(data.latitude));
      setLongitude(data.longitude === null ? "" : String(data.longitude));
      setMapUrl(data.mapUrl || "");
      setPurchasePrice(
        data.purchasePrice === null
          ? purchasePrice
          : String(data.purchasePrice),
      );
      setPurchaseDate(data.purchaseDate || purchaseDate);
      setLookupSource(data.lookupSource || "postcode_geocode");
      setLastLookupAt(data.lastLookupAt || currentDate());
      setPurchaseSourceUrl(
        (current) => current || data.landRegistrySearchUrl || "",
      );
      setLookupMessage(data.sourceNotes?.join(" ") || "Lookup complete.");
    } catch (error) {
      setLookupMessage(
        error instanceof Error ? error.message : "Address lookup failed",
      );
    } finally {
      setLookupBusy(false);
    }
  }

  function seedValuationFromPurchase() {
    const base = Number(purchasePrice || midEstimate || 0);
    if (!base) {
      setLookupMessage(
        "Add a purchase price or mid value first, then seed low/mid/high.",
      );
      return;
    }
    setLowEstimate(String(Math.round(base * 0.95)));
    setMidEstimate(String(Math.round(base)));
    setHighEstimate(String(Math.round(base * 1.05)));
    setLookupMessage(
      "Low/mid/high seeded from the current purchase/mid figure. Overwrite these with real valuations when you have them.",
    );
  }

  return (
    <form
      action={action}
      onSubmit={() => {
        if (!home)
          window.localStorage.setItem("loop:addMortgageAfterHome", "1");
      }}
      className="space-y-5"
    >
      {home ? <input type="hidden" name="id" value={home.id} /> : null}
      <input type="hidden" name="lookup_source" value={lookupSource} />
      <input type="hidden" name="last_lookup_at" value={lastLookupAt} />
      <input
        type="hidden"
        name="property_value"
        value={midEstimate || purchasePrice || "0"}
      />

      <div className="rounded-3xl border border-orange-200 bg-orange-50/50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <ControlledField
            label="House number/name"
            name="house_number"
            value={houseNumber}
            onChange={setHouseNumber}
            placeholder="8"
          />
          <ControlledField
            label="Postcode"
            name="postcode"
            value={postcode}
            onChange={setPostcode}
            placeholder="WA5 8AT"
            required
          />
          <button
            type="button"
            onClick={runLookup}
            disabled={lookupBusy || !postcode}
            className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {lookupBusy ? "Looking up..." : "Find address"}
          </button>
          <button
            type="button"
            onClick={seedValuationFromPurchase}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
          >
            Seed low/mid/high
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Fast mode: enter house number and postcode. The app will fill the map
          fields now, while purchase price/date can be manual or source-linked
          until Land Registry/PropertyData import is wired.
        </p>
        {lookupMessage ? (
          <div className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm text-slate-600">
            {lookupMessage}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ControlledField
          label="Home label"
          name="label"
          value={label}
          onChange={setLabel}
          placeholder="Current home, next house"
          required
        />
        <ControlledField
          label="Address line"
          name="address_line"
          value={addressLine}
          onChange={setAddressLine}
          placeholder="Street or house name"
        />
        <SelectField
          label="Status"
          name="ownership_status"
          defaultValue={home?.ownership_status ?? "current_home"}
        >
          <option value="current_home">Current home</option>
          <option value="watchlist">Watchlist</option>
          <option value="sold">Sold / historic</option>
        </SelectField>
        <ControlledField
          label="Full address"
          name="full_address"
          value={fullAddress}
          onChange={setFullAddress}
          placeholder="Full address from lookup"
        />
        <ControlledField
          label="Town / city"
          name="city"
          value={city}
          onChange={setCity}
        />
        <ControlledField
          label="Region"
          name="region"
          value={region}
          onChange={setRegion}
          placeholder="Cheshire, Greater Manchester"
        />
        <ControlledField
          label="Country"
          name="country"
          value={country}
          onChange={setCountry}
        />
        <ControlledField
          label="Latitude"
          name="latitude"
          type="number"
          step="0.0000001"
          value={latitude}
          onChange={setLatitude}
        />
        <ControlledField
          label="Longitude"
          name="longitude"
          type="number"
          step="0.0000001"
          value={longitude}
          onChange={setLongitude}
        />
        <ControlledField
          label="Map URL"
          name="map_url"
          value={mapUrl}
          onChange={setMapUrl}
          placeholder="Generated by lookup or paste Google Maps link"
        />
        <ControlledField
          label="Purchase price"
          name="purchase_price"
          type="number"
          step="0.01"
          value={purchasePrice}
          onChange={setPurchasePrice}
        />
        <ControlledField
          label="Purchase date"
          name="purchase_date"
          type="date"
          value={purchaseDate}
          onChange={setPurchaseDate}
        />
        <ControlledField
          label="Low estimate"
          name="estimated_value_low"
          type="number"
          step="0.01"
          value={lowEstimate}
          onChange={setLowEstimate}
          placeholder="Low valuation"
        />
        <ControlledField
          label="Mid estimate"
          name="estimated_value_mid"
          type="number"
          step="0.01"
          value={midEstimate}
          onChange={setMidEstimate}
          placeholder="Expected valuation"
        />
        <ControlledField
          label="High estimate"
          name="estimated_value_high"
          type="number"
          step="0.01"
          value={highEstimate}
          onChange={setHighEstimate}
          placeholder="High valuation"
        />
        <TextField
          label="Valuation checked"
          name="estimated_value_date"
          type="date"
          defaultValue={home?.estimated_value_date ?? currentDate()}
        />
        <ControlledField
          label="Purchase source URL"
          name="purchase_source_url"
          value={purchaseSourceUrl}
          onChange={setPurchaseSourceUrl}
          placeholder="Land Registry/search/listing URL"
        />
        <TextField
          label="Property type"
          name="property_type"
          defaultValue={home?.property_type}
          placeholder="Detached, semi, terrace"
        />
        <TextField
          label="UPRN / provider ID"
          name="uprn"
          defaultValue={home?.uprn}
          placeholder="Optional address ID"
        />
        <TextField
          label="Notes"
          name="notes"
          defaultValue={home?.notes}
          placeholder="Valuation source, Rightmove link, assumptions"
        />
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700">
          Assign to household
        </p>
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          {people.map((person) => {
            const defaultPercent = ownerPercentByPerson.get(person.id);
            return (
              <label
                key={person.id}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="owner_ids"
                    value={person.id}
                    defaultChecked={assignedOwners.has(person.id)}
                  />
                  <span>
                    {person.name}{" "}
                    <span className="text-xs capitalize text-slate-400">
                      ({person.relationship})
                    </span>
                  </span>
                </span>
                <input
                  name={`owner_percent_${person.id}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={numberValue(defaultPercent)}
                  placeholder="Auto split"
                  className="mt-2 w-full rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700"
                />
                <span className="mt-1 block text-[11px] font-bold text-slate-400">
                  Ownership % override. Blank = equal split.
                </span>
              </label>
            );
          })}
          {people.length === 0 ? (
            <p className="text-sm text-slate-500">
              Add people in Household first if you want ownership attached.
            </p>
          ) : null}
        </div>
      </div>

      <SubmitButton>{home ? "Save home" : "Add home"}</SubmitButton>
    </form>
  );
}

function MortgageForm({
  homes,
  people,
  allocations,
  deal,
  homeId,
  action,
}: {
  homes: Home[];
  people: Person[];
  allocations: HomeMortgageLiabilityAllocation[];
  deal?: HomeMortgageDeal;
  homeId?: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const adultPeople = people.filter(
    (person) => person.relationship !== "child",
  );
  const allocationByPerson = new Map(
    allocations
      .filter(
        (allocation) => !deal || allocation.home_mortgage_deal_id === deal.id,
      )
      .map((allocation) => [
        allocation.person_id,
        allocation.liability_percent,
      ]),
  );
  const defaultChecked = new Set(
    allocationByPerson.size > 0
      ? Array.from(allocationByPerson.keys())
      : adultPeople.map((person) => person.id),
  );

  return (
    <form action={action} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {deal ? <input type="hidden" name="id" value={deal.id} /> : null}
      <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4 md:col-span-2 lg:col-span-4">
        <h3 className="font-black text-blue-950">Mortgage / rate record</h3>
        <p className="mt-1 text-sm font-bold leading-6 text-blue-900/80">
          Attach the mortgage to the home, then allocate the legal/payment
          liability across the adults in the household. Ownership and mortgage
          liability are stored separately.
        </p>
      </div>
      <SelectField
        label="Home"
        name="home_id"
        defaultValue={deal?.home_id ?? homeId ?? homes[0]?.id ?? ""}
      >
        {homes.map((home) => (
          <option key={home.id} value={home.id}>
            {home.label}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Lender"
        name="lender"
        defaultValue={deal?.lender}
        placeholder="NatWest, Halifax"
      />
      <TextField
        label="Product name"
        name="product_name"
        defaultValue={deal?.product_name}
        placeholder="2-year fix, tracker"
      />
      <TextField
        label="Opening / last known balance"
        name="balance"
        type="number"
        step="0.01"
        defaultValue={numberValue(deal?.balance)}
        placeholder="e.g. 168564"
        required
      />
      <TextField
        label="Balance date"
        name="balance_as_of_date"
        type="date"
        defaultValue={
          deal?.balance_as_of_date ?? deal?.start_date ?? currentDate()
        }
      />
      <TextField
        label="Interest rate %"
        name="interest_rate"
        type="number"
        step="0.001"
        defaultValue={numberValue(deal?.interest_rate)}
        placeholder="e.g. 1.77 or 4.75"
        required
      />
      <SelectField
        label="Repayment type"
        name="repayment_type"
        defaultValue={deal?.repayment_type ?? "repayment"}
      >
        <option value="repayment">Repayment</option>
        <option value="interest_only">Interest only</option>
      </SelectField>
      <SelectField
        label="Rate type"
        name="rate_type"
        defaultValue={deal?.rate_type ?? "fixed"}
      >
        <option value="fixed">Fixed</option>
        <option value="tracker">Tracker</option>
        <option value="variable">Variable</option>
        <option value="standard_variable">SVR</option>
      </SelectField>
      <TextField
        label="Rate ends"
        name="initial_period_end"
        type="date"
        defaultValue={deal?.initial_period_end}
      />
      <TextField
        label="Term years"
        name="term_years"
        type="number"
        step="1"
        defaultValue={numberValue(deal?.term_years ?? 25)}
        placeholder="e.g. 25 or 30"
        required
      />
      <TextField
        label="Payment override"
        name="monthly_payment_override"
        type="number"
        step="0.01"
        defaultValue={numberValue(deal?.monthly_payment_override)}
        placeholder="Actual monthly payment, e.g. 583"
      />
      <TextField
        label="Start date"
        name="start_date"
        type="date"
        defaultValue={deal?.start_date ?? currentDate()}
      />
      <TextField
        label="End date"
        name="end_date"
        type="date"
        defaultValue={deal?.end_date}
      />
      <TextField
        label="Notes"
        name="notes"
        defaultValue={deal?.notes}
        placeholder="Fees, ERC, product transfer details, source URL"
      />

      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 lg:col-span-4">
        <p className="text-sm font-black text-slate-950">
          Who is liable for this mortgage?
        </p>
        <p className="mt-1 text-xs font-bold text-slate-500">
          Select the adults and set liability percentages. Leave percentages
          blank for an equal split.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {adultPeople.map((person) => (
            <label
              key={person.id}
              className="rounded-2xl border border-slate-200 bg-white p-3"
            >
              <span className="flex items-center gap-2 text-sm font-black text-slate-900">
                <input
                  type="checkbox"
                  name="liability_person_ids"
                  value={person.id}
                  defaultChecked={defaultChecked.has(person.id)}
                />
                {person.name}
              </span>
              <input
                name={`liability_percent_${person.id}`}
                type="number"
                min="0"
                max="100"
                step="0.01"
                defaultValue={numberValue(allocationByPerson.get(person.id))}
                placeholder="Equal split"
                className="mt-2 w-full rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700"
              />
            </label>
          ))}
          {adultPeople.length === 0 ? (
            <p className="text-sm font-bold text-amber-700">
              Add the adults to Household before allocating mortgage liability.
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-end">
        <SubmitButton>{deal ? "Save mortgage" : "Add mortgage"}</SubmitButton>
      </div>
    </form>
  );
}

function ValuationForm({
  homes,
  valuation,
  homeId,
  action,
}: {
  homes: Home[];
  valuation?: HomeValuationSource;
  homeId?: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {valuation ? (
        <input type="hidden" name="id" value={valuation.id} />
      ) : null}
      <div className="rounded-3xl border border-orange-200 bg-orange-50 p-4 md:col-span-2 lg:col-span-4">
        <h3 className="font-black text-orange-950">Valuation source</h3>
        <p className="mt-1 text-sm font-bold leading-6 text-orange-900/80">
          Add either a single valuation or a low/mid/high range. Source URL and
          notes are important so the estimate can be checked later instead of
          becoming an unexplained number.
        </p>
      </div>
      <SelectField
        label="Home"
        name="home_id"
        defaultValue={valuation?.home_id ?? homeId ?? homes[0]?.id ?? ""}
      >
        {homes.map((home) => (
          <option key={home.id} value={home.id}>
            {home.label}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Source type"
        name="source_type"
        defaultValue={valuation?.source_type ?? "user_estimate"}
      >
        <option value="user_estimate">Your estimate</option>
        <option value="estate_agent">Estate agent</option>
        <option value="survey">Survey / RICS</option>
        <option value="zoopla">Zoopla / AVM</option>
        <option value="rightmove">Rightmove / listing</option>
        <option value="land_registry">Land Registry comparable</option>
        <option value="propertydata">PropertyData / API</option>
        <option value="other">Other</option>
      </SelectField>
      <TextField
        label="Source name"
        name="source_name"
        defaultValue={valuation?.source_name}
        placeholder="Zoopla, agent name, Land Registry"
        required
      />
      <SelectField
        label="Confidence"
        name="confidence"
        defaultValue={valuation?.confidence ?? "medium"}
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </SelectField>
      <TextField
        label="Single valuation"
        name="valuation_amount"
        type="number"
        step="0.01"
        defaultValue={numberValue(valuation?.valuation_amount)}
        placeholder="e.g. 363000"
      />
      <TextField
        label="Low"
        name="valuation_low"
        type="number"
        step="0.01"
        defaultValue={numberValue(valuation?.valuation_low)}
        placeholder="Low estimate, e.g. 345000"
      />
      <TextField
        label="Mid"
        name="valuation_mid"
        type="number"
        step="0.01"
        defaultValue={numberValue(valuation?.valuation_mid)}
        placeholder="Mid estimate, e.g. 363000"
      />
      <TextField
        label="High"
        name="valuation_high"
        type="number"
        step="0.01"
        defaultValue={numberValue(valuation?.valuation_high)}
        placeholder="High estimate, e.g. 381000"
      />
      <TextField
        label="Valuation date"
        name="valuation_date"
        type="date"
        defaultValue={valuation?.valuation_date ?? currentDate()}
      />
      <TextField
        label="Source URL"
        name="source_url"
        defaultValue={valuation?.source_url}
        placeholder="Paste Zoopla, Rightmove, agent or Land Registry link"
      />
      <TextField
        label="Notes"
        name="notes"
        defaultValue={valuation?.notes}
        placeholder="Condition, comparable sale, valuation caveats"
      />
      <div className="flex items-end">
        <SubmitButton>
          {valuation ? "Save valuation" : "Add valuation"}
        </SubmitButton>
      </div>
    </form>
  );
}

function ScenarioForm() {
  return (
    <form
      action={addMortgageScenario}
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-6"
    >
      <TextField
        label="Scenario name"
        name="name"
        placeholder="Current deal, 5% rate, overpay £200"
        required
      />
      <TextField
        label="Balance"
        name="balance"
        type="number"
        step="0.01"
        required
      />
      <TextField
        label="Interest rate %"
        name="interest_rate"
        type="number"
        step="0.001"
        required
      />
      <TextField
        label="Term years"
        name="term_years"
        type="number"
        step="1"
        defaultValue={25}
        required
      />
      <TextField
        label="Monthly overpayment"
        name="monthly_overpayment"
        type="number"
        step="0.01"
        defaultValue={0}
      />
      <div className="flex items-end">
        <SubmitButton>Add scenario</SubmitButton>
      </div>
    </form>
  );
}

function MoveQueryForm({ homes }: { homes: Home[] }) {
  const [title, setTitle] = useState("");
  const [propertyUrl, setPropertyUrl] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [postcode, setPostcode] = useState("");
  const [addressHint, setAddressHint] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [councilTaxBand, setCouncilTaxBand] = useState("");
  const [epcRating, setEpcRating] = useState("");
  const [targetDeposit, setTargetDeposit] = useState("");
  const [expectedRate, setExpectedRate] = useState("4.75");
  const [expectedTermYears, setExpectedTermYears] = useState("30");
  const [movingCosts, setMovingCosts] = useState("4000");
  const [councilTaxAnnual, setCouncilTaxAnnual] = useState("");
  const [heatingMonthly, setHeatingMonthly] = useState("");
  const [purchaseContext, setPurchaseContext] = useState("primary_home");
  const [councilTaxSourceUrl, setCouncilTaxSourceUrl] = useState("");
  const [councilTaxAuthority, setCouncilTaxAuthority] = useState("");
  const [mapEmbedUrl, setMapEmbedUrl] = useState("");
  const [mapLatitude, setMapLatitude] = useState("");
  const [mapLongitude, setMapLongitude] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);

  async function runListingLookup() {
    if (!propertyUrl.trim()) {
      setLookupMessage("Paste a Rightmove, Zoopla or OnTheMarket URL first.");
      return;
    }
    setLookupBusy(true);
    setLookupMessage(null);
    try {
      const response = await fetch("/api/property/move-query/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: propertyUrl,
          asking_price: askingPrice,
          target_deposit: targetDeposit,
          expected_rate: expectedRate,
          expected_term_years: expectedTermYears,
          purchase_context: purchaseContext,
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error)
        throw new Error(data.error || "Listing lookup failed");
      const parsed = data.parsed || {};
      const assumptions = data.assumptions || {};
      if (parsed.cleanTitle || parsed.title)
        setTitle(parsed.cleanTitle || parsed.title);
      if (parsed.askingPrice)
        setAskingPrice(String(Math.round(Number(parsed.askingPrice))));
      if (parsed.postcode) setPostcode(parsed.postcode);
      if (parsed.addressHint) setAddressHint(parsed.addressHint);
      if (parsed.bedrooms) setBedrooms(String(parsed.bedrooms));
      if (parsed.councilTaxBand) setCouncilTaxBand(parsed.councilTaxBand);
      if (parsed.councilTaxSourceUrl)
        setCouncilTaxSourceUrl(parsed.councilTaxSourceUrl);
      if (parsed.councilTaxAuthority)
        setCouncilTaxAuthority(parsed.councilTaxAuthority);
      if (parsed.mapEmbedUrl) setMapEmbedUrl(parsed.mapEmbedUrl);
      if (parsed.mapLatitude) setMapLatitude(String(parsed.mapLatitude));
      if (parsed.mapLongitude) setMapLongitude(String(parsed.mapLongitude));
      if (parsed.epcRating) setEpcRating(parsed.epcRating);
      if (assumptions.movingCostEstimate)
        setMovingCosts(
          String(Math.round(Number(assumptions.movingCostEstimate))),
        );
      if (assumptions.heatingMonthly)
        setHeatingMonthly(
          String(Math.round(Number(assumptions.heatingMonthly))),
        );
      if (assumptions.councilTaxAnnual)
        setCouncilTaxAnnual(
          String(Math.round(Number(assumptions.councilTaxAnnual))),
        );
      const confidence = Number(parsed.sourceConfidence || 0);
      setLookupMessage(
        parsed.sourceStatus === "url_ingested"
          ? `Listing found${confidence ? ` (${confidence}% source confidence)` : ""}. Check the filled fields, then save.`
          : "URL checked, but only partial data was found. Add the missing fields before saving.",
      );
    } catch (error: any) {
      setLookupMessage(
        error?.message ||
          "Could not read that property URL. You can still paste the URL and add the figures manually.",
      );
    } finally {
      setLookupBusy(false);
    }
  }

  return (
    <form action={addPropertyMoveQuery} className="space-y-5">
      <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
          I’m looking at houses
        </p>
        <h3 className="mt-2 text-xl font-black text-slate-950">
          Save a property search or rough target price
        </h3>
        <p className="mt-1 text-sm font-bold text-slate-600">
          Paste a listing URL where you have one. LOOP stores the source, then
          the enrichment layer can add council tax, EPC/energy assumptions,
          stamp duty, mortgage estimate and affordability scoring.
        </p>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="block">
          <span className="text-sm font-black text-slate-700">
            Property URL search
          </span>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              name="property_url"
              value={propertyUrl}
              onChange={(event) => setPropertyUrl(event.target.value)}
              placeholder="Paste Rightmove, Zoopla or OnTheMarket URL"
              className={inputClass}
            />
            <button
              type="button"
              onClick={runListingLookup}
              disabled={lookupBusy}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60"
            >
              {lookupBusy ? "Searching..." : "Search & fill"}
            </button>
          </div>
        </label>
        {lookupMessage ? (
          <p className="mt-2 text-xs font-bold text-slate-500">
            {lookupMessage}
          </p>
        ) : null}
      </div>
      <input
        type="hidden"
        name="council_tax_source_url"
        value={councilTaxSourceUrl}
      />
      <input
        type="hidden"
        name="council_tax_authority"
        value={councilTaxAuthority}
      />
      <input type="hidden" name="map_embed_url" value={mapEmbedUrl} />
      <input type="hidden" name="map_latitude" value={mapLatitude} />
      <input type="hidden" name="map_longitude" value={mapLongitude} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-sm font-black text-slate-700">
            Buying scenario
          </span>
          <select
            name="purchase_context"
            value={purchaseContext}
            onChange={(event) => setPurchaseContext(event.target.value)}
            className={inputClass}
          >
            <option value="primary_home">
              Main home / replacing current home
            </option>
            <option value="second_home">Second property</option>
            <option value="buy_to_let">Buy-to-let / investment property</option>
          </select>
        </label>
        <ControlledField
          label="Search name"
          name="title"
          value={title}
          onChange={setTitle}
          placeholder="Marsh Brook Close, Rixton"
          required
        />
        <ControlledField
          label="Rough / asking price"
          name="asking_price"
          value={askingPrice}
          onChange={setAskingPrice}
          type="number"
          step="0.01"
          placeholder="550000"
        />
        <ControlledField
          label="Postcode / area"
          name="postcode"
          value={postcode}
          onChange={setPostcode}
          placeholder="WA5, York, Harrogate"
        />
        <ControlledField
          label="Address hint"
          name="address_hint"
          value={addressHint}
          onChange={setAddressHint}
          placeholder="Street, estate, village"
        />
        <ControlledField
          label="Bedrooms"
          name="bedrooms"
          value={bedrooms}
          onChange={setBedrooms}
          type="number"
          step="1"
        />
        <ControlledField
          label="Deposit / equity to use"
          name="target_deposit"
          value={targetDeposit}
          onChange={setTargetDeposit}
          type="number"
          step="0.01"
          placeholder="Equity + cash after costs"
        />
        <ControlledField
          label="Expected rate %"
          name="expected_rate"
          value={expectedRate}
          onChange={setExpectedRate}
          type="number"
          step="0.001"
        />
        <ControlledField
          label="Term years"
          name="expected_term_years"
          value={expectedTermYears}
          onChange={setExpectedTermYears}
          type="number"
          step="1"
        />
        <ControlledField
          label="Moving costs"
          name="moving_cost_estimate"
          value={movingCosts}
          onChange={setMovingCosts}
          type="number"
          step="0.01"
          placeholder="Default is 1.2% of price, capped £3k-£12k"
        />
        <ControlledField
          label="Council tax band"
          name="council_tax_band"
          value={councilTaxBand}
          onChange={setCouncilTaxBand}
          placeholder="Optional until source lookup"
        />
        <ControlledField
          label="Council tax £/year"
          name="council_tax_estimate_annual"
          value={councilTaxAnnual}
          onChange={setCouncilTaxAnnual}
          type="number"
          step="0.01"
        />
        <ControlledField
          label="EPC rating"
          name="epc_rating"
          value={epcRating}
          onChange={setEpcRating}
          placeholder="A-G"
        />
        <ControlledField
          label="Energy / heating £/mo"
          name="expected_heating_cost_monthly"
          value={heatingMonthly}
          onChange={setHeatingMonthly}
          type="number"
          step="0.01"
        />
        <SelectField
          label="Compare against current home"
          name="home_id"
          defaultValue={homes[0]?.id ?? ""}
        >
          <option value="">No current home comparison</option>
          {homes.map((home) => (
            <option key={home.id} value={home.id}>
              {home.label}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Notes"
          name="notes"
          placeholder="School, commute, renovation risk, offer notes"
        />
      </div>
      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
        Mortgage estimate uses asking price minus deposit/equity, the selected
        rate and term. Council tax uses the listing band first; if the local
        council annual amount is not available yet, LOOP shows the band and
        marks the annual amount as an estimate until confirmed.
      </p>
      <SubmitButton>Save moving search</SubmitButton>
    </form>
  );
}

function MoveQueryDetail({
  query,
  currentAffordabilityScore,
  currentMonthlyCost,
}: {
  query: PropertyMoveQuery;
  currentAffordabilityScore?: AffordabilityScore | null;
  currentMonthlyCost?: number;
}) {
  const [showMortgageRange, setShowMortgageRange] = useState(false);
  const monthlyEnergy =
    Number(query.expected_heating_cost_monthly || 0) ||
    Number(query.epc_energy_cost_estimate_annual || 0) / 12;
  const councilTaxMonthly = moveCouncilTaxMonthly(query);
  const managementMonthly = moveManagementMonthly(query);
  const maintenanceMonthly = moveMaintenanceMonthly(query);
  const monthlyRunning = moveQueryRunningMonthly(query);
  const score = moveQueryScore(
    query,
    currentAffordabilityScore,
    Number(currentMonthlyCost || 0),
  );
  const confidence = moveQueryConfidence(query);
  const councilConfidence = Number(
    query.council_tax_confidence ??
      (query.payload as Record<string, any> | null)
        ?.council_tax_band_confidence ??
      confidence,
  );
  const reasons = moveScoreReasons(
    query,
    currentAffordabilityScore,
    Number(currentMonthlyCost || 0),
  );
  const mapEmbedUrl = moveMapEmbedUrl(query);
  const propertyUse = String(
    query.property_use ||
      (query.payload as Record<string, any> | null)?.property_use ||
      "primary_home",
  ).replaceAll("_", " ");
  const runningRows = [
    {
      label: "Mortgage",
      value: Number(query.expected_payment || 0),
      helper: `Based on ${formatMoney(query.expected_mortgage_balance)} over ${query.expected_term_years || 30} years at ${Number(query.expected_rate || 0).toFixed(2)}%.`,
    },
    {
      label: "Council tax",
      value: councilTaxMonthly,
      helper: query.council_tax_band
        ? `Band ${query.council_tax_band}${query.council_tax_authority ? ` · ${query.council_tax_authority}` : ""}.`
        : "Band not confirmed yet.",
    },
    {
      label: "Energy / heating",
      value: monthlyEnergy,
      helper: query.epc_rating
        ? `EPC ${query.epc_rating}.`
        : "EPC not confirmed yet.",
    },
    {
      label: "Estate / management",
      value: managementMonthly,
      helper: managementMonthly
        ? "User/listing supplied estate or management charge."
        : "No management/estate charge detected.",
    },
    {
      label: "Maintenance allowance",
      value: maintenanceMonthly,
      helper:
        "Planning allowance only; not included in headline mortgage estimate.",
    },
  ];
  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100">
        <div className="relative min-h-[240px]">
          {query.image_url ? (
            <img
              src={query.image_url}
              alt={displayMoveTitle(query)}
              className="absolute inset-0 h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : mapEmbedUrl ? (
            <iframe
              title={`${displayMoveTitle(query)} map`}
              src={mapEmbedUrl}
              className="absolute inset-0 h-full w-full border-0"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-slate-100 to-orange-100" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-slate-950/10 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-end justify-between gap-3">
            <div className="rounded-3xl bg-white/90 p-4 shadow-xl backdrop-blur">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">
                {query.source_status === "manual_price"
                  ? "Manual scenario"
                  : "Listing"}
              </p>
              <h3 className="mt-1 max-w-2xl text-2xl font-black text-slate-950">
                {displayMoveTitle(query)}
              </h3>
              <p className="mt-1 text-xs font-bold capitalize text-slate-500">
                {propertyUse} · {query.postcode || "postcode pending"}
              </p>
            </div>
            <button
              type="button"
              className="rounded-3xl bg-white/95 p-4 text-left shadow-xl ring-1 ring-white/70"
              title="Score breakdown is shown below"
            >
              <p className="text-xs font-black uppercase text-slate-400">
                Score
              </p>
              <p className="text-3xl font-black text-slate-950">{score}/100</p>
              <p className="text-xs font-bold text-orange-600">
                Current: {currentAffordabilityScore?.score ?? "—"}/100
              </p>
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-slate-400">Price</p>
          <p className="mt-1 text-xl font-black text-slate-950">
            {formatMoney(query.asking_price)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowMortgageRange((value) => !value)}
          className="rounded-3xl bg-slate-50 p-4 text-left transition hover:bg-blue-50 hover:ring-2 hover:ring-blue-200"
        >
          <p className="text-xs font-black uppercase text-slate-400">
            Mortgage est.
          </p>
          <p className="mt-1 text-xl font-black text-slate-950">
            {formatMoney(query.expected_payment)}/mo
          </p>
          <p className="text-xs font-bold text-blue-700">
            Click for payment range
          </p>
        </button>
        <div className="rounded-3xl bg-slate-50 p-4">
          <p className="text-xs font-black uppercase text-slate-400">
            Council tax
          </p>
          <p className="mt-1 text-xl font-black text-slate-950">
            {query.council_tax_band
              ? `Band ${query.council_tax_band}`
              : "Check"}
          </p>
          <p className="text-xs font-bold text-slate-500">
            {query.council_tax_estimate_annual
              ? `${formatMoney(query.council_tax_estimate_annual)}/yr`
              : "Annual amount pending"}
          </p>
        </div>
        <div
          className={`rounded-3xl p-4 ${confidence >= 95 ? "bg-emerald-50" : "bg-amber-50"}`}
        >
          <p className="text-xs font-black uppercase text-slate-500">
            Source confidence
          </p>
          <p className="mt-1 text-xl font-black text-slate-950">
            {confidence}%
          </p>
          <p className="text-xs font-bold text-slate-600">
            Target 95%+ before relying on scraped fields.
          </p>
        </div>
      </div>

      {showMortgageRange ? (
        <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
            Mortgage payment range
          </p>
          <p className="mt-1 text-sm font-bold text-blue-900/80">
            Uses the saved loan amount, rate and term. Once mortgage catalogue
            rows are filtered, this can be replaced by live cheapest-to-highest
            eligible deals.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {mortgagePaymentRange(query).map((row) => (
              <div key={row.label} className="rounded-2xl bg-white p-4">
                <p className="text-xs font-black uppercase text-slate-400">
                  {row.label}
                </p>
                <p className="mt-1 text-2xl font-black text-slate-950">
                  {formatMoney(row.payment)}/mo
                </p>
                <p className="text-xs font-bold text-slate-500">
                  {row.rate.toFixed(2)}% rate
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-5">
        <p className="text-xs font-black uppercase tracking-wide text-orange-600">
          Running cost breakdown
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {runningRows.map((row) => (
            <div key={row.label} className="rounded-2xl bg-slate-50 p-3">
              <dt className="text-xs font-bold text-slate-500">{row.label}</dt>
              <dd className="font-black text-slate-950">
                {row.value ? `${formatMoney(row.value)}/mo` : "—"}
              </dd>
              <p className="mt-1 text-[11px] font-bold text-slate-500">
                {row.helper}
              </p>
            </div>
          ))}
        </dl>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">Stamp duty</p>
            <p className="font-black text-slate-950">
              {formatMoney(query.stamp_duty_estimate)}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">Moving costs</p>
            <p className="font-black text-slate-950">
              {formatMoney(query.moving_cost_estimate)}
            </p>
            <p className="mt-1 text-[11px] font-bold text-slate-500">
              {String(
                (query.payload as Record<string, any> | null)
                  ?.moving_cost_basis ||
                  "Default planning estimate until removals/legal/furnishing costs are overridden.",
              )}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-500">Monthly headline</p>
            <p className="font-black text-slate-950">
              {formatMoney(monthlyRunning)}/mo
            </p>
            <p className="mt-1 text-[11px] font-bold text-slate-500">
              Mortgage + known recurring property costs. Maintenance shown
              separately as planning allowance.
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {query.property_url ? (
            <a
              href={query.property_url}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
            >
              Open listing
            </a>
          ) : null}
          {query.council_tax_source_url ? (
            <a
              href={query.council_tax_source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-full border border-slate-200 px-4 py-2 text-xs font-black text-slate-700"
            >
              Check council tax source
            </a>
          ) : null}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {reasons.map((item) => (
          <div
            key={item.label}
            className="rounded-3xl border border-slate-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  {item.label}
                </p>
                <p className="mt-1 text-sm font-bold text-slate-600">
                  {item.reason}
                </p>
              </div>
              <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">
                {item.label === "Council tax confidence"
                  ? councilConfidence
                  : item.score}
                /100
              </span>
            </div>
            <p className="mt-3 rounded-2xl bg-orange-50 px-3 py-2 text-xs font-black text-orange-700">
              Current comparison: {item.current}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function mortgageTermBadge(deal: HomeMortgageDeal) {
  const product = String(deal.product_name || "");
  const yearMatch = product.match(/\b(1|2|3|5|7|10)\s*(?:year|yr)/i);
  if (yearMatch) return `${yearMatch[1]}Y`;
  const type = String(deal.rate_type || "").toLowerCase();
  if (type.includes("tracker")) return "Tracker";
  if (type.includes("variable") || type.includes("svr")) return "Variable";
  return type.includes("fixed") ? "Fixed" : "Mortgage";
}

function lenderInitials(lender: string | null | undefined) {
  const words = String(lender || "Mortgage")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("") || "M"
  );
}

function HomeMapHero({
  home,
  owners,
  peopleById,
  deals,
  valuations,
  summary,
  affordabilityScore,
  maternityExposureScore,
  starredComparison,
  liabilityAllocations,
  onEdit,
  onAddMortgage,
  onAddValuation,
  onOpenAffordability,
  onOpenMortgage,
}: {
  home: Home;
  owners: HomeOwner[];
  peopleById: Map<string, Person>;
  deals: HomeMortgageDeal[];
  valuations: HomeValuationSource[];
  summary: ReturnType<typeof valuationSummary>;
  affordabilityScore: AffordabilityScore;
  maternityExposureScore: AffordabilityScore | null;
  starredComparison: MortgageComparisonBubble;
  liabilityAllocations: HomeMortgageLiabilityAllocation[];
  onEdit: () => void;
  onAddMortgage: () => void;
  onAddValuation: () => void;
  onOpenAffordability: () => void;
  onOpenMortgage: (deal: HomeMortgageDeal) => void;
}) {
  const mapsUrl = mapUrlForHome(home);
  const embedUrl = embedMapUrlForHome(home);
  const homeBalance = deals.reduce(
    (sum, deal) => sum + currentMortgageBalanceForDeal(deal),
    0,
  );
  const homePayment = deals.reduce(
    (sum, deal) => sum + mortgagePaymentForDeal(deal),
    0,
  );
  const ltv = summary.mid > 0 ? (homeBalance / summary.mid) * 100 : 0;
  const ownerNames =
    owners.length > 0
      ? owners
          .map((owner) => peopleById.get(owner.person_id)?.name ?? "Unknown")
          .join(", ")
      : "Not assigned";

  return (
    <SectionCard
      title="Tracked home"
      description="Click a home card below to change the focus. The map, valuation range and mortgage panel update together."
    >
      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="relative min-h-[390px] overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">
          {embedUrl ? (
            <iframe
              title={`${home.label} map`}
              src={embedUrl}
              className="absolute inset-0 h-full w-full border-0"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-200 via-slate-100 to-orange-100" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-slate-950/5 to-transparent" />
          <button
            type="button"
            onClick={onOpenAffordability}
            className="absolute right-4 top-4 rounded-3xl border border-white/50 bg-white/90 px-5 py-4 text-left shadow-xl backdrop-blur transition hover:-translate-y-0.5"
          >
            <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-600">
              Affordability
            </p>
            <p className="mt-1 text-3xl font-black text-slate-950">
              {affordabilityScore.score}/100
            </p>
            <p className="text-xs font-bold text-slate-500">
              Normal salary basis · {affordabilityScore.label}
            </p>
            {maternityExposureScore ? (
              <p className="mt-2 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-black text-amber-800">
                Maternity exposure {maternityExposureScore.score}/100
              </p>
            ) : null}
          </button>
          <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-orange-500 text-white shadow-2xl ring-8 ring-orange-500/20">
            ⌂
          </div>
          <div className="absolute bottom-4 left-4 right-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/30 bg-white/80 p-4 shadow-lg backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {statusLabel(home.ownership_status)}
              </p>
              <p className="mt-1 text-xl font-bold text-slate-950">
                {home.label}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {home.full_address || home.address_line || "No address"}
                {home.postcode ? ` · ${home.postcode}` : ""}
              </p>
            </div>
            <div className="rounded-2xl border border-white/30 bg-white/80 p-4 shadow-lg backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Valuation range
              </p>
              <p className="mt-1 text-lg font-bold text-slate-950">
                {formatMoney(summary.low)} – {formatMoney(summary.high)}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Mid {formatMoney(summary.mid)} · {summary.sourceCount} source(s)
              </p>
            </div>
            <div className="rounded-2xl border border-white/30 bg-white/80 p-4 shadow-lg backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Mortgage
              </p>
              <p className="mt-1 text-lg font-bold text-slate-950">
                {formatMoney(homeBalance)}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {ltv.toFixed(1)}% LTV · {formatMoney(homePayment)}/mo
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Home details
                </p>
                <h3 className="mt-1 text-2xl font-bold text-slate-950">
                  {home.label}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Owners: {ownerNames}
                </p>
              </div>
              <button
                onClick={onEdit}
                className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white"
              >
                Edit
              </button>
            </div>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Purchase</dt>
                <dd className="font-bold">
                  {formatMoney(home.purchase_price)}
                </dd>
                <dd className="text-xs text-slate-500">
                  {home.purchase_date || "Date not set"}
                </dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Source average</dt>
                <dd className="font-bold">
                  {formatMoney(summary.sourceMid || summary.mid)}
                </dd>
                <dd className="text-xs text-slate-500">
                  {summary.hasManualOverride
                    ? "Manual override active"
                    : "Weighted by confidence"}
                </dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Coordinates</dt>
                <dd className="font-bold">
                  {home.latitude && home.longitude ? "Set" : "Missing"}
                </dd>
                <dd className="text-xs text-slate-500">
                  {home.latitude && home.longitude
                    ? `${home.latitude}, ${home.longitude}`
                    : "Use lookup"}
                </dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Lookup</dt>
                <dd className="font-bold capitalize">
                  {home.lookup_source?.replaceAll("_", " ") || "Manual"}
                </dd>
                <dd className="text-xs text-slate-500">
                  {home.last_lookup_at || "Not checked"}
                </dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                >
                  Open map
                </a>
              ) : null}
              {home.purchase_source_url ? (
                <a
                  href={home.purchase_source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
                >
                  Purchase/source
                </a>
              ) : null}
              <button
                onClick={onAddValuation}
                className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white"
              >
                + valuation
              </button>
              <button
                onClick={onAddMortgage}
                className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white"
              >
                + mortgage
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Attached mortgage
                </p>
                <p className="mt-1 text-sm font-bold text-slate-600">
                  Open a mortgage bubble for the full rate, balance, dates and
                  liability split.
                </p>
              </div>
              <button
                onClick={onAddMortgage}
                className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white"
              >
                + Add
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {deals.map((deal) => {
                const projection = projectedMortgageForDeal(deal);
                const payment = mortgagePaymentForDeal(deal);
                const allocations = liabilityAllocations.filter(
                  (allocation) => allocation.home_mortgage_deal_id === deal.id,
                );
                const liabilityLabel = allocations.length
                  ? allocations
                      .map(
                        (allocation) =>
                          `${peopleById.get(allocation.person_id)?.name || "Unknown"} ${Number(allocation.liability_percent || 0).toFixed(0)}%`,
                      )
                      .join(" · ")
                  : "Liability not allocated";
                return (
                  <button
                    key={deal.id}
                    type="button"
                    onClick={() => onOpenMortgage(deal)}
                    className="relative min-h-48 overflow-visible rounded-[2rem] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-5 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                  >
                    <span className="absolute -left-3 -top-3 grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-sm font-black text-white shadow-lg ring-4 ring-white">
                      {lenderInitials(deal.lender)}
                    </span>
                    <span className="absolute right-4 top-4 rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">
                      {mortgageTermBadge(deal)}
                    </span>
                    <div className="flex h-full flex-col items-center justify-center pt-5 text-center">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                        {deal.lender || "Mortgage provider"}
                      </p>
                      <p className="mt-2 text-4xl font-black text-slate-950">
                        {formatMoney(payment)}
                        <span className="text-base">/mo</span>
                      </p>
                      <p className="mt-2 text-sm font-black text-slate-700">
                        {formatMoney(projection.projectedBalance)} left
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {Number(deal.interest_rate || 0).toFixed(2)}% ·{" "}
                        {liabilityLabel}
                      </p>
                    </div>
                  </button>
                );
              })}
              {starredComparison ? (
                <div
                  className={`flex min-h-48 flex-col items-center justify-center rounded-full border-8 p-5 text-center shadow-lg ${starredComparison.monthlyDelta >= 0 ? "border-emerald-100 bg-emerald-50 text-emerald-950" : "border-orange-100 bg-orange-50 text-orange-950"}`}
                  style={{
                    transform: `scale(${Math.min(1.12, Math.max(0.88, 0.9 + Math.abs(starredComparison.monthlyDelta) / 1000))})`,
                  }}
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.18em]">
                    {starredComparison.sourceKind === "fallback" ? "Estimated follow-on" : "★ Saved comparison"}
                  </p>
                  <p className="mt-1 text-sm font-black">
                    {starredComparison.lender}
                  </p>
                  <p className="mt-1 text-3xl font-black">
                    {starredComparison.monthlyDelta >= 0 ? "+" : "-"}
                    {formatMoney(Math.abs(starredComparison.monthlyDelta))}
                    <span className="text-xs">/mo</span>
                  </p>
                  <p className="mt-1 text-xs font-bold">
                    {starredComparison.monthlyDelta >= 0
                      ? "better than current"
                      : "more than current"}{" "}
                    · {starredComparison.rate.toFixed(2)}%
                  </p>
                </div>
              ) : deals.length > 0 ? (
                <div className="flex min-h-48 flex-col items-center justify-center rounded-full border-4 border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                  <p className="text-sm font-black text-slate-700">
                    No saved comparison
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    Until you shortlist or star a deal, LOOP uses the estimated follow-on/SVR rate.
                  </p>
                </div>
              ) : null}
              {deals.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-bold text-slate-500 sm:col-span-2">
                  You have added the house. Do you have a mortgage? Add it now,
                  or leave this blank for a mortgage-free/rented home.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function monthsUntilMortgageDealEnd(deal: HomeMortgageDeal) {
  return monthsBetweenToday(deal.initial_period_end || deal.end_date);
}

function isVariableMortgageDeal(deal: HomeMortgageDeal) {
  const type = String(deal.rate_type || "").toLowerCase();
  return (
    type.includes("variable") ||
    type.includes("tracker") ||
    type.includes("svr")
  );
}

function mortgageWatchStatus(deal: HomeMortgageDeal) {
  if (isVariableMortgageDeal(deal)) {
    return {
      label: "Variable / tracker",
      tone: "bg-blue-50 text-blue-800 ring-blue-100",
      detail: "Compare now and keep watching.",
    };
  }
  const months = monthsUntilMortgageDealEnd(deal);
  if (months === null)
    return {
      label: "End date missing",
      tone: "bg-amber-50 text-amber-800 ring-amber-100",
      detail: "Add a rate-end date to activate watch.",
    };
  if (months <= 0)
    return {
      label: "Deal ended",
      tone: "bg-red-50 text-red-800 ring-red-100",
      detail: "Compare immediately.",
    };
  if (months <= 12)
    return {
      label: `${months} month${months === 1 ? "" : "s"} left`,
      tone: "bg-orange-50 text-orange-800 ring-orange-100",
      detail: "Renewal watch is relevant now.",
    };
  return {
    label: `${months} months left`,
    tone: "bg-emerald-50 text-emerald-800 ring-emerald-100",
    detail: "Monitor but avoid overreacting.",
  };
}

function recommendationTermMonths(rec: MortgageRenewalRecommendation) {
  const payloadTerm = Number(
    rec.payload?.initialTermMonths || rec.payload?.initial_term_months || 0,
  );
  if (payloadTerm > 0) return payloadTerm;
  const name =
    `${rec.product_name || ""} ${rec.recommendation_kind || ""}`.toLowerCase();
  const yearMatch = name.match(/(2|3|5|10)\s*(?:yr|year)/i);
  if (yearMatch) return Number(yearMatch[1]) * 12;
  const monthMatch = name.match(/(24|36|60|120)\s*(?:m|month)/i);
  if (monthMatch) return Number(monthMatch[1]);
  return null;
}

function termLabel(months: number | null) {
  if (!months) return "Check source";
  if (months % 12 === 0)
    return `${months / 12} year${months / 12 === 1 ? "" : "s"}`;
  return `${months} months`;
}

function marketDealTermMonths(deal: MortgageMarketDeal) {
  const months = Number(deal.initial_term_months || 0);
  if (months > 0) return months;
  const name = `${deal.product_name || ""}`.toLowerCase();
  if (/\b(svr|variable|tracker)\b/.test(name)) return null;
  const match = name.match(/\b(2|3|5|10)\s*(?:yr|year)/);
  return match ? Number(match[1]) * 12 : null;
}

function marketDealTermPillClass(
  months: number | null,
  productName?: string | null,
) {
  const text = String(productName || "").toLowerCase();
  if (/\b(svr|variable|tracker)\b/.test(text))
    return "bg-purple-50 text-purple-800 ring-purple-200";
  if (months === 24) return "bg-blue-50 text-blue-800 ring-blue-200";
  if (months === 36) return "bg-indigo-50 text-indigo-800 ring-indigo-200";
  if (months === 60) return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (months === 120) return "bg-teal-50 text-teal-800 ring-teal-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

function MarketMortgageDealCard({ deal }: { deal: MortgageMarketDeal }) {
  const termMonths = marketDealTermMonths(deal);
  const term = /\b(svr|variable|tracker)\b/i.test(
    String(deal.product_name || ""),
  )
    ? "Variable / tracker"
    : termLabel(termMonths);
  return (
    <article className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">
            Market product
          </p>
          <h3 className="mt-1 text-lg font-black text-slate-950">
            {deal.lender_name || "Lender"}
          </h3>
          <p className="mt-1 text-sm font-bold text-slate-600">
            {deal.product_name || "Mortgage product"}
          </p>
        </div>
        <p className="text-3xl font-black text-slate-950">
          {Number(deal.rate_percent || 0).toFixed(2)}%
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span
          className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${marketDealTermPillClass(termMonths, deal.product_name)}`}
        >
          {term}
        </span>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800 ring-1 ring-amber-200">
          {deal.product_fee
            ? `${formatMoney(deal.product_fee)} fee`
            : "No/unknown fee"}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">
          {deal.ltv_max ? `${deal.ltv_max}% LTV` : "LTV check"}
        </span>
      </div>
      <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
        This is a checked catalogue row, not personalised advice yet. Run
        Mortgage Watch to calculate eligibility, payment and total-cost
        comparison against your current mortgage.
      </p>
      {deal.source_url ? (
        <a
          href={deal.source_url}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
        >
          Assess on lender/site
        </a>
      ) : null}
    </article>
  );
}

function recommendationInitialCost(rec: MortgageRenewalRecommendation) {
  const months = recommendationTermMonths(rec);
  const payment = Number(rec.estimated_new_payment || 0);
  const fee = Number(rec.product_fee || 0);
  if (!months || !payment) return null;
  return payment * months + fee;
}

function effectiveInitialPeriodRate(rec: MortgageRenewalRecommendation) {
  const balance = Number(
    rec.payload?.balance || rec.payload?.currentBalance || 0,
  );
  const months = recommendationTermMonths(rec);
  const cost = recommendationInitialCost(rec);
  if (!balance || !months || !cost) return null;
  return (cost / balance) * (12 / months) * 100;
}

function mortgageDealAnchorLabel(deal: HomeMortgageDeal) {
  const status = mortgageWatchStatus(deal);
  return status.label;
}

function MortgageCommandStrip({
  balance,
  payment,
  recommendations,
  marketDeals,
  deals,
  affordabilityScore,
  onOpenDeals,
}: {
  balance: number;
  payment: number;
  recommendations: MortgageRenewalRecommendation[];
  marketDeals: MortgageMarketDeal[];
  deals: HomeMortgageDeal[];
  affordabilityScore: AffordabilityScore;
  onOpenDeals: () => void;
}) {
  const watchedDeals = deals.filter(
    (deal) =>
      isVariableMortgageDeal(deal) ||
      (monthsUntilMortgageDealEnd(deal) ?? 999) <= 12,
  ).length;
  const availableDealCount = recommendations.length || marketDeals.length;
  const improvementLabel =
    recommendations.length > 0
      ? `${recommendations.length} to review`
      : affordabilityScore.score >= 90
        ? "100/100"
        : `${affordabilityScore.score}/100`;
  const improvementCopy =
    recommendations.length > 0
      ? "Review possible mortgage improvements."
      : affordabilityScore.score >= 90
        ? "You’re nailing it."
        : "Open the score on your property for detail.";

  return (
    <section className="grid gap-4 md:grid-cols-4">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
          Mortgage balance
        </p>
        <p className="mt-2 text-3xl font-black text-slate-950">
          {formatMoney(balance)}
        </p>
        <p className="mt-1 text-xs font-bold text-slate-500">
          Projected from attached mortgage records.
        </p>
      </div>
      <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
          Mortgage payment
        </p>
        <p className="mt-2 text-3xl font-black text-slate-950">
          {formatMoney(payment)}
        </p>
        <p className="mt-1 text-xs font-bold text-slate-500">
          Monthly payment used in household logic.
        </p>
      </div>
      <button
        type="button"
        onClick={onOpenDeals}
        className="rounded-[2rem] border border-blue-200 bg-blue-50 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-100"
      >
        <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
          Deals available
        </p>
        <p className="mt-2 text-3xl font-black text-slate-950">
          {availableDealCount}
        </p>
        <p className="mt-1 text-xs font-bold text-blue-800">
          {watchedDeals
            ? `${watchedDeals} mortgage record(s) are watch-ready.`
            : "Add an end date or variable rate to activate."}
        </p>
      </button>
      <button
        type="button"
        onClick={onOpenDeals}
        className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-100"
      >
        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
          Improvements
        </p>
        <p className="mt-2 text-3xl font-black text-slate-950">
          {improvementLabel}
        </p>
        <p className="mt-1 text-xs font-bold text-emerald-800">
          {improvementCopy}
        </p>
      </button>
    </section>
  );
}

function HomeTabNav({
  active,
  onChange,
  workspacePreference,
  onEditWorkspace,
}: {
  active: HomeDashboardTab;
  onChange: (tab: HomeDashboardTab) => void;
  workspacePreference: MortgageWorkspacePreference | null;
  onEditWorkspace: () => void;
}) {
  const tabs: { key: HomeDashboardTab; label: string; helper: string }[] = [
    {
      key: "overview",
      label: "House overview",
      helper: "Map, equity and current record",
    },
    {
      key: "mortgage_deals",
      label: "Mortgage deals",
      helper: "Watch, sourced deals and action",
    },
    {
      key: "moving_home",
      label: workspacePreference?.moving_home_label || "Moving home",
      helper:
        workspacePreference?.moving_home_description ||
        "Saved searches and move costs",
    },
    {
      key: "valuation_sources",
      label: "Valuation sources",
      helper: "Manual and automated valuation trail",
    },
  ];
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onEditWorkspace}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600"
        >
          Rename moving tab
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`rounded-3xl border p-4 text-left transition ${active === tab.key ? "border-slate-950 bg-slate-950 text-white shadow-xl shadow-slate-950/15" : "border-slate-200 bg-white text-slate-950 hover:border-orange-200 hover:bg-orange-50"}`}
          >
            <p className="text-sm font-black">{tab.label}</p>
            <p
              className={`mt-1 text-xs font-bold ${active === tab.key ? "text-slate-300" : "text-slate-500"}`}
            >
              {tab.helper}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function MortgageDealsPanel({
  home,
  deals,
  recommendations,
  marketDeals,
  dealPreferences,
  onAddMortgage,
  onEditMortgage,
}: {
  home: Home | undefined;
  deals: HomeMortgageDeal[];
  recommendations: MortgageRenewalRecommendation[];
  marketDeals: MortgageMarketDeal[];
  dealPreferences: MortgageDealPreference[];
  onAddMortgage: () => void;
  onEditMortgage: (deal: HomeMortgageDeal) => void;
}) {
  const watchReady = deals.filter(
    (deal) =>
      isVariableMortgageDeal(deal) ||
      (monthsUntilMortgageDealEnd(deal) ?? 999) <= 12,
  );
  const router = useRouter();
  const [isSavingPreference, startPreferenceTransition] = useTransition();
  const [preferenceMessage, setPreferenceMessage] = useState<string | null>(null);
  const [dealSearch, setDealSearch] = useState("");
  const [termFilter, setTermFilter] = useState("all");
  const [comparisonTermYears, setComparisonTermYears] = useState("30");
  const [extraCosts, setExtraCosts] = useState("0");
  const [absorbCosts, setAbsorbCosts] = useState(false);
  const [selectedComparison, setSelectedComparison] = useState<{
    id: string;
    lender: string;
    product: string;
    rate: number;
    fee: number;
    termMonths: number | null;
    sourceUrl?: string | null;
    sourceKind: "market" | "recommendation" | "fallback";
  } | null>(null);
  const persistedShortlistIds = useMemo(
    () =>
      new Set(
        dealPreferences
          .filter((preference) => preference.is_shortlisted)
          .map((preference) => preference.source_id),
      ),
    [dealPreferences],
  );
  const [shortlistedDealIds, setShortlistedDealIds] = useState<Set<string>>(
    () => new Set(persistedShortlistIds),
  );
  const [showShortlistedOnly, setShowShortlistedOnly] = useState(false);
  const shortlistLimit = 1; // tier gate placeholder: higher paid tiers can raise this in the service plan.
  function toggleShortlist(dealId: string, sourceKind: "market" | "recommendation") {
    const nextValue = !shortlistedDealIds.has(dealId);
    const previous = new Set(shortlistedDealIds);
    setShortlistedDealIds((current) => {
      const next = new Set(current);
      if (!nextValue) next.delete(dealId);
      else {
        if (next.size >= shortlistLimit) next.clear();
        next.add(dealId);
      }
      return next;
    });
    setPreferenceMessage("Saving shortlist…");
    startPreferenceTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("home_id", home?.id || "");
        formData.set("source_kind", sourceKind);
        formData.set("source_id", dealId);
        formData.set("intent", "shortlist");
        formData.set("next_value", String(nextValue));
        await saveMortgageDealPreference(formData);
        setPreferenceMessage(nextValue ? "Shortlisted and saved" : "Removed from shortlist");
        router.refresh();
      } catch (error) {
        setShortlistedDealIds(previous);
        setPreferenceMessage(error instanceof Error ? error.message : "Could not save shortlist");
      }
    });
  }

  const currentBalance = deals[0] ? currentMortgageBalanceForDeal(deals[0]) : 0;
  const currentPayment = deals[0] ? mortgagePaymentForDeal(deals[0]) : 0;
  const currentRate = deals[0] ? Number(deals[0].interest_rate || 0) : 0;
  const selectableFromMarket = marketDeals.map((deal) => ({
    id: deal.id,
    lender: deal.lender_name || "Lender",
    product: deal.product_name || "Mortgage product",
    rate: Number(deal.rate_percent || 0),
    fee: Number(deal.product_fee || 0),
    termMonths: marketDealTermMonths(deal),
    sourceUrl: deal.source_url,
    sourceKind: "market" as const,
    raw: deal,
  }));
  const selectableFromRecommendations = recommendations.map((rec) => ({
    id: rec.id,
    lender: rec.lender_name || "Lender",
    product: rec.product_name || "Mortgage product",
    rate: Number(rec.suggested_rate || rec.current_rate || 0),
    fee: Number(rec.product_fee || 0),
    termMonths: recommendationTermMonths(rec),
    sourceUrl: rec.source_url,
    sourceKind: "recommendation" as const,
    raw: rec,
  }));
  const starredPreference = dealPreferences.find(
    (preference) =>
      preference.is_starred &&
      (!home || !preference.home_id || preference.home_id === home.id),
  );
  const starredDefault = starredPreference
    ? [...selectableFromRecommendations, ...selectableFromMarket].find(
        (deal) =>
          deal.id === starredPreference.source_id &&
          deal.sourceKind === starredPreference.source_kind,
      ) || null
    : null;
  const selected =
    selectedComparison ||
    starredDefault ||
    selectableFromRecommendations[0] ||
    selectableFromMarket[0] ||
    null;
  const extraBorrowing =
    (absorbCosts ? Number(extraCosts || 0) : 0) + Number(selected?.fee || 0);
  const comparisonBalance = Math.max(0, currentBalance + extraBorrowing);
  const comparisonPayment = selected?.rate
    ? calculateMonthlyMortgagePayment({
        balance: comparisonBalance,
        annualInterestRate: selected.rate,
        termYears: Math.max(1, Number(comparisonTermYears || 30)),
      })
    : 0;
  const comparisonSaving =
    currentPayment && comparisonPayment
      ? currentPayment - comparisonPayment
      : 0;
  const comparisonInitialMonths = selected?.termMonths || 24;
  const comparisonInitialCost = comparisonPayment
    ? comparisonPayment * comparisonInitialMonths + Number(selected?.fee || 0)
    : 0;

  const termMatches = (months: number | null, product: string) => {
    if (termFilter === "all") return true;
    const text = product.toLowerCase();
    if (termFilter === "variable")
      return /tracker|variable|svr/.test(text) || !months;
    return months === Number(termFilter) * 12;
  };
  const searchMatches = (lender: string, product: string) => {
    const q = dealSearch.trim().toLowerCase();
    if (!q) return true;
    return `${lender} ${product}`.toLowerCase().includes(q);
  };
  const shortlistMatches = (id: string) =>
    !showShortlistedOnly || shortlistedDealIds.has(id);
  const preferenceFor = (
    sourceKind: "market" | "recommendation",
    sourceId: string,
  ) =>
    dealPreferences.find(
      (preference) =>
        preference.source_kind === sourceKind &&
        preference.source_id === sourceId,
    );
  const filteredRecommendations = selectableFromRecommendations.filter(
    (deal) =>
      termMatches(deal.termMonths, deal.product) &&
      searchMatches(deal.lender, deal.product) &&
      shortlistMatches(deal.id),
  );
  const filteredMarketDeals = selectableFromMarket.filter(
    (deal) =>
      termMatches(deal.termMonths, deal.product) &&
      searchMatches(deal.lender, deal.product) &&
      shortlistMatches(deal.id),
  );

  return (
    <div className="space-y-6" id="mortgage-watch">
      <SectionCard
        title="Mortgage watch"
        description="For users in the final year of a deal, or already on variable/tracker/SVR, LOOP compares current-lender product-transfer options against wider-market rows once source data is connected."
      >
        <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-3xl border border-orange-200 bg-orange-50 p-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-700">
              Renewal radar
            </p>
            <h3 className="mt-2 text-2xl font-black text-slate-950">
              Current lender + whole market
            </h3>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-700">
              Add a mortgage end date or mark the rate as variable. The watch
              then checks product-transfer style deals first, wider market
              second, and stages recommendations for the user to review.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-4">
                <p className="text-xs font-bold text-slate-500">
                  Active mortgage records
                </p>
                <p className="text-2xl font-black text-slate-950">
                  {deals.length}
                </p>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <p className="text-xs font-bold text-slate-500">Watch-ready</p>
                <p className="text-2xl font-black text-slate-950">
                  {watchReady.length}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onAddMortgage}
              className="mt-4 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white"
            >
              + Add mortgage/rate
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {deals.map((deal) => {
              const projection = projectedMortgageForDeal(deal);
              const status = mortgageWatchStatus(deal);
              return (
                <article
                  key={deal.id}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                        {deal.lender || "Mortgage lender"}
                      </p>
                      <h3 className="mt-1 text-lg font-black text-slate-950">
                        {deal.product_name ||
                          deal.rate_type.replaceAll("_", " ")}
                      </h3>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${status.tone}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <dt className="text-xs font-bold text-slate-500">
                        Balance
                      </dt>
                      <dd className="font-black text-slate-950">
                        {formatMoney(projection.projectedBalance)}
                      </dd>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <dt className="text-xs font-bold text-slate-500">
                        Payment
                      </dt>
                      <dd className="font-black text-slate-950">
                        {formatMoney(mortgagePaymentForDeal(deal))}/mo
                      </dd>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <dt className="text-xs font-bold text-slate-500">Rate</dt>
                      <dd className="font-black text-slate-950">
                        {Number(deal.interest_rate || 0).toFixed(2)}%
                      </dd>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <dt className="text-xs font-bold text-slate-500">Ends</dt>
                      <dd className="font-black text-slate-950">
                        {deal.initial_period_end || deal.end_date || "Add date"}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs font-bold text-slate-500">
                    {status.detail}
                  </p>
                  <div className="mt-4 flex justify-end gap-3">
                    <button
                      onClick={() => onEditMortgage(deal)}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700"
                    >
                      Edit
                    </button>
                    <form action={deleteHomeMortgageDeal}>
                      <input type="hidden" name="id" value={deal.id} />
                      <button className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-black text-red-600">
                        Delete
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
            {deals.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-bold text-slate-500 md:col-span-2">
                No mortgage/rate record attached to {home?.label || "this home"}{" "}
                yet.
              </div>
            ) : null}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Sourced deals for you"
        description="Search/filter published rows, select one for comparison, then adjust term/cost assumptions before opening the lender site."
      >
        <div className="mb-5 rounded-[2rem] border border-blue-100 bg-blue-50 p-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_160px_140px_160px_auto] lg:items-end">
            <label className="block">
              <span className="text-xs font-black uppercase text-blue-700">
                Search lender/product
              </span>
              <input
                value={dealSearch}
                onChange={(event) => setDealSearch(event.target.value)}
                placeholder="NatWest, tracker, 5 year..."
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase text-blue-700">
                Filter term
              </span>
              <select
                value={termFilter}
                onChange={(event) => setTermFilter(event.target.value)}
                className={inputClass}
              >
                <option value="all">All</option>
                <option value="2">2 year</option>
                <option value="3">3 year</option>
                <option value="5">5 year</option>
                <option value="10">10 year</option>
                <option value="variable">Variable/tracker</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase text-blue-700">
                Mortgage term
              </span>
              <input
                value={comparisonTermYears}
                onChange={(event) => setComparisonTermYears(event.target.value)}
                type="number"
                min="1"
                max="40"
                step="1"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase text-blue-700">
                Costs to absorb
              </span>
              <input
                value={extraCosts}
                onChange={(event) => setExtraCosts(event.target.value)}
                type="number"
                step="100"
                placeholder="Stamp/move costs"
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700">
              <input
                type="checkbox"
                checked={absorbCosts}
                onChange={(event) => setAbsorbCosts(event.target.checked)}
              />{" "}
              Add costs to loan
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-3">
            <div>
              <p className="text-sm font-black text-slate-950">
                Shortlist folder
              </p>
              <p className="text-xs font-bold text-slate-500">
                Starter keeps one shortlisted deal; higher tiers can compare
                more than one side by side.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowShortlistedOnly((value) => !value)}
              className={`rounded-full px-4 py-2 text-xs font-black ${showShortlistedOnly ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}
            >
              {showShortlistedOnly
                ? "Showing shortlist"
                : `Show shortlist (${shortlistedDealIds.size})`}
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <div className="rounded-2xl bg-white p-3">
              <p className="text-xs font-bold text-slate-500">Selected</p>
              <p className="font-black text-slate-950">
                {selected
                  ? `${selected.lender} · ${selected.rate.toFixed(2)}%`
                  : "Select a deal"}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-3">
              <p className="text-xs font-bold text-slate-500">Balance used</p>
              <p className="font-black text-slate-950">
                {formatMoney(comparisonBalance)}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-3">
              <p className="text-xs font-bold text-slate-500">Est. payment</p>
              <p className="font-black text-slate-950">
                {comparisonPayment
                  ? `${formatMoney(comparisonPayment)}/mo`
                  : "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-3">
              <p className="text-xs font-bold text-slate-500">Vs current</p>
              <p
                className={`font-black ${comparisonSaving >= 0 ? "text-emerald-700" : "text-red-600"}`}
              >
                {comparisonPayment
                  ? `${comparisonSaving >= 0 ? "+" : ""}${formatMoney(comparisonSaving)}/mo`
                  : "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-3">
              <p className="text-xs font-bold text-slate-500">
                Initial-period cost
              </p>
              <p className="font-black text-slate-950">
                {comparisonInitialCost
                  ? formatMoney(comparisonInitialCost)
                  : "—"}
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {filteredRecommendations.map((deal) => {
            const raw = deal.raw as MortgageRenewalRecommendation;
            const totalCost = recommendationInitialCost(raw);
            const effectiveRate = effectiveInitialPeriodRate(raw);
            const saving = Number(raw.estimated_monthly_saving || 0);
            return (
              <article
                key={deal.id}
                className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-blue-700">
                      Personalised watch
                    </p>
                    <h3 className="mt-1 text-lg font-black text-slate-950">
                      {deal.lender}
                    </h3>
                    <p className="mt-1 text-sm font-bold text-slate-600">
                      {deal.product}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${saving > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {saving > 0
                      ? `${formatMoney(saving)}/mo better`
                      : "compare"}
                  </span>
                </div>
                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <dt className="text-xs font-bold text-slate-500">
                      Time frame
                    </dt>
                    <dd className="font-black text-slate-950">
                      {termLabel(deal.termMonths)}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <dt className="text-xs font-bold text-slate-500">Rate</dt>
                    <dd className="font-black text-slate-950">
                      {deal.rate ? `${deal.rate.toFixed(2)}%` : "Check"}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <dt className="text-xs font-bold text-slate-500">Cost</dt>
                    <dd className="font-black text-slate-950">
                      {formatMoney(raw.estimated_new_payment)}/mo
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <dt className="text-xs font-bold text-slate-500">
                      Product fee
                    </dt>
                    <dd className="font-black text-slate-950">
                      {formatMoney(deal.fee)}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <dt className="text-xs font-bold text-slate-500">
                      Total cost
                    </dt>
                    <dd className="font-black text-slate-950">
                      {totalCost ? formatMoney(totalCost) : "Check source"}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <dt className="text-xs font-bold text-slate-500">
                      Effective rate
                    </dt>
                    <dd className="font-black text-slate-950">
                      {effectiveRate
                        ? `${effectiveRate.toFixed(2)}%`
                        : deal.rate
                          ? `${deal.rate.toFixed(2)}%`
                          : "Check"}
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
                  {raw.reason ||
                    "Review the deal criteria, LTV band, fees and eligibility before acting."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedComparison(deal)}
                    className="rounded-full bg-blue-600 px-4 py-2 text-xs font-black text-white"
                  >
                    Select for comparison
                  </button>
                  <form action={saveMortgageDealPreference}>
                    <input
                      type="hidden"
                      name="home_id"
                      value={home?.id || ""}
                    />
                    <input
                      type="hidden"
                      name="source_kind"
                      value="recommendation"
                    />
                    <input type="hidden" name="source_id" value={deal.id} />
                    <input type="hidden" name="intent" value="star" />
                    <input
                      type="hidden"
                      name="next_value"
                      value={
                        preferenceFor("recommendation", deal.id)?.is_starred
                          ? "false"
                          : "true"
                      }
                    />
                    <button
                      className={`rounded-full px-4 py-2 text-xs font-black ${preferenceFor("recommendation", deal.id)?.is_starred ? "bg-amber-400 text-slate-950" : "bg-slate-100 text-slate-700"}`}
                    >
                      {preferenceFor("recommendation", deal.id)?.is_starred
                        ? "★ Default"
                        : "☆ Make default"}
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={() => toggleShortlist(deal.id, "recommendation")}
                    className={`rounded-full px-4 py-2 text-xs font-black ${shortlistedDealIds.has(deal.id) ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-700 ring-1 ring-orange-200"}`}
                  >
                    {shortlistedDealIds.has(deal.id)
                      ? "Shortlisted"
                      : "Shortlist"}
                  </button>
                  {deal.sourceUrl ? (
                    <a
                      href={deal.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
                    >
                      Assess on lender/site
                    </a>
                  ) : null}
                  <form action={reportMortgageRecommendationIssue}>
                    <input
                      type="hidden"
                      name="recommendation_id"
                      value={deal.id}
                    />
                    <input
                      type="hidden"
                      name="issue_kind"
                      value="broken_or_wrong"
                    />
                    <button className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-700">
                      Report wrong/broken
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
          {filteredRecommendations.length === 0
            ? filteredMarketDeals.map((deal) => {
                const term = /\b(svr|variable|tracker)\b/i.test(deal.product)
                  ? "Variable / tracker"
                  : termLabel(deal.termMonths);
                return (
                  <article
                    key={deal.id}
                    className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                          Market product
                        </p>
                        <h3 className="mt-1 text-lg font-black text-slate-950">
                          {deal.lender}
                        </h3>
                        <p className="mt-1 text-sm font-bold text-slate-600">
                          {deal.product}
                        </p>
                      </div>
                      <p className="text-3xl font-black text-slate-950">
                        {deal.rate.toFixed(2)}%
                      </p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ring-1 ${marketDealTermPillClass(deal.termMonths, deal.product)}`}
                      >
                        {term}
                      </span>
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800 ring-1 ring-amber-200">
                        {deal.fee
                          ? `${formatMoney(deal.fee)} fee`
                          : "No/unknown fee"}
                      </span>
                      {(deal.raw as MortgageMarketDeal).ltv_max ? (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">{`${(deal.raw as MortgageMarketDeal).ltv_max}% LTV`}</span>
                      ) : null}
                    </div>
                    <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">
                      Use comparison to model the monthly payment, product fee,
                      term and optional moving/stamp costs against your current
                      mortgage.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedComparison(deal)}
                        className="rounded-full bg-blue-600 px-4 py-2 text-xs font-black text-white"
                      >
                        Select for comparison
                      </button>
                      <form action={saveMortgageDealPreference}>
                        <input
                          type="hidden"
                          name="home_id"
                          value={home?.id || ""}
                        />
                        <input
                          type="hidden"
                          name="source_kind"
                          value="market"
                        />
                        <input type="hidden" name="source_id" value={deal.id} />
                        <input type="hidden" name="intent" value="star" />
                        <input
                          type="hidden"
                          name="next_value"
                          value={
                            preferenceFor("market", deal.id)?.is_starred
                              ? "false"
                              : "true"
                          }
                        />
                        <button
                          className={`rounded-full px-4 py-2 text-xs font-black ${preferenceFor("market", deal.id)?.is_starred ? "bg-amber-400 text-slate-950" : "bg-slate-100 text-slate-700"}`}
                        >
                          {preferenceFor("market", deal.id)?.is_starred
                            ? "★ Default"
                            : "☆ Make default"}
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={() => toggleShortlist(deal.id, "market")}
                        className={`rounded-full px-4 py-2 text-xs font-black ${shortlistedDealIds.has(deal.id) ? "bg-orange-500 text-white" : "bg-orange-50 text-orange-700 ring-1 ring-orange-200"}`}
                      >
                        {shortlistedDealIds.has(deal.id)
                          ? "Shortlisted"
                          : "Shortlist"}
                      </button>
                      {deal.sourceUrl ? (
                        <a
                          href={deal.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white"
                        >
                          Assess on lender/site
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })
            : null}
          {filteredRecommendations.length === 0 &&
          filteredMarketDeals.length === 0 ? (
            <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-bold leading-6 text-slate-600 xl:col-span-3">
              No matching mortgage deals for this search/filter. Publish
              reviewed catalogue rows in Admin &gt; House or clear the filters.
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}

function MovingHomePanel({
  moveQueries,
  onAddMoveQuery,
  onOpenQuery,
  currentAffordabilityScore,
  currentMonthlyCost,
  workspacePreference,
}: {
  moveQueries: PropertyMoveQuery[];
  onAddMoveQuery: () => void;
  onOpenQuery: (query: PropertyMoveQuery) => void;
  currentAffordabilityScore?: AffordabilityScore | null;
  currentMonthlyCost?: number;
  workspacePreference?: MortgageWorkspacePreference | null;
}) {
  return (
    <SectionCard
      title={workspacePreference?.moving_home_label || "Moving home"}
      description={
        workspacePreference?.moving_home_description ||
        "Keep future-house research separate from the current home. Listings and rough targets can be digested without changing the live affordability score."
      }
    >
      <div className="grid gap-4 lg:grid-cols-[0.6fr_1.4fr]">
        <div className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">
            Looking at houses?
          </p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">
            Save every option safely
          </h3>
          <p className="mt-2 text-sm font-bold text-slate-600">
            Paste a Rightmove/Zoopla/OnTheMarket URL or add a rough target
            price. LOOP stages council tax, EPC, energy, stamp duty, moving cost
            and mortgage assumptions.
          </p>
          <p className="mt-3 rounded-2xl bg-white/70 p-3 text-xs font-black text-blue-900">
            Property photos and listing extracts are retained while the search
            is active. Archived searches are queued for deletion after 14 days.
          </p>
          <button
            type="button"
            onClick={onAddMoveQuery}
            className="mt-4 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white"
          >
            + Save a house search
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {moveQueries.map((query) => {
            const score = moveQueryScore(
              query,
              currentAffordabilityScore,
              Number(currentMonthlyCost || 0),
            );
            const confidence = moveQueryConfidence(query);
            const monthlyRunning = moveQueryRunningMonthly(query);
            return (
              <div
                key={query.id}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="relative h-44 bg-slate-100">
                  {query.image_url ? (
                    <img
                      src={query.image_url}
                      alt={displayMoveTitle(query)}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : moveMapEmbedUrl(query) ? (
                    <iframe
                      title={`${displayMoveTitle(query)} map`}
                      src={moveMapEmbedUrl(query) || undefined}
                      className="h-full w-full border-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-blue-50 via-slate-100 to-orange-100" />
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenQuery(query)}
                    className="absolute right-3 top-3 rounded-2xl border border-white/70 bg-white/95 px-4 py-3 text-left shadow-xl backdrop-blur transition hover:-translate-y-0.5"
                  >
                    <p className="text-xs font-black uppercase tracking-wide text-orange-600">
                      Score
                    </p>
                    <p className="text-2xl font-black text-slate-950">
                      {score}/100
                    </p>
                    <p className="text-[11px] font-bold text-slate-500">
                      Click for why
                    </p>
                  </button>
                  <span
                    className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-black ${confidence >= 95 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
                  >
                    {confidence}% source
                  </span>
                </div>
                <div className="p-5">
                  <p className="text-xs font-black uppercase tracking-wide text-orange-600">
                    {sourceStatusDisplay(query.source_status)}
                  </p>
                  <h3 className="mt-1 min-h-[3.5rem] text-lg font-black leading-tight text-slate-950">
                    {displayMoveTitle(query)}
                  </h3>
                  <div className="mt-4 rounded-3xl bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Price
                    </p>
                    <p className="mt-1 text-2xl font-black text-slate-950">
                      {formatMoney(query.asking_price)}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-600">
                      Mortgage est. {formatMoney(query.expected_payment)}/mo
                    </p>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[11px] font-black uppercase text-slate-400">
                        Tax
                      </p>
                      <p className="font-black text-slate-950">
                        {query.council_tax_band
                          ? `Band ${query.council_tax_band}`
                          : "Check"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[11px] font-black uppercase text-slate-400">
                        EPC
                      </p>
                      <p className="font-black text-slate-950">
                        {query.epc_rating || "Check"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[11px] font-black uppercase text-slate-400">
                        Running
                      </p>
                      <p className="font-black text-slate-950">
                        {formatMoney(monthlyRunning)}/mo
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-bold text-slate-500">
                    {query.address_hint ||
                      query.postcode ||
                      "Add location / source URL for enrichment"}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenQuery(query)}
                      className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white"
                    >
                      More details
                    </button>
                    {query.property_url ? (
                      <a
                        href={query.property_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700"
                      >
                        Listing
                      </a>
                    ) : null}
                    <form action={archivePropertyMoveQuery}>
                      <input type="hidden" name="id" value={query.id} />
                      <button className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-black text-red-600">
                        Archive
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            );
          })}
          {moveQueries.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-bold text-slate-500 md:col-span-2">
              No moving searches yet. Add a URL or rough price when you start
              looking at houses.
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

function ValuationSourcesPanel({
  home,
  valuations,
  summary,
  onAddValuation,
  onEditValuation,
}: {
  home: Home | undefined;
  valuations: HomeValuationSource[];
  summary: ReturnType<typeof valuationSummary> | null;
  onAddValuation: () => void;
  onEditValuation: (valuation: HomeValuationSource) => void;
}) {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Valuation automation"
        description="The user should not have to hunt for every source manually. This tab keeps the valuation trail explainable while automation is connected."
      >
        <div className="grid gap-4 xl:grid-cols-4">
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
              Current mid
            </p>
            <p className="mt-2 text-2xl font-black text-slate-950">
              {formatMoney(summary?.mid)}
            </p>
            <p className="mt-1 text-xs font-bold text-emerald-800">
              Confidence-weighted where no manual override exists.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Land Registry
            </p>
            <p className="mt-2 text-sm font-bold text-slate-700">
              Open-data comparable sales by postcode/street.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Portal / AVM
            </p>
            <p className="mt-2 text-sm font-bold text-slate-700">
              Premium source such as Homedata, PropertyData or permitted Zoopla
              integration.
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              Agent / surveyor
            </p>
            <p className="mt-2 text-sm font-bold text-slate-700">
              User-entered valuations stay visible and auditable.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onAddValuation}
          className="mt-5 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white"
        >
          + Add valuation source
        </button>
      </SectionCard>
      <SectionCard
        title="Valuation sources"
        description={`Sources currently attached to ${home?.label || "this home"}.`}
      >
        <div className="space-y-3">
          {valuations.map((valuation) => (
            <div
              key={valuation.id}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-bold text-slate-950">
                    {valuation.source_name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {valuation.source_type.replaceAll("_", " ")} ·{" "}
                    {valuation.confidence ?? "medium"} confidence
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => onEditValuation(valuation)}
                    className="text-sm font-semibold text-slate-700"
                  >
                    Edit
                  </button>
                  <form action={deleteHomeValuationSource}>
                    <input type="hidden" name="id" value={valuation.id} />
                    <button className="text-sm font-medium text-red-600">
                      Delete
                    </button>
                  </form>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Low</p>
                  <p className="font-bold">
                    {formatMoney(valuation.valuation_low)}
                  </p>
                </div>
                <div className="rounded-2xl bg-orange-50 p-3">
                  <p className="text-xs text-orange-700">Mid</p>
                  <p className="font-bold">
                    {formatMoney(
                      valuation.valuation_mid ?? valuation.valuation_amount,
                    )}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">High</p>
                  <p className="font-bold">
                    {formatMoney(valuation.valuation_high)}
                  </p>
                </div>
              </div>
              {valuation.source_url ? (
                <a
                  href={valuation.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block text-xs font-semibold text-orange-600"
                >
                  Open source
                </a>
              ) : null}
            </div>
          ))}
          {valuations.length === 0 ? (
            <p className="rounded-3xl bg-slate-50 p-5 text-sm font-bold text-slate-500">
              No valuation sources yet. Add one manually or connect automation
              in Admin &gt; Future integrations.
            </p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}

function RateResearchModal({
  targetPrice,
  loanRequired,
  ltv,
  termYears,
  currentRate,
  maxTermYears,
  onSelect,
  onClose,
}: {
  targetPrice: number;
  loanRequired: number;
  ltv: number;
  termYears: number;
  currentRate: number;
  maxTermYears: number;
  onSelect: (suggestion: RateSuggestion) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<RateSuggestion[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function runResearch() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mortgage/rate-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPrice,
          loanRequired,
          ltv,
          termYears,
          currentRate,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not run rate research");
      setSuggestions(data.suggestions ?? []);
      setMessage(data.note ?? null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not run rate research",
      );
    } finally {
      setLoading(false);
    }
  }

  const seededSuggestions =
    suggestions.length > 0
      ? suggestions
      : [
          {
            lender: "Best-buy search",
            productName: `${ltvBand(ltv)} fixed-rate benchmark`,
            rate: currentRate || 4.75,
            rateType: "fixed",
            termYears,
            score: 72,
            notes:
              "Use as a placeholder until OpenAI/source research is connected.",
          },
          {
            lender: "Stress test",
            productName: "Planning buffer rate",
            rate: Math.max((currentRate || 4.75) + 1.5, 6.5),
            rateType: "stress",
            termYears,
            score: 55,
            notes:
              "Useful to check whether affordability still works if rates move against you.",
          },
        ];

  return (
    <Modal
      title="Mortgage rate research"
      description="Run an AI-assisted check, then select a rate assumption to apply to the move planner. Treat results as research notes until you verify lender eligibility/source URLs."
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Target price</p>
            <p className="font-bold">{formatMoney(targetPrice)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Loan required</p>
            <p className="font-bold">{formatMoney(loanRequired)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">LTV</p>
            <p className="font-bold">{ltv.toFixed(1)}%</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">Term guide</p>
            <p className="font-bold">
              {termYears} / max {maxTermYears}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={runResearch}
          disabled={loading}
          className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {loading ? "Researching..." : "Run AI rate check"}
        </button>
        {message ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {message}
          </p>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {seededSuggestions.map((item, index) => (
            <div
              key={`${item.lender}-${index}`}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    {item.lender}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-slate-950">
                    {item.productName}
                  </h3>
                </div>
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">
                  Score {item.score}
                </span>
              </div>
              <p className="mt-4 text-3xl font-bold text-slate-950">
                {Number(item.rate).toFixed(2)}%
              </p>
              <p className="text-sm text-slate-500 capitalize">
                {item.rateType} · {item.termYears} years
              </p>
              <p className="mt-3 text-sm text-slate-600">{item.notes}</p>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="mt-4 rounded-full bg-orange-600 px-4 py-2 text-sm font-bold text-white"
              >
                Use this rate
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function MortgagePlannerClient({
  scenarios,
  people,
  homes,
  owners,
  deals,
  valuations,
  monthPlan,
  normalMonthPlan = monthPlan,
  emergencySavings = 0,
  childProfileCount = 0,
  renewalRecommendations = [],
  marketDeals = [],
  moveQueries = [],
  liabilityAllocations = [],
  dealPreferences = [],
  workspacePreference = null,
}: Props) {
  const [modal, setModal] = useState<ModalState>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [selectedHomeId, setSelectedHomeId] = useState(homes[0]?.id ?? "");
  const [targetPrice, setTargetPrice] = useState(
    String(homes[0]?.target_purchase_price ?? 550000),
  );
  const [extraCash, setExtraCash] = useState(
    String(homes[0]?.target_extra_cash ?? 0),
  );
  const [targetRate, setTargetRate] = useState(
    String(homes[0]?.target_interest_rate ?? 4.75),
  );
  const [termYears, setTermYears] = useState(
    String(homes[0]?.target_term_years ?? 30),
  );
  const [movingCosts, setMovingCosts] = useState("4000");
  const [viewMode, setViewMode] = useState<"low" | "mid" | "high">("mid");
  const [rateResearchOpen, setRateResearchOpen] = useState(false);
  const [activeHomeTab, setActiveHomeTab] =
    useState<HomeDashboardTab>("overview");

  useEffect(() => {
    if (
      homes.length > 0 &&
      deals.length === 0 &&
      window.localStorage.getItem("loop:addMortgageAfterHome") === "1"
    ) {
      window.localStorage.removeItem("loop:addMortgageAfterHome");
      setSelectedHomeId(homes[0].id);
      setModal({ type: "add_mortgage", homeId: homes[0].id });
    }
  }, [deals.length, homes]);

  const personById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );
  const termGuide = useMemo(() => planningMaxTermYears(people), [people]);
  const homeById = useMemo(
    () => new Map(homes.map((home) => [home.id, home])),
    [homes],
  );
  const selectedHome = homeById.get(selectedHomeId) ?? homes[0];

  const valuationsByHome = useMemo(() => {
    const map = new Map<string, HomeValuationSource[]>();
    for (const valuation of valuations) {
      const list = map.get(valuation.home_id) ?? [];
      list.push(valuation);
      map.set(valuation.home_id, list);
    }
    return map;
  }, [valuations]);

  const selectedHomeDeals = selectedHome
    ? deals.filter((deal) => deal.home_id === selectedHome.id)
    : [];
  const selectedHomeOwners = selectedHome
    ? owners.filter((owner) => owner.home_id === selectedHome.id)
    : [];
  const selectedHomeValuations = selectedHome
    ? (valuationsByHome.get(selectedHome.id) ?? [])
    : [];
  const selectedSummary = selectedHome
    ? valuationSummary(selectedHome, selectedHomeValuations)
    : null;
  const selectedRenewalRecommendations = selectedHome
    ? renewalRecommendations.filter(
        (rec) =>
          rec.home_id === selectedHome.id ||
          selectedHomeDeals.some((deal) => deal.id === rec.mortgage_deal_id),
      )
    : renewalRecommendations;

  const totalPropertyValue = homes.reduce(
    (sum, home) =>
      sum + valuationSummary(home, valuationsByHome.get(home.id) ?? []).mid,
    0,
  );
  const totalMortgageBalance = deals.reduce(
    (sum, deal) => sum + currentMortgageBalanceForDeal(deal),
    0,
  );
  const totalMortgagePayment = deals.reduce(
    (sum, deal) => sum + mortgagePaymentForDeal(deal),
    0,
  );
  const currentLtv =
    totalPropertyValue > 0
      ? (totalMortgageBalance / totalPropertyValue) * 100
      : 0;
  const firstScenario = scenarios[0];
  const firstPayment = firstScenario
    ? calculateMonthlyMortgagePayment({
        balance: Number(firstScenario.balance),
        annualInterestRate: Number(firstScenario.interest_rate),
        termYears: Number(firstScenario.term_years),
      })
    : 0;

  const movePlanner = useMemo(() => {
    if (!selectedHome) {
      return {
        saleValue: 0,
        currentMortgage: 0,
        currentPayment: 0,
        equity: 0,
        target: Number(targetPrice) || 0,
        stampDuty: 0,
        loanRequired: 0,
        ltv: 0,
        payment: 0,
        ltvBand: "Add a home first",
      };
    }
    const summary = valuationSummary(
      selectedHome,
      valuationsByHome.get(selectedHome.id) ?? [],
    );
    const saleValue = summary[viewMode];
    const currentMortgage = deals
      .filter((deal) => deal.home_id === selectedHome.id)
      .reduce((sum, deal) => sum + currentMortgageBalanceForDeal(deal), 0);
    const currentPayment = deals
      .filter((deal) => deal.home_id === selectedHome.id)
      .reduce((sum, deal) => sum + mortgagePaymentForDeal(deal), 0);
    const equity = Math.max(0, saleValue - currentMortgage);
    const target = Number(targetPrice) || 0;
    const stampDuty = calculateStampDutyEngland({ purchasePrice: target });
    const cash = Number(extraCash) || 0;
    const upfront = stampDuty + (Number(movingCosts) || 0);
    const depositAvailableAfterCosts = Math.max(0, equity + cash - upfront);
    const loanRequired = Math.max(0, target - depositAvailableAfterCosts);
    const ltv = target > 0 ? (loanRequired / target) * 100 : 0;
    const payment = calculateMonthlyMortgagePayment({
      balance: loanRequired,
      annualInterestRate: Number(targetRate) || 0,
      termYears: Number(termYears) || 30,
    });
    return {
      saleValue,
      currentMortgage,
      currentPayment,
      equity,
      target,
      stampDuty,
      loanRequired,
      ltv,
      payment,
      ltvBand: ltvBand(ltv),
    };
  }, [
    deals,
    extraCash,
    movingCosts,
    selectedHome,
    targetPrice,
    targetRate,
    termYears,
    valuationsByHome,
    viewMode,
  ]);

  const selectedHomeCurrentPayment = selectedHomeDeals.reduce(
    (sum, deal) => sum + mortgagePaymentForDeal(deal),
    0,
  );
  const selectedHomeMortgageBalance = selectedHomeDeals.reduce(
    (sum, deal) => sum + currentMortgageBalanceForDeal(deal),
    0,
  );
  const currentHousePayment =
    selectedHomeCurrentPayment ||
    totalMortgagePayment ||
    firstPayment ||
    Number(
      monthPlan.outgoingItems.find((item) => /mortgage/i.test(item.label))
        ?.value || 0,
    );
  const currentHouseBalance =
    selectedHomeMortgageBalance || totalMortgageBalance;
  const householdOutgoings = normalMonthPlan.outgoings;
  const householdSurplus = normalMonthPlan.income - householdOutgoings;
  const paymentToIncomeRatio =
    normalMonthPlan.income > 0
      ? currentHousePayment / normalMonthPlan.income
      : 0;
  const affordabilityScore = buildAffordabilityScore({
    monthPlan: normalMonthPlan,
    mortgagePayment: currentHousePayment,
    mortgageBalance: currentHouseBalance,
    propertyValue: selectedSummary?.mid || totalPropertyValue,
    futureOutgoings: householdOutgoings,
    futureSurplus: householdSurplus,
    emergencySavings,
    ownerPersonIds: selectedHomeOwners.map((owner) => owner.person_id),
    childProfileCount,
  });
  const hasMaternityIncome = monthPlan.incomeItems.some((item) =>
    /maternity/i.test(`${item.label} ${item.helper}`),
  );
  const maternityExposureScore = hasMaternityIncome
    ? buildAffordabilityScore({
        monthPlan,
        mortgagePayment: currentHousePayment,
        mortgageBalance: currentHouseBalance,
        propertyValue: selectedSummary?.mid || totalPropertyValue,
        futureOutgoings: monthPlan.outgoings,
        futureSurplus: monthPlan.income - monthPlan.outgoings,
        emergencySavings,
        ownerPersonIds: selectedHomeOwners.map((owner) => owner.person_id),
        childProfileCount,
        includeTemporaryIncomeNote: true,
      })
    : null;
  const score = legacyAffordabilityLabel(affordabilityScore);
  const selectedLtv = selectedSummary?.mid
    ? (currentHouseBalance / selectedSummary.mid) * 100
    : currentLtv;
  const selectedDealPreference = dealPreferences.find(
    (preference) =>
      preference.is_starred &&
      (!selectedHome || !preference.home_id || preference.home_id === selectedHome.id),
  ) || dealPreferences.find(
    (preference) =>
      preference.is_shortlisted &&
      (!selectedHome || !preference.home_id || preference.home_id === selectedHome.id),
  );
  const starredComparison: MortgageComparisonBubble = (() => {
    if (currentHouseBalance <= 0) return null;
    if (!selectedDealPreference) {
      const currentDeal = selectedHomeDeals[0];
      if (!currentDeal) return null;
      const rate = Math.max(Number(currentDeal.interest_rate || 0) + 2.5, 7.49);
      const payment = calculateMonthlyMortgagePayment({
        balance: currentHouseBalance,
        annualInterestRate: rate,
        termYears: Number(currentDeal.term_years || 30),
      });
      return {
        lender: currentDeal.lender || "Current lender",
        product: "Estimated follow-on / SVR",
        rate,
        payment,
        monthlyDelta: currentHousePayment - payment,
        sourceKind: "fallback",
        sourceId: currentDeal.id,
      };
    }
    if (selectedDealPreference.source_kind === "market") {
      const market = marketDeals.find(
        (deal) => deal.id === selectedDealPreference.source_id,
      );
      const rate = Number(market?.rate_percent || 0);
      if (!market || rate <= 0) return null;
      const payment = calculateMonthlyMortgagePayment({
        balance: currentHouseBalance + Number(market.product_fee || 0),
        annualInterestRate: rate,
        termYears: Number(selectedHomeDeals[0]?.term_years || 30),
      });
      return {
        lender: market.lender_name || "Lender",
        product: market.product_name || "Mortgage product",
        rate,
        payment,
        monthlyDelta: currentHousePayment - payment,
        sourceKind: "market",
        sourceId: market.id,
      };
    }
    const recommendation = renewalRecommendations.find(
      (deal) => deal.id === selectedDealPreference.source_id,
    );
    const rate = Number(
      recommendation?.suggested_rate || recommendation?.current_rate || 0,
    );
    if (!recommendation || rate <= 0) return null;
    const payment =
      Number(recommendation.estimated_new_payment || 0) ||
      calculateMonthlyMortgagePayment({
        balance: currentHouseBalance + Number(recommendation.product_fee || 0),
        annualInterestRate: rate,
        termYears: Number(selectedHomeDeals[0]?.term_years || 30),
      });
    return {
      lender: recommendation.lender_name || "Lender",
      product: recommendation.product_name || "Mortgage product",
      rate,
      payment,
      monthlyDelta: currentHousePayment - payment,
      sourceKind: "recommendation",
      sourceId: recommendation.id,
    };
  })();

  if (homes.length === 0) {
    return (
      <main className="mx-auto w-[95vw] max-w-[2000px] space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-600">
              House command centre
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
              House
            </h1>
            <p className="mt-1 max-w-3xl text-slate-600">
              Track your home, ownership split, valuation sources and mortgage
              records. Future purchase planning will move into its own tab
              later.
            </p>
          </div>
        </div>

        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/80 bg-white p-6 shadow-[0_30px_110px_-70px_rgba(15,23,42,.65)] md:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(251,146,60,.22),transparent_32%),radial-gradient(circle_at_12%_80%,rgba(16,185,129,.16),transparent_35%)]" />
          <div className="relative grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-700">
                No house tracked yet
              </p>
              <h2 className="mt-3 text-4xl font-black tracking-tight text-slate-950 md:text-6xl">
                Let’s get tracking.
              </h2>
              <p className="mt-3 max-w-xl text-base font-semibold leading-7 text-slate-600">
                Add the address first, then LOOP will immediately ask whether
                you want to add the mortgage/rate details. You can skip the
                mortgage step if you are exploring or rent for now.
              </p>
              <button
                type="button"
                onClick={() => setModal({ type: "add_home" })}
                className="mt-6 rounded-full bg-slate-950 px-6 py-3 text-sm font-black text-white shadow-xl shadow-slate-950/15 hover:bg-slate-800"
              >
                Let’s get tracking
              </button>
            </div>
            <div className="relative min-h-[310px] overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-b from-sky-100 via-white to-orange-50 p-6">
              <div className="absolute left-0 right-0 top-16 h-20 bg-gradient-to-b from-white/60 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-slate-200" />
              <div className="absolute bottom-20 left-8 h-24 w-28 rounded-t-3xl bg-orange-300 shadow-lg">
                <div className="mx-auto mt-10 h-14 w-10 rounded-t-xl bg-white/80" />
              </div>
              <div className="absolute bottom-20 left-40 h-32 w-36 rounded-t-3xl bg-emerald-300 shadow-lg">
                <div className="mx-auto mt-16 h-16 w-12 rounded-t-xl bg-white/80" />
              </div>
              <div className="absolute bottom-20 left-80 h-28 w-32 rounded-t-3xl bg-slate-900 shadow-lg">
                <div className="mx-auto mt-12 h-16 w-10 rounded-t-xl bg-white/80" />
              </div>
              <div className="absolute bottom-10 left-0 right-0 h-10 bg-slate-700" />
              <div className="absolute bottom-12 left-16 h-2 w-20 rounded-full bg-white/80" />
              <div className="absolute bottom-12 left-56 h-2 w-20 rounded-full bg-white/80" />
              <div className="absolute right-8 top-8 rounded-3xl border border-white/80 bg-white/85 p-5 shadow-xl backdrop-blur">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">
                  Next steps
                </p>
                <p className="mt-2 text-sm font-black text-slate-950">
                  1. Address
                </p>
                <p className="text-sm font-black text-slate-950">
                  2. Ownership split
                </p>
                <p className="text-sm font-black text-slate-950">
                  3. Mortgage/rate
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <SectionCard
            title="Valuation sources"
            description="After adding a home, store each valuation separately so averages stay explainable."
          >
            <p className="text-sm font-semibold text-slate-500">
              Ready once your first house is added.
            </p>
          </SectionCard>
          <SectionCard
            title="Mortgage/rate"
            description="Add balance, rate, deal-end date and payment to power affordability."
          >
            <p className="text-sm font-semibold text-slate-500">
              This opens straight after your first house unless skipped.
            </p>
          </SectionCard>
          <SectionCard
            title="Ownership"
            description="Assign adults in your profile/household and override split percentages where needed."
          >
            <p className="text-sm font-semibold text-slate-500">
              Use equal split by default or custom percentages.
            </p>
          </SectionCard>
        </div>

        <SectionCard
          title="Moving / property search"
          description="Already looking at future houses? Save a listing URL or rough price as a separate scenario without creating a current-home record yet."
        >
          <button
            type="button"
            onClick={() => setModal({ type: "add_move_query" })}
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white"
          >
            + Save a house search
          </button>
        </SectionCard>

        {modal?.type === "affordability_breakdown" ? (
          <Modal
            title="Affordability score breakdown"
            description="The headline score uses normal salary rather than temporary maternity pay. Where maternity is active, LOOP shows a separate exposure score below."
            onClose={() => setModal(null)}
          >
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                <div className={`rounded-3xl p-4 ${affordabilityScore.tone}`}>
                  <p className="text-xs font-black uppercase">Score</p>
                  <p className="mt-1 text-3xl font-black">
                    {affordabilityScore.score}/100
                  </p>
                  <p className="text-sm font-bold">
                    {affordabilityScore.label}
                  </p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase text-slate-400">
                    Income mode
                  </p>
                  <p className="mt-1 text-xl font-black capitalize text-slate-950">
                    {affordabilityScore.incomeMode}
                  </p>
                  <p className="text-xs font-bold text-slate-500">
                    {affordabilityScore.numberOfIncomes} income(s) detected
                  </p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase text-slate-400">
                    Payment / income
                  </p>
                  <p className="mt-1 text-xl font-black text-slate-950">
                    {(paymentToIncomeRatio * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase text-slate-400">
                    Projected buffer
                  </p>
                  <p className="mt-1 text-xl font-black text-slate-950">
                    {formatMoney(householdSurplus)}
                  </p>
                </div>
              </div>
              {maternityExposureScore ? (
                <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">
                        Temporary maternity exposure
                      </p>
                      <h3 className="mt-1 text-2xl font-black text-slate-950">
                        {maternityExposureScore.score}/100
                      </h3>
                      <p className="mt-1 text-sm font-bold text-amber-900">
                        This uses the income actually expected during the
                        selected maternity month. It does not replace the
                        normal-salary affordability result.
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-4 py-2 text-sm font-black ${maternityExposureScore.tone}`}
                    >
                      {maternityExposureScore.label}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {maternityExposureScore.criteria.slice(0, 4).map((item) => (
                      <div
                        key={`maternity-${item.label}`}
                        className="rounded-2xl bg-white/80 p-3"
                      >
                        <p className="text-xs font-black text-slate-500">
                          {item.label}
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-700">
                          {item.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="space-y-3">
                {affordabilityScore.criteria.map((item) => (
                  <div
                    key={`${item.group}-${item.label}`}
                    className="rounded-3xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                          {item.group}
                        </p>
                        <h3 className="mt-1 font-black text-slate-950">
                          {item.label}
                        </h3>
                      </div>
                      <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">
                        {item.points}/{item.max}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-600">
                      {item.reason}
                    </p>
                  </div>
                ))}
              </div>
              <p className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
                Next refinement: add explicit emergency savings, income
                protection, employment stability and essential-vs-discretionary
                tagging so this moves from a provisional score to a richer
                lender-style risk profile.
              </p>
            </div>
          </Modal>
        ) : null}

        {modal?.type === "add_home" ? (
          <Modal
            title="Add your first home"
            description="Enter house number and postcode first. The lookup fills address/map fields, then you can add valuation and purchase details."
            onClose={() => setModal(null)}
          >
            <HomeWizard people={people} owners={owners} action={addHome} />
          </Modal>
        ) : null}
        {modal?.type === "add_scenario" ? (
          <Modal
            title="Add standalone mortgage scenario"
            description="For one-off comparisons that do not need to attach to a home."
            onClose={() => setModal(null)}
          >
            <ScenarioForm />
          </Modal>
        ) : null}
        {modal?.type === "add_move_query" ? (
          <Modal
            title="I’m looking at houses"
            description="Save a URL or rough price so LOOP can estimate affordability, stamp duty, council tax and EPC/energy costs separately from your current home."
            onClose={() => setModal(null)}
          >
            <MoveQueryWizard homes={homes} />
          </Modal>
        ) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto w-[95vw] max-w-[2000px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">
            House command centre
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">
            House
          </h1>
          <p className="mt-1 max-w-3xl text-slate-600">
            Track the current home first, then use the tabs below for mortgage
            deals, moving-home options and valuation sources.
          </p>
        </div>
        <div className="relative">
          <button
            onClick={() => setAddMenuOpen((open) => !open)}
            className="flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-950/15 hover:bg-slate-800"
          >
            <span className="text-lg leading-none">+</span> Add
          </button>
          {addMenuOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              <button
                onClick={() => {
                  setModal({ type: "add_home" });
                  setAddMenuOpen(false);
                }}
                className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold hover:bg-slate-50"
              >
                Add home / address
                <span className="mt-1 block text-xs font-medium text-slate-500">
                  House number, postcode, map and ownership
                </span>
              </button>
              <button
                onClick={() => {
                  setModal({ type: "add_valuation", homeId: selectedHome?.id });
                  setAddMenuOpen(false);
                }}
                className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold hover:bg-slate-50"
              >
                Add valuation source
                <span className="mt-1 block text-xs font-medium text-slate-500">
                  Agent, Zoopla, Land Registry comp or manual
                </span>
              </button>
              <button
                onClick={() => {
                  setModal({ type: "add_mortgage", homeId: selectedHome?.id });
                  setAddMenuOpen(false);
                }}
                className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold hover:bg-slate-50"
              >
                Add mortgage / rate
                <span className="mt-1 block text-xs font-medium text-slate-500">
                  Balance, rate, end date and payment
                </span>
              </button>
              <button
                onClick={() => {
                  setModal({ type: "add_scenario" });
                  setAddMenuOpen(false);
                }}
                className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold hover:bg-slate-50"
              >
                Add standalone scenario
              </button>
              <button
                onClick={() => {
                  setModal({ type: "add_move_query" });
                  setAddMenuOpen(false);
                }}
                className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold hover:bg-slate-50"
              >
                I’m looking at houses
                <span className="mt-1 block text-xs font-medium text-slate-500">
                  Save a listing URL or rough target price
                </span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <MortgageCommandStrip
        balance={currentHouseBalance}
        payment={currentHousePayment}
        recommendations={selectedRenewalRecommendations}
        marketDeals={marketDeals}
        deals={selectedHomeDeals}
        affordabilityScore={affordabilityScore}
        onOpenDeals={() => setActiveHomeTab("mortgage_deals")}
      />

      {selectedHome && selectedSummary ? (
        <HomeMapHero
          home={selectedHome}
          owners={selectedHomeOwners}
          peopleById={personById}
          deals={selectedHomeDeals}
          valuations={selectedHomeValuations}
          summary={selectedSummary}
          affordabilityScore={affordabilityScore}
          maternityExposureScore={maternityExposureScore}
          starredComparison={starredComparison}
          liabilityAllocations={liabilityAllocations}
          onEdit={() => setModal({ type: "edit_home", home: selectedHome })}
          onAddMortgage={() =>
            setModal({ type: "add_mortgage", homeId: selectedHome.id })
          }
          onAddValuation={() =>
            setModal({ type: "add_valuation", homeId: selectedHome.id })
          }
          onOpenAffordability={() =>
            setModal({ type: "affordability_breakdown" })
          }
          onOpenMortgage={(deal) =>
            setModal({ type: "mortgage_details", deal })
          }
        />
      ) : (
        <SectionCard
          title="Tracked home"
          description="Start with house number and postcode, then add mortgage and valuation assumptions."
        >
          <button
            onClick={() => setModal({ type: "add_home" })}
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white"
          >
            + Add your first home
          </button>
        </SectionCard>
      )}

      <HomeTabNav
        active={activeHomeTab}
        onChange={setActiveHomeTab}
        workspacePreference={workspacePreference}
        onEditWorkspace={() => setModal({ type: "workspace_preferences" })}
      />

      {activeHomeTab === "overview" ? (
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-4">
            <StatCard
              title="House value estimate"
              value={formatMoney(selectedSummary?.mid || totalPropertyValue)}
              helper="Selected home mid valuation"
            />
            <StatCard
              title="Mortgage balance"
              value={formatMoney(currentHouseBalance)}
            />
            <StatCard
              title="Current LTV"
              value={`${selectedLtv.toFixed(1)}%`}
              helper={ltvBand(selectedLtv)}
            />
            <StatCard
              title="Household buffer"
              value={formatMoney(householdSurplus)}
              helper="After tracked monthly outgoings"
            />
          </section>

          <SectionCard
            title="House overview"
            description="The score is now kept on the property map so the main page stays focussed on the home, mortgage and decision points."
          >
            <div className="grid gap-4 lg:grid-cols-3">
              {homes.map((home) => {
                const homeOwners = owners.filter(
                  (owner) => owner.home_id === home.id,
                );
                const homeDeals = deals.filter(
                  (deal) => deal.home_id === home.id,
                );
                const homeValuations = valuationsByHome.get(home.id) ?? [];
                const summary = valuationSummary(home, homeValuations);
                const homeBalance = homeDeals.reduce(
                  (sum, deal) => sum + currentMortgageBalanceForDeal(deal),
                  0,
                );
                const homePayment = homeDeals.reduce(
                  (sum, deal) => sum + mortgagePaymentForDeal(deal),
                  0,
                );
                const ltv =
                  summary.mid > 0 ? (homeBalance / summary.mid) * 100 : 0;

                return (
                  <button
                    key={home.id}
                    onClick={() => setSelectedHomeId(home.id)}
                    className={`rounded-2xl border p-5 text-left transition hover:bg-slate-50 ${home.id === selectedHome?.id ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white"}`}
                  >
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {statusLabel(home.ownership_status)}
                    </p>
                    <h3 className="mt-1 text-xl font-bold text-slate-950">
                      {home.label}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {home.full_address || home.address_line || "No address"}
                      {home.postcode ? ` · ${home.postcode}` : ""}
                    </p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-xl bg-white/70 p-3">
                        <p className="text-xs text-slate-500">Mid</p>
                        <p className="font-bold">{formatMoney(summary.mid)}</p>
                      </div>
                      <div className="rounded-xl bg-white/70 p-3">
                        <p className="text-xs text-slate-500">LTV</p>
                        <p className="font-bold">{ltv.toFixed(1)}%</p>
                      </div>
                      <div className="rounded-xl bg-white/70 p-3">
                        <p className="text-xs text-slate-500">Payment</p>
                        <p className="font-bold">{formatMoney(homePayment)}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      Owners:{" "}
                      {homeOwners.length > 0
                        ? homeOwners
                            .map(
                              (owner) =>
                                personById.get(owner.person_id)?.name ??
                                "Unknown",
                            )
                            .join(", ")
                        : "Not assigned"}
                    </p>
                  </button>
                );
              })}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeHomeTab === "mortgage_deals" ? (
        <MortgageDealsPanel
          home={selectedHome}
          deals={selectedHomeDeals}
          recommendations={selectedRenewalRecommendations}
          marketDeals={marketDeals}
          dealPreferences={dealPreferences}
          onAddMortgage={() =>
            setModal({ type: "add_mortgage", homeId: selectedHome?.id })
          }
          onEditMortgage={(deal) => setModal({ type: "edit_mortgage", deal })}
        />
      ) : null}

      {activeHomeTab === "moving_home" ? (
        <MovingHomePanel
          moveQueries={moveQueries}
          onAddMoveQuery={() => setModal({ type: "add_move_query" })}
          onOpenQuery={(query) =>
            setModal({ type: "move_query_details", query })
          }
          currentAffordabilityScore={affordabilityScore}
          currentMonthlyCost={currentHousePayment}
          workspacePreference={workspacePreference}
        />
      ) : null}

      {activeHomeTab === "valuation_sources" ? (
        <ValuationSourcesPanel
          home={selectedHome}
          valuations={selectedHomeValuations}
          summary={selectedSummary}
          onAddValuation={() =>
            setModal({ type: "add_valuation", homeId: selectedHome?.id })
          }
          onEditValuation={(valuation) =>
            setModal({ type: "edit_valuation", valuation })
          }
        />
      ) : null}

      {scenarios.length > 0 && activeHomeTab === "mortgage_deals" ? (
        <SectionCard
          title="Saved standalone scenarios"
          description="Still available, but kept secondary to the home-backed mortgage deal workflow."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {scenarios.map((scenario) => {
              const payment = calculateMonthlyMortgagePayment({
                balance: Number(scenario.balance),
                annualInterestRate: Number(scenario.interest_rate),
                termYears: Number(scenario.term_years),
              });
              const totalInterest = estimateTotalInterest({
                balance: Number(scenario.balance),
                annualInterestRate: Number(scenario.interest_rate),
                termYears: Number(scenario.term_years),
              });

              return (
                <div
                  key={scenario.id}
                  className="rounded-2xl border border-slate-200 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-slate-950">
                        {scenario.name}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {formatMoney(scenario.balance)} at{" "}
                        {scenario.interest_rate}% over {scenario.term_years}{" "}
                        years
                      </p>
                    </div>
                    <form action={deleteMortgageScenario}>
                      <input type="hidden" name="id" value={scenario.id} />
                      <button className="text-sm font-medium text-red-600">
                        Delete
                      </button>
                    </form>
                  </div>
                  <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <dt className="text-xs text-slate-500">
                        Monthly payment
                      </dt>
                      <dd className="text-lg font-bold">
                        {formatMoney(payment)}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <dt className="text-xs text-slate-500">With overpay</dt>
                      <dd className="text-lg font-bold">
                        {formatMoney(
                          payment + Number(scenario.monthly_overpayment),
                        )}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <dt className="text-xs text-slate-500">Total interest</dt>
                      <dd className="text-lg font-bold">
                        {formatMoney(totalInterest)}
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        </SectionCard>
      ) : null}

      {rateResearchOpen ? (
        <RateResearchModal
          targetPrice={movePlanner.target}
          loanRequired={movePlanner.loanRequired}
          ltv={movePlanner.ltv}
          termYears={Number(termYears) || termGuide.maxTerm}
          currentRate={Number(targetRate) || 0}
          maxTermYears={termGuide.maxTerm}
          onSelect={(suggestion) => {
            setTargetRate(String(suggestion.rate));
            setTermYears(String(suggestion.termYears || termYears));
            setRateResearchOpen(false);
          }}
          onClose={() => setRateResearchOpen(false)}
        />
      ) : null}

      {modal?.type === "affordability_breakdown" ? (
        <Modal
          title="Affordability score breakdown"
          description="The headline score uses normal salary rather than temporary maternity pay. Where maternity is active, LOOP shows a separate exposure score below."
          onClose={() => setModal(null)}
        >
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              <div className={`rounded-3xl p-4 ${affordabilityScore.tone}`}>
                <p className="text-xs font-black uppercase">Score</p>
                <p className="mt-1 text-3xl font-black">
                  {affordabilityScore.score}/100
                </p>
                <p className="text-sm font-bold">{affordabilityScore.label}</p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase text-slate-400">
                  Income mode
                </p>
                <p className="mt-1 text-xl font-black capitalize text-slate-950">
                  {affordabilityScore.incomeMode}
                </p>
                <p className="text-xs font-bold text-slate-500">
                  {affordabilityScore.numberOfIncomes} income(s) detected
                </p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase text-slate-400">
                  Payment / income
                </p>
                <p className="mt-1 text-xl font-black text-slate-950">
                  {(paymentToIncomeRatio * 100).toFixed(1)}%
                </p>
              </div>
              <div className="rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase text-slate-400">
                  Projected buffer
                </p>
                <p className="mt-1 text-xl font-black text-slate-950">
                  {formatMoney(householdSurplus)}
                </p>
              </div>
            </div>
            {maternityExposureScore ? (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">
                      Temporary maternity exposure
                    </p>
                    <h3 className="mt-1 text-2xl font-black text-slate-950">
                      {maternityExposureScore.score}/100
                    </h3>
                    <p className="mt-1 text-sm font-bold text-amber-900">
                      This uses the income actually expected during the selected
                      maternity month. It does not replace the normal-salary
                      affordability result.
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-4 py-2 text-sm font-black ${maternityExposureScore.tone}`}
                  >
                    {maternityExposureScore.label}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {maternityExposureScore.criteria.slice(0, 4).map((item) => (
                    <div
                      key={`maternity-${item.label}`}
                      className="rounded-2xl bg-white/80 p-3"
                    >
                      <p className="text-xs font-black text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-700">
                        {item.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="space-y-3">
              {affordabilityScore.criteria.map((item) => (
                <div
                  key={`${item.group}-${item.label}`}
                  className="rounded-3xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                        {item.group}
                      </p>
                      <h3 className="mt-1 font-black text-slate-950">
                        {item.label}
                      </h3>
                    </div>
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">
                      {item.points}/{item.max}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-600">
                    {item.reason}
                  </p>
                </div>
              ))}
            </div>
            <p className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
              Next refinement: add explicit emergency savings, income
              protection, employment stability and essential-vs-discretionary
              tagging so this moves from a provisional score to a richer
              lender-style risk profile.
            </p>
          </div>
        </Modal>
      ) : null}

      {modal?.type === "add_home" ? (
        <Modal
          title="Add home / address"
          description="Enter house number and postcode first. The lookup fills address/map fields, then you can add valuation and purchase details."
          onClose={() => setModal(null)}
        >
          <HomeWizard people={people} owners={owners} action={addHome} />
        </Modal>
      ) : null}
      {modal?.type === "edit_home" ? (
        <Modal
          title={`Edit ${modal.home.label}`}
          description="Update address, map fields, owner assignment and valuation assumptions."
          onClose={() => setModal(null)}
        >
          <HomeWizard
            people={people}
            owners={owners}
            home={modal.home}
            action={updateHome}
          />
        </Modal>
      ) : null}
      {modal?.type === "add_mortgage" ? (
        <Modal
          title="Add mortgage / rate"
          description="Attach the current balance, rate and deal dates to a home."
          onClose={() => setModal(null)}
        >
          <MortgageWizard
            homes={homes}
            people={people}
            allocations={liabilityAllocations}
            homeId={modal.homeId}
            action={addHomeMortgageDeal}
          />
        </Modal>
      ) : null}
      {modal?.type === "edit_mortgage" ? (
        <Modal
          title="Edit mortgage / rate"
          description="Update the live balance, rate, payment override or rate-end date."
          onClose={() => setModal(null)}
        >
          <MortgageWizard
            homes={homes}
            people={people}
            allocations={liabilityAllocations}
            deal={modal.deal}
            action={updateHomeMortgageDeal}
          />
        </Modal>
      ) : null}
      {modal?.type === "mortgage_details"
        ? (() => {
            const deal = modal.deal;
            const projection = projectedMortgageForDeal(deal);
            const payment = mortgagePaymentForDeal(deal);
            const followOnRate = Math.max(
              Number(deal.interest_rate || 0) + 2.5,
              7.49,
            );
            const followOnPayment = calculateMonthlyMortgagePayment({
              balance: projection.projectedBalance,
              annualInterestRate: followOnRate,
              termYears: Number(deal.term_years || 25),
            });
            const allocations = liabilityAllocations.filter(
              (allocation) => allocation.home_mortgage_deal_id === deal.id,
            );
            return (
              <Modal
                title={`${deal.lender || "Mortgage"}${deal.product_name ? ` · ${deal.product_name}` : ""}`}
                description="Key facts for the mortgage attached to this home. Values marked estimated are calculated from the last known balance and stored terms."
                onClose={() => setModal(null)}
              >
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-3xl bg-slate-950 p-5 text-white">
                      <p className="text-xs font-black uppercase text-slate-400">
                        Payment
                      </p>
                      <p className="mt-1 text-3xl font-black">
                        {formatMoney(payment)}/mo
                      </p>
                    </div>
                    <div className="rounded-3xl bg-blue-50 p-5">
                      <p className="text-xs font-black uppercase text-blue-700">
                        Current balance est.
                      </p>
                      <p className="mt-1 text-3xl font-black text-slate-950">
                        {formatMoney(projection.projectedBalance)}
                      </p>
                    </div>
                    <div className="rounded-3xl bg-slate-50 p-5">
                      <p className="text-xs font-black uppercase text-slate-500">
                        Rate
                      </p>
                      <p className="mt-1 text-3xl font-black text-slate-950">
                        {Number(deal.interest_rate || 0).toFixed(2)}%
                      </p>
                      <p className="text-xs font-bold text-slate-500">
                        {mortgageTermBadge(deal)}
                      </p>
                    </div>
                    <div className="rounded-3xl bg-slate-50 p-5">
                      <p className="text-xs font-black uppercase text-slate-500">
                        Rate ends
                      </p>
                      <p className="mt-1 text-xl font-black text-slate-950">
                        {deal.initial_period_end || deal.end_date || "Not set"}
                      </p>
                    </div>
                  </div>
                  <dl className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <dt className="text-xs font-black text-slate-500">
                        Opening / last known balance
                      </dt>
                      <dd className="mt-1 font-black text-slate-950">
                        {formatMoney(deal.balance)}
                      </dd>
                      <dd className="text-xs font-bold text-slate-500">
                        as at {balanceAsOfLabel(deal)}
                      </dd>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <dt className="text-xs font-black text-slate-500">
                        Repayment
                      </dt>
                      <dd className="mt-1 font-black capitalize text-slate-950">
                        {String(deal.repayment_type || "repayment").replaceAll(
                          "_",
                          " ",
                        )}
                      </dd>
                      <dd className="text-xs font-bold text-slate-500">
                        {deal.term_years} year stored term
                      </dd>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-4">
                      <dt className="text-xs font-black text-slate-500">
                        Started
                      </dt>
                      <dd className="mt-1 font-black text-slate-950">
                        {deal.start_date || "Not set"}
                      </dd>
                      <dd className="text-xs font-bold text-slate-500">
                        Product record date
                      </dd>
                    </div>
                  </dl>
                  <div className="rounded-3xl border border-orange-200 bg-orange-50 p-5">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-orange-700">
                      Follow-on / SVR estimate
                    </p>
                    <p className="mt-1 text-2xl font-black text-slate-950">
                      {formatMoney(followOnPayment)}/mo at{" "}
                      {followOnRate.toFixed(2)}%
                    </p>
                    <p className="mt-1 text-sm font-bold text-orange-900">
                      This is a fallback estimate until a verified lender
                      follow-on rate is connected.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 p-5">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                      Mortgage liability
                    </p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {allocations.length ? (
                        allocations.map((allocation) => (
                          <div
                            key={allocation.id}
                            className="rounded-2xl bg-slate-50 p-4"
                          >
                            <p className="font-black text-slate-950">
                              {personById.get(allocation.person_id)?.name ||
                                "Unknown person"}
                            </p>
                            <p className="text-sm font-bold text-slate-500">
                              {Number(
                                allocation.liability_percent || 0,
                              ).toFixed(1)}
                              % liable
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm font-bold text-amber-700">
                          Liability has not been allocated yet.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setModal({ type: "edit_mortgage", deal })}
                      className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white"
                    >
                      Edit mortgage
                    </button>
                  </div>
                </div>
              </Modal>
            );
          })()
        : null}
      {modal?.type === "workspace_preferences" ? (
        <Modal
          title="Personalise the moving-home workspace"
          description="Rename this tab so it reflects the user’s actual goal, such as ‘Next family home’, ‘Move to York’ or ‘Investment property’."
          onClose={() => setModal(null)}
        >
          <form
            action={updateMortgageWorkspacePreference}
            className="space-y-4"
          >
            <TextField
              label="Tab name"
              name="moving_home_label"
              defaultValue={
                workspacePreference?.moving_home_label || "Moving home"
              }
              placeholder="Next family home"
              required
            />
            <TextField
              label="Short description"
              name="moving_home_description"
              defaultValue={
                workspacePreference?.moving_home_description ||
                "Saved searches and move costs"
              }
              placeholder="Compare homes, costs and affordability"
              required
            />
            <SubmitButton>Save workspace name</SubmitButton>
          </form>
        </Modal>
      ) : null}
      {modal?.type === "add_valuation" ? (
        <Modal
          title="Add valuation source"
          description="Add a low/mid/high estimate from an agent, portal, sold-price comparable or your own estimate."
          onClose={() => setModal(null)}
        >
          <ValuationWizard
            homes={homes}
            homeId={modal.homeId}
            action={addHomeValuationSource}
          />
        </Modal>
      ) : null}
      {modal?.type === "edit_valuation" ? (
        <Modal
          title="Edit valuation source"
          description="Update this source without losing the source trail."
          onClose={() => setModal(null)}
        >
          <ValuationWizard
            homes={homes}
            valuation={modal.valuation}
            action={updateHomeValuationSource}
          />
        </Modal>
      ) : null}
      {modal?.type === "add_scenario" ? (
        <Modal
          title="Add standalone mortgage scenario"
          description="For one-off comparisons that do not need to attach to a home."
          onClose={() => setModal(null)}
        >
          <ScenarioForm />
        </Modal>
      ) : null}
      {modal?.type === "add_move_query" ? (
        <Modal
          title="I’m looking at houses"
          description="Save a URL or rough price so LOOP can estimate affordability, stamp duty, council tax and EPC/energy costs separately from your current home."
          onClose={() => setModal(null)}
        >
          <MoveQueryWizard homes={homes} />
        </Modal>
      ) : null}
      {modal?.type === "move_query_details" ? (
        <Modal
          title={displayMoveTitle(modal.query)}
          description="Saved moving-search scenario. This does not change your current home until you choose to act on it."
          onClose={() => setModal(null)}
        >
          <MoveQueryDetail
            query={modal.query}
            currentAffordabilityScore={affordabilityScore}
            currentMonthlyCost={currentHousePayment}
          />
        </Modal>
      ) : null}
    </main>
  );
}
