import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/security/cron";
import { refreshPensionPerformanceAssumptions } from "@/lib/wealth/pension-performance-refresh";

export async function GET(request: NextRequest) {
  const guard = verifyCronRequest(request);
  if (!guard.ok) return guard.response;
  try {
    const result = await refreshPensionPerformanceAssumptions();
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Pension performance refresh failed" }, { status: 500 });
  }
}
