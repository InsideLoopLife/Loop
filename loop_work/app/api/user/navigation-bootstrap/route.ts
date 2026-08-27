import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { allowedAdminEmails } from "@/lib/admin/access";
import {
  DEFAULT_USER_FEATURE_ACCESS,
  loadUserFeatureAccess,
} from "@/lib/features/user-feature-access";
import { featureEnabled, getEffectiveEntitlements } from "@/lib/tiers/entitlements";
import { getMonthlyChatBudget } from "@/lib/briefing/chat-usage";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { features: DEFAULT_USER_FEATURE_ACCESS, isAdmin: false, unreadCount: 0, aiUsage: null, avatarUrl: null },
      { status: 401 },
    );
  }

  const profilePromise = supabase
    .from("app_user_profiles")
    .select("ui_navigation_layout, ui_navigation_layout_chosen_at, ui_mobile_navigation_layout, ui_mobile_navigation_layout_chosen_at, avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();

  const unreadPromise = supabase
    .from("app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "unread");

  const entitlementsPromise = getEffectiveEntitlements(user.id);

  const featuresPromise = Promise.all([loadUserFeatureAccess(supabase, user.id), entitlementsPromise]).then(([features, entitlements]) => ({
    ...features,
    aiFinancialBriefing: featureEnabled(entitlements, "ai_financial_briefing"),
  }));

  // Only checked for users entitled to the briefing chat — no point querying
  // usage for a feature the user can't use. This feeds the Account panel's
  // usage section only — there's deliberately no always-visible header badge.
  const aiUsagePromise = entitlementsPromise.then(async (entitlements) => {
    if (!featureEnabled(entitlements, "ai_financial_briefing")) return null;
    const budget = await getMonthlyChatBudget(supabase, user.id, "financial_briefing_chat");
    return { usedThisMonth: budget.usedThisMonth, monthlyLimit: budget.monthlyLimit, tierKey: budget.tierKey };
  });

  const email = String(user.email || "").toLowerCase();
  const adminPromise = allowedAdminEmails().includes(email)
    ? supabase
        .from("app_admin_users")
        .select("id")
        .or(`user_id.eq.${user.id},email.eq.${email}`)
        .eq("status", "active")
        .maybeSingle()
        .then(({ data, error }) => Boolean(data) || Boolean(error))
    : Promise.resolve(false);

  const [profileResult, unreadResult, features, isAdmin, aiUsage] = await Promise.all([
    profilePromise,
    unreadPromise,
    featuresPromise,
    adminPromise,
    aiUsagePromise,
  ]);

  return NextResponse.json(
    {
      navigationLayout: profileResult.data?.ui_navigation_layout === "top" ? "top" : "side",
      hasChosenNavigationLayout: Boolean(profileResult.data?.ui_navigation_layout_chosen_at),
      mobileNavigationLayout: profileResult.data?.ui_mobile_navigation_layout === "cards" ? "cards" : "bar",
      hasChosenMobileNavigationLayout: Boolean(profileResult.data?.ui_mobile_navigation_layout_chosen_at),
      unreadCount: unreadResult.count ?? 0,
      features,
      isAdmin,
      aiUsage,
      avatarUrl: profileResult.data?.avatar_url || null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
