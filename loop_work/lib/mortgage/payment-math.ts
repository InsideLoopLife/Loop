// lib/mortgage/payment-math.ts
//
// Shared amortization helpers. Same formulas as the affordability engine's
// internal ones — pulled out here so House's follow-on/shortlist calc and the
// affordability engine aren't quietly duplicating (and potentially diverging on)
// the same maths.

export function monthlyPaymentFor(loanAmount: number, annualRatePct: number, termYears: number): number {
  const r = annualRatePct / 100 / 12;
  const n = termYears * 12;
  if (n <= 0) return 0;
  if (r === 0) return loanAmount / n;
  const f = Math.pow(1 + r, n);
  return (loanAmount * r * f) / (f - 1);
}

/** Remaining term in years given a start date and an original term. */
export function remainingTermYears(startDate: string | null, termYears: number | null): number {
  if (!startDate || !termYears) return termYears ?? 25;
  const start = new Date(startDate);
  const now = new Date();
  const yearsElapsed = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(1, termYears - yearsElapsed);
}
