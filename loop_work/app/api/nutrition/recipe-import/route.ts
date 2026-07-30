import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { checkAiRouteAllowed, recordAiRouteUsage } from "@/lib/ai/route-budget";
import { enforceUserRateLimit } from "@/lib/security/rate-limit";
import { cleanText, safeExternalUrl } from "@/lib/security/external-data";
import { fallbackRecipeEstimate, normaliseRecipeEstimate } from "@/lib/nutrition/scoring";
import { getPublicPageEvidence } from "@/lib/imports/public-page-evidence";

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
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try { return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)); } catch {}
  }
  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    try { return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1)); } catch {}
  }
  return null;
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normaliseRecipeUrl(input: string) {
  const raw = cleanText(input || "", 1200);
  if (!raw) return "";
  if (/^https:\/\//i.test(raw)) return safeExternalUrl(raw);
  if (/^www\./i.test(raw)) return safeExternalUrl(`https://${raw}`);
  if (/^\/recipes\//i.test(raw)) return safeExternalUrl(`https://www.jamieoliver.com${raw}`);
  if (/^recipes\//i.test(raw)) return safeExternalUrl(`https://www.jamieoliver.com/${raw}`);
  return safeExternalUrl(raw);
}

function normaliseRecipeImageUrl(input: any, sourceUrl: string) {
  const raw = cleanText(
    typeof input === "string"
      ? input
      : Array.isArray(input)
        ? input.find(Boolean) || ""
        : input?.url || input?.contentUrl || input?.thumbnailUrl || "",
    1600,
  );
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("?")) return "";
  const firstPiece = raw.split(",").map((part) => part.trim().split(/\s+/)[0]).find(Boolean) || "";
  if (!firstPiece || firstPiece.startsWith("?")) return "";
  try {
    const normalised = firstPiece.startsWith("//") ? `https:${firstPiece}` : firstPiece;
    const url = new URL(normalised, sourceUrl || "https://www.google.com");
    if (url.protocol !== "https:") return "";
    const full = url.toString();
    if (/sprite|logo|icon|avatar|placeholder|transparent|blank/i.test(`${url.pathname} ${url.search}`)) return "";
    return safeExternalUrl(full);
  } catch {
    return "";
  }
}

function findRecipesInJsonLd(value: any, found: any[] = []) {
  if (!value) return found;
  if (Array.isArray(value)) {
    value.forEach((item) => findRecipesInJsonLd(item, found));
    return found;
  }
  if (typeof value !== "object") return found;
  const typeValue = value["@type"];
  const types = Array.isArray(typeValue) ? typeValue.map(String) : [String(typeValue || "")];
  if (types.some((type) => type.toLowerCase() === "recipe")) found.push(value);
  if (Array.isArray(value["@graph"])) findRecipesInJsonLd(value["@graph"], found);
  Object.values(value).forEach((nested) => {
    if (nested && typeof nested === "object") findRecipesInJsonLd(nested, found);
  });
  return found;
}

function extractRecipeJsonLd(html: string) {
  const recipes: any[] = [];
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html))) {
    const raw = decodeHtml(match[1] || "").trim();
    if (!raw) continue;
    try {
      findRecipesInJsonLd(JSON.parse(raw), recipes);
    } catch {
      // Keep going; recipe pages often include several JSON-LD blobs and one malformed blob should not fail import.
    }
  }
  const first = recipes[0] || null;
  if (!first) return { recipe: null, summary: "" };
  const nutrition = first.nutrition || {};
  const ingredients = Array.isArray(first.recipeIngredient) ? first.recipeIngredient.map(String) : [];
  const image = normaliseRecipeImageUrl(first.image, "");
  const videos = findVideosInJsonLd(first, "");
  const instructions = Array.isArray(first.recipeInstructions)
    ? first.recipeInstructions.map((step: any) => typeof step === "string" ? step : step?.text).filter(Boolean).slice(0, 8)
    : [];
  const summary = cleanText([
    first.name ? `Recipe name: ${first.name}` : "",
    first.description ? `Description: ${first.description}` : "",
    first.recipeYield ? `Yield: ${Array.isArray(first.recipeYield) ? first.recipeYield.join(", ") : first.recipeYield}` : "",
    ingredients.length ? `Structured ingredients:\n${ingredients.map((item: string) => `- ${item}`).join("\n")}` : "",
    Object.keys(nutrition).length ? `Structured nutrition JSON: ${JSON.stringify(nutrition).slice(0, 3000)}` : "",
    instructions.length ? `Instruction clues:\n${instructions.map((item: string) => `- ${item}`).join("\n")}` : "",
    videos.length ? `Video URL: ${videos[0]}` : "",
  ].filter(Boolean).join("\n\n"), 10000);
  return { recipe: { ...first, recipeIngredient: ingredients, image, video_url: videos[0] || "", videos }, summary };
}


