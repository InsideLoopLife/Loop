import { NextRequest, NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { verifyCronRequest } from "@/lib/security/cron";
import { runSnapTradeProviderSnapshotJob } from "@/lib/snaptrade/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = verifyCronRequest(request);
  if (!guard.ok) return guard.response;

  const maxUsers = Math.max(
    1,
    Math.min(250, Number(request.nextUrl.searchParams.get("maxUsers") || 50)),
  );
  const realtimeOnly = request.nextUrl.searchParams.get("realtimeOnly") !== "false";

  try {
    const supabase = createWorkerDatabaseClient("market");
    const result = await runSnapTradeProviderSnapshotJob({
      supabase,
      realtimeOnly,
      maxUsers,
    });
    return NextResponse.json({ guard: guard.mode, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "SnapTrade provider snapshot job failed",
      },
      { status: 500 },
    );
  }
}
