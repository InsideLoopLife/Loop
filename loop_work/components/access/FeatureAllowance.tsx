import { getFeatureAccess } from "@/lib/access/feature-entitlements";
import type { LoopFeatureKey } from "@/lib/access/feature-keys";

export async function FeatureAllowance({
  feature,
}: {
  feature: LoopFeatureKey | string;
}) {
  const access = await getFeatureAccess(feature);

  if (!access.visible || access.limit_value == null) return null;

  const remaining = Math.max(0, Number(access.remaining ?? 0));
  const limit = Number(access.limit_value);

  return (
    <span className="text-xs font-bold text-slate-500">
      {remaining.toLocaleString("en-GB")} of{" "}
      {limit.toLocaleString("en-GB")} remaining
      {access.limit_period && access.limit_period !== "none"
        ? ` this ${access.limit_period}`
        : ""}
    </span>
  );
}
