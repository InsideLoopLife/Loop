import { NextRequest, NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { verifyCronRequest } from "@/lib/security/cron";
import { runHealthChecks } from "@/lib/admin/health-checks";

export const dynamic = "force-dynamic";

// Daily: raises/resolves admin alerts for stale or failing automated jobs.
// Previously called a database function that never existed and had no auth.
export async function GET(request: NextRequest) {
  const guard = verifyCronRequest(request);
  if (!guard.ok) return guard.response;
  const db = createWorkerDatabaseClient("platform") as any;
  let ratesDb: any = null;
  try { ratesDb = createWorkerDatabaseClient("rates"); } catch { ratesDb = null; }
  const results = await runHealthChecks(db, ratesDb);
  return NextResponse.json({ ok: true, alerts: results.filter((r) => !r.ok).length, results });
}
