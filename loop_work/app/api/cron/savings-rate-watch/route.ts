import { NextRequest, NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { verifyCronRequest } from "@/lib/security/cron";
import { refreshSavingsCatalogueFromSources } from "@/lib/wealth/savings-catalogue";
import { ensureDefaultSourceUniverse } from "@/lib/wealth/default-source-catalogue";
import { expireStaleSavingsDeals, runSavingsRateWatch } from "@/lib/wealth/savings-rate-watch";

function runKey(date = new Date()) {
  return `savings-rate-watch:${date.toISOString().slice(0, 10)}`;
}

export async function GET(request: NextRequest) {
  const guard = verifyCronRequest(request);
  if (!guard.ok) return guard.response;

  try {
    const enforceLocalHour = request.nextUrl.searchParams.get("enforce_local_hour") === "1";
    const londonParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const londonHour = Number(londonParts.find((part) => part.type === "hour")?.value || -1);
    if (enforceLocalHour && londonHour !== 8) {
      return NextResponse.json({ ok: true, skipped: true, reason: "Not 08:00 Europe/London", londonHour });
    }

    const supabase = createWorkerDatabaseClient("rates");
    const mode = request.nextUrl.searchParams.get("mode") || "full";
    const freshnessHours = Number(request.nextUrl.searchParams.get("freshness_hours") || 12);
    const refreshLimit = Number(request.nextUrl.searchParams.get("refresh_limit") || 40);
    const watchLimit = Number(request.nextUrl.searchParams.get("limit") || 500);
    const triggeredBy = `cron:${guard.mode}`;

    const seed = mode === "watch_only" ? null : await ensureDefaultSourceUniverse(supabase);
    const refresh = mode === "watch_only" ? null : await refreshSavingsCatalogueFromSources(supabase, {
      runKey: `savings-catalogue:cron:${Date.now()}`,
      limit: refreshLimit,
      freshnessHours,
      publishConfidenceThreshold: Number(request.nextUrl.searchParams.get("publish_confidence") || 88),
      triggeredBy,
    });

    const watch = await runSavingsRateWatch(supabase, {
      runKey: request.nextUrl.searchParams.get("run_key") || runKey(),
      runKind: request.nextUrl.searchParams.get("run_kind") || (mode === "watch_only" ? "daily_8am" : "catalogue_then_daily_watch"),
      limit: watchLimit,
      triggeredBy,
      respectTier: false,
    });

    const expire = mode === "watch_only" ? null : await expireStaleSavingsDeals(supabase, Number(request.nextUrl.searchParams.get("stale_days") || 7), triggeredBy);
    return NextResponse.json({ ok: true, seed, refresh, watch, expire });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Savings rate watch failed" }, { status: 500 });
  }
}
