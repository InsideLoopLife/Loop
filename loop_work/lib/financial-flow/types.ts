export type FinancialFlowTab = "flow" | "income" | "spending" | "savings";
export type FinancialFlowTone = "orange" | "green" | "blue" | "slate";

export type FinancialFlowPerson = {
  id: string;
  name?: string | null;
  relationship?: string | null;
  avatar_url?: string | null;
  linked_user_id?: string | null;
};

export type FinancialFlowLine = {
  key: string;
  label: string;
  amount: number;
  percentOfIncome: number;
  tone: FinancialFlowTone;
  categoryKey?: string | null;
  personId?: string | null;
  isHidden?: boolean;
};

export type FinancialFlowMonthModel = {
  monthKey: string;
  scopeLabel: string;
  totalIncome: number;
  committedSpending: number;
  savingsTotal: number;
  leftoverCash: number;
  savingsRate: number;
  incomeLines: FinancialFlowLine[];
  spendingLines: FinancialFlowLine[];
  savingsLines: FinancialFlowLine[];
};
