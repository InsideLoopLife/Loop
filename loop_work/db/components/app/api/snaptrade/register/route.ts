import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProviderIntegrationEntitlement } from "@/lib/integrations/entitlements";
import { encryptSecret } from "@/lib/security/secrets";
import {
  loopSnapTradeUserId,
  snapTradeRequest,
  type SnapTradeRegisteredUser,
} from "@/lib/snaptrade/client";

export async function POST() {
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
  const snapUserId = loopSnapTradeUserId(user.id);
  try {
    const existing = await supabase
      .from("integration_secrets")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider", "snaptrade_user_secret")
      .eq("status", "active")
      .maybeSingle();
    if (existing.data?.id)
      return NextResponse.json({
        ok: true,
        userId: snapUserId,
        alreadyRegistered: true,
      });
    const registered = await snapTradeRequest<SnapTradeRegisteredUser>(
      "POST",
      "/snapTrade/registerUser",
      { userId: snapUserId },
    );
    const encrypted = encryptSecret(registered.userSecret);
    const { error } = await supabase.from("integration_secrets").insert({
      user_id: user.id,
      provider: "snaptrade_user_secret",
      key_label: "SnapTrade user secret",
      status: "active",
      ...encrypted,
    });
    if (error) throw error;
    await supabase
      .from("integration_connections")
      .insert({
        user_id: user.id,
        provider: "SnapTrade",
        connection_type: "open_finance",
        status: "sandbox",
        category: "wealth",
        notes: `SnapTrade user registered: ${registered.userId}`,
      })
      .then(
        () => null,
        () => null,
      );
    return NextResponse.json({ ok: true, userId: registered.userId });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not register SnapTrade user",
      },
      { status: 500 },
    );
  }
}
