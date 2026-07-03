export type SupabaseLike = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  from: (table: string) => any;
};

const fallbackEnabledPlans = new Set(["plus", "pro", "realtime", "enterprise", "admin_override"]);

function featureFromEntitlements(entitlements: any, featureKey: string) {
  const direct = entitlements?.features?.[featureKey];
  if (direct) return Boolean(direct.enabled);
  if (Array.isArray(entitlements?.features)) {
    const match = entitlements.features.find((feature: any) => String(feature?.feature_key || feature?.featureKey) === featureKey);
    return Boolean(match?.enabled);
  }
  return false;
}

export async function userHasWealthFeature(supabase: SupabaseLike, userId: string, featureKey: string) {
  if (!userId) return false;
  try {
    const { data, error } = await supabase.rpc("loop_effective_user_entitlements", { p_user_id: userId });
    if (!error && data) return featureFromEntitlements(data, featureKey);
  } catch {
    // Fall back to profile fields below.
  }

  try {
    const { data } = await supabase
      .from("app_user_profiles")
      .select("payment_tier, payment_tier_status, market_data_tier, market_data_realtime_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    const status = String(data?.payment_tier_status || "").toLowerCase();
    const tier = String(data?.payment_tier || "free").toLowerCase();
    if (!["active", "trialing", "manual_review"].includes(status) && tier !== "admin_override") return false;
    if (featureKey === "provider_integrations") return Boolean(data?.market_data_realtime_enabled) || tier === "realtime" || tier === "pro" || tier === "enterprise";
    return fallbackEnabledPlans.has(tier);
  } catch {
    return false;
  }
}

export function createFeatureCache(supabase: SupabaseLike, featureKey: string) {
  const cache = new Map<string, Promise<boolean>>();
  return (userId: string) => {
    if (!cache.has(userId)) cache.set(userId, userHasWealthFeature(supabase, userId, featureKey));
    return cache.get(userId)!;
  };
}
