import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProviderIntegrationEntitlement } from "@/lib/integrations/entitlements";
import { decryptSecret } from "@/lib/security/secrets";
import {
  loopSnapTradeUserId,
  snapTradeRequest,
  type SnapTradeLoginResponse,
} from "@/lib/snaptrade/client";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const entitlement = await getCurrentUserProviderIntegrationEntitlement(
    supabase,
    user.id,
  );
  if (!entitlement.canConnectProvider) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Provider integrations require an eligible tier. You can still remove access or restore manual records from Account → Integrations if you have existing imported data.",
      },
      { status: 403 },
    );
  }
  const body = await request.json().catch(() => ({}));
  const { data: secretRow, error: secretError } = await supabase
    .from("integration_secrets")
    .select("secret_ciphertext, secret_iv, secret_auth_tag")
    .eq("user_id", user.id)
    .eq("provider", "snaptrade_user_secret")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (secretError)
    return NextResponse.json({ error: secretError.message }, { status: 500 });
  if (!secretRow)
    return NextResponse.json(
      { error: "Register the SnapTrade user first." },
      { status: 400 },
    );
  const userSecret = decryptSecret(secretRow);
  if (!userSecret)
    return NextResponse.json(
      { error: "Stored SnapTrade user secret could not be decrypted." },
      { status: 500 },
    );
  try {
    const redirect = await snapTradeRequest<SnapTradeLoginResponse>(
      "POST",
      `/snapTrade/login?userId=${encodeURIComponent(loopSnapTradeUserId(user.id))}&userSecret=${encodeURIComponent(userSecret)}`,
      {
        connectionType: body.connectionType || "read",
        immediateRedirect: true,
        customRedirect:
          body.customRedirect ||
          process.env.SNAPTRADE_CONNECTION_REDIRECT_URL ||
          `${origin}/integrations/snaptrade/callback`,
        showCloseButton: true,
        darkMode: false,
        connectionPortalVersion: "v4",
      },
    );
    return NextResponse.json({ ok: true, ...redirect });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not create SnapTrade connection portal link",
      },
      { status: 500 },
    );
  }
}
