import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { fallbackRecipeEstimate, normaliseRecipeEstimate } from "@/lib/nutrition/scoring";
import { enforceUserRateLimit } from "@/lib/security/rate-limit";
import { cleanText } from "@/lib/security/external-data";

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
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch {}
  }
  return null;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 30_000) return NextResponse.json({ error: "Recipe estimate request is too large." }, { status: 413 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limit = await enforceUserRateLimit({ userId: user.id, bucket: "nutrition_recipe_estimate", limit: 60, windowSeconds: 60 * 60 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many recipe estimates. Try again shortly.", resetAt: limit.resetAt }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const label = cleanText(body.label || "Recipe", 160);
  const ingredients = cleanText(body.ingredients || "", 8000);
  const notes = cleanText(body.notes || "", 1200);
  const servings = Math.max(1, Number(body.servings || 1));
  const fallback = fallbackRecipeEstimate({ label, ingredients, notes, servings });

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  if (!secret?.value) {
    return NextResponse.json({ estimate: fallback, usedOpenAi: false, note: "No OpenAI token is saved, so this is a rough built-in estimate." });
  }

  const prompt = `You are helping a private household meal planner estimate nutrition for a recipe or commercial food. Return ONLY valid JSON. Do not give medical advice. Estimate values per serving, not whole recipe. Go deeper than basic macros: split carbohydrate type, fibre type, sugar source, lipid profile, sodium/potassium, fortification-style micronutrients, ingredient ratios, confidence and behavioural flags. If ingredients are vague, infer a realistic UK-style recipe ratio and state why confidence is lower.

Recipe/food name: ${label}
Servings: ${servings}
Notes: ${notes}
Ingredients:
${ingredients}

Rules:
- Separate total sugar into added_sugar_g and natural_sugar_g.
- Split fibre into soluble_fibre_g and insoluble_fibre_g.
- Split fat into saturated_fat_g, trans_fat_g, monounsaturated_fat_g and polyunsaturated_fat_g.
- For UK/EU-style wheat flour/bakery foods, include plausible flour fortification estimates for calcium, iron, niacin and thiamin.
- Estimate ingredient_ratio_json as percentage by weight.
- Include allergen_flags such as gluten, dairy, egg, soy, nuts when typical or explicit.
- Include dietary_flags such as energy dense, high salt, added sugar, higher glycemic impact, caffeine.
- energy_density_kcal_per_g should be kcal per gram of the edible portion.
- glycemic_impact_score should be 0-100, where higher means more likely to spike blood sugar.

JSON shape:
{
  "servings": number,
  "confidence": 0-100,
  "confidence_reason": "string",
  "processing_level": "low" | "medium" | "high" | "unknown",
  "health_score": 0-100,
  "image_prompt": "short realistic meal image prompt",
  "ingredients_json": [{"name":"string","quantity":"string","notes":"string"}],
  "ingredient_ratio_json": [{"name":"string","estimated_weight_g": number,"percentage": number,"role":"string","confidence":0-100}],
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
      body: JSON.stringify({ model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini", input: prompt }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || "OpenAI recipe estimate failed");
    const parsed = parseJsonLoose(extractTextFromResponse(payload));
    if (!parsed) throw new Error("OpenAI returned a non-JSON recipe estimate");
    return NextResponse.json({ estimate: normaliseRecipeEstimate(parsed, fallback), usedOpenAi: true, note: "AI estimate created. Review labels for precision before relying on this." });
  } catch (error) {
    return NextResponse.json({ estimate: fallback, usedOpenAi: false, note: `AI estimate could not complete, so fallback values were returned. ${error instanceof Error ? error.message : ""}`.trim() });
  }
}
