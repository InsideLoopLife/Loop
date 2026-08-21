import type { ReactNode } from "react";
import { FinancialFlowHouseShell } from "@/components/financial-flow/FinancialFlowHouseShell";

export default function FinancialFlowLayout({ children }: { children: ReactNode }) {
  return <FinancialFlowHouseShell section="flow">{children}</FinancialFlowHouseShell>;
}
