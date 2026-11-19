import type { ReactNode } from "react";
import { FinancialFlowHouseShell } from "@/components/financial-flow/FinancialFlowHouseShell";

export default function BankAccountsLayout({ children }: { children: ReactNode }) {
  return <FinancialFlowHouseShell section="accounts">{children}</FinancialFlowHouseShell>;
}
