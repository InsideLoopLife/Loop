import { parseAllergenFacts } from "@/lib/nutrition/v27_67/allergens";
import { fetchProductSourceSnapshot } from "@/lib/nutrition/v27_67/sourceHarvest";
import { normaliseProductType, sourceHost } from "./normalise";
import type { ProductEnrichmentResult, ProductImportNormalised } from "./types";

const NUMERIC_FACTS: Array<[keyof ProductImportNormalised, string, string]> = [
  ["calories", "Calories", "kcal"],
  ["protein_g", "Protein", "g"],
  ["carbs_g", "Carbohydrate", "g"],
  ["fat_g", "Fat", "g"],
  ["fibre_g", "Fibre", "g"],
  ["sugar_g", "Sugar", "g"],
  ["added_sugar_g", "Added sugar", "g"],
  ["saturated_fat_g", "Saturated fat", "g"],
  ["salt_g", "Salt", "g"],
  ["sodium_mg", "Sodium", "mg"],
  ["caffeine_mg", "Caffeine", "mg"],
  ["alcohol_g", "Alcohol", "g"],
  ["abv_percent", "ABV", "%"],
];

function n(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").replace(/,/g, "").replace(/[^0-9.\-]/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactString(value: unknown) {
  const text = String(value ?? "").trim();
  return text && text.toLowerCase() !== "nan" ? text : null;
}

function splitList(value?: string | null) {
  if (!value) return [];
  return value.split(/[|;,]/).map((v) => v.trim()).filter(Boolean);
}

function dietaryFlags(row: ProductImportNormalised) {
  const flags = new Set<string>(row.dietary_flags || []);
  const combined = `${row.product_name || ""} ${row.category || ""} ${row.category_path || ""} ${row.ingredients || ""}`.toLowerCase();

  if (row.product_type === "drink") flags.add("drink");
  if (row.is_alcohol || row.abv_percent || /alcohol|beer|wine|cider|vodka|gin|rum|whisky|whiskey|liqueur|prosecco|lager|ale/.test(combined)) flags.add("alcohol");
  if (/caffeine|coffee|espresso|energy drink|taurine|guarana/.test(combined) || Number(row.caffeine_mg || 0) > 0) flags.add("caffeine");
  if (/vegan/.test(combined)) flags.add("vegan");
  if (/vegetarian/.test(combined)) flags.add("vegetarian");
  if (/gluten[- ]?free/.test(combined)) flags.add("gluten-free");
  if (/protein/.test(combined) || Number(row.protein_g || 0) >= 8) flags.add("source of protein");
  if (Number(row.fibre_g || 0) >= 3) flags.add("source of fibre");
  if (Number(row.sugar_g || 0) === 0) flags.add("zero sugar");

  return [...flags].filter(Boolean);
}

function defaultCalories(row: ProductImportNormalised) {
  const text = `${row.product_name} ${row.category} ${row.ingredients}`.toLowerCase();
  if (row.calories != null) return { value: row.calories, estimated: false, confidence: row.nutrition_source_type === "source_page" ? 95 : 85 };
  if (/red bull sugar ?free|zero sugar cola|diet coke|coke zero/.test(text)) return { value: 8, estimated: true, confidence: 55 };
  if (/energy powder|gfuel|g fuel|sneak|x-gamer/.test(text)) return { value: 5, estimated: true, confidence: 55 };
  if (/protein bar|flapjack|cereal bar/.test(text)) return { value: 220, estimated: true, confidence: 45 };
  if (/coffee|espresso/.test(text) && !/latte|milk|cream|syrup/.test(text)) return { value: 5, estimated: true, confidence: 45 };
  return { value: null, estimated: true, confidence: 25 };
}

function mergeSource(row: ProductImportNormalised, source: Awaited<ReturnType<typeof fetchProductSourceSnapshot>> | null): ProductImportNormalised {
  if (!source) return row;
  return {
    ...row,
    product_name: row.product_name || source.formalName || "Unnamed product",
    formal_name: row.formal_name || source.formalName || row.product_name,
    source_url: row.source_url || source.sourceUrl,
    source_host: row.source_host || source.sourceHost || sourceHost(row.source_url),
    image_url: row.image_url || source.mainImageUrl || null,
    ingredients: row.ingredients || source.ingredientsText || null,
    allergens: row.allergens || source.allergensText || null,
    price: row.price ?? source.priceAmount ?? null,
    price_currency: row.price_currency || source.priceCurrency || "GBP",
    price_text: row.price_text || source.priceText || null,
    retailer: row.retailer || source.retailerName || source.sourceHost || null,
  };
}

