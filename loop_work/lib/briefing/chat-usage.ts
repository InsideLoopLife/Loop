import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAiRouteAllowed } from "@/lib/ai/route-budget";

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
//
// Note: loop_tier_ai_model_config has an explicit RLS deny-all policy for
// anon/authenticated roles, so it can only be read via a SECURITY DEFINER
// path — hence resolving the limit through checkAiRouteAllowed (which
// calls the loop_check_ai_entitlement RPC) rather than querying the table
// directly here. Only the usage count comes from a direct query, since
// loop_ai_usage_events does allow a user to read their own rows.
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
  const resolved = await checkAiRouteAllowed(supabase, userId, routeKey);
  const monthlyLimit = resolved.dailyLimit;

  const { count } = await supabase
    .from("loop_ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("route_key", routeKey)
    .gte("created_at", startOfMonthUtcIso());
  const usedThisMonth = count ?? 0;

  const allowed = monthlyLimit == null || usedThisMonth < monthlyLimit;
  const reason = monthlyLimit != null && usedThisMonth >= monthlyLimit ? "Monthly request limit reached for this user." : "Allowed.";

  return { allowed, reason, tierKey: resolved.tierKey, monthlyLimit, usedThisMonth };
}
