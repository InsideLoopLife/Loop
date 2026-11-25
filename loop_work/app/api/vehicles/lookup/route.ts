import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/platform/database/admin-client";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { checkAiRouteAllowed } from "@/lib/ai/route-budget";
import { enforceUserRateLimit } from "@/lib/security/rate-limit";
import { specKey } from "@/lib/vehicles/catalogue";
import type { FuelType } from "@/lib/vehicles/running-costs";

// A car's published figures (fuel, mpg or efficiency, list price, insurance group, typical
// insurance, CO2, and which engines that model/trim/year came with).
//
// 1. Loop's shared register (vehicle_model_specs) — instant and free, filled by earlier lookups.
// 2. Otherwise one web-search lookup, saved to the register for the next person with that car.
// Every figure is a guide the person can change.

const FUELS: FuelType[] = ["petrol", "diesel", "hybrid", "plug_in_hybrid", "electric"];
const FRESH_DAYS = 180;

function num(value: unknown, min: number, max: number) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
}
const text = (value: unknown, max = 80) => {
  const t = String(value ?? "").trim();
  return t && t.toLowerCase() !== "null" ? t.slice(0, max) : null;
};

type Spec = {
  matched: string;
  fuelType: FuelType | null;
  listPrice: number | null;
  wltpMpg: number | null;
  realWorldMpg: number | null;
  electricRangeMiles: number | null;
  milesPerKwh: number | null;
  co2: number | null;
  insuranceGroup: number | null;
  insuranceAnnualLow: number | null;
  insuranceAnnualHigh: number | null;
  engineOptions: string[];
  confidence: number;
  sources: string[];
  lookedUpAt: string;
  fromRegister: boolean;
};

