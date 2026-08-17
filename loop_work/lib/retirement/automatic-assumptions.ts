export type PensionFundEvidence = {
  pensionFundId: string;
  fundName: string;
  currentValue: number;
  fiveYearPercent: number | null;
  tenYearPercent: number | null;
  planningRatePercent: number | null;
  asOfDate: string;
  sourceName: string | null;
  sourceUrl: string | null;
};

export type RetirementAutomaticAssumptions = {
  portfolioGrowthPercent: number;
  evidencedPortfolioValue: number;
  totalPensionValue: number;
  inflationPercent: number;
  inflationPeriodYears: number;
  inflationAsOfDate: string | null;
  inflationSourceName: string;
  inflationSourceUrl: string;
  lifestyleAnnualTarget: number;
  currentAnnualSpending: number;
  currentChildcareAnnual: number;
  childcareEndingBeforeRetirementAnnual: number;
  childcareBasis: "explicit_dates" | "age_inference" | "mixed" | "none";
  childcareAdjustments: Array<{ label: string; annualAmount: number; endsAtAge: number; basis: "explicit" | "age_inference" }>;
  fundEvidence: PensionFundEvidence[];
};

export function evidencePlanningRate(five: number | null, ten: number | null) {
  const rates = [five, ten].filter((value): value is number => value != null && Number.isFinite(value));
  if (!rates.length) return null;
  const historicalAverage = rates.reduce((sum, value) => sum + value, 0) / rates.length;
  // Historical returns remain visible, but exceptional periods must not be
  // extrapolated as a promise. FCA COBS 13 Annex 2 caps the intermediate
  // nominal personal-pension projection rate at 5% (higher illustration 8%).
  return Math.max(-5, Math.min(5, historicalAverage));
}

export function weightedRate(rows: Array<{ currentValue: number; rate: number | null }>, fallback = 5) {
  const evidenced = rows.filter((row) => row.rate != null && Number.isFinite(row.rate));
  const value = evidenced.reduce((sum, row) => sum + Math.max(0, row.currentValue), 0);
  if (!evidenced.length) return fallback;
  if (value <= 0) return evidenced.reduce((sum, row) => sum + Number(row.rate), 0) / evidenced.length;
  return evidenced.reduce((sum, row) => sum + Number(row.rate) * Math.max(0, row.currentValue) / value, 0);
}
