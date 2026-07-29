import { redirect } from "next/navigation";
import { requireSignedInUser } from "@/domains/identity/auth";
import {
  getActiveHouseholdContext,
  type ActiveHouseholdContext,
} from "@/domains/identity/household";
import {
  loadUserFeatureAccess,
  type UserFeatureAccess,
} from "@/domains/identity/entitlements";
import type {
  DomainAccessRequest,
  DomainPermission,
  LoopDomain,
} from "./types";

export type DomainAccessContext = {
  domain: LoopDomain;
  permission: DomainPermission;
  supabase: Awaited<ReturnType<typeof requireSignedInUser>>["supabase"];
  user: Awaited<ReturnType<typeof requireSignedInUser>>["user"];
  householdContext: ActiveHouseholdContext;
  features: UserFeatureAccess;
};

/**
 * Central server-side access gate for authenticated product areas.
 *
 * This release intentionally keeps the current database/RLS model unchanged.
 * It establishes one code path for authentication, household resolution and
 * feature gating so explicit health/wealth sharing can be added later without
 * rewriting every page.
 */
export async function requireDomainAccess(
  request: DomainAccessRequest,
): Promise<DomainAccessContext> {
  const { supabase, user } = await requireSignedInUser();
  const [householdContext, features] = await Promise.all([
    getActiveHouseholdContext(supabase, user),
    loadUserFeatureAccess(supabase, user.id),
  ]);

  const allowedBySingleFeature = request.feature
    ? features[request.feature]
    : true;
  const allowedByAnyFeature = request.anyFeature?.length
    ? request.anyFeature.some((feature) => features[feature])
    : true;

  if (!allowedBySingleFeature || !allowedByAnyFeature) {
    redirect(
      request.deniedRedirect ||
        `/account?tab=wealth&feature=${request.feature || request.anyFeature?.[0] || "settings"}`,
    );
  }

  return {
    domain: request.domain,
    permission: request.permission || "view",
    supabase,
    user,
    householdContext,
    features,
  };
}
