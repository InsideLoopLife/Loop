import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserProviderIntegrationEntitlement } from "@/lib/integrations/entitlements";
import { importSnapTradeAccountsForUser } from "@/lib/snaptrade/sync";

export async function POST(request: Request) {
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
  const body = await request.json().catch(() => ({}));
  const accountIds = Array.isArray(body.accountIds)
    ? body.accountIds
        .map((value: unknown) => String(value || ""))
        .filter(Boolean)
    : [];
  const rawArchiveMap =
    body.archiveManualAccountIds &&
    typeof body.archiveManualAccountIds === "object"
      ? body.archiveManualAccountIds
      : {};
  const archiveManualAccountIds = Object.fromEntries(
    Object.entries(rawArchiveMap).map(([key, value]) => [
      String(key),
      Array.isArray(value)
        ? value.map((item) => String(item || "")).filter(Boolean)
        : [],
    ]),
  );
  try {
    const result = await importSnapTradeAccountsForUser(
      supabase,
      user.id,
      accountIds,
      { archiveManualAccountIds },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not sync SnapTrade accounts",
      },
      { status: 500 },
    );
  }
}