function normaliseVideoUrl(input: any, sourceUrl: string) {
  const raw = cleanText(
    typeof input === "string"
      ? input
      : input?.embedUrl || input?.contentUrl || input?.url || input?.thumbnailUrl || "",
    1600,
  );
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return "";
  try {
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw, sourceUrl || "https://www.google.com");
    if (url.protocol !== "https:") return "";
    return safeExternalUrl(url.toString());
  } catch {
    return "";
  }
}

function findVideosInJsonLd(value: any, sourceUrl: string, found: string[] = []) {
  if (!value) return found;
  if (Array.isArray(value)) { value.forEach((item) => findVideosInJsonLd(item, sourceUrl, found)); return found; }
  if (typeof value !== "object") return found;
  const typeValue = value["@type"];
  const types = Array.isArray(typeValue) ? typeValue.map(String) : [String(typeValue || "")];
  if (types.some((type) => /videoobject/i.test(type))) {
    const url = normaliseVideoUrl(value, sourceUrl);
    if (url) found.push(url);
  }
  [value.video, value.videoUrl, value.embedUrl, value.contentUrl].forEach((nested) => {
    const url = normaliseVideoUrl(nested, sourceUrl);
    if (url) found.push(url);
    if (nested && typeof nested === "object") findVideosInJsonLd(nested, sourceUrl, found);
  });
  if (Array.isArray(value["@graph"])) findVideosInJsonLd(value["@graph"], sourceUrl, found);
  Object.values(value).forEach((nested) => { if (nested && typeof nested === "object") findVideosInJsonLd(nested, sourceUrl, found); });
  return Array.from(new Set(found));
}

function extractMeta(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  return decodeHtml(html.match(regex)?.[1] || "");
}

async function getRecipePageEvidence(url: string) {
  if (!url) return { pageText: "", pageTextChars: 0, recipeSummary: "", recipeJson: null as any, imageUrl: "", videoUrl: "", videos: [] as string[], fetched: false, evidenceMode: "none" };

  const publicEvidence = await getPublicPageEvidence(url);
  if (publicEvidence.dynamicAppDetected || publicEvidence.headlessSucceeded || publicEvidence.jsonLd.length || publicEvidence.pageTextChars > 400) {
    const recipes = findRecipesInJsonLd(publicEvidence.jsonLd, []);
    const recipe = recipes[0] || null;
    const summary = recipe ? cleanText([
      recipe.name ? `Recipe name: ${recipe.name}` : "",
      recipe.description ? `Description: ${recipe.description}` : "",
      recipe.recipeYield ? `Yield: ${Array.isArray(recipe.recipeYield) ? recipe.recipeYield.join(", ") : recipe.recipeYield}` : "",
      Array.isArray(recipe.recipeIngredient) && recipe.recipeIngredient.length ? "Structured ingredients:\n" + recipe.recipeIngredient.map((item: string) => `- ${item}`).join("\n") : "",
      recipe.nutrition ? `Structured nutrition JSON: ${JSON.stringify(recipe.nutrition).slice(0, 3000)}` : "",
    ].filter(Boolean).join("\n\n"), 10000) : publicEvidence.jsonLdSummary;
    const image = normaliseRecipeImageUrl(recipe?.image, url) || publicEvidence.images[0] || "";
    const videos = findVideosInJsonLd(recipe || publicEvidence.jsonLd, url);
    return {
      pageText: publicEvidence.pageText,
      pageTextChars: publicEvidence.pageTextChars,
      recipeSummary: summary,
      recipeJson: recipe ? { ...recipe, recipeIngredient: Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient.map(String) : [], image } : null,
      imageUrl: normaliseRecipeImageUrl(image, url),
      videoUrl: videos[0] || "",
      videos,
      fetched: publicEvidence.status !== "failed",
      evidenceMode: publicEvidence.status,
    };
  }

  return { pageText: "", pageTextChars: 0, recipeSummary: "", recipeJson: null as any, imageUrl: "", videoUrl: "", videos: [] as string[], fetched: false, evidenceMode: publicEvidence.status };
}

