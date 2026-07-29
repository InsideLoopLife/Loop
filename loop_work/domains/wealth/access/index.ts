import { requireDomainAccess } from "@/platform/permissions";
import type { FeatureKey } from "@/platform/permissions";

export function requireWealthPageAccess(options: {
  feature?: FeatureKey;
  anyFeature?: FeatureKey[];
  deniedRedirect?: string;
} = {}) {
  return requireDomainAccess({
    domain: "wealth",
    permission: "view",
    ...options,
  });
}
