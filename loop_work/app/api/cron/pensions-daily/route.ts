import { NextRequest, NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { runPensionProviderRefresh } from "@/lib/investments/pension-provider-refresh";
import { runPensionContributionProjection } from "@/lib/investments/pension-contribution-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.LOOP_CRON_SECRET || process.env.INVESTMENT_CRON_SECRET || "";
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization") || request.headers.get("x-cron-secret") || "";
  const token = header.replace(/^Bearer\s+/i, "") || request.nextUrl.searchParams.get("secret") || "";
  return token === secret;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const force = request.nextUrl.searchParams.get("force") === "1" || request.nextUrl.searchParams.get("force") === "true";
  const lookbackMonths = Number(request.nextUrl.searchParams.get("lookback_months") || 3);
  const supabase = createWorkerDatabaseClient("wealth");
  const providerRefresh = await runPensionProviderRefresh(supabase, { logger: console }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
  const contributionProjection = await runPensionContributionProjection(supabase, { force, lookbackMonths, logger: console }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
  const ok = Boolean((providerRefresh as any).ok !== false && (contributionProjection as any).ok !== false);
  return NextResponse.json({ ok, provider_refresh: providerRefresh, contribution_projection: contributionProjection }, { status: ok ? 200 : 500 });
}
