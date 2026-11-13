import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { checkAiRouteAllowed, recordAiRouteUsage } from "@/lib/ai/route-budget";
import { cleanBarcode, enrichCandidate, looksLikeBarcode, mapOpenFoodFactsProduct, normaliseAiProductCandidate, type ProductLookupCandidate } from "@/lib/nutrition/product-data";
import { referenceCandidates } from "@/lib/nutrition/reference-foods";
import { expandBrandQuery, looksBranded, parseQuantity, textRelevance } from "@/lib/nutrition/food-search";
import { fallbackRecipeEstimate, normaliseRecipeEstimate } from "@/lib/nutrition/scoring";
import { cleanText, compactJson } from "@/lib/security/external-data";
import { enforceUserRateLimit } from "@/lib/security/rate-limit";

const OFF_FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "generic_name",
  "generic_name_en",
  "brands",
  "quantity",
  "product_quantity",
  "serving_quantity",
  "serving_size",
  "serving_quantity_unit",
  "image_url",
  "image_small_url",
  "image_front_url",
  "image_front_small_url",
  "ingredients_text",
  "ingredients_text_en",
  "ingredients_text_with_allergens",
  "ingredients_text_with_allergens_en",
  "allergens_tags",
  "traces_tags",
  "nutriscore_grade",
  "nutriscore_score",
  "nutriments",
].join(",");

