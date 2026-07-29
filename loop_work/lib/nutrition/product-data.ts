import { fallbackRecipeEstimate, normaliseRecipeEstimate, scoreMeal, type NutritionTotals, type RecipeEstimate } from "@/lib/nutrition/scoring";
import { cleanText, compactJson, safeExternalUrl } from "@/lib/security/external-data";

export type ProductDataSource = "open_food_facts" | "open_food_facts_uk" | "retailer_web" | "manual_label" | "ai_research" | "user_verified" | "global_cache" | "household_cache" | "ingredient_url_import" | "restaurant_menu_import" | "product_search" | "ai_freehand";

export type ProductLookupCandidate = {
  source: ProductDataSource;
  source_label: string;
  source_url?: string | null;
  barcode?: string | null;
  gtin?: string | null;
  label: string;
  card_kind?: string | null;
  brand_name?: string | null;
  image_url?: string | null;
  ingredients_text?: string | null;
  serving_label?: string | null;
  package_quantity?: string | null;
  data_confidence: number;
  confidence_reason: string;
  raw?: unknown;
  estimate: RecipeEstimate;
};

const zeroProductTotals: NutritionTotals = {
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  fibre_g: 0,
  soluble_fibre_g: 0,
  insoluble_fibre_g: 0,
  sugar_g: 0,
  added_sugar_g: 0,
  natural_sugar_g: 0,
  salt_g: 0,
  saturated_fat_g: 0,
  trans_fat_g: 0,
  monounsaturated_fat_g: 0,
  polyunsaturated_fat_g: 0,
  sodium_mg: 0,
  potassium_mg: 0,
  calcium_mg: 0,
  iron_mg: 0,
  magnesium_mg: 0,
  zinc_mg: 0,
  folate_ug: 0,
  niacin_mg: 0,
  thiamin_mg: 0,
  vitamin_c_mg: 0,
  vitamin_d_ug: 0,
  vitamin_b12_ug: 0,
  omega_3_g: 0,
  caffeine_mg: 0,
  energy_density_kcal_per_g: 0,
  glycemic_impact_score: 0,
};

function asText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return cleanText(value, 2000) || fallback;
}


