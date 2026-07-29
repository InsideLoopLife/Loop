import type { FinancialFlowLine, FinancialFlowMonthModel } from "./types";

function n(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(amount: number, income: number) {
  return income > 0 ? Math.round((amount / income) * 1000) / 10 : 0;
}

export function buildFinancialFlowMonthModel(input: {
  monthKey: string;
  scopeLabel: string;
  incomeLines: Array<Omit<FinancialFlowLine, "percentOfIncome">>;
  spendingLines: Array<Omit<FinancialFlowLine, "percentOfIncome">>;
  savingsLines: Array<Omit<FinancialFlowLine, "percentOfIncome">>;
}): FinancialFlowMonthModel {
  const totalIncome = input.incomeLines.reduce((sum, line) => sum + n(line.amount), 0);
  const committedSpending = input.spendingLines.reduce((sum, line) => sum + n(line.amount), 0);
  const savingsTotal = input.savingsLines.reduce((sum, line) => sum + n(line.amount), 0);
  const leftoverCash = totalIncome - committedSpending - savingsTotal;
  const attachPercent = (line: Omit<FinancialFlowLine, "percentOfIncome">): FinancialFlowLine => ({
    ...line,
    percentOfIncome: pct(line.amount, totalIncome),
  });
  return {
    monthKey: input.monthKey,
    scopeLabel: input.scopeLabel,
    totalIncome,
    committedSpending,
    savingsTotal,
    leftoverCash,
    savingsRate: pct(savingsTotal, totalIncome),
    incomeLines: input.incomeLines.map(attachPercent),
    spendingLines: input.spendingLines.map(attachPercent),
    savingsLines: input.savingsLines.map(attachPercent),
  };
}
