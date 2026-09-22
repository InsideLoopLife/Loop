import type { ReactNode } from "react";
import { getFeatureAccess } from "@/lib/access/feature-entitlements";
import type { LoopFeatureKey } from "@/lib/access/feature-keys";

type FeatureGateProps = {
  feature: LoopFeatureKey | string;
  children: ReactNode;

  /**
   * Rendered when the feature exists/is visible but the current user cannot use
   * it (for example a depleted monthly allowance).
   */
  unavailable?: ReactNode;

  /**
   * Rendered when the feature is deliberately hidden for the current plan.
   * Leave undefined to render nothing.
   */
  hidden?: ReactNode;
};

/**
 * Server Component gate.
 *
 * This is a UX gate only. Protected server actions/API routes MUST still call
 * requireFeature() or consumeFeature().
 */
export async function FeatureGate({
  feature,
  children,
  unavailable = null,
  hidden = null,
}: FeatureGateProps) {
  const access = await getFeatureAccess(feature);

  if (!access.visible) return <>{hidden}</>;
  if (!access.allowed) return <>{unavailable}</>;

  return <>{children}</>;
}
