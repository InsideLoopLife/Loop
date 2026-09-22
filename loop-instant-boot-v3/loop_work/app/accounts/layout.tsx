import type { ReactNode } from "react";
import { FinancialFlowHouseShell } from "@/components/financial-flow/FinancialFlowHouseShell";

export default function AccountsLayout({ children }: { children: ReactNode }) {
  return (
    <FinancialFlowHouseShell section="savings">
      {children}
    </FinancialFlowHouseShell>
  );
}