function cleanProductTitle(value: unknown, fallback = "") {
  const raw = asText(value, fallback).trim();
  if (!raw) return asText(fallback, "").trim();
  const withoutQuery = raw.replace(/\?.*$/, "");
  if (/^https?:\/\//i.test(raw) || /^www\./i.test(raw) || raw.includes("/products/")) {
    try {
      const url = new URL(raw.startsWith("www.") ? `https://${raw}` : raw);
      const slug = url.pathname.split("/").filter(Boolean).pop() || "";
      const cleaned = slug.replace(/[-_]+/g, " ").replace(/\buk\b/gi, "").replace(/\b\d+g\b/gi, "").replace(/\s+/g, " ").trim();
      if (cleaned && cleaned.length > 3) return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
    } catch {}
    const slug = withoutQuery.split("/").filter(Boolean).pop() || "";
    const cleaned = slug.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    if (cleaned && cleaned.length > 3) return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return raw.replace(/^https?:\/\/[^\s]+\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function asNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function cleanBarcode(value: unknown) {
  return String(value || "").replace(/\D/g, "").slice(0, 18);
}

export function looksLikeBarcode(value: unknown) {
  const barcode = cleanBarcode(value);
  return /^\d{8,18}$/.test(barcode);
}

function openFoodFactsUrlForBarcode(barcode: string) {
  return `https://world.openfoodfacts.org/product/${encodeURIComponent(barcode)}`;
}

function compactSourceProduct(product: any) {
  return compactJson({
    code: product?.code || product?._id || product?.id,
    product_name: product?.product_name_en || product?.product_name,
    brands: product?.brands,
    quantity: product?.quantity,
    serving_quantity: product?.serving_quantity,
    image_front_url: product?.image_front_url,
    ingredients_text: product?.ingredients_text_en || product?.ingredients_text,
    allergens_tags: Array.isArray(product?.allergens_tags) ? product.allergens_tags.slice(0, 30) : [],
    traces_tags: Array.isArray(product?.traces_tags) ? product.traces_tags.slice(0, 30) : [],
    nutriments: product?.nutriments || {},
  }, 35_000);
}

function productTextList(product: any, keys: string[]) {
  for (const key of keys) {
    const value = product?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function productImage(product: any) {
  return safeExternalUrl(productTextList(product, ["image_front_url", "image_url", "image_front_small_url", "image_small_url"]));
}

function nutriment(nutriments: Record<string, unknown>, base: string, scale: number, fallback = 0) {
  const serving = asNumber(nutriments?.[`${base}_serving`], NaN);
  if (Number.isFinite(serving)) return serving;
  const per100g = asNumber(nutriments?.[`${base}_100g`], NaN);
  if (Number.isFinite(per100g)) return per100g * scale;
  const plain = asNumber(nutriments?.[base], NaN);
  return Number.isFinite(plain) ? plain * scale : fallback;
}

function nutrientMg(nutriments: Record<string, unknown>, base: string, scale: number) {
  const value = nutriment(nutriments, base, scale, 0);
  const unit = String(nutriments?.[`${base}_unit`] || "").toLowerCase();
  if (unit === "g") return value * 1000;
  if (unit === "µg" || unit === "ug") return value / 1000;
  return value;
}

function nutrientUg(nutriments: Record<string, unknown>, base: string, scale: number) {
  const value = nutriment(nutriments, base, scale, 0);
  const unit = String(nutriments?.[`${base}_unit`] || "").toLowerCase();
  if (unit === "mg") return value * 1000;
  if (unit === "g") return value * 1_000_000;
  return value;
}

function inferAddedSugar(totalSugar: number, ingredients: string) {
  if (!totalSugar) return 0;
  const text = ingredients.toLowerCase();
  if (/sugar|glucose|syrup|dextrose|sucrose|fructose syrup|maltodextrin|invert sugar|honey/.test(text)) return round(totalSugar * 0.75, 2);
  if (/fruit|milk|yoghurt|yogurt|lactose/.test(text)) return round(totalSugar * 0.15, 2);
  return round(totalSugar * 0.4, 2);
}

function inferFibreSplit(totalFibre: number, ingredients: string) {
  const text = ingredients.toLowerCase();
  if (!totalFibre) return { soluble_fibre_g: 0, insoluble_fibre_g: 0 };
  const solubleRatio = /oat|barley|bean|lentil|chickpea|apple|citrus|psyllium/.test(text) ? 0.42 : /wheat|flour|bran|bread|pastry|croissant/.test(text) ? 0.18 : 0.28;
  return { soluble_fibre_g: round(totalFibre * solubleRatio, 2), insoluble_fibre_g: round(totalFibre * (1 - solubleRatio), 2) };
}

function inferFatSplit(totalFat: number, saturated: number, trans: number, nutriments: Record<string, unknown>, scale: number) {
  const mono = nutriment(nutriments, "monounsaturated-fat", scale, 0) || nutriment(nutriments, "monounsaturated_fat", scale, 0);
  const poly = nutriment(nutriments, "polyunsaturated-fat", scale, 0) || nutriment(nutriments, "polyunsaturated_fat", scale, 0);
  if (mono || poly) return { monounsaturated_fat_g: round(mono, 2), polyunsaturated_fat_g: round(poly, 2) };
  const unsat = Math.max(0, totalFat - saturated - trans);
  return { monounsaturated_fat_g: round(unsat * 0.62, 2), polyunsaturated_fat_g: round(unsat * 0.38, 2) };
}

function allergenTags(product: any, ingredients: string) {
  const raw = [
    ...(Array.isArray(product?.allergens_tags) ? product.allergens_tags : []),
    ...(Array.isArray(product?.traces_tags) ? product.traces_tags.map((item: string) => `possible ${item}`) : []),
  ].map((item) => String(item).replace(/^en:/, "").replace(/-/g, " ").trim()).filter(Boolean);
  const text = ingredients.toLowerCase();
  if (/wheat|gluten|barley|rye|oat/.test(text)) raw.push("gluten");
  if (/milk|butter|cheese|whey|lactose|yoghurt|yogurt/.test(text)) raw.push("dairy");
  if (/egg/.test(text)) raw.push("egg");
  if (/soy|soya/.test(text)) raw.push("soy");
  if (/(\bpeanut\b|\balmond\b|\bhazelnut\b|\bcashew\b|\bwalnut\b|\bpecan\b|\bpistachio\b|brazil nut|tree nut|\bnuts?\b)/.test(text)) raw.push("nuts");
  return Array.from(new Set(raw)).slice(0, 12);
}

function dietaryFlags(totals: NutritionTotals, ingredients: string) {
  const flags: string[] = [];
  if (totals.salt_g > 1.5) flags.push("high salt");
  if (totals.added_sugar_g > 8) flags.push("added sugar");
  if (totals.saturated_fat_g > 7) flags.push("high saturated fat");
  if (totals.energy_density_kcal_per_g > 3.5) flags.push("energy dense");
  if (totals.glycemic_impact_score > 70) flags.push("higher glycemic impact");
  if (totals.caffeine_mg > 0) flags.push("caffeine");
  if (/emulsifier|stabiliser|preservative|colour|flavouring|maltodextrin|hydrogenated/i.test(ingredients)) flags.push("processed ingredients");
  return Array.from(new Set(flags));
}

function glycemicImpact(totals: NutritionTotals, ingredients: string) {
  const carbs = totals.carbs_g;
  if (!carbs) return 0;
  let impact = /wholegrain|oat|bean|lentil|chickpea/i.test(ingredients) ? 48 : 68;
  impact += clamp(totals.added_sugar_g / Math.max(1, carbs), 0, 1) * 20;
  impact -= clamp(totals.fibre_g / Math.max(1, carbs), 0, 0.45) * 45;
  impact -= clamp(totals.protein_g / 25, 0, 1) * 6;
  impact -= clamp(totals.fat_g / 25, 0, 1) * 5;
  return Math.round(clamp(impact, 0, 100));
}

function ingredientRatiosFromIngredients(ingredientsText: string) {
  const parts = ingredientsText
    .split(/,|\n|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (!parts.length) return [];
  const weights = parts.map((_, idx) => Math.max(4, 100 - idx * 9));
  const total = weights.reduce((sum, item) => sum + item, 0);
  return parts.map((part, idx) => ({
    name: part.slice(0, 90),
    percentage: round((weights[idx] / total) * 100, 1),
    role: idx === 0 ? "primary ingredient" : "listed ingredient",
    confidence: 45,
  }));
}

export function mapOpenFoodFactsProduct(product: any): ProductLookupCandidate | null {
  const label = cleanProductTitle(productTextList(product, ["product_name_en", "product_name", "generic_name_en", "generic_name"]));
  if (!label) return null;
  const barcode = cleanBarcode(product?.code || product?._id || product?.id);
  const brand = productTextList(product, ["brands", "brands_tags"]);
  const ingredients = productTextList(product, ["ingredients_text_en", "ingredients_text", "ingredients_text_with_allergens_en", "ingredients_text_with_allergens"]);
  const imageUrl = productImage(product);
  const nutriments = product?.nutriments || {};
  const servingQuantity = asNumber(product?.serving_quantity, 0);
  const productQuantity = asNumber(product?.product_quantity, 0);
  const servingG = servingQuantity > 0 ? servingQuantity : productQuantity > 0 && productQuantity <= 100 ? productQuantity : 100;
  const scale = servingG / 100;
  const sugar = nutriment(nutriments, "sugars", scale, 0);
  const addedSugar = nutriment(nutriments, "added-sugars", scale, 0) || inferAddedSugar(sugar, ingredients);
  const fibre = nutriment(nutriments, "fiber", scale, nutriment(nutriments, "fibre", scale, 0));
  const fat = nutriment(nutriments, "fat", scale, 0);
  const sat = nutriment(nutriments, "saturated-fat", scale, 0);
  const trans = nutriment(nutriments, "trans-fat", scale, 0);
  const fibreSplit = inferFibreSplit(fibre, ingredients);
  const fatSplit = inferFatSplit(fat, sat, trans, nutriments, scale);
  const kcal = nutriment(nutriments, "energy-kcal", scale, 0) || round(nutriment(nutriments, "energy", scale, 0) / 4.184, 0);
  const totals: NutritionTotals = {
    ...zeroProductTotals,
    calories: round(kcal, 0),
    protein_g: round(nutriment(nutriments, "proteins", scale, nutriment(nutriments, "protein", scale, 0)), 2),
    carbs_g: round(nutriment(nutriments, "carbohydrates", scale, 0), 2),
    fat_g: round(fat, 2),
    fibre_g: round(fibre, 2),
    ...fibreSplit,
    sugar_g: round(sugar, 2),
    added_sugar_g: round(addedSugar, 2),
    natural_sugar_g: round(Math.max(0, sugar - addedSugar), 2),
    salt_g: round(nutriment(nutriments, "salt", scale, 0), 2),
    saturated_fat_g: round(sat, 2),
    trans_fat_g: round(trans, 2),
    ...fatSplit,
    sodium_mg: round((nutriment(nutriments, "sodium", scale, 0) || nutriment(nutriments, "salt", scale, 0) * 0.393) * 1000, 0),
    potassium_mg: round(nutrientMg(nutriments, "potassium", scale), 0),
    calcium_mg: round(nutrientMg(nutriments, "calcium", scale), 0),
    iron_mg: round(nutrientMg(nutriments, "iron", scale), 2),
    magnesium_mg: round(nutrientMg(nutriments, "magnesium", scale), 0),
    zinc_mg: round(nutrientMg(nutriments, "zinc", scale), 2),
    folate_ug: round(nutrientUg(nutriments, "folates", scale) || nutrientUg(nutriments, "folate", scale), 0),
    niacin_mg: round(nutrientMg(nutriments, "vitamin-pp", scale) || nutrientMg(nutriments, "niacin", scale), 2),
    thiamin_mg: round(nutrientMg(nutriments, "vitamin-b1", scale) || nutrientMg(nutriments, "thiamin", scale), 2),
    vitamin_c_mg: round(nutrientMg(nutriments, "vitamin-c", scale), 0),
    vitamin_d_ug: round(nutrientUg(nutriments, "vitamin-d", scale), 2),
    vitamin_b12_ug: round(nutrientUg(nutriments, "vitamin-b12", scale), 2),
    omega_3_g: round(nutriment(nutriments, "omega-3-fat", scale, 0), 2),
    caffeine_mg: round(nutrientMg(nutriments, "caffeine", scale), 0),
    energy_density_kcal_per_g: servingG > 0 ? round(kcal / servingG, 2) : 0,
    glycemic_impact_score: 0,
  };
  totals.glycemic_impact_score = glycemicImpact(totals, ingredients);
  const fallback = fallbackRecipeEstimate({ label, servings: 1, ingredients: ingredients || label, notes: brand ? `Brand: ${brand}` : undefined });
  const estimate = normaliseRecipeEstimate({
    servings: 1,
    confidence: product?.nutriments ? (ingredients ? 88 : 76) : 52,
    confidence_reason: ingredients ? "Matched from Open Food Facts barcode/product database with label ingredients and nutrition fields where available." : "Matched from Open Food Facts, but the ingredient list is missing or incomplete.",
    processing_level: /additive|emulsifier|preservative|flavouring|stabiliser|sweetener/i.test(ingredients) ? "high" : "unknown",
    health_score: scoreMeal(totals),
    image_prompt: imageUrl ? `Use product image for ${label}.` : `Realistic pack shot or plated image for ${brand ? `${brand} ` : ""}${label}`,
    ingredients_json: ingredients ? ingredients.split(/,|;/).slice(0, 30).map((item) => ({ name: item.trim() })).filter((item) => item.name) : fallback.ingredients_json,
    ingredient_ratio_json: ingredientRatiosFromIngredients(ingredients),
    per_serving: totals,
    allergen_flags: allergenTags(product, ingredients),
    dietary_flags: dietaryFlags(totals, ingredients),
    manufacturing_notes: [
      "Barcode match is useful for packaged food accuracy, but labels should still be checked because recipes and pack sizes change.",
      ...(ingredients ? [] : ["Ingredient list was not available from the product database."]),
    ],
    micronutrient_notes: ["Micronutrients come from product database fields where present; missing values remain estimates or zero until label data is added."],
    assumptions: [
      servingQuantity > 0 ? `Per-serving values use the product serving quantity of about ${round(servingG, 0)}g/ml.` : "Per-serving values default to per 100g because no serving size was provided.",
      "Added sugar, fibre type and glycemic impact are inferred when the label does not split them.",
    ],
  }, fallback);

  return {
    source: "open_food_facts",
    source_label: "Open Food Facts",
    source_url: barcode ? openFoodFactsUrlForBarcode(barcode) : null,
    barcode: barcode || null,
    gtin: barcode || null,
    label,
    brand_name: brand || null,
    image_url: safeExternalUrl(imageUrl) || null,
    ingredients_text: ingredients || null,
    serving_label: servingQuantity > 0 ? `${round(servingQuantity, 0)}g/ml serving` : "Per 100g estimate",
    package_quantity: productTextList(product, ["quantity", "product_quantity"]),
    data_confidence: estimate.confidence,
    confidence_reason: estimate.confidence_reason,
    raw: compactSourceProduct(product),
    estimate,
  };
}

export function normaliseAiProductCandidate(input: any, fallbackLabel: string): ProductLookupCandidate | null {
  const label = cleanProductTitle(input?.label || input?.name || input?.product_name, fallbackLabel).slice(0, 180);
  if (!label) return null;
  const fallback = fallbackRecipeEstimate({ label, servings: 1, ingredients: asText(input?.ingredients_text || input?.ingredients, label), notes: asText(input?.brand_name || input?.brand) });
  const estimate = normaliseRecipeEstimate(input?.estimate || input?.nutrition || input, fallback);
  return {
    source: "ai_research",
    source_label: "AI web research",
    source_url: safeExternalUrl(input?.source_url || input?.url) || null,
    barcode: cleanBarcode(input?.barcode || input?.gtin) || null,
    gtin: cleanBarcode(input?.gtin || input?.barcode) || null,
    label,
    brand_name: asText(input?.brand_name || input?.brand, "") || null,
    image_url: safeExternalUrl(input?.image_url || input?.image) || null,
    card_kind: asText(input?.card_kind || input?.kind, "") || undefined,
    ingredients_text: asText(input?.ingredients_text || input?.ingredients, "") || null,
    serving_label: asText(input?.serving_label || input?.serving_size, "") || null,
    package_quantity: asText(input?.package_quantity || input?.quantity, "") || null,
    data_confidence: Math.round(clamp(Number(input?.data_confidence ?? estimate.confidence ?? 45), 0, 100)),
    confidence_reason: asText(input?.confidence_reason, estimate.confidence_reason),
    raw: compactJson(input, 35_000),
    estimate,
  };
}
