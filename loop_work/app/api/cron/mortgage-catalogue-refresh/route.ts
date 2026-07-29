import { NextRequest, NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { verifyCronRequest } from "@/lib/security/cron";
import { refreshMortgageCatalogueFromSources } from "@/lib/wealth/mortgage-catalogue";

export async function GET(request: NextRequest) {
  const guard = verifyCronRequest(request);
  if (!guard.ok) return guard.response;
  try {
    const supabase = createWorkerDatabaseClient("rates");
    const result = await refreshMortgageCatalogueFromSources(supabase, {
      runKey: request.nextUrl.searchParams.get("run_key") || undefined,
      limit: Number(request.nextUrl.searchParams.get("limit") || 12),
      sourceId: request.nextUrl.searchParams.get("source_id"),
      triggeredBy: `cron:${guard.mode}`,
      publishConfidenceThreshold: Number(request.nextUrl.searchParams.get("publish_confidence") || 95),
    });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Mortgage catalogue refresh failed" }, { status: 500 });
  }
}
