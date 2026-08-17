import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_LAYOUTS = new Set(["top", "side"]);
const VALID_MOBILE_LAYOUTS = new Set(["cards", "bar"]);

type NavigationLayout = "top" | "side";
type MobileNavigationLayout = "cards" | "bar";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await supabase
    .from("app_user_profiles")
    .select("ui_navigation_layout, ui_navigation_layout_chosen_at, ui_mobile_navigation_layout, ui_mobile_navigation_layout_chosen_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!result.error) {
    const navigationLayout: NavigationLayout = result.data?.ui_navigation_layout === "top" ? "top" : "side";
    return NextResponse.json({
      navigationLayout,
      hasChosenNavigationLayout: Boolean(result.data?.ui_navigation_layout_chosen_at),
      chosenAt: result.data?.ui_navigation_layout_chosen_at || null,
      mobileNavigationLayout: result.data?.ui_mobile_navigation_layout === "cards" ? "cards" : "bar",
      hasChosenMobileNavigationLayout: Boolean(result.data?.ui_mobile_navigation_layout_chosen_at),
    });
  }

  // Backwards-compatible fallback while the v28.84 migration is being applied.
  const fallback = await supabase
    .from("app_user_profiles")
    .select("ui_navigation_layout")
    .eq("user_id", user.id)
    .maybeSingle();

  if (fallback.error) {
    return NextResponse.json(
      { error: fallback.error.message, navigationLayout: "side", hasChosenNavigationLayout: false },
      { status: 500 },
    );
  }

  return NextResponse.json({
    navigationLayout: fallback.data?.ui_navigation_layout === "top" ? "top" : "side",
    hasChosenNavigationLayout: false,
    chosenAt: null,
    migrationRequired: true,
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const rawMobileLayout = String(body.mobileNavigationLayout || "");
  if (rawMobileLayout) {
    if (!VALID_MOBILE_LAYOUTS.has(rawMobileLayout)) {
      return NextResponse.json({ error: "Invalid mobile navigation layout" }, { status: 400 });
    }
    const mobileNavigationLayout = rawMobileLayout as MobileNavigationLayout;
    const markChosen = body.markChosen !== false;
    const result = await supabase.from("app_user_profiles").upsert({
      user_id: user.id,
      ui_mobile_navigation_layout: mobileNavigationLayout,
      ...(markChosen ? { ui_mobile_navigation_layout_chosen_at: new Date().toISOString() } : {}),
    }, { onConflict: "user_id" });
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
    return NextResponse.json({ mobileNavigationLayout, hasChosenMobileNavigationLayout: markChosen });
  }
  const rawLayout = String(body.navigationLayout || "");
  if (!VALID_LAYOUTS.has(rawLayout)) {
    return NextResponse.json({ error: "Invalid navigation layout" }, { status: 400 });
  }

  const navigationLayout = rawLayout as NavigationLayout;
  const markChosen = body.markChosen !== false;
  const payload = {
    user_id: user.id,
    ui_navigation_layout: navigationLayout,
    ...(markChosen ? { ui_navigation_layout_chosen_at: new Date().toISOString() } : {}),
  };

  const result = await supabase
    .from("app_user_profiles")
    .upsert(payload, { onConflict: "user_id" });

  if (!result.error) {
    return NextResponse.json({
      navigationLayout,
      hasChosenNavigationLayout: markChosen,
    });
  }

  // Keep layout switching usable before the new chosen-at column exists.
  const fallback = await supabase
    .from("app_user_profiles")
    .upsert(
      { user_id: user.id, ui_navigation_layout: navigationLayout },
      { onConflict: "user_id" },
    );

  if (fallback.error) {
    return NextResponse.json({ error: fallback.error.message }, { status: 500 });
  }

  return NextResponse.json({
    navigationLayout,
    hasChosenNavigationLayout: markChosen,
    migrationRequired: true,
  });
}
