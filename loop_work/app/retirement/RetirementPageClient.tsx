"use client";

import { useRouter } from "next/navigation";
import { RetirementPlannerPanel } from "@/components/investments/RetirementPlannerPanel";
import type { RetirementAsset, RetirementContribution } from "@/lib/calculations/retirement";
import type { RetirementPlanRecord } from "@/lib/retirement/actions";

type Props = {
  personId: string;
  assets: RetirementAsset[];
  contributions: RetirementContribution[];
  initialPlan: RetirementPlanRecord | null;
  currentAge: number;
};

export function RetirementPageClient({ personId, assets, contributions, initialPlan, currentAge }: Props) {
  const router = useRouter();
  return (
    <RetirementPlannerPanel
      personId={personId}
      assets={assets}
      contributions={contributions}
      initialPlan={initialPlan}
      initialCurrentAge={currentAge}
      onBack={() => router.push("/investments")}
    />
  );
}
