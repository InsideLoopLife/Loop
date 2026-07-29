import { NextRequest, NextResponse } from "next/server";
import { runInvestmentPriceSnapshotJob } from "@/lib/investments/price-snapshot-runner";

export const runtime = "nodejs";

function authorised(request: NextRequest) {
  const expected = process.env.CRON_SECRET || process.env.LOOP_CRON_SECRET || process.env.INVESTMENT_CRON_SECRET || "";
  if (!expected) return false;
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "") || request.nextUrl.searchParams.get("secret") || "";
  return token === expected;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const force = request.nextUrl.searchParams.get("force") === "1" || request.nextUrl.searchParams.get("force") === "true";
  const result = await runInvestmentPriceSnapshotJob({ force, logger: console });
  return NextResponse.json({ ...result, note: "Admin controlled under /admin/investment-storage. The job fetches each distinct ticker/exchange once, respects storage frequency/market-hours settings, inserts due snapshot rows and prunes retention." }, { status: result.ok ? 200 : 500 });
}