function isWeakIngredient(item: any) {
  const name = cleanText(item?.name || item || "", 120).toLowerCase();
  return !name || /^(main ingredient|ingredient|ingredients?|food item|recipe|pasta)$/i.test(name);
}

function cleanIngredients(raw: any[], fallbackIngredients: string[]) {
  const mapped = raw
    .filter((item) => !isWeakIngredient(item))
    .map((item) => ({
      name: cleanText(item?.name || item, 140),
      quantity: cleanText(item?.quantity || "", 100),
      notes: cleanText(item?.notes || "", 180),
    }))
    .filter((item) => item.name);

  if (mapped.length >= 3) return mapped.slice(0, 30);
  return fallbackIngredients.slice(0, 30).map((line) => ({ name: line, quantity: "", notes: "from recipe page evidence" }));
}

function recipeNutritionFromJsonLd(recipe: any) {
  const nutrition = recipe?.nutrition || {};
  const result: Record<string, number> = {};
  const calorieMatch = String(nutrition.calories || "").match(/\d+(?:\.\d+)?/);
  if (calorieMatch) result.calories = Number(calorieMatch[0]);
  const maps: Record<string, string> = {
    proteinContent: "protein_g",
    carbohydrateContent: "carbs_g",
    fatContent: "fat_g",
    fiberContent: "fibre_g",
    sugarContent: "sugar_g",
    saturatedFatContent: "saturated_fat_g",
    sodiumContent: "sodium_mg",
  };
  Object.entries(maps).forEach(([source, target]) => {
    const match = String(nutrition[source] || "").match(/\d+(?:\.\d+)?/);
    if (match) result[target] = Number(match[0]);
  });
  return result;
}

function recipeServingsFromJsonLd(recipe: any) {
  const value = Array.isArray(recipe?.recipeYield) ? recipe.recipeYield.join(" ") : String(recipe?.recipeYield || recipe?.yield || "");
  const match = value.match(/\d+(?:\.\d+)?/);
  return match ? Math.max(1, Number(match[0])) : 1;
}

