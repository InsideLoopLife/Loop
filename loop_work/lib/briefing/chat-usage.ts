import type { SupabaseClient } from "@supabase/supabase-js";

// The financial_briefing_chat route's limit (stored in the shared
// loop_tier_ai_model_config.daily_limit column, same as every other AI
// route) is deliberately treated as a MONTHLY allowance here, not a daily
// one — 250 requests/day read as an enormous number for a chat feature,
// but 250/month is a sensible tier allowance. This only changes how this
// one route counts and displays usage; loop_check_ai_entitlement's genuine
// daily reset (used by checkAiRouteAllowed elsewhere) is untouched and
// still runs underneath as a harmless extra safety net — a user could
// never hit a same-numbered daily cap without also hitting this monthly
// one first.
export type MonthlyChatBudget = {
  allowed: boolean;
  reason: string;
  tierKey: string;
  monthlyLimit: number | null;
  usedThisMonth: number;
};

function startOfMonthUtcIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function getMonthlyChatBudget(supabase: SupabaseClient<any, any, any>, userId: string, routeKey: string): Promise<MonthlyChatBudget> {
  const { data: membership } = await supabase.from("app_user_plan_memberships").select("plan_slug").eq("user_id", userId).maybeSingle();
  const tierKey = membership?.plan_slug || "free";

  let config = await supabase.from("loop_tier_ai_model_config").select("daily_limit,enabled").eq("tier_key", tierKey).eq("route_key", routeKey).maybeSingle();
  if (!config.data) {
    config = await supabase.from("loop_tier_ai_model_config").select("daily_limit,enabled").eq("tier_key", "free").eq("route_key", routeKey).maybeSingle();
  }
  const monthlyLimit: number | null = config.data?.enabled ? (config.data?.daily_limit ?? null) : 0;

  const { count } = await supabase
    .from("loop_ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("route_key", routeKey)
    .gte("created_at", startOfMonthUtcIso());
  const usedThisMonth = count ?? 0;

  const allowed = config.data?.enabled !== false && (monthlyLimit == null || usedThisMonth < monthlyLimit);
  const reason = !config.data?.enabled ? "AI is disabled for this tier." : monthlyLimit != null && usedThisMonth >= monthlyLimit ? "Monthly request limit reached for this user." : "Allowed.";

  return { allowed, reason, tierKey, monthlyLimit, usedThisMonth };
}
