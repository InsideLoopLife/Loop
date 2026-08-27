import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAiRouteAllowed } from "@/lib/ai/route-budget";

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