function jsonError(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

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


function relevance(candidate: ProductLookupCandidate, query: string) {
  const text = `${candidate.brand_name || ""} ${candidate.label}`;
  const ukBoost = /tesco|sainsbury|asda|morrisons|waitrose|ocado|aldi|lidl|iceland|greggs|costa|boots|superdrug|\buk\b|great britain|united kingdom/i.test(`${candidate.source_url || ""} ${candidate.source_label || ""} ${candidate.brand_name || ""}`) ? 0.1 : 0;
  return textRelevance(query, text) + ukBoost;
}

function rowToCandidate(row: any, source: "meal_card" | "ingredient_db"): ProductLookupCandidate | null {
  const label = cleanText(row?.label || row?.product_name || "", 180);
  if (!label) return null;
  const rawLookup = row?.product_lookup_json || row?.lookup_json;
  if (rawLookup && typeof rawLookup === "object" && rawLookup.label && rawLookup.estimate) {
    return {
      ...(rawLookup as ProductLookupCandidate),
      source: source === "ingredient_db" ? "household_cache" : ((rawLookup as ProductLookupCandidate).source || "household_cache"),
      source_label: source === "ingredient_db" ? "Your saved ingredient/product" : "Your saved card",
      data_confidence: Number(row?.data_confidence ?? row?.product_data_confidence ?? (rawLookup as ProductLookupCandidate).data_confidence ?? 70),
    };
  }
  const fallback = fallbackRecipeEstimate({ label, servings: 1, ingredients: cleanText(row?.ingredients_text || row?.ingredients || label, 3000), notes: cleanText(row?.brand_name || "", 300) });
  const estimate = normaliseRecipeEstimate({
    servings: 1,
    confidence: Number(row?.data_confidence ?? row?.product_data_confidence ?? row?.nutrition_confidence ?? 60),
    confidence_reason: source === "ingredient_db" ? "Found in the reusable ingredient/product database." : "Found in your saved LoopHealth cards.",
    health_score: Number(row?.nutrition_score ?? fallback.health_score ?? 0),
    image_prompt: row?.image_prompt || `Food image for ${label}`,
    ingredients_json: Array.isArray(row?.ingredients_json) ? row.ingredients_json : fallback.ingredients_json,
    per_serving: {
      calories: Number(row?.calories || 0), protein_g: Number(row?.protein_g || 0), carbs_g: Number(row?.carbs_g || 0), fat_g: Number(row?.fat_g || 0), fibre_g: Number(row?.fibre_g || 0), sugar_g: Number(row?.sugar_g || 0), salt_g: Number(row?.salt_g || 0), saturated_fat_g: Number(row?.saturated_fat_g || 0), caffeine_mg: Number(row?.caffeine_mg || 0),
    },
    allergen_flags: Array.isArray(row?.allergen_flags) ? row.allergen_flags : [],
    dietary_flags: Array.isArray(row?.dietary_flags) ? row.dietary_flags : [],
    assumptions: [source === "ingredient_db" ? "Reused from a previously captured ingredient/product." : "Reused from a saved LoopHealth card."],
  }, fallback);
  return {
    source: "household_cache",
    source_label: source === "ingredient_db" ? "Your saved ingredient/product" : "Your saved card",
    source_url: row?.source_url || row?.product_source_url || null,
    barcode: row?.barcode || null,
    gtin: row?.gtin || row?.barcode || null,
    label,
    brand_name: row?.brand_name || null,
    image_url: row?.image_url || row?.product_image_url || null,
    ingredients_text: row?.ingredients_text || row?.ingredients || null,
    serving_label: row?.serving_label || "Saved serving",
    package_quantity: row?.package_quantity || null,
    data_confidence: Number(row?.data_confidence ?? row?.product_data_confidence ?? row?.nutrition_confidence ?? 60),
    confidence_reason: estimate.confidence_reason,
    raw: { id: row?.id, source },
    estimate,
  };
}

async function searchSavedCards(supabase: any, userId: string, query: string) {
  const safeQuery = query.replace(/[%_]/g, " ");
  const { data } = await supabase
    .from("meals")
    .select("id, label, source_url, image_url, image_prompt, barcode, gtin, brand_name, product_data_source, product_data_confidence, product_image_url, product_source_url, product_lookup_json, nutrition_score, nutrition_confidence, calories, protein_g, carbs_g, fat_g, fibre_g, sugar_g, salt_g, saturated_fat_g, caffeine_mg, ingredients, ingredients_json, allergen_flags, dietary_flags")
    .ilike("label", `%${safeQuery}%`)
    .eq("user_id", userId)
    .limit(10);
  return (data || []).map((row: any) => rowToCandidate(row, "meal_card")).filter(Boolean) as ProductLookupCandidate[];
}

async function searchIngredientDb(supabase: any, userId: string, query: string) {
  const safeQuery = query.replace(/[%_]/g, " ");
  try {
    const [own, global] = await Promise.all([
      supabase
        .from("nutrition_ingredients")
        .select("id, label, brand_name, source_url, image_url, source_type, data_confidence, serving_label, ingredients_text, ingredients_json, nutrition_json, allergen_flags, dietary_flags, calories, protein_g, carbs_g, fat_g, fibre_g, sugar_g, salt_g, saturated_fat_g, caffeine_mg, use_count")
        .eq("user_id", userId)
        .ilike("label", `%${safeQuery}%`)
        .order("use_count", { ascending: false })
        .limit(10),
      hasSupabaseAdminKey()
        ? createAdminClient()
            .from("nutrition_global_product_catalog")
            .select("product_name, brand_name, source, source_url, image_url, ingredients_text, serving_label, package_quantity, data_confidence, lookup_json, last_seen_at")
            .ilike("product_name", `%${safeQuery}%`)
            .order("data_confidence", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const ownCandidates = (own.data || []).map((row: any) => rowToCandidate(row, "ingredient_db")).filter(Boolean) as ProductLookupCandidate[];
    const globalCandidates = (global.data || []).filter((row: any) => !(/^ai_/.test(String(row?.source || "")) && Number(row?.data_confidence || 0) < 50)).map((row: any) => cacheCandidateFromRow({ ...row, lookup_json: row.lookup_json }, "global_cache")).filter(Boolean) as ProductLookupCandidate[];
    return [...ownCandidates, ...globalCandidates];
  } catch {
    return [] as ProductLookupCandidate[];
  }
}

function cacheCandidateFromRow(row: any, source: "household_cache" | "global_cache"): ProductLookupCandidate | null {
  const lookup = row?.lookup_json;
  if (!lookup || typeof lookup !== "object") return null;
  const candidate = lookup as ProductLookupCandidate;
  if (!candidate.label || !candidate.estimate) return null;
  return {
    ...candidate,
    source,
    source_label: source === "global_cache" ? "Shared product cache" : "Your saved product cache",
    data_confidence: Math.max(0, Math.min(100, Number(row?.data_confidence ?? candidate.data_confidence ?? 0))),
  };
}

async function searchHouseholdCache(supabase: any, userId: string, query: string) {
  const barcode = cleanBarcode(query);
  const selectFields = "product_name, brand_name, barcode, gtin, data_confidence, lookup_json, updated_at";
  let rows: any[] = [];

  if (looksLikeBarcode(query)) {
    const [barcodeResult, gtinResult] = await Promise.all([
      supabase.from("nutrition_product_catalog").select(selectFields).eq("user_id", userId).eq("barcode", barcode).limit(5),
      supabase.from("nutrition_product_catalog").select(selectFields).eq("user_id", userId).eq("gtin", barcode).limit(5),
    ]);
    rows = [...(barcodeResult.data || []), ...(gtinResult.data || [])];
  } else {
    const safeQuery = query.replace(/[%_]/g, " ");
    const [nameResult, brandResult] = await Promise.all([
      supabase.from("nutrition_product_catalog").select(selectFields).eq("user_id", userId).ilike("product_name", `%${safeQuery}%`).order("data_confidence", { ascending: false }).limit(5),
      supabase.from("nutrition_product_catalog").select(selectFields).eq("user_id", userId).ilike("brand_name", `%${safeQuery}%`).order("data_confidence", { ascending: false }).limit(5),
    ]);
    rows = [...(nameResult.data || []), ...(brandResult.data || [])];
  }

  return rows.map((row: any) => cacheCandidateFromRow(row, "household_cache")).filter(Boolean) as ProductLookupCandidate[];
}

async function searchGlobalCache(supabase: any, query: string) {
  const client = hasSupabaseAdminKey() ? createAdminClient() : supabase;
  const barcode = cleanBarcode(query);
  const selectFields = "product_name, brand_name, barcode, gtin, data_confidence, lookup_json, updated_at";
  let rows: any[] = [];

  if (looksLikeBarcode(query)) {
    const [barcodeResult, gtinResult] = await Promise.all([
      client.from("nutrition_global_product_catalog").select(selectFields).eq("barcode", barcode).limit(8),
      client.from("nutrition_global_product_catalog").select(selectFields).eq("gtin", barcode).limit(8),
    ]);
    rows = [...(barcodeResult.data || []), ...(gtinResult.data || [])];
  } else {
    const safeQuery = query.replace(/[%_]/g, " ");
    const [nameResult, brandResult] = await Promise.all([
      client.from("nutrition_global_product_catalog").select(selectFields).ilike("product_name", `%${safeQuery}%`).order("data_confidence", { ascending: false }).limit(8),
      client.from("nutrition_global_product_catalog").select(selectFields).ilike("brand_name", `%${safeQuery}%`).order("data_confidence", { ascending: false }).limit(8),
    ]);
    rows = [...(nameResult.data || []), ...(brandResult.data || [])];
  }

  return rows
    .filter((row: any) => !(/^ai_/.test(String(row?.lookup_json?.source || "")) && Number(row?.data_confidence || 0) < 50))
    .map((row: any) => cacheCandidateFromRow(row, "global_cache"))
    .filter(Boolean) as ProductLookupCandidate[];
}

async function fetchOpenFoodFactsByBarcode(barcode: string) {
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${encodeURIComponent(OFF_FIELDS)}`, {
    headers: { "User-Agent": "LoopHealthPrivateBeta/0.2 (private household nutrition lookup; contact: app owner)" },
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  const candidate = payload?.product ? mapOpenFoodFactsProduct(payload.product) : null;
  return candidate ? [candidate] : [];
}

async function searchOpenFoodFactsHost(query: string, host: string, sourceLabel: string, ukFilter = false) {
  const url = new URL(`${host}/cgi/search.pl`);
  url.searchParams.set("search_terms", query);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "10");
  url.searchParams.set("fields", OFF_FIELDS);
  if (ukFilter) {
    url.searchParams.set("tagtype_0", "countries");
    url.searchParams.set("tag_contains_0", "contains");
    url.searchParams.set("tag_0", "United Kingdom");
  }
  const response = await fetch(url.toString(), {
    headers: { "User-Agent": "LoopHealthPrivateBeta/0.2 (private household nutrition lookup; contact: app owner)" },
    next: { revalidate: 60 * 60 * 12 },
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  return (Array.isArray(payload?.products) ? payload.products : [])
    .map(mapOpenFoodFactsProduct)
    .filter(Boolean)
    .map((candidate: ProductLookupCandidate) => ({ ...candidate, source: sourceLabel.includes("UK") ? "open_food_facts_uk" : candidate.source, source_label: sourceLabel }))
    .slice(0, 8) as ProductLookupCandidate[];
}

async function searchOpenFoodFacts(query: string) {
  const [ukScoped, ukHost, world] = await Promise.all([
    searchOpenFoodFactsHost(query, "https://world.openfoodfacts.org", "Open Food Facts UK-filtered", true),
    searchOpenFoodFactsHost(query, "https://uk.openfoodfacts.org", "Open Food Facts UK"),
    searchOpenFoodFactsHost(query, "https://world.openfoodfacts.org", "Open Food Facts global"),
  ]);
  return [...ukScoped, ...ukHost, ...world];
}

async function searchWithOpenAi(supabase: any, userId: string, query: string) {
  const secret = await getActiveIntegrationSecret(supabase, userId, "openai");
  if (!secret?.value) return [];
  const budget = await checkAiRouteAllowed(supabase, userId, "product_enrichment");
  if (!budget.allowed) return [];
  const barcode = cleanBarcode(query);
  const prompt = `Find likely UK packaged-food or drink product data for: "${query}".

${barcode ? `The query is a barcode/GTIN candidate: ${barcode}. Search the exact barcode first. If it is missing from Open Food Facts, search the wider web for that barcode and the likely product name. Do not invent a different barcode.` : "The query is a product name. Search the exact product phrase first, then close UK equivalents."}

Priority source order:
1. brand/manufacturer product pages,
2. UK retailer pages such as Tesco, Sainsbury's, Asda, Morrisons, Waitrose, Ocado, Aldi, Lidl, Iceland, Boots or Superdrug,
3. Open Food Facts / GS1 / barcode databases,
4. reputable nutrition/product listings.

Return ONLY JSON with a candidates array. This is for a private food diary. Include source_url, product image URL if clearly available, ingredients_text and nutrition per serving/per 100g where available. Be transparent if confidence is low. Include caffeine/vitamin data for energy drinks or powders where available. Shape: {"candidates":[{"label":"","brand_name":"","barcode":"","gtin":"","source_url":"","image_url":"","ingredients_text":"","serving_label":"","package_quantity":"","data_confidence":0,"confidence_reason":"","estimate":{"servings":1,"confidence":0,"confidence_reason":"","processing_level":"low|medium|high|unknown","health_score":0,"image_prompt":"","ingredients_json":[{"name":"","quantity":"","notes":""}],"ingredient_ratio_json":[{"name":"","percentage":0,"role":"","confidence":0}],"per_serving":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fibre_g":0,"soluble_fibre_g":0,"insoluble_fibre_g":0,"sugar_g":0,"added_sugar_g":0,"natural_sugar_g":0,"salt_g":0,"saturated_fat_g":0,"trans_fat_g":0,"monounsaturated_fat_g":0,"polyunsaturated_fat_g":0,"sodium_mg":0,"potassium_mg":0,"calcium_mg":0,"iron_mg":0,"magnesium_mg":0,"zinc_mg":0,"folate_ug":0,"niacin_mg":0,"thiamin_mg":0,"vitamin_c_mg":0,"vitamin_d_ug":0,"vitamin_b12_ug":0,"omega_3_g":0,"caffeine_mg":0,"energy_density_kcal_per_g":0,"glycemic_impact_score":0},"allergen_flags":[],"dietary_flags":[],"manufacturing_notes":[],"micronutrient_notes":[],"assumptions":[]}}]}`;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
      body: JSON.stringify({
        model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
        tools: [{ type: "web_search_preview" }],
        input: prompt,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return [];
    const parsed = parseJsonLoose(extractTextFromResponse(payload));
    const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    if (candidates.length) await recordAiRouteUsage({ supabase, userId, tierKey: budget.tierKey, routeKey: "product_enrichment", provider: "openai", model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini" });
    return candidates.map((item: any) => normaliseAiProductCandidate(item, query)).filter(Boolean).slice(0, 5) as ProductLookupCandidate[];
  } catch {
    return [];
  }
}

function dedupeCandidates(candidates: ProductLookupCandidate[], query = "") {
  const seen = new Set<string>();
  const output: ProductLookupCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.gtin || candidate.barcode || ""}:${candidate.label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(enrichCandidate({ ...candidate, raw: compactJson(candidate.raw || {}, 35_000) }));
  }
  const rank = (candidate: ProductLookupCandidate) => relevance(candidate, query) * 100 + Number(candidate.data_confidence || 0) * 0.5 - (candidate.quality_flags?.includes("energy_mismatch") ? 40 : 0) - (candidate.quality_flags?.includes("low_confidence_ai") ? 30 : 0);
  return output.sort((a, b) => rank(b) - rank(a)).slice(0, 10);
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 20_000) return jsonError("Product lookup request is too large.", 413);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return jsonError("Not signed in", 401);

  const body = await request.json().catch(() => ({}));
  const query = cleanText(body.query || body.barcode || "", 180);
  if (!query) return jsonError("Enter a barcode, GTIN, product name or retailer product URL.", 400);

  const generalLimit = await enforceUserRateLimit({ userId: user.id, bucket: "nutrition_product_lookup", limit: 80, windowSeconds: 60 * 60 });
  if (!generalLimit.allowed) {
    return jsonError("Too many product lookups. Try again shortly.", 429, { resetAt: generalLimit.resetAt });
  }

  const hint = parseQuantity(query);
  const searchText = looksLikeBarcode(query) ? query : hint.text;
  const reference = looksLikeBarcode(query) ? { best: 0, candidates: [] as ProductLookupCandidate[] } : referenceCandidates(query, 6);
  const branded = looksBranded(searchText);
  const strongReference = reference.best >= 1.45 && !branded;

  const candidates: ProductLookupCandidate[] = [];
  candidates.push(...await searchSavedCards(supabase, user.id, searchText));
  candidates.push(...await searchIngredientDb(supabase, user.id, searchText));
  candidates.push(...await searchHouseholdCache(supabase, user.id, searchText));
  candidates.push(...await searchGlobalCache(supabase, searchText));

  const wantExternal = Boolean(body.refreshExternal) || Boolean(body.deepResearch);
  if (looksLikeBarcode(query)) {
    if (candidates.length < 2 || wantExternal) candidates.push(...await fetchOpenFoodFactsByBarcode(cleanBarcode(query)));
  } else if (wantExternal || (!strongReference && candidates.length < 3)) {
    candidates.push(...await searchOpenFoodFacts(expandBrandQuery(searchText)));
  }

  let sorted = dedupeCandidates(candidates, searchText);
  const bestRelevance = sorted.length ? Math.max(...sorted.map((candidate) => relevance(candidate, searchText))) : 0;
  const shouldWebResearch = Boolean(body.deepResearch) || (!strongReference && reference.best < 1.2 && (sorted.length === 0 || bestRelevance < 0.55));
  if (shouldWebResearch) {
    const aiLimit = await enforceUserRateLimit({ userId: user.id, bucket: "nutrition_retailer_research", limit: 25, windowSeconds: 60 * 60 * 24 });
    if (aiLimit.allowed) candidates.push(...await searchWithOpenAi(supabase, user.id, expandBrandQuery(searchText)));
  }

  sorted = dedupeCandidates(candidates, searchText);
  // Low-confidence AI guesses only show when there's nothing better.
  const trustworthy = sorted.filter((candidate) => !candidate.quality_flags?.includes("low_confidence_ai"));
  const external = (trustworthy.length || reference.candidates.length ? trustworthy : sorted).map((candidate) => {
    if (candidate.suggested_amount != null || candidate.base_amount == null) return candidate;
    const amount = hint.amount ?? (hint.count && candidate.serving_known ? Math.round(candidate.base_amount * hint.count * 10) / 10 : null);
    return amount ? { ...candidate, suggested_amount: amount } : candidate;
  });
  const everyday = reference.candidates.map(enrichCandidate);
  const yours = external.filter((candidate) => candidate.result_group === "yours");
  const brandedResults = external.filter((candidate) => candidate.result_group !== "yours");
  const groupList = [
    { key: "yours", label: "Your foods", note: "Things you've logged or saved before", candidates: yours },
    { key: "everyday", label: "Everyday foods", note: "UK government reference data — per 100g/ml, pick a portion", candidates: everyday },
    { key: "branded", label: "Branded & shop products", note: "From pack labels — check the details match yours", candidates: brandedResults },
  ].filter((group) => group.candidates.length);
  if (branded) groupList.sort((a, b) => (a.key === "branded" ? -1 : 0) - (b.key === "branded" ? -1 : 0));
  const ordered = groupList.flatMap((group) => group.candidates);

  return NextResponse.json({
    candidates: ordered,
    groups: groupList,
    quantity: hint.amount || hint.count ? { amount: hint.amount, count: hint.count, unit: hint.unit } : null,
    canSearchBrands: !wantExternal && strongReference,
    rateLimit: { remaining: generalLimit.remaining, resetAt: generalLimit.resetAt },
    autoWebResearch: shouldWebResearch,
    sources: ["Your saved foods", "UK government reference data (CoFID)", "Shared product data", "Open Food Facts UK/global", "AI retailer/manufacturer web research when nothing else matches"],
    note: ordered.length
      ? (shouldWebResearch ? "Nothing close enough in the food databases, so Loop also checked shop and brand websites. Check the label before relying on it." : "Pick the closest match, then choose how much you had.")
      : "No match yet. Try fewer words, check spelling, or add a product URL or label photo.",
  });
}
