/**
 * Explicit cross-domain contract for future AI/LOOP briefing features.
 * Raw Health and Wealth repositories must not be joined directly by UI code.
 */
export type WealthWellbeingSummary = {
  netWorthBand?: "negative" | "low" | "building" | "established";
  emergencyFundMonths?: number | null;
  monthlyFinancialCapacity?: number | null;
  highPriorityActionCount: number;
  generatedAt: string;
};

export type HealthWellbeingSummary = {
  nutritionDataPresent: boolean;
  activityDataPresent: boolean;
  sleepDataPresent: boolean;
  highPriorityActionCount: number;
  generatedAt: string;
};

export type ApprovedWellbeingSummary = {
  wealth?: WealthWellbeingSummary;
  health?: HealthWellbeingSummary;
  consentScopes: Array<"wealth_summary" | "health_summary">;
  generatedAt: string;
};
