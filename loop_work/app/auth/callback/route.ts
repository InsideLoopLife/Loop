import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { processPendingHouseholdLinksForUser } from "@/lib/auth/invite-linking";
import { sendWelcomeEmailForUser } from "@/lib/notifications/welcome";
import { ACCESS_COOKIE_NAME, accessCookieValue, markUserBetaApproved } from "@/lib/access/beta-gate";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/dashboard";
  const response = NextResponse.redirect(new URL(next, requestUrl.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); },
      },
    }
  );

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) console.error("[auth/callback] code exchange failed", error.message);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id && user.email) {
    await processPendingHouseholdLinksForUser({ userId: user.id, email: user.email });
    if (request.cookies.get(ACCESS_COOKIE_NAME)?.value === accessCookieValue()) {
      await markUserBetaApproved({ userId: user.id, email: user.email, source: "auth_callback_beta_cookie" });
    }
    const provider = String(user.app_metadata?.provider || user.identities?.[0]?.provider || "email");
    await sendWelcomeEmailForUser({
      userId: user.id,
      email: user.email,
      name: String(user.user_metadata?.full_name || user.user_metadata?.name || ""),
      authProvider: provider,
      next,
      supabase,
    }).catch((error) => console.error("[auth/callback] welcome email failed", error?.message || error));
  }

  return response;
}
