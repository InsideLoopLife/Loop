import { NextRequest, NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { verifyCronRequest } from "@/lib/security/cron";
import { runLoopWatchDaily } from "@/lib/loopwatch/watch-logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = verifyCronRequest(request);
  if (!guard.ok) return guard.response;

  const limit = Math.max(1, Math.min(250, Number(request.nextUrl.searchParams.get("limit") || 100)));
  const supabase = createWorkerDatabaseClient("wealth");
  const result = await runLoopWatchDaily(supabase, limit);
  return NextResponse.json({ ok: true, mode: guard.mode, ...result });
}
