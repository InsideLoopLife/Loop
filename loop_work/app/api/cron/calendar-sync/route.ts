import { NextRequest, NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { verifyCronRequest } from "@/lib/security/cron";
import { runCalendarSync } from "@/lib/calendar/sync-all";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const guard = verifyCronRequest(request);
  if (!guard.ok) return guard.response;
  try {
    const result = await runCalendarSync(createWorkerDatabaseClient("platform") as any);
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed === 0 ? 200 : 500 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "calendar sync failed" }, { status: 500 });
  }
}