function recipeInstructionsFromJsonLd(recipe: any) {
  const instructions = Array.isArray(recipe?.recipeInstructions) ? recipe.recipeInstructions : [];
  return instructions
    .map((step: any) => typeof step === "string" ? step : step?.text || step?.name || "")
    .map((step: string) => cleanText(step, 500))
    .filter(Boolean)
    .slice(0, 18);
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 24_000) return NextResponse.json({ error: "Recipe import request is too large." }, { status: 413 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limit = await enforceUserRateLimit({ userId: user.id, bucket: "nutrition_recipe_import", limit: 45, windowSeconds: 60 * 60 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many recipe imports. Try again shortly.", resetAt: limit.resetAt }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "import" ? "import" : "custom";
  const title = cleanText(body.title || "", 180);
  const sourceUrl = normaliseRecipeUrl(body.sourceUrl || "");
  const imageUrl = normaliseRecipeImageUrl(body.imageUrl || "", sourceUrl || "https://www.google.com");
  const evidence = mode === "import" && sourceUrl ? await getRecipePageEvidence(sourceUrl) : { pageText: "", pageTextChars: 0, recipeSummary: "", recipeJson: null as any, imageUrl: "", fetched: false, evidenceMode: "none" };
  const evidenceIngredients = Array.isArray(evidence.recipeJson?.recipeIngredient) ? evidence.recipeJson.recipeIngredient.map(String).filter(Boolean) : [];
  const fallbackTitle = title || cleanText(evidence.recipeJson?.name || "Custom recipe", 180) || "Custom recipe";
  const evidenceIngredientText = evidenceIngredients.join("\n");
  const fallbackServings = recipeServingsFromJsonLd(evidence.recipeJson);
  const fallbackInstructions = recipeInstructionsFromJsonLd(evidence.recipeJson);
  const baseFallback = fallbackRecipeEstimate({ label: fallbackTitle, ingredients: evidenceIngredientText, notes: `${sourceUrl || ""}\n${fallbackInstructions.join("\n")}`.trim(), servings: fallbackServings });
  const fallback = {
    label: fallbackTitle,
    ingredients: cleanIngredients([], evidenceIngredients),
    notes: [
      evidenceIngredients.length
        ? "Ingredients were pulled from the recipe page evidence. Refresh the deep nutrition estimate after reviewing them."
        : "AI recipe extraction could not complete, so LoopHealth used its safest fallback. Add exact ingredients before relying on this card.",
    ],
    image_url: imageUrl || normaliseRecipeImageUrl(evidence.imageUrl, sourceUrl || "") || "",
    source_url: sourceUrl || "",
    video_url: (evidence as any).videoUrl || "",
    videos: (evidence as any).videos || [],
    servings: fallbackServings,
    instructions: fallbackInstructions,
    estimate: baseFallback,
  };

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  if (!secret?.value) {
    return NextResponse.json({ recipe: fallback, usedOpenAi: false, pageTextChars: evidence.pageTextChars, sourceRead: evidence.pageTextChars > 250 || evidenceIngredients.length > 0, note: `No OpenAI token is configured. Page evidence mode: ${evidence.evidenceMode || "unknown"}. Add a token to extract recipe pages automatically.` });
  }

  const budget = await checkAiRouteAllowed(supabase, user.id, "nutrition_recommendation");
  if (!budget.allowed) {
    return NextResponse.json({ recipe: fallback, usedOpenAi: false, pageTextChars: evidence.pageTextChars, sourceRead: evidence.pageTextChars > 250 || evidenceIngredients.length > 0, note: `${budget.reason} Resets at midnight.` });
  }

  const prompt = mode === "import"
    ? `You help a household nutrition app import public recipe pages with minimal user editing. Return ONLY valid JSON. Use the supplied page evidence first. If the structured recipe evidence includes ingredients or nutrition, treat those as the source of truth. Use web search only to fill missing pieces from the same public URL. Never output placeholder ingredients such as "main ingredient" or "ingredient".

Recipe source URL: ${sourceUrl || "none supplied"}
Recipe image URL supplied by user: ${imageUrl || "none supplied"}

Structured recipe evidence extracted server-side:
${evidence.recipeSummary || "(No JSON-LD recipe evidence found.)"}

Visible page text extracted server-side (${evidence.pageTextChars} characters):
${evidence.pageText || "(The server-rendered page text was sparse, so use web search for the exact public recipe page.)"}

Return JSON with this exact shape:
{
  "label": "string",
  "source_name": "string",
  "source_url": "string",
  "image_url": "string",
  "video_url": "string",
  "servings": number,
  "ingredients": [{"name":"string","quantity":"string","notes":"string"}],
  "instructions": ["string"],
  "prep_summary": "string",
  "notes": ["string"],
  "estimate": {
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
  }
}

Rules:
- Pull actual ingredients from the page. For example, do not return "main ingredient" for a carbonara recipe.
- If the page has nutrition values, use them as the best available per-serving anchor, then estimate the deeper fields that are missing.
- Keep recipe ingredients separate from instructions and return concise cooking steps in instructions.
- Pull the recipe image URL from the page when available.
- Prefer UK names and weights where possible.
- Mark confidence lower if nutrition has to be estimated from ingredients rather than published values.`
    : `You help a household nutrition app build recipe cards with minimal user input. Return ONLY valid JSON. Use your model knowledge to suggest realistic ingredients for the named dish. Never output placeholder ingredients such as "main ingredient" or "ingredient".

Recipe title: ${fallbackTitle}

Return JSON with this exact shape:
{
  "label": "string",
  "servings": number,
  "ingredients": [{"name":"string","quantity":"string","notes":"string"}],
  "instructions": ["string"],
  "prep_summary": "string",
  "notes": ["string"],
  "estimate": {
    "servings": 1,
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
  }
}

Rules:
- Provide between 4 and 16 actual likely ingredients.
- Favour ingredients that materially affect nutrition.
- Include specific variants when helpful, e.g. "5% beef mince", "wholewheat pasta", "0% Greek yoghurt", "Graham's Gold Top milk", "double espresso shot".
- For coffee drinks: ask for shot count/strength separately from volume where needed. A double espresso may still be around 30–60ml.
- For mince: include fat % when possible.
- For syrups/flavourings: flag sugar-free vs full-sugar and brand/source URL where possible.
- Estimate servings from the named dish if the user has not said a count; default to 1 only when genuinely unknown.
- Return concise cooking steps in instructions so the saved card tells the user how to make it.
- Estimate nutrition per 1 normal adult serving.
- Keep notes short and practical.`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
      body: JSON.stringify({
        model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
        tools: mode === "import" && sourceUrl ? [{ type: "web_search_preview" }] : undefined,
        input: prompt,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || "Recipe import failed");
    const parsed = parseJsonLoose(extractTextFromResponse(payload));
    if (!parsed || typeof parsed !== "object") throw new Error("Recipe import did not return JSON");

    const aiIngredients = Array.isArray((parsed as any).ingredients) ? (parsed as any).ingredients : [];
    const ingredients = cleanIngredients(aiIngredients, evidenceIngredients);
    if (ingredients.length < 2) throw new Error("Recipe import returned too few real ingredients.");

    const ingredientText = ingredients.map((item) => [item.quantity, item.name].filter(Boolean).join(" ").trim()).join("\n");
    const parsedInstructions = Array.isArray((parsed as any).instructions)
      ? (parsed as any).instructions.map((step: any) => cleanText(step, 500)).filter(Boolean).slice(0, 18)
      : fallbackInstructions;
    const parsedServings = Number((parsed as any).servings || (parsed as any).estimate?.servings || fallbackServings || 1);
    const estimateFallback = fallbackRecipeEstimate({
      label: cleanText((parsed as any).label || fallback.label, 180) || fallback.label,
      ingredients: ingredientText,
      notes: cleanText([((parsed as any).notes || []).join?.(" ") || sourceUrl || "", parsedInstructions.join("\n")].filter(Boolean).join("\n\n"), 2000),
      servings: parsedServings,
    });
    const jsonLdNutrition = recipeNutritionFromJsonLd(evidence.recipeJson);
    const estimate = normaliseRecipeEstimate({
      ...((parsed as any).estimate || {}),
      per_serving: {
        ...jsonLdNutrition,
        ...((parsed as any).estimate?.per_serving || {}),
      },
      ingredients_json: (parsed as any).estimate?.ingredients_json || ingredients,
    }, estimateFallback);

    const recipe = {
      label: cleanText((parsed as any).label || fallback.label, 180) || fallback.label,
      source_name: cleanText((parsed as any).source_name || (sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : "AI recipe suggestion"), 160),
      source_url: sourceUrl || cleanText((parsed as any).source_url || "", 1200),
      image_url: normaliseRecipeImageUrl((parsed as any).image_url, sourceUrl || "") || imageUrl || normaliseRecipeImageUrl(evidence.imageUrl, sourceUrl || "") || "",
      video_url: normaliseVideoUrl((parsed as any).video_url, sourceUrl || "") || (evidence as any).videoUrl || "",
      videos: Array.from(new Set([normaliseVideoUrl((parsed as any).video_url, sourceUrl || ""), (evidence as any).videoUrl, ...((evidence as any).videos || [])].filter(Boolean))).slice(0, 3),
      servings: parsedServings,
      instructions: parsedInstructions,
      prep_summary: cleanText((parsed as any).prep_summary || "", 400),
      ingredients,
      notes: Array.isArray((parsed as any).notes)
        ? (parsed as any).notes.slice(0, 8).map((item: any) => cleanText(item, 180)).filter(Boolean)
        : [mode === "import" ? "AI extracted this from the recipe page and available structured data." : "AI suggested these likely ingredients. Review before saving."],
      estimate,
    };

    await recordAiRouteUsage({ supabase, userId: user.id, tierKey: budget.tierKey, routeKey: "nutrition_recommendation", provider: "openai", model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini" });
    return NextResponse.json({
      recipe,
      estimate,
      usedOpenAi: true,
      pageTextChars: evidence.pageTextChars,
      sourceRead: evidence.pageTextChars > 250 || evidenceIngredients.length > 0,
      evidenceIngredients: evidenceIngredients.length,
      note: mode === "import"
        ? `AI extraction used ${evidenceIngredients.length ? `${evidenceIngredients.length} structured ingredient(s)` : "web/page evidence"}${Object.keys(jsonLdNutrition).length ? " and published nutrition anchors" : ""}. Evidence mode: ${evidence.evidenceMode || "static"}.`
        : "AI suggested ingredients and a first-pass nutrition estimate.",
    });
  } catch (error) {
    return NextResponse.json({
      recipe: fallback,
      estimate: fallback.estimate,
      usedOpenAi: false,
      pageTextChars: evidence.pageTextChars,
      sourceRead: evidence.pageTextChars > 250 || evidenceIngredients.length > 0,
      note: `AI extraction could not complete. ${error instanceof Error ? error.message : ""}`.trim(),
    });
  }
}
