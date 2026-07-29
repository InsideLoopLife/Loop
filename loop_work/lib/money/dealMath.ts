export function poundsToPence(value: number | string | null | undefined) {
  const n = typeof value === "string" ? Number(value.replace(/[^0-9.\-]/g, "")) : Number(value || 0);
  return Math.round((Number.isFinite(n) ? n : 0) * 100);
}

export function penceToPounds(value: number | null | undefined) {
  return (Number(value || 0) / 100).toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
  });
}

/**
 * Regular saver estimate:
 * If £200 is deposited monthly for 12 months, first deposit earns for 12 months,
 * second for 11, ... final for 1. This is only a comparison estimate.
 */
export function estimateRegularSaverGrossInterestPence(monthlyPence: number, rateAer: number, months = 12) {
  const monthCount = Math.max(1, months || 12);
  const monthWeight = (monthCount * (monthCount + 1)) / 2;
  return Math.max(0, Math.round(monthlyPence * (rateAer / 100) / 12 * monthWeight));
}

export function estimateOpportunity(input: {
  monthlyAvailablePence: number;
  currentRateAer?: number | null;
  candidateRateAer: number;
  maxMonthlyPence?: number | null;
  termMonths?: number | null;
}) {
  const monthly = Math.min(input.monthlyAvailablePence, input.maxMonthlyPence || input.monthlyAvailablePence);
  const months = input.termMonths || 12;
  const gross = estimateRegularSaverGrossInterestPence(monthly, input.candidateRateAer, months);
  const current = estimateRegularSaverGrossInterestPence(monthly, input.currentRateAer || 0, months);

  return {
    recommendedMonthlyPence: monthly,
    remainingMonthlyPence: Math.max(0, input.monthlyAvailablePence - monthly),
    estimatedGrossInterestPence: gross,
    estimatedIncrementalGrossInterestPence: Math.max(0, gross - current),
  };
}

export function conditionSummary(deal: any) {
  return [
    deal.requires_current_account ? "Requires linked/current account" : null,
    deal.requires_switch ? "May require a current account switch" : null,
    deal.requires_direct_debits ? "May require direct debits" : null,
    deal.requires_min_monthly_pay_in ? "May require minimum monthly pay-in" : null,
    deal.new_customers_only ? "May be new customers only" : null,
    deal.max_monthly_pence ? `Max monthly contribution ${penceToPounds(deal.max_monthly_pence)}` : null,
    deal.max_balance_pence ? `Max balance ${penceToPounds(deal.max_balance_pence)}` : null,
    deal.term_months ? `${deal.term_months} month term` : null,
  ].filter(Boolean) as string[];
}
