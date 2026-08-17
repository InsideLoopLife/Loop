import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { allowedAdminEmails } from "@/lib/admin/access";
import {
  DEFAULT_USER_FEATURE_ACCESS,
  loadUserFeatureAccess,
} from "@/lib/features/user-feature-access";
import { featureEnabled, getEffectiveEntitlements } from "@/lib/tiers/entitlements";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { features: DEFAULT_USER_FEATURE_ACCESS, isAdmin: false, unreadCount: 0 },
      { status: 401 },
    );
  }

  const profilePromise = supabase
    .from("app_user_profiles")
    .select("ui_navigation_layout, ui_navigation_layout_chosen_at, ui_mobile_navigation_layout, ui_mobile_navigation_layout_chosen_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const unreadPromise = supabase
    .from("app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "unread");

  const featuresPromise = Promise.all([
    loadUserFeatureAccess(supabase, user.id),
    getEffectiveEntitlements(user.id),
  ]).then(([features, entitlements]) => ({
    ...features,
    aiFinancialBriefing: featureEnabled(entitlements, "ai_financial_briefing"),
  }));

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

  const [profileResult, unreadResult, features, isAdmin] = await Promise.all([
    profilePromise,
    unreadPromise,
    featuresPromise,
    adminPromise,
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
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
