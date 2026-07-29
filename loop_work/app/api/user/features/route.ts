import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_USER_FEATURE_ACCESS, loadUserFeatureAccess } from "@/lib/features/user-feature-access";
import { getEffectiveEntitlements, featureEnabled } from "@/lib/tiers/entitlements";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ features: DEFAULT_USER_FEATURE_ACCESS }, { status: 401 });
  const features = await loadUserFeatureAccess(supabase, user.id);
  const entitlements = await getEffectiveEntitlements(user.id);
  features.aiFinancialBriefing = featureEnabled(entitlements, "ai_financial_briefing");
  return NextResponse.json({ features }, { headers: { "Cache-Control": "no-store" } });
}
