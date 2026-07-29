export function calculateDisposableIncome({
  monthlyTakeHome,
  monthlyDividends,
  monthlyMortgage,
  fixedCosts,
  variableBudget,
  savingsTarget,
  debtPayments,
}: {
  monthlyTakeHome: number;
  monthlyDividends: number;
  monthlyMortgage: number;
  fixedCosts: number;
  variableBudget: number;
  savingsTarget: number;
  debtPayments: number;
}) {
  const totalIncome = monthlyTakeHome + monthlyDividends;
  const totalPlannedOutgoings =
    monthlyMortgage + fixedCosts + variableBudget + savingsTarget + debtPayments;

  return {
    totalIncome,
    totalPlannedOutgoings,
    disposableIncome: totalIncome - totalPlannedOutgoings,
  };
}
