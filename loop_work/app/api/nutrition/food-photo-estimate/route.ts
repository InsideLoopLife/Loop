import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { checkAiRouteAllowed, recordAiRouteUsage } from "@/lib/ai/route-budget";
import { fallbackRecipeEstimate, normaliseRecipeEstimate } from "@/lib/nutrition/scoring";
import { enforceUserRateLimit } from "@/lib/security/rate-limit";
import { cleanText } from "@/lib/security/external-data";

// This is a genuinely different job from label-image: that route reads
// printed text off a nutrition facts panel. This one has no label to
// read at all — it has to visually recognise the actual food or drink
// itself (a plate of food, a glass of juice, a coffee) and estimate
// what it is, how much of it there is, and its full nutrition —
// including fluid volume in ml for anything drinkable, which nothing
// else in the app currently detects automatically.

function extractTextFromResponse(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function parseJsonLoose(text: string) {
  const trimmed = String(text || "").trim();
  try { return JSON.parse(trimmed); } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) { try { return JSON.parse(fenced[1]); } catch {} }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) { try { return JSON.parse(trimmed.slice(first, last + 1)); } catch {} }
  return null;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 7_000_000) return NextResponse.json({ error: "Photo is too large. Use a clear photo under 7MB." }, { status: 413 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limit = await enforceUserRateLimit({ userId: user.id, bucket: "nutrition_food_photo", limit: 25, windowSeconds: 60 * 60 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many photo estimates. Try again shortly.", resetAt: limit.resetAt }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const imageDataUrl = String(body.imageDataUrl || "");
  const notes = cleanText(body.notes || "", 500);
  if (!imageDataUrl.startsWith("data:image/")) return NextResponse.json({ error: "Take or upload a photo of what you're eating or drinking." }, { status: 400 });

  const fallback = fallbackRecipeEstimate({ label: "Photo diary entry", ingredients: notes || "Estimated from a photo", notes, servings: 1 });

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  if (!secret?.value) {
    return NextResponse.json({ estimate: fallback, usedOpenAi: false, note: "No OpenAI token is saved, so this couldn't be analysed. Add one in Integrations, or log this manually." });
  }

  const budget = await checkAiRouteAllowed(supabase, user.id, "vision_label_scan");
  if (!budget.allowed) {
    return NextResponse.json({ estimate: fallback, usedOpenAi: false, note: `${budget.reason} Resets at midnight.` });
  }

  const prompt = `You are looking at a photo of food or drink someone is about to log in a private household nutrition diary. There is no label to read — you must visually identify what this actually is and estimate a realistic portion. Return ONLY valid JSON.

${notes ? `The person also noted: "${notes}"` : "No extra notes were given — identify purely from the photo."}

Rules:
- First identify what the food/drink actually is (label field) — be specific (e.g. "Flat white with oat milk", "Chicken caesar salad", "Glass of orange juice"), not generic ("drink", "food").
- If this is a drink or has a clear liquid component (a mug, glass, bottle, bowl of soup), estimate detected_fluid_ml — your best estimate of the liquid volume in millilitres, based on the container size and how full it looks. Set this to 0 only if there is genuinely no liquid component at all (e.g. a dry sandwich).
- Estimate a realistic portion size from what's visible — don't assume a "standard" serving if the photo clearly shows more or less.
- Go deeper than basic macros: split carbohydrate type, fibre type, sugar source, lipid profile, sodium/potassium, and plausible micronutrients for what's visible.
- confidence should reflect how clearly identifiable the food/drink and its portion actually are from the photo — a clear, well-lit single item deserves higher confidence than a partially-eaten, mixed, or poorly-lit photo.
- Include allergen_flags and dietary_flags exactly as in a normal recipe estimate.

JSON shape:
{
  "label": "what this food/drink actually is",
  "detected_fluid_ml": number,
  "servings": 1,
  "confidence": 0-100,
  "confidence_reason": "string",
  "processing_level": "low" | "medium" | "high" | "unknown",
  "health_score": 0-100,
  "image_prompt": "short realistic meal image prompt",
  "ingredients_json": [{"name":"string","quantity":"string","notes":"string"}],
  "per_serving": {
    "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "fibre_g": number, "soluble_fibre_g": number, "insoluble_fibre_g": number, "sugar_g": number, "added_sugar_g": number, "natural_sugar_g": number, "salt_g": number, "saturated_fat_g": number, "trans_fat_g": number, "monounsaturated_fat_g": number, "polyunsaturated_fat_g": number, "sodium_mg": number, "potassium_mg": number, "calcium_mg": number, "iron_mg": number, "magnesium_mg": number, "zinc_mg": number, "folate_ug": number, "niacin_mg": number, "thiamin_mg": number, "vitamin_c_mg": number, "vitamin_d_ug": number, "vitamin_b12_ug": number, "omega_3_g": number, "caffeine_mg": number, "energy_density_kcal_per_g": number, "glycemic_impact_score": number
  },
  "allergen_flags": ["string"],
  "dietary_flags": ["string"],
  "manufacturing_notes": ["string"],
  "micronutrient_notes": ["string"],
  "assumptions": ["string"]
}`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
      body: JSON.stringify({
        model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: imageDataUrl }] }],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || "OpenAI photo estimate failed");
    const parsed = parseJsonLoose(extractTextFromResponse(payload));
    if (!parsed) throw new Error("OpenAI returned a non-JSON photo estimate");

    await recordAiRouteUsage({ supabase, userId: user.id, tierKey: budget.tierKey, routeKey: "vision_label_scan", provider: "openai", model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini" });

    const detectedFluidMl = Number(parsed.detected_fluid_ml) || 0;
    const label = cleanText(parsed.label || "Photo diary entry", 160);
    return NextResponse.json({
      estimate: normaliseRecipeEstimate(parsed, fallback),
      label,
      detectedFluidMl,
      usedOpenAi: true,
      note: "AI estimate from photo. Review before relying on this — portion sizes from a photo are always an estimate, not a measurement.",
    });
  } catch (error) {
    return NextResponse.json({
      estimate: fallback,
      usedOpenAi: false,
      note: `Photo analysis could not complete, so fallback values were returned. ${error instanceof Error ? error.message : ""}`.trim(),
    });
  }
}
