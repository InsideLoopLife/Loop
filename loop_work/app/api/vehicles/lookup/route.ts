import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { checkAiRouteAllowed } from "@/lib/ai/route-budget";
import { enforceUserRateLimit } from "@/lib/security/rate-limit";
import type { FuelType } from "@/lib/vehicles/running-costs";

// Looks up a car's published figures (fuel type, mpg or range, list price, insurance group,
// a typical insurance range) with one web-search call. Every figure is a guide: the form
// shows where it came from and lets the person change it.

const FUELS: FuelType[] = ["petrol", "diesel", "hybrid", "plug_in_hybrid", "electric"];

function num(value: unknown, min: number, max: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const query = String(body?.query || "").trim().slice(0, 140);
  if (query.length < 3) return NextResponse.json({ error: "Describe the car first." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const limit = await enforceUserRateLimit({ userId: user.id, bucket: "vehicle_lookup", limit: 10, windowSeconds: 86_400 });
  if (!limit.allowed) return NextResponse.json({ error: "That's the limit of car lookups for today. Type the figures in instead." }, { status: 429 });

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  const key = secret?.value || process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Car lookups aren't set up. Type the figures in instead." }, { status: 503 });

  const budget = await checkAiRouteAllowed(supabase, user.id, "quick_runtime");
  if (!budget.allowed) return NextResponse.json({ error: "Loop's lookups are paused for today. Type the figures in instead." }, { status: 429 });

  const model = process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini";
  const prompt = `UK car: "${query}".
Find the manufacturer's published UK figures for this exact model and trim (or the closest match), and a typical UK insurance range for a driver aged 30-50 with a clean licence and no claims.
Return JSON only, no prose, with these keys:
{"matched": "make model trim year you matched", "fuelType": one of ${FUELS.map((f) => `"${f}"`).join(", ")},
 "listPriceGbp": number|null, "wltpMpg": number|null, "realWorldMpg": number|null, "electricRangeMiles": number|null, "milesPerKwh": number|null,
 "insuranceGroup": number|null (1-50), "insuranceAnnualLowGbp": number|null, "insuranceAnnualHighGbp": number|null,
 "confidence": 0-1, "sources": ["https://..."]}
Use null when you can't find a figure. Never guess a list price.`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, tools: [{ type: "web_search_preview" }], input: prompt }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(payload?.error?.message || "");
      return NextResponse.json({ error: payload?.error?.type === "loop_ai_guard" ? message : "The lookup didn't work this time. Type the figures in instead." }, { status: 502 });
    }
    const text = String(
      payload.output_text ||
        (payload.output || []).flatMap((item: { content?: { text?: string }[] }) => (item.content || []).map((c) => c.text || "")).join("\n"),
    );
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || "{}");
    const fuelType = FUELS.includes(parsed.fuelType) ? (parsed.fuelType as FuelType) : null;
    const low = num(parsed.insuranceAnnualLowGbp, 100, 10_000);
    const high = num(parsed.insuranceAnnualHighGbp, 100, 10_000);
    const sources = (Array.isArray(parsed.sources) ? parsed.sources : [])
      .map((s: unknown) => String(s))
      .filter((s: string) => /^https:\/\/[^\s]+$/.test(s))
      .slice(0, 4);
    return NextResponse.json({
      car: {
        matched: String(parsed.matched || query).slice(0, 140),
        fuelType,
        listPrice: num(parsed.listPriceGbp, 3_000, 500_000),
        wltpMpg: num(parsed.wltpMpg, 10, 400),
        realWorldMpg: num(parsed.realWorldMpg, 10, 200),
        electricRangeMiles: num(parsed.electricRangeMiles, 5, 800),
        milesPerKwh: num(parsed.milesPerKwh, 1, 7),
        insuranceGroup: num(parsed.insuranceGroup, 1, 50),
        insuranceAnnualLow: low,
        insuranceAnnualHigh: high && low && high >= low ? high : null,
        confidence: num(parsed.confidence, 0, 1) ?? 0.5,
        sources,
        lookedUpAt: new Date().toISOString().slice(0, 10),
      },
    });
  } catch {
    return NextResponse.json({ error: "The lookup didn't work this time. Type the figures in instead." }, { status: 502 });
  }
}
