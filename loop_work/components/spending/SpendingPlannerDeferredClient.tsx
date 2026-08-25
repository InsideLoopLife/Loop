"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { useFinancialFlowRetained } from "@/components/financial-flow/FinancialFlowRetainedStore";
import {
  SpendingPlannerClient,
  type BankImport,
  type RegularPaymentCandidate,
  type StudentLoanAccount,
} from "@/components/spending/SpendingPlannerClient";

type PlannerProps = ComponentProps<typeof SpendingPlannerClient>;

type DeferredPayload = {
  bankImports?: BankImport[];
  regularCandidates?: RegularPaymentCandidate[];
  studentLoanAccounts?: StudentLoanAccount[];
  paymentAccounts?: PlannerProps["paymentAccounts"];
  householdPets?: PlannerProps["householdPets"];
  homeProfile?: PlannerProps["homeProfile"];
  categoryGroups?: PlannerProps["categoryGroups"];
};

export function SpendingPlannerDeferredClient(props: PlannerProps) {
  const [deferred, setDeferred] = useState<DeferredPayload>({});
  const { rememberSpending } = useFinancialFlowRetained();

  useEffect(() => {
    rememberSpending(props as unknown as Record<string, unknown>);
  }, [rememberSpending, props]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/spending/deferred-context", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (!controller.signal.aborted) setDeferred(payload);
      } catch {
        // Secondary context must never block the core spending timeline.
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <SpendingPlannerClient
      {...props}
      bankImports={deferred.bankImports ?? props.bankImports}
      regularCandidates={deferred.regularCandidates ?? props.regularCandidates}
      studentLoanAccounts={deferred.studentLoanAccounts ?? props.studentLoanAccounts}
      paymentAccounts={deferred.paymentAccounts ?? props.paymentAccounts}
      householdPets={deferred.householdPets ?? props.householdPets}
      homeProfile={deferred.homeProfile ?? props.homeProfile}
      categoryGroups={deferred.categoryGroups ?? props.categoryGroups}
    />
  );
}
