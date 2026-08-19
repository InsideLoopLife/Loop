import { NextRequest, NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { applyConfirmedPensionPrice } from "@/lib/investments/pension-price-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same auth pattern as the other /api/cron/* routes — a shared secret, not
// a per-user session, since the caller here is a scheduled agent (or any
// other automated job) rather than someone logged into the app.
function authorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.LOOP_CRON_SECRET || process.env.INVESTMENT_CRON_SECRET || "";
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization") || request.headers.get("x-cron-secret") || "";
  const token = header.replace(/^Bearer\s+/i, "") || request.nextUrl.searchParams.get("secret") || "";
  return token === secret;
}

/**
 * Body: { glossaryId: string, isin?: string, unitPrice: number,
 *         providerDate: string (YYYY-MM-DD), sourceUrl?: string,
 *         note?: string }
 *
 * Intended caller: a Cowork scheduled task that reads pension_funds /
 * provider_fund_glossary to see which funds need a same-day snapshot,
 * visits the source page itself to find the price (the part an LLM is
 * genuinely good at — arbitrary, changing page layouts — rather than the
 * part it shouldn't freehand, which is writing account values), then POSTs
 * the result here.
 *
 * This endpoint does NOT write anything itself beyond calling
 * applyConfirmedPensionPrice — same identity check (ISIN must match if
 * supplied), same >25% day-over-day sanity bound, same snapshot upsert,
 * same account rollup as the automated daily scrape. An agent supplying a
 * bad number is treated exactly like a bad regex match: rejected and
 * reported, never silently applied.
 */
export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const glossaryId = String(body?.glossaryId || "").trim();
  const isin = body?.isin ? String(body.isin).trim().toUpperCase() : null;
  const unitPrice = Number(body?.unitPrice);
  const providerDate = String(body?.providerDate || "").trim();
  const sourceUrl = body?.sourceUrl ? String(body.sourceUrl) : null;
  const note = body?.note ? String(body.note).slice(0, 500) : null;

  if (!glossaryId) return NextResponse.json({ ok: false, error: "glossaryId is required" }, { status: 400 });
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return NextResponse.json({ ok: false, error: "unitPrice must be a positive number" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(providerDate)) return NextResponse.json({ ok: false, error: "providerDate must be YYYY-MM-DD" }, { status: 400 });

  const supabase = createWorkerDatabaseClient("wealth");

  const result = await applyConfirmedPensionPrice(
    supabase,
    {
      glossaryId,
      isin,
      unitPrice,
      providerDate,
      source: "agent_confirmed",
      sourceUrl,
      // Distinct confidence tag from the automated scrape's own tiers, so
      // a snapshot's provenance is visible later — "an agent read this
      // off the page" is a genuinely different trust level than "an exact
      // ISIN attribute match", even though both are currently auto-applied
      // (subject to the same sanity bound either way).
      parseConfidence: "agent_confirmed",
    },
    { logger: console },
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, applied: false, glossaryId, reason: result.reason, note }, { status: 200 });
  }

  return NextResponse.json({ ok: true, applied: true, ...result, note });
}
