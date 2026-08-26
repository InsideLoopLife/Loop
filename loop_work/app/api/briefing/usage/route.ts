import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { featureEnabled, getEffectiveEntitlements } from "@/lib/tiers/entitlements";
import { checkAiRouteAllowed } from "@/lib/ai/route-budget";

export const dynamic = "force-dynamic";

const ROUTE_KEY = "financial_briefing_chat";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const entitlements = await getEffectiveEntitlements(user.id);
  if (!featureEnabled(entitlements, "ai_financial_briefing")) {
    return NextResponse.json({ error: "Not entitled" }, { status: 403 });
  }

  // Read-only — checkAiRouteAllowed only counts existing loop_ai_usage_events
  // rows, it doesn't consume anything, so this is safe to call on every page
  // load without affecting the user's actual daily/monthly limit.
  const budgetCheck = await checkAiRouteAllowed(supabase, user.id, ROUTE_KEY);
  return NextResponse.json({
    budget: { usedToday: budgetCheck.usedToday, dailyLimit: budgetCheck.dailyLimit, tierKey: budgetCheck.tierKey },
  });
}
