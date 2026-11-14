import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { checkAiRouteAllowed, recordAiRouteUsage } from "@/lib/ai/route-budget";
import { enforceUserRateLimit } from "@/lib/security/rate-limit";
import { cleanText } from "@/lib/security/external-data";
import { groundFreehand, splitFreehand, type ParsedFreehandItem } from "@/lib/nutrition/freehand";

function extractText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks: string[] = [];
  for (const item of payload?.output || []) for (const content of item?.content || []) if (typeof content?.text === "string") chunks.push(content.text);
  return chunks.join("\n");
}

function parseJson(text: string) {
  const trimmed = String(text || "").trim();
  try { return JSON.parse(trimmed); } catch {}
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) { try { return JSON.parse(trimmed.slice(first, last + 1)); } catch {} }
  return null;
}

const NUTRIENT_KEYS = ["calories", "protein_g", "carbs_g", "fat_g", "fibre_g", "sugar_g", "added_sugar_g", "salt_g", "saturated_fat_g", "monounsaturated_fat_g", "polyunsaturated_fat_g", "potassium_mg", "calcium_mg", "iron_mg", "magnesium_mg", "zinc_mg", "folate_ug", "vitamin_c_mg", "vitamin_d_ug", "vitamin_b12_ug", "caffeine_mg"];

function aiItems(parsed: any): ParsedFreehandItem[] {
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  return items.slice(0, 20).map((item: any) => {
    const unit = item?.unit === "ml" ? "ml" : "g";
    const amount = Number(item?.amount);
    const nutrition = item?.nutrition && typeof item.nutrition === "object"
      ? Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, Math.max(0, Number(item.nutrition[key] || 0))]))
      : null;
    return {
      name: cleanText(item?.generic_name || item?.name || "", 120),
      brand: cleanText(item?.brand || "", 60) || null,
      amount: Number.isFinite(amount) && amount > 0 ? Math.min(amount, 3000) : null,
      unit,
      amount_estimated: Boolean(item?.amount_estimated),
      ai_nutrition: nutrition,
    } as ParsedFreehandItem;
  }).filter((item: ParsedFreehandItem) => item.name);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limit = await enforceUserRateLimit({ userId: user.id, bucket: "nutrition_freehand_estimate", limit: 80, windowSeconds: 60 * 60 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many estimates. Try again shortly.", resetAt: limit.resetAt }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const description = cleanText(body.text || body.description || "", 1500);
  if (!description) return NextResponse.json({ error: "Describe what you ate or drank first." }, { status: 400 });

  let items: ParsedFreehandItem[] = [];
  let usedOpenAi = false;
  let note = "";

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  const budget = secret?.value ? await checkAiRouteAllowed(supabase, user.id, "nutrition_recommendation") : null;
  if (secret?.value && budget?.allowed) {
    const prompt = `Split this UK food diary entry into separate foods and drinks with amounts. Return ONLY JSON.

Entry: """${description}"""

Rules:
- One item per distinct food or drink actually eaten. A dish named and then described by its parts ("burger with a bun, cheese and 250g mince") is ONLY its parts.
- "generic_name": plain UK food name a nutrition database would use, without brand or shop (e.g. "white farmhouse bread", "cooked ham", "whole milk", "espresso", "beef mince, 20% fat, raw"). Keep chain/restaurant dishes as one item with the chain in "brand" (e.g. name "steak bake", brand "Greggs").
- "amount": grams for food, ml for drinks. Use the stated amount; otherwise estimate a typical UK portion and set "amount_estimated": true. Count items ("2 slices", "2 shots") into the total amount.
- "nutrition": your best estimate for THIS item at THIS amount (not per 100g), using UK label conventions. Calories must roughly equal 4×protein + 4×carbs + 9×fat. Include caffeine for coffee, tea, cola, energy drinks.

JSON: {"items":[{"name":"string","generic_name":"string","brand":"string|null","amount":number,"unit":"g|ml","amount_estimated":boolean,"nutrition":{${NUTRIENT_KEYS.map((key) => `"${key}":number`).join(",")}}}]}`;
    try {
      const model = process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini";
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
        body: JSON.stringify({ model, input: prompt }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || "AI request failed");
      items = aiItems(parseJson(extractText(payload)));
      if (items.length) {
        usedOpenAi = true;
        await recordAiRouteUsage({ supabase, userId: user.id, tierKey: budget.tierKey, routeKey: "nutrition_recommendation", provider: "openai", model });
      }
    } catch (error) {
      note = `AI couldn't split this entry (${error instanceof Error ? error.message : "unknown error"}), so Loop split it itself. `;
    }
  } else if (secret?.value && budget && !budget.allowed) {
    note = `${budget.reason} Loop split the entry itself. `;
  }

  if (!items.length) items = splitFreehand(description);
  const { estimate, breakdown } = groundFreehand(description, items);
  const fromData = breakdown.filter((item) => item.source === "uk_reference" || item.source === "typical").length;
  note += breakdown.length
    ? `Worked out ${breakdown.length} item${breakdown.length === 1 ? "" : "s"}${fromData ? `, ${fromData} from UK food data` : ""}. Check the amounts below and edit the description if any are off.`
    : "Couldn't find any foods in that description — try naming each food and how much.";

  return NextResponse.json({ estimate, breakdown, usedOpenAi, note });
}
