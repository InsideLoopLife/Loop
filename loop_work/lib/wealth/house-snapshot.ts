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

export type HouseAffordabilityCriterion = {
  label: string;
  reason: string;
  points: number;
  max: number;
  explanation: string;
  scoring: string;
  improve: string;
};

export type HouseAffordabilityScore = {
  score: number;
  label: "Green" | "Amber" | "Red";
  tone: string;
  criteria: HouseAffordabilityCriterion[];
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
  const mortgagePayment = Math.max(0, Number(input.mortgagePayment || 0));

  const paymentRatio = income > 0 ? mortgagePayment / income : 1;
  const outgoingRatio = income > 0 ? outgoings / income : 1;
  const ltv =
    input.propertyValue > 0
      ? Math.max(0, Number(input.mortgageBalance || 0)) / input.propertyValue
      : 1;

  const incomes = input.monthPlan.incomeItems.filter(
    (item) =>
      Number(item.value || 0) > 100 &&
      !/dividend|side income|interest/i.test(item.label),
  );

  const incomeCount = new Set(
    incomes.map(
      (item) => item.personId || item.label.split(" · ")[0] || item.label,
    ),
  ).size;

  const multiIncome = incomeCount >= 2;

  const childMonthly = input.monthPlan.outgoingItems
    .filter((item) =>
      /child|nursery|childcare|wraparound|school|after school|breakfast club/i.test(
        String(item.label || ""),
      ),
    )
    .reduce((sum, item) => sum + Math.max(0, Number(item.value || 0)), 0);

  const debtMonthly = input.monthPlan.outgoingItems
    .filter((item) =>
      /loan|credit|debt|finance|hp\b|hire purchase|student loan/i.test(
        String(item.label || ""),
      ),
    )
    .reduce((sum, item) => sum + Math.max(0, Number(item.value || 0)), 0);

  const committedExMortgage = Math.max(0, outgoings - mortgagePayment);
  const committedHouseholdLoad =
    income > 0 ? (mortgagePayment + committedExMortgage) / income : 1;

  const bufferMonths =
    Number(input.emergencySavings || 0) > 0 && outgoings > 0
      ? Number(input.emergencySavings || 0) / outgoings
      : surplus > 0 && outgoings > 0
        ? (surplus * 3) / outgoings
        : 0;

  const stressPayment =
    Number(input.mortgageBalance || 0) > 0
      ? calculateMonthlyMortgagePayment({
          balance: Number(input.mortgageBalance || 0),
          annualInterestRate: 6.5,
          termYears: 25,
        })
      : 0;

  const stressRatio = income > 0 ? stressPayment / income : 1;
  const stressResidual = income - committedExMortgage - stressPayment;

  const householdPressure =
    childMonthly > 0 || debtMonthly > 0
      ? "This household has additional child/debt commitments, so LOOP places more weight on residual cash and stress resilience."
      : "No large child/debt commitment was detected in the current month plan.";

  function band(
    value: number,
    strong: number,
    watch: number,
    maxPoints: number,
  ) {
    if (value <= strong) return maxPoints;
    if (value <= watch) return Math.round(maxPoints * 0.6);
    return 0;
  }

  const residualFloor =
    650 +
    (multiIncome ? 350 : 150) +
    Math.min(900, childMonthly * 0.35) +
    Math.min(600, debtMonthly * 0.25);

  const criteria: HouseAffordabilityCriterion[] = [
    {
      label: "Mortgage share of net income",
      max: 20,
      points: band(paymentRatio, multiIncome ? 0.30 : 0.28, multiIncome ? 0.40 : 0.38, 20),
      reason: `${(paymentRatio * 100).toFixed(1)}% of tracked net household income.`,
      explanation:
        "This shows how much usable household income goes to the mortgage itself. LOOP treats this as a resilience measure, not an average-household benchmark: a higher percentage can still be workable when residual income and other commitments remain strong.",
      scoring:
        multiIncome
          ? "Planning resilience band: strong at 30% or below, watch from 30–40%, pressured above 40%. These are LOOP planning bands, not a claim about what a normal household spends."
          : "Planning resilience band: strong at 28% or below, watch from 28–38%, pressured above 38%. These are LOOP planning bands, not a claim about what a normal household spends.",
      improve:
        "A lower payment, lower rate, smaller mortgage, or higher sustainable household income improves this measure.",
    },
    {
      label: "Whole-household committed load",
      max: 20,
      points: band(committedHouseholdLoad, 0.55, 0.72, 20),
      reason: `${(committedHouseholdLoad * 100).toFixed(1)}% of net income is currently tracked as outgoings.`,
      explanation:
        `This looks beyond the mortgage and asks how much household income is already committed across the month. ${householdPressure}`,
      scoring:
        "Strong at 55% or below, watch from 55–72%, pressured above 72%. The purpose is to judge remaining flexibility, not compare the household with a national average.",
      improve:
        "Reduce recurring commitments or expensive debt, remove duplicate spending records, or increase sustainable household income.",
    },
    {
      label: "Rate stress resilience",
      max: 20,
      points:
        stressRatio <= 0.35 && stressResidual >= residualFloor
          ? 20
          : stressRatio <= 0.45 && stressResidual >= residualFloor * 0.6
            ? 12
            : 0,
      reason: `At a 6.5% planning stress, the modelled payment is ${formatMoney(stressPayment)}/mo and leaves ${formatMoney(stressResidual)} after other tracked outgoings.`,
      explanation:
        "This asks whether the household still has room if mortgage costs rise materially. It uses a conservative planning stress rather than assuming today's rate lasts forever.",
      scoring:
        `Strong when the stressed mortgage remains at or below 35% of net income and leaves at least ${formatMoney(residualFloor)} monthly residual cash; watch up to 45% with a reduced residual buffer. This is a LOOP planning test, not a lender affordability decision.`,
      improve:
        "Lower the mortgage balance, extend the term where appropriate, improve the rate, increase sustainable income, or build more monthly headroom before taking on a larger mortgage.",
    },
    {
      label: "Loan-to-value",
      max: 15,
      points: ltv < 0.8 ? 15 : ltv <= 0.9 ? 9 : 0,
      reason: `${(ltv * 100).toFixed(1)}% LTV.`,
      explanation:
        "Mortgage balance divided by current property value. Lower LTV generally means more equity, a larger property-price buffer and access to more competitive mortgage bands.",
      scoring:
        "Strong below 80% LTV, watch from 80–90%, pressured above 90%. LOOP only uses evidenced property values.",
      improve:
        "Repayments, overpayments or additional deposit/equity can lower LTV. Property valuations should only move when there is evidence.",
    },
    {
      label: "Accessible cash buffer",
      max: 15,
      points:
        bufferMonths >= (multiIncome ? 3 : 6)
          ? 15
          : bufferMonths >= (multiIncome ? 1.5 : 3)
            ? 9
            : 0,
      reason: `${bufferMonths.toFixed(1)} months of tracked outgoings.`,
      explanation:
        "How long accessible emergency savings could cover the household's tracked monthly outgoings if income stopped or fell sharply.",
      scoring:
        multiIncome
          ? "Strong at 3+ months and watch at 1.5–3 months for a multi-income household."
          : "Strong at 6+ months and watch at 3–6 months for a single-income household.",
      improve:
        "Build accessible emergency savings and make sure LOOP is not treating locked investments or pension assets as emergency cash.",
    },
    {
      label: "Residual household headroom",
      max: 10,
      points:
        surplus >= residualFloor
          ? 10
          : surplus >= residualFloor * 0.6
            ? 6
            : 0,
      reason: `${formatMoney(surplus)} remains after tracked outgoings; LOOP's current household-aware planning floor is ${formatMoney(residualFloor)}.`,
      explanation:
        "Residual cash pays for irregular costs, savings, repairs and surprises. LOOP scales this planning floor when it detects multiple incomes, childcare or debt rather than applying one fixed cash target to every household.",
      scoring:
        `Strong when monthly residual income is at least ${formatMoney(residualFloor)}, watch at 60–100% of that amount, pressured below it.`,
      improve:
        "Increase sustainable income, reduce fixed/debt commitments or childcare pressure where practical, and make sure all recurring spending is classified correctly.",
    },
  ];

  const score = Math.max(
    0,
    Math.min(100, criteria.reduce((sum, item) => sum + item.points, 0)),
  );
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
