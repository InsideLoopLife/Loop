import type { ReactNode } from "react";
import { FinancialFlowHouseShell } from "@/components/financial-flow/FinancialFlowHouseShell";

export default function CanIAffordLayout({ children }: { children: ReactNode }) {
  return <FinancialFlowHouseShell section="afford">{children}</FinancialFlowHouseShell>;
}
