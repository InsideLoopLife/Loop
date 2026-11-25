/**
 * Estimate a student loan's balance today from the last checked balance.
 *
 * For each payday after the check date, up to today: add a month of interest,
 * then take off that month's repayment from pay. Paydays are the last weekday
 * of the month, which is how most payroll runs.
 *
 * This is an estimate. The Student Loans Company's own figure is the real one,
 * so the checked balance stays visible and the person can update it any time.
 */
export type StudentLoanEstimate = {
  estimatedBalance: number;
  paydays: number;
  repaid: number;
  interest: number;
};

export function lastWeekdayOfMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 0));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function nextMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 1));
  return date.toISOString().slice(0, 7);
}

export function estimateStudentLoanBalance(input: {
  balance: number;
  balanceDate: string | null | undefined;
  interestRatePercent?: number | null;
  today: string;
  /** Repayment taken from pay in a month (from the payslip maths, or a fixed override). */
  repaymentForMonth: (month: string) => number;
}): StudentLoanEstimate {
  const start = String(input.balanceDate || "").slice(0, 10);
  let balance = Math.max(0, Number(input.balance) || 0);
  const result: StudentLoanEstimate = { estimatedBalance: balance, paydays: 0, repaid: 0, interest: 0 };
  if (!start || !balance || start >= input.today) return result;
  const monthlyRate = Math.max(0, Number(input.interestRatePercent) || 0) / 100 / 12;
  let month = start.slice(0, 7);
  for (let guard = 0; guard < 600 && month <= input.today.slice(0, 7); guard += 1, month = nextMonth(month)) {
    const payday = lastWeekdayOfMonth(month);
    if (payday <= start || payday > input.today) continue;
    const interest = balance * monthlyRate;
    const repayment = Math.min(balance + interest, Math.max(0, input.repaymentForMonth(month) || 0));
    balance = balance + interest - repayment;
    result.paydays += 1;
    result.repaid += repayment;
    result.interest += interest;
    if (balance <= 0) { balance = 0; break; }
  }
  result.estimatedBalance = balance;
  return result;
}

// Interest from 1 Sept 2026 to 31 Aug 2027 (DfE): Plan 1, 4 and 5 at RPI 4.1%; Plan 2 and postgraduate capped at 6%.
// Used only when no rate is saved on the loan.
export const STUDENT_LOAN_DEFAULT_RATE: Record<string, number> = { plan_1: 4.1, plan_2: 6, plan_4: 4.1, plan_5: 4.1, postgraduate: 6 };

// Written off this many years after the April you were first due to repay (England & Wales; Plan 4 is Scotland).
// Plan 1 loans taken out before September 2006 are written off at 65 instead.
export const STUDENT_LOAN_WRITE_OFF_YEARS: Record<string, number> = { plan_1: 25, plan_2: 30, plan_4: 30, plan_5: 40, postgraduate: 30 };

export type StudentLoanPayoff = {
  /** Month the last repayment comes out ("YYYY-MM"), or null if it's written off first or never cleared. */
  payoffMonth: string | null;
  months: number;
  totalRepaid: number;
  totalInterest: number;
  /** The month it would be written off, if the first repayment year is known. */
  writeOffMonth: string | null;
  writtenOffFirst: boolean;
  writtenOffBalance: number;
  /** Repayments stop (no pay above the threshold) — it won't clear at today's pay. */
  stalls: boolean;
  monthlyNow: number;
  ratePercent: number;
  rateIsDefault: boolean;
};

/**
 * When a student loan is paid off at today's pay: each month adds interest and takes off that
 * month's repayment from pay (which already follows future pay changes like maternity leave).
 * Pay rises and threshold rises aren't forecast, so this is a guide.
 */
export function projectStudentLoanPayoff(input: {
  balance: number;
  today: string;
  plan: string;
  interestRatePercent?: number | null;
  firstRepaymentYear?: number | null;
  repaymentForMonth: (month: string) => number;
}): StudentLoanPayoff {
  const saved = Number(input.interestRatePercent);
  const rateIsDefault = !(saved > 0);
  const ratePercent = rateIsDefault ? STUDENT_LOAN_DEFAULT_RATE[input.plan] ?? 4.1 : saved;
  const monthlyRate = ratePercent / 100 / 12;
  const years = STUDENT_LOAN_WRITE_OFF_YEARS[input.plan];
  const writeOffMonth = input.firstRepaymentYear && years ? `${input.firstRepaymentYear + years}-04` : null;
  let balance = Math.max(0, Number(input.balance) || 0);
  let month = nextMonth(input.today.slice(0, 7));
  const out: StudentLoanPayoff = { payoffMonth: null, months: 0, totalRepaid: 0, totalInterest: 0, writeOffMonth, writtenOffFirst: false, writtenOffBalance: 0, stalls: false, monthlyNow: Math.max(0, input.repaymentForMonth(input.today.slice(0, 7)) || 0), ratePercent, rateIsDefault };
  if (!balance) return out;
  let zeroRun = 0;
  for (let guard = 0; guard < 12 * 45; guard += 1, month = nextMonth(month)) {
    if (writeOffMonth && month >= writeOffMonth) { out.writtenOffFirst = true; out.writtenOffBalance = Math.round(balance); return out; }
    const interest = balance * monthlyRate;
    const repayment = Math.min(balance + interest, Math.max(0, input.repaymentForMonth(month) || 0));
    zeroRun = repayment > 0 ? 0 : zeroRun + 1;
    if (zeroRun >= 24) { out.stalls = true; return out; }
    balance = balance + interest - repayment;
    out.months += 1;
    out.totalRepaid += repayment;
    out.totalInterest += interest;
    if (balance <= 0.5) { out.payoffMonth = month; break; }
  }
  out.totalRepaid = Math.round(out.totalRepaid);
  out.totalInterest = Math.round(out.totalInterest);
  return out;
}
