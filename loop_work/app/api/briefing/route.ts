// app/api/briefing/route.ts
//
// Returns the current user's AI financial briefing as JSON. The /briefing page's
// story feed polls this on an interval to give the "live" feel of numbers
// updating in real time without a full page reload or websocket infrastructure.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildFinancialBriefing } from "@/lib/briefing/build-financial-briefing";
import { getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";
import { featureEnabled, getEffectiveEntitlements } from "@/lib/tiers/entitlements";

// Always compute fresh — this is a live financial figure, not a cacheable asset.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const entitlements = await getEffectiveEntitlements(user.id);
  if (!featureEnabled(entitlements, "ai_financial_briefing")) {
    return NextResponse.json({ error: "Not entitled" }, { status: 403 });
  }

  try {
    const context = await getActiveHouseholdContext(supabase, user);
    const briefing = await buildFinancialBriefing(supabase, user, visibleDataOrFilter(context));
    return NextResponse.json({ briefing });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to build briefing" }, { status: 500 });
  }
}
