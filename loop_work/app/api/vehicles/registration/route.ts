import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { checkAiRouteAllowed } from "@/lib/ai/route-budget";
import { enforceUserRateLimit } from "@/lib/security/rate-limit";
import type { FuelType } from "@/lib/vehicles/running-costs";

// Registration → car details, found by a web search (public vehicle-check and MOT pages),
// plus the model's published mpg, list price and insurance group. Interim until Loop has a
// formal DVLA / MOT data feed: everything comes back as a suggestion for the person to check.

const FUELS: FuelType[] = ["petrol", "diesel", "hybrid", "plug_in_hybrid", "electric"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function num(value: unknown, min: number, max: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
}
function text(value: unknown, max = 60) {
  const t = String(value ?? "").trim();
  return t && t.toLowerCase() !== "null" ? t.slice(0, max) : null;
}
function date(value: unknown) {
  const t = String(value ?? "").trim();
  return DATE.test(t) ? t : null;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const registration = String(body?.registration || "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(registration)) return NextResponse.json({ error: "Enter a UK registration, like AB12 CDE." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const limit = await enforceUserRateLimit({ userId: user.id, bucket: "vehicle_lookup", limit: 15, windowSeconds: 86_400 });
  if (!limit.allowed) return NextResponse.json({ error: "That's the limit of car lookups for today. Type the details in instead." }, { status: 429 });

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  const key = secret?.value || process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Lookups aren't set up. Type the details in instead." }, { status: 503 });
  const budget = await checkAiRouteAllowed(supabase, user.id, "quick_runtime");
  if (!budget.allowed) return NextResponse.json({ error: "Loop's lookups are paused for today. Type the details in instead." }, { status: 429 });

  const model = process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini";
  const prompt = `Look up the UK vehicle with registration "${registration}" on public UK vehicle-check and MOT history pages (for example GOV.UK "check MOT history", or free vehicle check sites that show DVLA/DVSA data).
Only report details that a page clearly shows for exactly this registration. Then find that model's published UK figures.
Return JSON only, no prose:
{"registrationFound": true|false, "registration": "${registration}", "make": string|null, "model": string|null, "variant": string|null, "colour": string|null,
 "year": number|null, "firstRegistered": "YYYY-MM-DD"|null, "fuelType": one of ${FUELS.map((f) => `"${f}"`).join(", ")} or null, "engineCc": number|null, "co2": number|null,
 "motExpiry": "YYYY-MM-DD"|null, "taxDue": "YYYY-MM-DD"|null,
 "motMileage": [{"date": "YYYY-MM-DD", "miles": number}] (every MOT test with its odometer reading, newest first, max 10),
 "listPriceGbp": number|null, "realWorldMpg": number|null, "wltpMpg": number|null, "milesPerKwh": number|null,
 "insuranceGroup": number|null, "insuranceAnnualLowGbp": number|null, "insuranceAnnualHighGbp": number|null,
 "sources": ["https://..."]}
If you can't find this registration, set registrationFound false and leave the vehicle fields null. Never guess dates or mileage.`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, tools: [{ type: "web_search_preview" }], input: prompt }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(payload?.error?.message || "");
      return NextResponse.json({ error: payload?.error?.type === "loop_ai_guard" ? message : "The lookup didn't work this time. Type the details in instead." }, { status: 502 });
    }
    const out = String(
      payload.output_text ||
        (payload.output || []).flatMap((item: { content?: { text?: string }[] }) => (item.content || []).map((c) => c.text || "")).join("\n"),
    );
    const parsed = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] || "{}");
    const sources = (Array.isArray(parsed.sources) ? parsed.sources : []).map(String).filter((s: string) => /^https:\/\/[^\s]+$/.test(s)).slice(0, 4);
    const found = Boolean(parsed.registrationFound) && Boolean(text(parsed.make));
    if (!found) return NextResponse.json({ found: false, registration, sources, message: "Couldn't find that registration online. Check it, or type the details in." });

    const motMileage = (Array.isArray(parsed.motMileage) ? parsed.motMileage : [])
      .map((r: any) => ({ date: date(r?.date), miles: num(r?.miles, 1, 999_999) }))
      .filter((r: { date: string | null; miles: number | null }) => r.date && r.miles)
      .slice(0, 10);
    const low = num(parsed.insuranceAnnualLowGbp, 100, 10_000);
    const high = num(parsed.insuranceAnnualHighGbp, 100, 10_000);
    return NextResponse.json({
      found: true,
      registration,
      car: {
        make: text(parsed.make),
        model: text(parsed.model),
        variant: text(parsed.variant, 80),
        colour: text(parsed.colour, 30),
        year: num(parsed.year, 1950, 2100),
        firstRegistered: date(parsed.firstRegistered),
        fuelType: FUELS.includes(parsed.fuelType) ? parsed.fuelType : null,
        engineCc: num(parsed.engineCc, 50, 10_000),
        co2: num(parsed.co2, 0, 600),
        motExpiry: date(parsed.motExpiry),
        taxDue: date(parsed.taxDue),
        motMileage,
        listPrice: num(parsed.listPriceGbp, 3_000, 500_000),
        mpg: num(parsed.realWorldMpg, 10, 200) || (num(parsed.wltpMpg, 10, 400) ? Math.round(Number(parsed.wltpMpg) * 0.85) : null),
        milesPerKwh: num(parsed.milesPerKwh, 1, 7),
        insuranceGroup: num(parsed.insuranceGroup, 1, 50),
        insuranceAnnualLow: low,
        insuranceAnnualHigh: high && low && high >= low ? high : null,
      },
      sources,
      lookedUpAt: new Date().toISOString().slice(0, 10),
    });
  } catch {
    return NextResponse.json({ error: "The lookup didn't work this time. Type the details in instead." }, { status: 502 });
  }
}
