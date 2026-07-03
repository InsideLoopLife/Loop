import {
  investmentDataEntitlementForProfile,
  type TierProfile,
} from "@/lib/wealth/user-tiers";

export const PROVIDER_INTEGRATION_FEATURE_KEYS = new Set([
  "provider_integrations",
  "snaptrade_realtime",
  "snaptrade",
  "market_data_realtime",
  "realtime_market_data",
]);

export type ProviderIntegrationEntitlement = {
  canSeeTab: boolean;
  canConnectProvider: boolean;
  canUseRealtime: boolean;
  canManageExisting: boolean;
  label: string;
  reason: string;
  source:
    | "admin"
    | "tier_feature"
    | "profile_market_tier"
    | "existing_connection"
    | "locked";
};

function featureValue(features: unknown): boolean {
  if (!Array.isArray(features)) return false;
  return features.some((feature: any) => {
    const key = String(
      feature?.feature_key || feature?.featureKey || "",
    ).toLowerCase();
    return (
      PROVIDER_INTEGRATION_FEATURE_KEYS.has(key) && feature?.enabled === true
    );
  });
}

export function planAllowsProviderIntegrations(planData: unknown): boolean {
  const data = planData as any;
  if (!data) return false;
  if (featureValue(data.features)) return true;
  if (featureValue(data.current_plan?.features)) return true;
  if (featureValue(data.plan?.features)) return true;
  return false;
}

export function providerIntegrationEntitlementFromSources({
  profile,
  planData,
  isAdmin = false,
  hasExistingProviderState = false,
}: {
  profile?: TierProfile | null;
  planData?: unknown;
  isAdmin?: boolean;
  hasExistingProviderState?: boolean;
}): ProviderIntegrationEntitlement {
  if (isAdmin) {
    return {
      canSeeTab: true,
      canConnectProvider: true,
      canUseRealtime: true,
      canManageExisting: true,
      label: "Admin override",
      reason: "Admin users can test and manage provider integrations.",
      source: "admin",
    };
  }

  const profileEntitlement = investmentDataEntitlementForProfile(profile);
  const featureAllowed = planAllowsProviderIntegrations(planData);
  const canConnectProvider =
    featureAllowed || profileEntitlement.canConnectPaidProvider;
  const canUseRealtime = profileEntitlement.canUseRealtimePrices;

  if (canConnectProvider) {
    return {
      canSeeTab: true,
      canConnectProvider: true,
      canUseRealtime,
      canManageExisting: true,
      label: canUseRealtime
        ? "Realtime integrations"
        : "Provider connection available",
      reason: featureAllowed
        ? "Your current plan includes provider/broker integrations. Realtime prices still depend on provider health and account coverage."
        : profileEntitlement.reason,
      source: featureAllowed ? "tier_feature" : "profile_market_tier",
    };
  }

  if (hasExistingProviderState) {
    return {
      canSeeTab: true,
      canConnectProvider: false,
      canUseRealtime: false,
      canManageExisting: true,
      label: "Manage existing integrations",
      reason:
        "Your current plan cannot add new provider connections, but you can remove provider access and restore archived manual investment records.",
      source: "existing_connection",
    };
  }

  return {
    canSeeTab: false,
    canConnectProvider: false,
    canUseRealtime: false,
    canManageExisting: false,
    label: "Integrations locked",
    reason:
      "Provider integrations require a tier with broker/realtime market-data access.",
    source: "locked",
  };
}

export async function getCurrentUserProviderIntegrationEntitlement(
  supabase: any,
  userId: string,
) {
  const [
    profileResult,
    planResult,
    connectionsResult,
    snapAccountsResult,
    archivedManualResult,
  ] = await Promise.all([
    supabase
      .from("app_user_profiles")
      .select(
        "payment_tier, payment_tier_status, payment_tier_override, market_data_tier, market_data_tier_override, market_data_provider_status, market_data_realtime_enabled",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.rpc("app_get_my_plan"),
    supabase
      .from("integration_connections")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("provider", "SnapTrade")
      .or("review_status.is.null,review_status.neq.archived"),
    supabase
      .from("investment_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("external_provider", "snaptrade"),
    supabase
      .from("investment_accounts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("record_status", "archived")
      .or("external_provider.is.null,external_provider.neq.snaptrade"),
  ]);

  const hasExistingProviderState = Boolean(
    (connectionsResult as any)?.count ||
    (snapAccountsResult as any)?.count ||
    (archivedManualResult as any)?.count,
  );

  return providerIntegrationEntitlementFromSources({
    profile: profileResult.data,
    planData: planResult.data,
    hasExistingProviderState,
  });
}
