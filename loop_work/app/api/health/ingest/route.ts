import { NextResponse } from "next/server";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { enforceUserRateLimit } from "@/lib/security/rate-limit";
import { hashIngestToken } from "@/lib/health/tokens";
import { normaliseHealthPayload } from "@/lib/health/ingest";

// Receives health data from a phone (Health Auto Export "REST API" automation, or an Apple Shortcut).
// Authenticated by a per-person private key: header "Authorization: Bearer lh_…", "X-Loop-Key", or ?key=.

const MAX_BYTES = 8 * 1024 * 1024;

function keyFrom(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return bearer || request.headers.get("x-loop-key")?.trim() || new URL(request.url).searchParams.get("key")?.trim() || "";
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "Loop health import is ready. Send health data with POST and your private key." });
}

export async function POST(request: Request) {
  if (!hasSupabaseAdminKey()) return NextResponse.json({ error: "Health import isn't configured on this server." }, { status: 503 });
  const key = keyFrom(request);
  if (!/^lh_[A-Za-z0-9_-]{20,}$/.test(key)) return NextResponse.json({ error: "Missing or invalid key." }, { status: 401 });

  const admin = createAdminClient();
  const { data: link } = await admin
    .from("health_ingest_links")
    .select("id, user_id, person_id, revoked_at")
    .eq("token_hash", hashIngestToken(key))
    .maybeSingle();
  if (!link || link.revoked_at) return NextResponse.json({ error: "This key isn't recognised or has been switched off." }, { status: 401 });

  const limit = await enforceUserRateLimit({ userId: link.user_id, bucket: `health_ingest:${link.id}`, limit: 120, windowSeconds: 60 * 60 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many uploads. Try again later.", resetAt: limit.resetAt }, { status: 429 });

  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BYTES) return NextResponse.json({ error: "Upload too large. Send fewer days at a time." }, { status: 413 });
  const text = await request.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "Upload too large. Send fewer days at a time." }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Send JSON (in Health Auto Export choose JSON as the export format)." }, { status: 400 });
  }

  const { data: person } = await admin.from("people").select("id, household_id, weight_kg").eq("id", link.person_id).maybeSingle();
  if (!person) return NextResponse.json({ error: "The person this key belongs to no longer exists." }, { status: 410 });

  const parsed = normaliseHealthPayload(body);
  const base = { user_id: link.user_id, household_id: person.household_id || null, person_id: person.id };
  const now = new Date().toISOString();

  if (parsed.daily.length) {
    const rows = parsed.daily.map((row) => ({ ...base, ...row, source: "apple_health", updated_at: now }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("health_daily_metrics").upsert(rows.slice(i, i + 500), { onConflict: "person_id,metric_date,metric,source" });
      if (error) return NextResponse.json({ error: `Couldn't save metrics: ${error.message}` }, { status: 500 });
    }
  }
  if (parsed.workouts.length) {
    const { error } = await admin.from("health_workouts").upsert(parsed.workouts.map((row) => ({ ...base, ...row, source: "apple_health" })), { onConflict: "person_id,external_id" });
    if (error) return NextResponse.json({ error: `Couldn't save workouts: ${error.message}` }, { status: 500 });
  }
  if (parsed.weights.length) {
    const { error } = await admin.from("person_weight_logs").upsert(parsed.weights.map((row) => ({ ...base, ...row, source: "apple_health" })), { onConflict: "person_id,measured_on,source" });
    if (error) return NextResponse.json({ error: `Couldn't save weights: ${error.message}` }, { status: 500 });
    // Keep the person's current weight in step with their newest weigh-in.
    const { data: newest } = await admin.from("person_weight_logs").select("weight_kg").eq("person_id", person.id).order("measured_on", { ascending: false }).limit(1).maybeSingle();
    if (newest?.weight_kg) await admin.from("people").update({ weight_kg: newest.weight_kg }).eq("id", person.id);
  }

  const days = Array.from(new Set(parsed.daily.map((row) => row.metric_date))).sort();
  const summary = { at: now, days: days.length, from: days[0] || null, to: days[days.length - 1] || null, metrics: parsed.daily.length, workouts: parsed.workouts.length, weights: parsed.weights.length, skipped: parsed.skipped };
  await admin.from("health_ingest_links").update({ last_used_at: now, last_summary: summary }).eq("id", link.id);

  return NextResponse.json({ ok: true, ...summary });
}
