import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProviderIntegrationEntitlement } from "@/lib/integrations/entitlements";
import { fetchSnapTradeAccountsForUser } from "@/lib/snaptrade/sync";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { ok: false, error: "Not signed in" },
      { status: 401 },
    );
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
  try {
    const accounts = await fetchSnapTradeAccountsForUser(supabase, user.id);
    return NextResponse.json({ ok: true, accounts });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not load SnapTrade accounts",
      },
      { status: 500 },
    );
  }
}
