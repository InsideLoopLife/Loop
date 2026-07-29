import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ACCESS_COOKIE_NAME, accessCookieValue, accessGateRequired } from "@/lib/access/beta-gate";
import { featureEnabled, getEffectiveEntitlements } from "@/lib/tiers/entitlements";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("app_user_profiles")
      .select("onboarding_completed_at, onboarding_skipped_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!profile?.onboarding_completed_at && !profile?.onboarding_skipped_at) redirect("/onboarding");
    const entitlements = await getEffectiveEntitlements(user.id);
    redirect(featureEnabled(entitlements, "ai_financial_briefing") ? "/briefing" : "/dashboard");
  }

  if (accessGateRequired()) {
    const cookieStore = await cookies();
    const unlocked = cookieStore.get(ACCESS_COOKIE_NAME)?.value === accessCookieValue();
    redirect(unlocked ? "/login" : "/access");
  }

  redirect("/login");
}
