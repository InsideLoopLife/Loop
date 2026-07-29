import { NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { runPensionContributionProjection } from "@/lib/investments/pension-contribution-runner";
import { runRegularInvestmentReinvestmentProjection } from "@/lib/investments/regular-investment-runner";
import { runPensionProviderRefresh } from "@/lib/investments/pension-provider-refresh";
import { runInvestmentPriceSnapshotJob } from "@/lib/investments/price-snapshot-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET || process.env.LOOP_CRON_SECRET || process.env.INVESTMENT_CRON_SECRET || "";
  if (!secret) return process.env.NODE_ENV !== "production";
  const url = new URL(request.url);
  const header = request.headers.get("authorization") || request.headers.get("x-cron-secret") || "";
  const token = header.replace(/^Bearer\s+/i, "") || url.searchParams.get("secret") || "";
  return token === secret;
}

export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
  const lookbackMonths = Number(url.searchParams.get("lookback_months") || 3);
  const supabase = createWorkerDatabaseClient("market");

  const stockEtfSnapshots = await runInvestmentPriceSnapshotJob({ force, prune: true, logger: console }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
  const providerRefresh = await runPensionProviderRefresh(supabase, { logger: console }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
  const pensionContributions = await runPensionContributionProjection(supabase, { force, lookbackMonths, logger: console }).catch((error) => ({ ok: false, error: error?.message || String(error) }));
  const investmentReinvestments = await runRegularInvestmentReinvestmentProjection(supabase, { force, lookbackMonths, logger: console }).catch((error) => ({ ok: false, error: error?.message || String(error) }));

  const ok = Boolean((stockEtfSnapshots as any).ok !== false && (providerRefresh as any).ok !== false && (pensionContributions as any).ok !== false && (investmentReinvestments as any).ok !== false);
  return NextResponse.json({
    ok,
    stock_etf_snapshots: stockEtfSnapshots,
    provider_refresh: providerRefresh,
    pension_contributions: pensionContributions,
    investment_reinvestments: investmentReinvestments,
    note: "Runs stock/ETF price snapshots, provider-value pension refresh, scheduled pension contribution/NI top-up projection, and optional regular investment reinvestment materialisation.",
  }, { status: ok ? 200 : 500 });
}
