import { formatMoney } from "@/lib/format/money";
import {
  calculateMonthlyMortgagePayment,
  calculateProjectedMortgageBalance,
} from "@/lib/calculations/mortgage";
import type { MonthPlan } from "@/lib/planning/month-plan";
import type {
  Home,
  HomeMortgageDeal,
  HomeValuationSource,
} from "@/components/mortgage/MortgagePlannerClient";

export function valuationSummary(
  home: Home | undefined,
  valuations: HomeValuationSource[],
) {
  if (!home) return { low: 0, mid: 0, high: 0, sourceCount: 0 };

  const attached = valuations.filter((row) => row.home_id === home.id);
  const mids = attached
    .map((row) => Number(row.valuation_mid ?? row.valuation_amount ?? 0))
    .filter((value) => value > 0);

  const mid =
    Number(home.estimated_value_mid || 0) ||
    (mids.length ? mids.reduce((sum, value) => sum + value, 0) / mids.length : 0) ||
    Number(home.property_value || 0);

  return {
    low: Number(home.estimated_value_low || attached[0]?.valuation_low || mid),
    mid,
    high: Number(home.estimated_value_high || attached[0]?.valuation_high || mid),
    sourceCount: attached.length,
  };
}

export function currentMortgageSnapshot(deal?: HomeMortgageDeal | null) {
  if (!deal) return { balance: 0, payment: 0 };

  const projected = calculateProjectedMortgageBalance({
    openingBalance: Number(deal.balance || 0),
    annualInterestRate: Number(deal.interest_rate || 0),
    termYears: Number(deal.term_years || 25),
    balanceAsOfDate: deal.balance_as_of_date ?? deal.start_date,
    asOfDate: new Date(),
    monthlyPayment: deal.monthly_payment_override,
    repaymentType: deal.repayment_type ?? "repayment",
  });

  const balance = Math.max(0, projected.projectedBalance);
  const payment =
    Number(deal.monthly_payment_override || 0) ||
    calculateMonthlyMortgagePayment({
      balance,
      annualInterestRate: Number(deal.interest_rate || 0),
      termYears: Number(deal.term_years || 25),
    });

  return { balance, payment };
}

export type HouseAffordabilityScore = {
  score: number;
  label: "Green" | "Amber" | "Red";
  tone: string;
  criteria: { label: string; reason: string; points: number; max: number }[];
};

function points(value: number, green: number, amber: number, max: number) {
  if (value <= green) return max;
  if (value <= amber) return Math.round(max / 2);
  return 0;
}

export function buildHouseAffordabilityScore(input: {
  monthPlan: MonthPlan;
  mortgagePayment: number;
  mortgageBalance: number;
  propertyValue: number;
  emergencySavings?: number;
}): HouseAffordabilityScore {
  const income = Math.max(0, Number(input.monthPlan.income || 0));
  const outgoings = Math.max(0, Number(input.monthPlan.outgoings || 0));
  const surplus = income - outgoings;
  const paymentRatio = income > 0 ? input.mortgagePayment / income : 1;
  const outgoingRatio = income > 0 ? outgoings / income : 1;
  const ltv = input.propertyValue > 0 ? input.mortgageBalance / input.propertyValue : 1;

  const incomes = input.monthPlan.incomeItems.filter(
    (item) => Number(item.value || 0) > 100 && !/dividend|side income|interest/i.test(item.label),
  );
  const incomeCount = new Set(
    incomes.map((item) => item.personId || item.label.split(" · ")[0] || item.label),
  ).size;
  const dual = incomeCount >= 2;
  const bufferMonths =
    Number(input.emergencySavings || 0) > 0 && outgoings > 0
      ? Number(input.emergencySavings || 0) / outgoings
      : surplus > 0 && outgoings > 0
        ? (surplus * 3) / outgoings
        : 0;
  const maintenance = input.propertyValue > 0 ? (input.propertyValue * 0.01) / 12 : 0;

  const criteria = [
    {
      label: "Housing cost vs net income",
      max: 25,
      points: points(paymentRatio, dual ? 0.28 : 0.25, dual ? 0.38 : 0.35, 25),
      reason: `${(paymentRatio * 100).toFixed(1)}% of tracked net income.`,
    },
    {
      label: "Total outgoing load",
      max: 20,
      points: points(outgoingRatio, 0.35, 0.45, 20),
      reason: `${(outgoingRatio * 100).toFixed(1)}% of tracked net income.`,
    },
    {
      label: "Loan-to-value",
      max: 15,
      points: ltv < 0.8 ? 15 : ltv <= 0.9 ? 8 : 0,
      reason: `${(ltv * 100).toFixed(1)}% LTV.`,
    },
    {
      label: "Cash buffer",
      max: 15,
      points: bufferMonths >= (dual ? 3 : 6) ? 15 : bufferMonths >= (dual ? 1.5 : 3) ? 8 : 0,
      reason: `${bufferMonths.toFixed(1)} months of tracked outgoings.`,
    },
    {
      label: "Maintenance runway",
      max: 10,
      points: surplus >= maintenance ? 10 : surplus >= maintenance / 2 ? 5 : 0,
      reason: `${formatMoney(surplus)} surplus vs ${formatMoney(maintenance)} monthly maintenance guide.`,
    },
    {
      label: "Residual monthly income",
      max: 15,
      points: surplus >= (dual ? 1500 : 900) ? 15 : surplus >= (dual ? 750 : 350) ? 8 : 0,
      reason: `${formatMoney(surplus)} after tracked outgoings.`,
    },
  ];

  const score = Math.max(0, Math.min(100, criteria.reduce((sum, item) => sum + item.points, 0)));
  const label = score >= 80 ? "Green" : score >= 50 ? "Amber" : "Red";

  return {
    score,
    label,
    tone:
      label === "Green"
        ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
        : label === "Amber"
          ? "bg-amber-50 text-amber-800 ring-amber-200"
          : "bg-rose-50 text-rose-800 ring-rose-200",
    criteria,
  };
}
