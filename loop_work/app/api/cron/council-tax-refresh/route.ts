import { NextRequest, NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { verifyCronRequest } from "@/lib/security/cron";
import { refreshEnglandCouncilTax } from "@/lib/property/council-tax-rates";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Called daily; only downloads when the current charge year isn't loaded yet
// (so in practice once a year). ?force=1 reloads.
export async function GET(request: NextRequest) {
  const guard = verifyCronRequest(request);
  if (!guard.ok) return guard.response;
  try {
    const result = await refreshEnglandCouncilTax(createWorkerDatabaseClient("platform") as any, { force: request.nextUrl.searchParams.get("force") === "1" });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "council tax refresh failed" }, { status: 500 });
  }
}
