import type { SupabaseClient } from "@supabase/supabase-js";
import { checkUserAiBudget, recordAiUsageEvent } from "@/lib/ai/usage-budget";

// This is the missing wiring: checkUserAiBudget()/loop_check_ai_entitlement()
// already existed, fully built (including a correct midnight-UTC daily
// reset), but nothing in the app ever called it. This helper is what
// actually connects a real API route to that machinery, using the same
// canonical plan (app_user_plan_memberships) that the rest of today's
// tiering consolidation work made consistent everywhere else.

export type AiRouteDecision = {
  allowed: boolean;
  reason: string;
  tierKey: string;
  dailyLimit: number | null;
  usedToday: number;
  remainingToday: number | null;
};

/**
 * Checks whether this user is allowed to make an AI call for the given
 * route right now, using their real current plan. Call this BEFORE making
 * the OpenAI request. If `allowed` is false, routes should fall back to
 * their existing non-AI behaviour (all the routes wired up so far already
 * have one) rather than hard-error — a budget limit shouldn't break the
 * feature, just stop it from calling out to a paid model.
 */
export async function checkAiRouteAllowed(
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  routeKey: string,
): Promise<AiRouteDecision> {
  const { data: membership } = await supabase
    .from("app_user_plan_memberships")
    .select("plan_slug")
    .eq("user_id", userId)
    .maybeSingle();
  // loop_check_ai_entitlement already falls back to 'free' limits itself
  // if a plan_slug has no matching config row (e.g. "extra" has none
  // configured yet) — so no extra mapping is needed here, only a safe
  // default if the user has no membership row at all.
  const tierKey = membership?.plan_slug || "free";

  const result = await checkUserAiBudget({ supabase, userId, tierKey, routeKey });
  return {
    allowed: result.allowed,
    reason: result.reason,
    tierKey,
    dailyLimit: result.dailyLimit,
    usedToday: result.usedToday,
    remainingToday: result.remainingToday,
  };
}

/**
 * Call this AFTER a successful AI call so usage actually accrues against
 * the daily/monthly counters checkAiRouteAllowed() reads. Never let a
 * logging failure break the actual feature response — swallow errors here.
 */
export async function recordAiRouteUsage(args: {
  supabase: SupabaseClient<any, any, any>;
  userId: string;
  tierKey: string;
  routeKey: string;
  provider: string;
  model: string;
  estimatedCostPence?: number;
}) {
  try {
    await recordAiUsageEvent({
      supabase: args.supabase,
      userId: args.userId,
      tierKey: args.tierKey,
      routeKey: args.routeKey,
      provider: args.provider,
      model: args.model,
      estimatedCostPence: args.estimatedCostPence,
      requestStatus: "completed",
    });
  } catch {
    // Usage logging failing should never break the feature itself.
  }
}
