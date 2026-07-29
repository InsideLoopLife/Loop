export function calculateMonthlyMortgagePayment({
  balance,
  annualInterestRate,
  termYears,
}: {
  balance: number;
  annualInterestRate: number;
  termYears: number;
}) {
  const monthlyRate = annualInterestRate / 100 / 12;
  const numberOfPayments = termYears * 12;

  if (balance <= 0 || termYears <= 0) return 0;
  if (monthlyRate === 0) return balance / numberOfPayments;

  return (
    balance *
    ((monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) /
      (Math.pow(1 + monthlyRate, numberOfPayments) - 1))
  );
}

export function estimateTotalInterest({
  balance,
  annualInterestRate,
  termYears,
}: {
  balance: number;
  annualInterestRate: number;
  termYears: number;
}) {
  const monthlyPayment = calculateMonthlyMortgagePayment({
    balance,
    annualInterestRate,
    termYears,
  });

  return monthlyPayment * termYears * 12 - balance;
}

export function countWholeMortgageMonths({
  fromDate,
  toDate,
}: {
  fromDate?: string | null;
  toDate?: string | Date | null;
}) {
  if (!fromDate) return 0;

  const start = new Date(`${fromDate}T00:00:00`);
  const end = toDate instanceof Date ? toDate : new Date(`${toDate || new Date().toISOString().slice(0, 10)}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;

  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;

  return Math.max(0, months);
}

export function calculateProjectedMortgageBalance({
  openingBalance,
  annualInterestRate,
  termYears,
  balanceAsOfDate,
  asOfDate = new Date(),
  monthlyPayment,
  repaymentType = "repayment",
}: {
  openingBalance: number;
  annualInterestRate: number;
  termYears: number;
  balanceAsOfDate?: string | null;
  asOfDate?: string | Date;
  monthlyPayment?: number | null;
  repaymentType?: string | null;
}) {
  const originalBalance = Number(openingBalance || 0);
  if (originalBalance <= 0) {
    return {
      projectedBalance: 0,
      monthsProjected: 0,
      monthlyPaymentUsed: 0,
      interestPaidSinceBalanceDate: 0,
      capitalPaidSinceBalanceDate: 0,
    };
  }

  const monthsProjected = countWholeMortgageMonths({ fromDate: balanceAsOfDate, toDate: asOfDate });
  const rate = Number(annualInterestRate || 0) / 100 / 12;
  const numberOfPayments = Math.max(1, Math.round(Number(termYears || 0) * 12));
  const payment = Number(monthlyPayment || 0) > 0
    ? Number(monthlyPayment)
    : calculateMonthlyMortgagePayment({
        balance: originalBalance,
        annualInterestRate: Number(annualInterestRate || 0),
        termYears: Number(termYears || 0),
      });

  if (repaymentType === "interest_only") {
    return {
      projectedBalance: originalBalance,
      monthsProjected,
      monthlyPaymentUsed: payment,
      interestPaidSinceBalanceDate: originalBalance * rate * monthsProjected,
      capitalPaidSinceBalanceDate: 0,
    };
  }

  let balance = originalBalance;
  let interestPaid = 0;
  const monthsToRun = Math.min(monthsProjected, numberOfPayments + 24);

  for (let index = 0; index < monthsToRun; index += 1) {
    if (balance <= 0) {
      balance = 0;
      break;
    }

    const monthlyInterest = balance * rate;
    interestPaid += monthlyInterest;
    balance = Math.max(0, balance + monthlyInterest - payment);
  }

  return {
    projectedBalance: balance,
    monthsProjected,
    monthlyPaymentUsed: payment,
    interestPaidSinceBalanceDate: interestPaid,
    capitalPaidSinceBalanceDate: Math.max(0, originalBalance - balance),
  };
}
