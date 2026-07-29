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
}: {
  grossAnnual: number;
  pensionPercent?: number;
  studentLoanPlan?: StudentLoanPlan;
  pensionMethod?: PensionMethod;
}) {
  const gross = Math.max(0, grossAnnual);
  const method = normalisePensionMethod(pensionMethod);
  const grossPension = method === "none" ? 0 : Math.max(0, gross * (pensionPercent / 100));
  const taxablePay = method === "net_pay" || method === "nhs_pension" || method === "salary_sacrifice"
    ? Math.max(0, gross - grossPension)
    : gross;
  const niPay = method === "salary_sacrifice" ? Math.max(0, gross - grossPension) : gross;
  const studentLoanPay = method === "salary_sacrifice" ? Math.max(0, gross - grossPension) : gross;
  const pensionNetDeduction = method === "relief_at_source" ? grossPension * 0.8 : grossPension;

  const incomeTax = calculateIncomeTaxEnglandWalesNorthernIreland(taxablePay);
  const nationalInsurance = calculateEmployeeNI(niPay);
  const studentLoan = calculateStudentLoan(studentLoanPay, studentLoanPlan);
  const annualTakeHome = gross - pensionNetDeduction - incomeTax - nationalInsurance - studentLoan;

  return {
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
