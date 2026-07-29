import { createClient } from "@/lib/supabase/server";

export async function getEffectiveEntitlements(userId?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("loop_effective_user_entitlements", {
    p_user_id: userId || undefined,
  });

  if (error) {
    return {
      plan: "free",
      features: {},
      error: error.message,
    };
  }

  return data;
}

export function featureLimit(entitlements: any, featureKey: string, fallback = 0) {
  const feature = entitlements?.features?.[featureKey];
  if (!feature?.enabled) return 0;
  return Number(feature?.limit_value ?? fallback);
}

export function featureEnabled(entitlements: any, featureKey: string) {
  return Boolean(entitlements?.features?.[featureKey]?.enabled);
}
