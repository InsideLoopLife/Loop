"use client";

import { useRouter } from "next/navigation";
import { RetirementPlannerPanel } from "@/components/investments/RetirementPlannerPanel";
import type { RetirementAsset, RetirementContribution } from "@/lib/calculations/retirement";
import type { RetirementPlanRecord } from "@/lib/retirement/actions";
import type { RetirementAutomaticAssumptions } from "@/lib/retirement/automatic-assumptions";

type Props = {
  personId: string;
  assets: RetirementAsset[];
  contributions: RetirementContribution[];
  initialPlan: RetirementPlanRecord | null;
  currentAge: number;
  automaticAssumptions: RetirementAutomaticAssumptions;
};

export function RetirementPageClient({ personId, assets, contributions, initialPlan, currentAge, automaticAssumptions }: Props) {
  const router = useRouter();
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
