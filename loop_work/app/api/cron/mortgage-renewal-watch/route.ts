import { NextRequest, NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { createAdminClient } from "@/platform/database/admin-client";
import { verifyCronRequest } from "@/lib/security/cron";
import { runMortgageRenewalWatch } from "@/lib/wealth/mortgage-renewal-watch";

function runKey(date = new Date()) {
  return `mortgage-renewal-watch:${date.toISOString().slice(0, 10)}`;
}

export async function GET(request: NextRequest) {
  const guard = verifyCronRequest(request);
  if (!guard.ok) return guard.response;

  try {
    const supabase = createWorkerDatabaseClient("rates");
    const mainSupabase = createAdminClient();
    const result = await runMortgageRenewalWatch(mainSupabase, supabase, {
      runKey: request.nextUrl.searchParams.get("run_key") || runKey(),
      runKind: request.nextUrl.searchParams.get("run_kind") || "daily_mortgage_watch",
      limit: Number(request.nextUrl.searchParams.get("limit") || 250),
      triggeredBy: `cron:${guard.mode}`,
      respectTier: true,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Mortgage renewal watch failed" }, { status: 500 });
  }
}
