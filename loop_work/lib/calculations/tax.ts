import { nhsMemberContributionPercent } from "@/lib/calculations/nhs-pension";

export type StudentLoanPlan = "none" | "plan_1" | "plan_2" | "plan_4" | "plan_5" | "postgraduate";
export type PensionMethod = "none" | "net_pay" | "salary_sacrifice" | "relief_at_source" | "nhs_pension";

const STUDENT_LOAN_THRESHOLDS_2026_27: Record<StudentLoanPlan, { annual: number; rate: number }> = {
  none: { annual: Number.POSITIVE_INFINITY, rate: 0 },
  plan_1: { annual: 26900, rate: 0.09 },
  plan_2: { annual: 29385, rate: 0.09 },
  plan_4: { annual: 33795, rate: 0.09 },
  plan_5: { annual: 25000, rate: 0.09 },
  postgraduate: { annual: 21000, rate: 0.06 },
};

export function normalisePensionMethod(value: unknown): PensionMethod {
  if (value === "salary_sacrifice" || value === "relief_at_source" || value === "nhs_pension" || value === "none") return value;
  return "net_pay";
}

export function calculateIncomeTaxEnglandWalesNorthernIreland(grossAnnual: number) {
  const gross = Math.max(0, grossAnnual);
  const personalAllowance = gross > 100000 ? Math.max(0, 12570 - (gross - 100000) / 2) : 12570;
  const taxable = Math.max(0, gross - personalAllowance);

  const basic = Math.min(taxable, 37700) * 0.2;
  const higher = Math.max(0, Math.min(taxable - 37700, 87440)) * 0.4;
  const additional = Math.max(0, taxable - 125140) * 0.45;

  return basic + higher + additional;
}

export type TaxRegion = "rUK" | "scotland";

// Scottish income tax 2026-27 (Scottish Rate Resolution; gov.scot "Scottish
// Income Tax rates and bands 2026 to 2027"). Bands are amounts of taxable
// income above the personal allowance: starter to £16,537, basic to £29,526,
// intermediate to £43,662, higher to £75,000, advanced to £125,140, then top.
const SCOTTISH_BANDS_2026_27: Array<{ upTo: number; rate: number }> = [
  { upTo: 16537 - 12570, rate: 0.19 },
  { upTo: 29526 - 12570, rate: 0.2 },
  { upTo: 43662 - 12570, rate: 0.21 },
  { upTo: 75000 - 12570, rate: 0.42 },
  { upTo: 125140 - 12570, rate: 0.45 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.48 },
];

export function calculateIncomeTaxScotland(grossAnnual: number) {
  const gross = Math.max(0, grossAnnual);
  const personalAllowance = gross > 100000 ? Math.max(0, 12570 - (gross - 100000) / 2) : 12570;
  const taxable = Math.max(0, gross - personalAllowance);
  // Band limits are fixed amounts of taxable income; when the allowance tapers
  // away the top band still starts at £125,140 of total income.
  let tax = 0;
  let lower = 0;
  for (const band of SCOTTISH_BANDS_2026_27) {
    const upper = band.upTo === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : band.upTo;
    const topStart = 125140 - personalAllowance;
    const effectiveUpper = band.rate === 0.45 ? topStart : upper;
    const slice = Math.max(0, Math.min(taxable, effectiveUpper) - lower);
    tax += slice * band.rate;
    lower = Math.max(lower, effectiveUpper);
    if (taxable <= lower) break;
  }
  return tax;
}

export function calculateIncomeTax(grossAnnual: number, region: TaxRegion | string | null | undefined = "rUK") {
  return region === "scotland" ? calculateIncomeTaxScotland(grossAnnual) : calculateIncomeTaxEnglandWalesNorthernIreland(grossAnnual);
}

export function calculateEmployeeNI(grossAnnual: number) {
  const gross = Math.max(0, grossAnnual);
  const primaryThreshold = 12570;
  const upperEarningsLimit = 50270;

  const main = Math.max(0, Math.min(gross, upperEarningsLimit) - primaryThreshold) * 0.08;
  const upper = Math.max(0, gross - upperEarningsLimit) * 0.02;

  return main + upper;
}

export function calculateStudentLoan(grossAnnual: number, plan: StudentLoanPlan) {
  const config = STUDENT_LOAN_THRESHOLDS_2026_27[plan] ?? STUDENT_LOAN_THRESHOLDS_2026_27.none;
  const repayable = Math.max(0, grossAnnual - config.annual);
  return repayable * config.rate;
}

export function estimateAnnualTakeHome({
  grossAnnual,
  pensionPercent = 0,
  studentLoanPlan = "none",
  pensionMethod = "net_pay",
  taxRegion = "rUK",
  nhsTierFromPay = true,
}: {
  grossAnnual: number;
  pensionPercent?: number;
  studentLoanPlan?: StudentLoanPlan;
  pensionMethod?: PensionMethod;
  taxRegion?: TaxRegion | string | null;
  /** NHS member rates are set by pay tier, so a pay rise can move someone up a tier. */
  nhsTierFromPay?: boolean;
}) {
  const gross = Math.max(0, grossAnnual);
  const method = normalisePensionMethod(pensionMethod);
  const effectivePercent = method === "nhs_pension" && nhsTierFromPay && gross > 0 ? nhsMemberContributionPercent(gross) : pensionPercent;
  const grossPension = method === "none" ? 0 : Math.max(0, gross * (effectivePercent / 100));
  const taxablePay = method === "net_pay" || method === "nhs_pension" || method === "salary_sacrifice"
    ? Math.max(0, gross - grossPension)
    : gross;
  const niPay = method === "salary_sacrifice" ? Math.max(0, gross - grossPension) : gross;
  const studentLoanPay = method === "salary_sacrifice" ? Math.max(0, gross - grossPension) : gross;
  const pensionNetDeduction = method === "relief_at_source" ? grossPension * 0.8 : grossPension;

  const incomeTax = calculateIncomeTax(taxablePay, taxRegion);
  const nationalInsurance = calculateEmployeeNI(niPay);
  const studentLoan = calculateStudentLoan(studentLoanPay, studentLoanPlan);
  const annualTakeHome = gross - pensionNetDeduction - incomeTax - nationalInsurance - studentLoan;

  return {
    pensionPercent: effectivePercent,
    pension: grossPension,
    pensionNetDeduction,
    taxablePay,
    niPay,
    studentLoanPay,
    incomeTax,
    nationalInsurance,
    studentLoan,
    annualTakeHome,
    monthlyTakeHome: annualTakeHome / 12,
  };
}