function fromRow(row: any): Spec {
  return {
    matched: row.matched || [row.year, row.make, row.model, row.trim, row.engine].filter(Boolean).join(" "),
    fuelType: FUELS.includes(row.fuel_type) ? row.fuel_type : null,
    listPrice: row.list_price === null ? null : Number(row.list_price),
    wltpMpg: row.wltp_mpg === null ? null : Number(row.wltp_mpg),
    realWorldMpg: row.real_world_mpg === null ? null : Number(row.real_world_mpg),
    electricRangeMiles: row.electric_range_miles === null ? null : Number(row.electric_range_miles),
    milesPerKwh: row.miles_per_kwh === null ? null : Number(row.miles_per_kwh),
    co2: row.co2_g_km,
    insuranceGroup: row.insurance_group,
    insuranceAnnualLow: row.insurance_annual_low === null ? null : Number(row.insurance_annual_low),
    insuranceAnnualHigh: row.insurance_annual_high === null ? null : Number(row.insurance_annual_high),
    engineOptions: Array.isArray(row.engine_options) ? row.engine_options : [],
    confidence: Number(row.confidence ?? 0.6),
    sources: Array.isArray(row.sources) ? row.sources : [],
    lookedUpAt: String(row.looked_up_at || "").slice(0, 10),
    fromRegister: true,
  };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  // Structured (Your cars picker) or a free description (planned purchases).
  const make = text(body?.make, 40);
  const modelName = text(body?.model, 60);
  const trim = text(body?.trim, 60);
  const year = num(body?.year, 1990, 2030);
  const fuel = FUELS.includes(body?.fuel) ? (body.fuel as FuelType) : null;
  const engine = text(body?.engine, 60);
  const query = text(body?.query, 140);
  const description = make && modelName ? [year, make, modelName, trim, engine, fuel ? fuel.replace(/_/g, " ") : null].filter(Boolean).join(" ") : query;
  if (!description || description.length < 3) return NextResponse.json({ error: "Pick the make and model first." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const key = make && modelName ? specKey({ make, model: modelName, trim, year, fuel, engine }) : specKey({ make: "", model: description });

  // 1. The register.
  const { data: cached } = await supabase.from("vehicle_model_specs").select("*").eq("spec_key", key).maybeSingle();
  if (cached && Date.now() - Date.parse(cached.looked_up_at) < FRESH_DAYS * 86_400_000) {
    void Promise.resolve(createAdminClient().from("vehicle_model_specs").update({ lookups: Number(cached.lookups || 1) + 1 }).eq("id", cached.id)).catch(() => undefined);
    return NextResponse.json({ car: fromRow(cached) });
  }

  // 2. A web lookup.
  const limit = await enforceUserRateLimit({ userId: user.id, bucket: "vehicle_lookup", limit: 15, windowSeconds: 86_400 });
  if (!limit.allowed) return NextResponse.json({ error: "That's the limit of car lookups for today. Type the figures in instead." }, { status: 429 });
  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  const apiKey = secret?.value || process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Car lookups aren't set up. Type the figures in instead." }, { status: 503 });
  const budget = await checkAiRouteAllowed(supabase, user.id, "quick_runtime");
  if (!budget.allowed) return NextResponse.json({ error: "Loop's lookups are paused for today. Type the figures in instead." }, { status: 429 });

  const model = process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini";
  const prompt = `UK car: "${description}".
Find the manufacturer's published UK figures for this model, trim and year (or the closest match), and a typical UK insurance range for a driver aged 30-50 with a clean licence and no claims.
${engine ? "" : "If this model/trim/year/fuel was sold with more than one engine, list them in engineOptions (e.g. \"2.0 TDI 150PS DSG\", \"2.0 TDI 200PS 4MOTION\") and give the figures for the most common one, saying which in matched."}
Return JSON only, no prose:
{"matched": "year make model trim engine you matched", "fuelType": one of ${FUELS.map((f) => `"${f}"`).join(", ")},
 "listPriceGbp": number|null (new price when that year was on sale), "wltpMpg": number|null, "realWorldMpg": number|null, "electricRangeMiles": number|null, "milesPerKwh": number|null,
 "co2": number|null, "insuranceGroup": number|null (1-50), "insuranceAnnualLowGbp": number|null, "insuranceAnnualHighGbp": number|null,
 "engineOptions": [string], "confidence": 0-1, "sources": ["https://..."]}
Use null when you can't find a figure. Never guess a list price.`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, tools: [{ type: "web_search_preview" }], input: prompt }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(payload?.error?.message || "");
      return NextResponse.json({ error: payload?.error?.type === "loop_ai_guard" ? message : "The lookup didn't work this time. Type the figures in instead." }, { status: 502 });
    }
    const out = String(
      payload.output_text ||
        (payload.output || []).flatMap((item: { content?: { text?: string }[] }) => (item.content || []).map((c) => c.text || "")).join("\n"),
    );
    const parsed = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] || "{}");
    const low = num(parsed.insuranceAnnualLowGbp, 100, 10_000);
    const high = num(parsed.insuranceAnnualHighGbp, 100, 10_000);
    const spec: Spec = {
      matched: String(parsed.matched || description).slice(0, 140),
      fuelType: FUELS.includes(parsed.fuelType) ? parsed.fuelType : fuel,
      listPrice: num(parsed.listPriceGbp, 3_000, 500_000),
      wltpMpg: num(parsed.wltpMpg, 10, 400),
      realWorldMpg: num(parsed.realWorldMpg, 10, 200),
      electricRangeMiles: num(parsed.electricRangeMiles, 5, 800),
      milesPerKwh: num(parsed.milesPerKwh, 1, 7),
      co2: num(parsed.co2, 0, 600),
      insuranceGroup: num(parsed.insuranceGroup, 1, 50),
      insuranceAnnualLow: low,
      insuranceAnnualHigh: high && low && high >= low ? high : null,
      engineOptions: (Array.isArray(parsed.engineOptions) ? parsed.engineOptions : []).map((e: unknown) => String(e).slice(0, 60)).filter(Boolean).slice(0, 6),
      confidence: num(parsed.confidence, 0, 1) ?? 0.5,
      sources: (Array.isArray(parsed.sources) ? parsed.sources : []).map(String).filter((s: string) => /^https:\/\/[^\s]+$/.test(s)).slice(0, 4),
      lookedUpAt: new Date().toISOString().slice(0, 10),
      fromRegister: false,
    };

    // Save to the register when it found something useful.
    if (spec.realWorldMpg || spec.wltpMpg || spec.milesPerKwh || spec.insuranceGroup || spec.listPrice) {
      await Promise.resolve(createAdminClient().from("vehicle_model_specs").upsert({
        spec_key: key,
        make: make || "",
        model: modelName || description,
        trim, year, fuel_type: spec.fuelType, engine,
        matched: spec.matched,
        list_price: spec.listPrice, real_world_mpg: spec.realWorldMpg, wltp_mpg: spec.wltpMpg, miles_per_kwh: spec.milesPerKwh,
        electric_range_miles: spec.electricRangeMiles, co2_g_km: spec.co2 === null ? null : Math.round(spec.co2),
        insurance_group: spec.insuranceGroup === null ? null : Math.round(spec.insuranceGroup),
        insurance_annual_low: spec.insuranceAnnualLow, insurance_annual_high: spec.insuranceAnnualHigh,
        engine_options: spec.engineOptions, sources: spec.sources, confidence: spec.confidence,
        looked_up_at: new Date().toISOString(),
      }, { onConflict: "spec_key" })).catch(() => undefined);
    }
    return NextResponse.json({ car: spec });
  } catch {
    return NextResponse.json({ error: "The lookup didn't work this time. Type the figures in instead." }, { status: 502 });
  }
}