async function aiStructuredEnrichment(row: ProductImportNormalised): Promise<Partial<ProductEnrichmentResult> | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `You are enriching a UK food/drink product database. Return strict JSON only. Do not claim allergens unless ingredient/allergen evidence supports it. Split may_contain from contains. Keep retailer source values where present. Product row: ${JSON.stringify(row)}`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.LOOP_PRODUCT_IMPORT_AI_MODEL || "gpt-4.1-mini",
        input: prompt,
        text: { format: { type: "json_object" } },
      }),
    });

    if (!response.ok) return null;
    const json = await response.json();
    const content =
      json.output_text ||
      json.output?.flatMap((item: any) => item.content || [])?.map((part: any) => part.text || "").join("") ||
      "";
    if (!content) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function enrichProductRow(row: ProductImportNormalised): Promise<ProductEnrichmentResult> {
  let source: Awaited<ReturnType<typeof fetchProductSourceSnapshot>> | null = null;
  const warnings: string[] = [...(Array.isArray((row as any).warnings) ? (row as any).warnings : [])];

  // If import package already carries source snapshot values, avoid hammering retailer pages.
  const hasImportedSourceSnapshot = Boolean(row.source_snapshot && Object.keys(row.source_snapshot).length);

  if (row.source_url && !hasImportedSourceSnapshot && (!row.image_url || !row.ingredients || row.price == null)) {
    try {
      source = await fetchProductSourceSnapshot(row.source_url);
    } catch (error: any) {
      warnings.push(`Source fetch failed: ${error?.message || "unknown error"}`);
    }
  }

  const merged = mergeSource(row, source);
  const ai = await aiStructuredEnrichment(merged);

  const calories = ai?.calories != null ? n(ai.calories) : defaultCalories(merged).value ?? n(merged.calories);
  const calorieConfidence = merged.calories != null ? (merged.nutrition_source_type === "source_page" ? 95 : 80) : defaultCalories(merged).confidence;

  const facts = NUMERIC_FACTS.map(([key, label, unit]) => {
    const imported = n((merged as any)[key]);
    const aiValue = n((ai as any)?.[key]);
    const value = aiValue ?? imported;
    const estimated = imported == null && aiValue != null;
    return {
      fact_key: String(key),
      fact_label: label,
      value_numeric: value,
      value_text: null,
      unit,
      source_kind: imported != null ? "import" as const : estimated ? "ai_estimate" as const : "import" as const,
      source_url: merged.source_url || null,
      confidence: key === "calories" ? calorieConfidence : imported != null ? (merged.nutrition_source_type === "source_page" ? 92 : 75) : 35,
      is_estimated: imported == null,
      notes: imported == null ? "Missing in import; estimated or left blank." : "Imported from product spreadsheet/source package.",
    };
  }).filter((fact) => fact.value_numeric != null);

  if (calories == null) warnings.push("Calories missing or could not be estimated confidently.");
  if (!merged.ingredients) warnings.push("Ingredients missing; allergen and micronutrient confidence will be low.");
  if (merged.image_harvest_mode && !merged.image_url) warnings.push("Image missing; queued for source-page image harvest.");
  if (merged.product_type === "drink" && !merged.serving_ml && !merged.prepared_volume_ml) warnings.push("Drink is missing serving_ml/prepared_volume_ml.");

  const allergenFacts = parseAllergenFacts({
    ingredientsText: merged.ingredients,
    allergensText: `${merged.allergens || ""}\n${merged.may_contain ? `May contain ${merged.may_contain}` : ""}`,
    sourceUrl: merged.source_url,
  });

  const confidence = Math.max(
    1,
    Math.min(100, Number(merged.confidence || merged.estimate_confidence || ai?.confidence || (warnings.length ? 62 : 85)))
  );

  const dataQuality =
    merged.is_verified ? "verified" :
    warnings.length || confidence < 65 ? "needs_review" :
    merged.nutrition_source_type === "estimated_from_product_class" ? "estimated" :
    "imported";

  return {
    ...merged,
    product_type: normaliseProductType(merged.product_type || merged.category || merged.product_name),
    product_name: merged.product_name || ai?.product_name || "Unnamed product",
    formal_name: merged.formal_name || ai?.formal_name || merged.product_name || null,
    source_host: merged.source_host || sourceHost(merged.source_url),
    calories,
    protein_g: ai?.protein_g != null ? n(ai.protein_g) : n(merged.protein_g),
    carbs_g: ai?.carbs_g != null ? n(ai.carbs_g) : n(merged.carbs_g),
    fat_g: ai?.fat_g != null ? n(ai.fat_g) : n(merged.fat_g),
    fibre_g: ai?.fibre_g != null ? n(ai.fibre_g) : n(merged.fibre_g),
    sugar_g: ai?.sugar_g != null ? n(ai.sugar_g) : n(merged.sugar_g),
    added_sugar_g: ai?.added_sugar_g != null ? n(ai.added_sugar_g) : n(merged.added_sugar_g),
    saturated_fat_g: ai?.saturated_fat_g != null ? n(ai.saturated_fat_g) : n(merged.saturated_fat_g),
    salt_g: ai?.salt_g != null ? n(ai.salt_g) : n(merged.salt_g),
    sodium_mg: ai?.sodium_mg != null ? n(ai.sodium_mg) : n(merged.sodium_mg),
    caffeine_mg: ai?.caffeine_mg != null ? n(ai.caffeine_mg) : n(merged.caffeine_mg),
    price: ai?.price != null ? n(ai.price) : n(merged.price),
    retailer: compactString(merged.retailer) || compactString(merged.source_host),
    confidence,
    data_quality_status: dataQuality,
    dietary_flags: dietaryFlags(merged),
    contains_allergens: [
      ...splitList(merged.allergens),
      ...allergenFacts.filter((fact) => fact.presence === "contains").map((fact) => fact.allergen_label),
    ],
    may_contain_allergens: [
      ...splitList(merged.may_contain),
      ...allergenFacts.filter((fact) => fact.presence === "may_contain").map((fact) => fact.allergen_label),
    ],
    facts,
    warnings: [...new Set(warnings)],
  };
}
