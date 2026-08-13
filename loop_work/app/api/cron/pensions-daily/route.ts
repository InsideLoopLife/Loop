import { NextRequest, NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { runPensionProviderRefresh } from "@/lib/investments/pension-provider-refresh";
import { runPensionContributionProjection } from "@/lib/investments/pension-contribution-runner";
import { runPensionDailyPriceSnapshot } from "@/lib/investments/pension-price-snapshot";
import { runPensionMonthlyManagementCharges } from "@/lib/investments/pension-management-charges";

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

  // Runs first: fetches today's real price for every held fund and writes
  // it as a snapshot row (previously: nothing fetched prices on any
  // schedule at all — the only mechanism was a person manually clicking
  // "AI check", which itself only checked fees, not price).
  const priceSnapshot = await runPensionDailyPriceSnapshot(supabase, { logger: console }).catch((error) => ({ ok: false, error: error?.message || String(error) }));

  // Runs second, now against today's fresh prices rather than whatever was
  // last recorded (previously: recomputed from prices that were sometimes
  // weeks stale, since nothing kept them current).
  const providerRefresh = await runPensionProviderRefresh(supabase, { logger: console }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
  const contributionProjection = await runPensionContributionProjection(supabase, { force, lookbackMonths, logger: console }).catch((error) => ({ ok: false, error: error?.message || String(error) }));

  // Only actually applies a charge once per fund per calendar month
  // (idempotent) — safe to run on every daily cron tick rather than
  // needing its own separate monthly schedule.
  const managementCharges = await runPensionMonthlyManagementCharges(supabase, { logger: console }).catch((error) => ({ ok: false, error: error?.message || String(error) }));

  const ok = Boolean(
    (priceSnapshot as any).ok !== false &&
      (providerRefresh as any).ok !== false &&
      (contributionProjection as any).ok !== false &&
      (managementCharges as any).ok !== false,
  );
  return NextResponse.json(
    { ok, price_snapshot: priceSnapshot, provider_refresh: providerRefresh, contribution_projection: contributionProjection, management_charges: managementCharges },
    { status: ok ? 200 : 500 },
  );
}
