import type { ReactNode } from "react";
import { FinancialFlowHouseShell } from "@/components/financial-flow/FinancialFlowHouseShell";

export default function IncomeLayout({ children }: { children: ReactNode }) {
  return <FinancialFlowHouseShell section="income">{children}</FinancialFlowHouseShell>;
}
