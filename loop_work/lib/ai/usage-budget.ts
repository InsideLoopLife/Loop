import type { SupabaseClient } from "@supabase/supabase-js";

export type AiUsageWindow = "day" | "month";

export type AiUsageCheck = {
  allowed: boolean;
  reason: string;
  userId: string;
  tierKey: string;
  routeKey: string;
  dailyLimit: number | null;
  monthlyBudgetPence: number | null;
  usedToday: number;
  spentThisMonthPence: number;
  remainingToday: number | null;
  remainingBudgetPence: number | null;
};

export async function checkUserAiBudget(args: {
  supabase: SupabaseClient<any, any, any>;
  userId: string;
  tierKey: string;
  routeKey: string;
}): Promise<AiUsageCheck> {
  const { supabase, userId, tierKey, routeKey } = args;
  const { data, error } = await supabase.rpc("loop_check_ai_entitlement", {
    p_user_id: userId,
    p_tier_key: tierKey,
    p_route_key: routeKey,
  });

  if (error) {
    return {
      allowed: false,
      reason: error.message,
      userId,
      tierKey,
      routeKey,
      dailyLimit: null,
      monthlyBudgetPence: null,
      usedToday: 0,
      spentThisMonthPence: 0,
      remainingToday: null,
      remainingBudgetPence: null,
    };
  }

  const row = data as any;
  return {
    allowed: Boolean(row?.allowed),
    reason: String(row?.reason || "No budget decision returned."),
    userId,
    tierKey,
    routeKey,
    dailyLimit: row?.daily_limit ?? null,
    monthlyBudgetPence: row?.monthly_budget_pence ?? null,
    usedToday: Number(row?.used_today || 0),
    spentThisMonthPence: Number(row?.spent_this_month_pence || 0),
    remainingToday: row?.remaining_today ?? null,
    remainingBudgetPence: row?.remaining_budget_pence ?? null,
  };
}

export async function recordAiUsageEvent(args: {
  supabase: SupabaseClient<any, any, any>;
  userId: string;
  tierKey: string;
  routeKey: string;
  provider: string;
  model: string;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  estimatedCostPence?: number;
  requestStatus?: string;
  metadata?: Record<string, unknown>;
}) {
  const { supabase, ...payload } = args;
  return supabase.from("loop_ai_usage_events").insert({
    user_id: payload.userId,
    tier_key: payload.tierKey,
    route_key: payload.routeKey,
    provider: payload.provider,
    model: payload.model,
    estimated_input_tokens: payload.estimatedInputTokens || 0,
    estimated_output_tokens: payload.estimatedOutputTokens || 0,
    estimated_cost_pence: payload.estimatedCostPence || 0,
    request_status: payload.requestStatus || "completed",
    metadata: payload.metadata || {},
  });
}
