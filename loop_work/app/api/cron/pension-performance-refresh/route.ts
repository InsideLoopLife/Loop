import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/security/cron";
import { runRetirementAssumptionMaintenance } from "@/lib/retirement/assumption-maintenance";

export async function GET(request: NextRequest) {
  const guard = verifyCronRequest(request);
  if (!guard.ok) return guard.response;
  try {
    const result = await runRetirementAssumptionMaintenance();
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Retirement assumptions refresh failed" }, { status: 500 });
  }
}
