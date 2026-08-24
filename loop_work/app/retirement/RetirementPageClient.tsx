"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RetirementPlannerPanel } from "@/components/investments/RetirementPlannerPanel";
import type { RetirementAsset, RetirementContribution } from "@/lib/calculations/retirement";
import type { RetirementPlanRecord } from "@/lib/retirement/actions";
import type { RetirementAutomaticAssumptions } from "@/lib/retirement/automatic-assumptions";
import { writeRouteSnapshot } from "@/lib/client/route-snapshot-cache";

export type RetirementPageClientProps = {
  personId: string;
  assets: RetirementAsset[];
  contributions: RetirementContribution[];
  initialPlan: RetirementPlanRecord | null;
  currentAge: number;
  automaticAssumptions: RetirementAutomaticAssumptions;
};

export function RetirementPageClient({ personId, assets, contributions, initialPlan, currentAge, automaticAssumptions }: RetirementPageClientProps) {
  const router = useRouter();
  useEffect(() => {
    writeRouteSnapshot<RetirementPageClientProps>("retirement", { personId, assets, contributions, initialPlan, currentAge, automaticAssumptions });
  }, [personId, assets, contributions, initialPlan, currentAge, automaticAssumptions]);
  return (
    <RetirementPlannerPanel
      personId={personId}
      assets={assets}
      contributions={contributions}
      initialPlan={initialPlan}
      initialCurrentAge={currentAge}
      automaticAssumptions={automaticAssumptions}
      onBack={() => router.push("/investments")}
    />
  );
}
