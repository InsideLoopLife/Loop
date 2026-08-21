import type { ReactNode } from "react";
import { FinancialFlowHouseShell } from "@/components/financial-flow/FinancialFlowHouseShell";

export default function SpendingLayout({ children }: { children: ReactNode }) {
  return <FinancialFlowHouseShell section="spending">{children}</FinancialFlowHouseShell>;
}
