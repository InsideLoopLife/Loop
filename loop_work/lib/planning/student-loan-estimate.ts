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
