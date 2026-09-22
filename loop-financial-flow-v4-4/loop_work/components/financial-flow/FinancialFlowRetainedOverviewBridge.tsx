"use client";

import { useEffect } from "react";
import {
  useFinancialFlowRetained,
  type RetainedFlowSummary,
} from "@/components/financial-flow/FinancialFlowRetainedStore";

export function FinancialFlowRetainedOverviewBridge({
  summary,
}: {
  summary: RetainedFlowSummary;
}) {
  const { rememberSummary } = useFinancialFlowRetained();
  const serialised = JSON.stringify(summary);

  useEffect(() => {
    rememberSummary(JSON.parse(serialised) as RetainedFlowSummary);
  }, [rememberSummary, serialised]);

  return null;
}
