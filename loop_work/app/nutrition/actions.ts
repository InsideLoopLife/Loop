"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { parseNumber } from "@/lib/format/money";
import { fallbackRecipeEstimate, scaleNutritionTotals, NUTRITION_TOTAL_KEYS, type NutritionTotals } from "@/lib/nutrition/scoring";
import { cleanProductOrMealLabel, extractVolumeMl, inferFoodEntityType, isProductLikeKind } from "@/lib/nutrition/intelligence";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

function nullableString(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}

function numberField(formData: FormData, key: string, fallback = 0) {
  const value = parseNumber(formData.get(key));
  return value === null || value === undefined ? fallback : value;
}

function jsonField(formData: FormData, key: string, fallback: any) {
  const text = String(formData.get(key) || "").trim();
  if (!text) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
}

function labelFromForm(formData: FormData, fallback = "Food entry") {
  return cleanProductOrMealLabel(formData.get("label") || formData.get("freehand_description") || formData.get("ingredients") || fallback);
}

function normaliseCardKind(formData: FormData, fallback: "recipe" | "ingredient" | "product" | "drink_product" | "menu" = "recipe") {
  const supplied = String(formData.get("card_kind") || "").toLowerCase();
  if (["recipe", "ingredient", "product", "drink_product", "menu"].includes(supplied)) return supplied;
  const product = productPayload(formData);
  return inferFoodEntityType({ label: formData.get("label"), source: product.product_data_source || product.product_source_url, cardKind: supplied || fallback, ingredients: formData.get("ingredients") });
}

function mergedNutritionJson(formData: FormData, fallback: any = {}) {
  const existing = jsonField(formData, "nutrition_json", fallback);
  const parsedVolume = extractVolumeMl(`${formData.get("label") || ""} ${formData.get("freehand_description") || ""} ${formData.get("ingredients") || ""}`);
  return {
    ...(existing && typeof existing === "object" ? existing : {}),
    parsed_volume_ml: parsedVolume || existing?.parsed_volume_ml || null,
  };
}

function simpleGeneratedMethod(label: string, ingredients: any[]) {
  const items = Array.isArray(ingredients) ? ingredients.map((item) => typeof item === "string" ? item : [item?.quantity, item?.name].filter(Boolean).join(" ")).filter(Boolean) : [];
  if (!items.length) return [
    `Prepare the ingredients for ${label}.`,
    "Cook or assemble in a sensible order, checking seasoning and food safety before serving.",
    "Serve and adjust the saved method if your household makes it differently.",
  ];
  return [
    `Gather and prepare: ${items.slice(0, 4).join(", ")}${items.length > 4 ? " and the remaining ingredients" : ""}.`,
    "Cook or assemble the main ingredients in the order listed, keeping heat moderate where dairy, eggs or sauces are involved.",
    "Check the texture, seasoning and temperature before serving.",
    "Update these AI-generated steps if your household method is different.",
  ];
}

function fallbackFoodImageUrl(label: string) {
  return `/api/food-image-placeholder?label=${encodeURIComponent(label || "Food")}`;
}

function productCacheKey(value: { label?: string | null; brandName?: string | null; brand_name?: string | null; sourceUrl?: string | null; source_url?: string | null; gtin?: string | null; barcode?: string | null }) {
  const id = String(value.gtin || value.barcode || "").replace(/\D/g, "").slice(0, 18);
  if (id) return `gtin:${id}`;
  const base = `${value.brandName || value.brand_name || ""} ${value.label || ""} ${value.sourceUrl || value.source_url || ""}`
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return base ? `name:${base}` : null;
}

async function upsertGlobalProductFromIngredient(data: {
  label: string;
  brandName?: string | null;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  sourceType?: string | null;
  confidence?: number;
  barcode?: string | null;
  gtin?: string | null;
  servingLabel?: string | null;
  packageQuantity?: string | null;
  lookupJson?: any;
  ingredientsText?: string | null;
  nutrition?: Record<string, number>;
}) {
  if (!hasSupabaseAdminKey()) return;
  try {
    const admin = createAdminClient();
    const productKey = productCacheKey({ label: data.label, brandName: data.brandName, sourceUrl: data.sourceUrl, gtin: data.gtin, barcode: data.barcode });
    if (!productKey) return;
    const lookupJson = data.lookupJson && typeof data.lookupJson === "object" && data.lookupJson.label
      ? data.lookupJson
      : {
          source: data.sourceType || "food_log",
          source_label: "LoopHealth shared product cache",
          source_url: data.sourceUrl || null,
          barcode: data.barcode || null,
          gtin: data.gtin || data.barcode || null,
          label: data.label,
          brand_name: data.brandName || null,
          image_url: data.imageUrl || fallbackFoodImageUrl(data.label),
          ingredients_text: data.ingredientsText || null,
          serving_label: data.servingLabel || "Saved serving",
          package_quantity: data.packageQuantity || null,
          data_confidence: Math.round(Number(data.confidence || 0)),
          confidence_reason: "Shared from a LoopHealth user-captured product/ingredient entry.",
          estimate: {
            servings: 1,
            confidence: Math.round(Number(data.confidence || 0)),
            confidence_reason: "Shared from a LoopHealth user-captured product/ingredient entry.",
            health_score: 0,
            processing_level: "unknown",
            image_prompt: `Food/product image for ${data.label}`,
            ingredients_json: [],
            ingredient_ratio_json: [],
            per_serving: data.nutrition || {},
            allergen_flags: [],
            dietary_flags: [],
            manufacturing_notes: [],
            micronutrient_notes: [],
            assumptions: ["Shared product cache entry. Check label accuracy before relying on it."],
          },
        };
    const row = {
      product_key: productKey,
      barcode: data.barcode || null,
      gtin: data.gtin || data.barcode || null,
      product_name: data.label.slice(0, 220),
      brand_name: data.brandName || null,
      source: data.sourceType || "food_log",
      source_url: data.sourceUrl || null,
      image_url: data.imageUrl || null,
      ingredients_text: data.ingredientsText || null,
      serving_label: data.servingLabel || null,
      package_quantity: data.packageQuantity || null,
      data_confidence: Math.round(Number(data.confidence || 0)),
      lookup_json: lookupJson,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      await admin.from("nutrition_global_product_catalog").upsert(row, { onConflict: "product_key", ignoreDuplicates: false });
    } catch {
      const { product_key, ...legacyRow } = row as any;
      if (legacyRow.gtin || legacyRow.barcode) await admin.from("nutrition_global_product_catalog").upsert(legacyRow, { onConflict: "gtin", ignoreDuplicates: false });
    }
  } catch {
    // Shared catalogue write is an optimisation only.
  }
}

async function recordIngredientUsage(supabase: any, userId: string, data: {
  mealId?: string | null;
  label: string;
  brandName?: string | null;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  sourceType?: string | null;
  confidence?: number;
  barcode?: string | null;
  gtin?: string | null;
  servingLabel?: string | null;
  packageQuantity?: string | null;
  lookupJson?: any;
  ingredientsText?: string | null;
  ingredientsJson?: any;
  nutritionJson?: any;
  allergens?: string[];
  dietaryFlags?: string[];
  nutrition?: Record<string, number>;
}) {
  try {
    const label = String(data.label || "Ingredient").trim();
    if (!label) return;
    const sourceUrl = data.sourceUrl || null;
    let existingQuery = supabase
      .from("nutrition_ingredients")
      .select("id, use_count")
      .eq("user_id", userId)
      .limit(1);
    if (sourceUrl) existingQuery = existingQuery.eq("source_url", sourceUrl);
    else existingQuery = existingQuery.ilike("label", label);
    const { data: existing } = await existingQuery.maybeSingle();
    const nutrition = data.nutrition || {};
    const payload = {
      user_id: userId,
      meal_id: data.mealId || null,
      label,
      brand_name: data.brandName || null,
      source_url: sourceUrl,
      image_url: data.imageUrl || fallbackFoodImageUrl(label),
      source_type: data.sourceType || "food_log",
      data_confidence: Math.round(Number(data.confidence || 0)),
      ingredients_text: data.ingredientsText || null,
      ingredients_json: Array.isArray(data.ingredientsJson) ? data.ingredientsJson : [],
      nutrition_json: data.nutritionJson && typeof data.nutritionJson === "object" ? data.nutritionJson : {},
      allergen_flags: Array.isArray(data.allergens) ? data.allergens : [],
      dietary_flags: Array.isArray(data.dietaryFlags) ? data.dietaryFlags : [],
      calories: Number(nutrition.calories || 0),
      protein_g: Number(nutrition.protein_g || 0),
      carbs_g: Number(nutrition.carbs_g || 0),
      fat_g: Number(nutrition.fat_g || 0),
      fibre_g: Number(nutrition.fibre_g || 0),
      sugar_g: Number(nutrition.sugar_g || 0),
      salt_g: Number(nutrition.salt_g || 0),
      saturated_fat_g: Number(nutrition.saturated_fat_g || 0),
      caffeine_mg: Number(nutrition.caffeine_mg || 0),
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (existing?.id) {
      await supabase.from("nutrition_ingredients").update({ ...payload, use_count: Number(existing.use_count || 0) + 1 }).eq("id", existing.id).eq("user_id", userId);
    } else {
      await supabase.from("nutrition_ingredients").insert({ ...payload, use_count: 1 });
    }
    await upsertGlobalProductFromIngredient({
      label,
      brandName: data.brandName,
      sourceUrl,
      imageUrl: data.imageUrl || fallbackFoodImageUrl(label),
      sourceType: data.sourceType,
      confidence: data.confidence,
      ingredientsText: data.ingredientsText,
      servingLabel: data.servingLabel,
      packageQuantity: data.packageQuantity,
      barcode: data.barcode,
      gtin: data.gtin,
      lookupJson: data.lookupJson,
      nutrition,
    });
  } catch {
    // Ingredient capture is helpful, but food logging must not fail if the migration has not run yet.
  }
}

function productPayload(formData: FormData) {
  const gtin = nullableString(formData.get("gtin")) || nullableString(formData.get("barcode"));
  return {
    barcode: nullableString(formData.get("barcode")),
    gtin,
    brand_name: nullableString(formData.get("brand_name")),
    product_data_source: nullableString(formData.get("product_data_source")),
    product_data_confidence: Math.round(numberField(formData, "product_data_confidence", 0)),
    product_image_url: nullableString(formData.get("product_image_url")),
    product_source_url: nullableString(formData.get("product_source_url")),
    label_front_image_url: nullableString(formData.get("label_front_image_url")),
    label_ingredients_image_url: nullableString(formData.get("label_ingredients_image_url")),
    label_nutrition_image_url: nullableString(formData.get("label_nutrition_image_url")),
    user_verified_label: formData.get("user_verified_label") === "on" || formData.get("user_verified_label") === "true",
    product_lookup_json: jsonField(formData, "product_lookup_json", {}),
  };
}

const nutritionKeys: Array<keyof NutritionTotals> = NUTRITION_TOTAL_KEYS;

function nutritionPayload(formData: FormData) {
  return nutritionKeys.reduce<Record<string, number>>((acc, key) => {
    acc[key] = numberField(formData, String(key), 0);
    return acc;
  }, {});
}

export async function addNutritionMeal(formData: FormData) {
  const { supabase, user } = await requireUser();
  const label = labelFromForm(formData, "Recipe");
  const servings = Math.max(1, numberField(formData, "servings", 1));
  const ingredients = nullableString(formData.get("ingredients"));
  const suppliedNutrition = nutritionPayload(formData);
  const hasNutrition = Object.values(suppliedNutrition).some((value) => Number(value || 0) > 0);
  const fallback = hasNutrition ? null : fallbackRecipeEstimate({ label, servings, ingredients: ingredients || "", notes: String(formData.get("notes") || "") });
  const payload = hasNutrition ? suppliedNutrition : nutritionKeys.reduce<Record<string, number>>((acc, key) => { acc[key] = Number(fallback?.[key] || 0); return acc; }, {});

  const { error } = await supabase.from("meals").insert({
    user_id: user.id,
    person_id: nullableString(formData.get("person_id")),
    label,
    source_url: nullableString(formData.get("source_url")),
    card_kind: normaliseCardKind(formData, productPayload(formData).product_data_source ? "product" : "recipe"),
    image_url: nullableString(formData.get("image_url")) || fallbackFoodImageUrl(label),
    image_prompt: nullableString(formData.get("image_prompt")) || fallback?.image_prompt || null,
    servings,
    adult_serving_multiplier: numberField(formData, "adult_serving_multiplier", 1),
    child_serving_multiplier: numberField(formData, "child_serving_multiplier", 0.55),
    estimated_cost: numberField(formData, "estimated_cost", 0),
    supermarket_id: nullableString(formData.get("supermarket_id")),
    ...productPayload(formData),
    ingredients,
    ingredients_json: jsonField(formData, "ingredients_json", fallback?.ingredients_json || []),
    notes: nullableString(formData.get("notes")),
    nutrition_json: mergedNutritionJson(formData, { assumptions: fallback?.assumptions || [] }),
    ingredient_ratio_json: jsonField(formData, "ingredient_ratio_json", fallback?.ingredient_ratio_json || []),
    allergen_flags: jsonField(formData, "allergen_flags", fallback?.allergen_flags || []),
    dietary_flags: jsonField(formData, "dietary_flags", fallback?.dietary_flags || []),
    manufacturing_notes: jsonField(formData, "manufacturing_notes", fallback?.manufacturing_notes || []),
    confidence_reason: nullableString(formData.get("confidence_reason")) || fallback?.confidence_reason || null,
    processing_level: String(formData.get("processing_level") || fallback?.processing_level || "unknown"),
    nutrition_confidence: Math.round(numberField(formData, "nutrition_confidence", fallback?.confidence || 0)),
    nutrition_score: Math.round(numberField(formData, "nutrition_score", fallback?.health_score || 0)),
    ...payload,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/nutrition");
  revalidatePath("/nutrition/cards");
  revalidatePath("/nutrition/ingredients");
  revalidatePath("/lifestyle");
}


export async function bulkAddNutritionMeals(formData: FormData) {
  const { supabase, user } = await requireUser();
  const rawItems = jsonField(formData, "items_json", []) as any[];
  const items = Array.isArray(rawItems) ? rawItems.slice(0, 60) : [];
  if (!items.length) throw new Error("No menu items were selected.");

  const rows = items.map((item) => {
    const label = String(item?.label || "Menu item").trim().slice(0, 180) || "Menu item";
    const description = String(item?.description || "").trim();
    const sourceUrl = nullableString(item?.source_url || null);
    const sourceName = String(item?.source_name || "Menu import").trim().slice(0, 120) || "Menu import";
    const importKind = item?.import_kind === "ingredient" || item?.import_kind === "product" ? item.import_kind : "menu";
    const estimate = item?.estimate && typeof item.estimate === "object"
      ? item.estimate
      : fallbackRecipeEstimate({ label, ingredients: description, notes: sourceName, servings: 1 });
    const nutrition = nutritionKeys.reduce<Record<string, number>>((acc, key) => {
      acc[key] = Number(estimate?.[key] || estimate?.per_serving?.[key] || 0);
      return acc;
    }, {});
    const allergens = Array.isArray(item?.allergens) ? item.allergens.map(String).filter(Boolean).slice(0, 16) : [];
    const estimateAllergens = Array.isArray(estimate?.allergen_flags) ? estimate.allergen_flags.map(String).filter(Boolean) : [];
    const dietaryFlags = Array.isArray(estimate?.dietary_flags) ? estimate.dietary_flags.map(String).filter(Boolean) : [];
    if (!dietaryFlags.includes("restaurant / menu estimate")) dietaryFlags.push("restaurant / menu estimate");

    return {
      user_id: user.id,
      person_id: null,
      label,
      source_url: sourceUrl,
      card_kind: importKind === "menu" ? "menu" : importKind === "product" ? "product" : "ingredient",
      image_url: nullableString(item?.image_url || null) || fallbackFoodImageUrl(label),
      image_prompt: String(estimate?.image_prompt || `A plated serving of ${label}`).slice(0, 500),
      servings: 1,
      adult_serving_multiplier: 1,
      child_serving_multiplier: 0.55,
      estimated_cost: Number(String(item?.price || "").replace(/[^0-9.]/g, "")) || 0,
      supermarket_id: null,
      brand_name: sourceName,
      product_data_source: importKind === "menu" ? "restaurant_menu_import" : importKind === "product" ? "product_search" : "ingredient_url_import",
      product_data_confidence: Math.round(Number(estimate?.confidence || 55)),
      product_source_url: sourceUrl,
      product_lookup_json: {
        source: importKind === "menu" ? "restaurant_menu_import" : importKind === "product" ? "product_search" : "ingredient_url_import",
        import_kind: importKind,
        source_label: sourceName,
        source_url: sourceUrl,
        price: item?.price || null,
        description,
      },
      ingredients: description,
      ingredients_json: Array.isArray(estimate?.ingredients_json) ? estimate.ingredients_json : [],
      notes: `Imported from ${sourceName}${item?.price ? ` · ${item.price}` : ""}`,
      nutrition_json: {
        assumptions: Array.isArray(estimate?.assumptions) ? estimate.assumptions : [],
        micronutrient_notes: Array.isArray(estimate?.micronutrient_notes) ? estimate.micronutrient_notes : [],
        import_source: sourceName,
        menu_price: item?.price || null,
        import_kind: importKind,
      },
      ingredient_ratio_json: Array.isArray(estimate?.ingredient_ratio_json) ? estimate.ingredient_ratio_json : [],
      allergen_flags: Array.from(new Set([...allergens, ...estimateAllergens])).slice(0, 16),
      dietary_flags: dietaryFlags,
      manufacturing_notes: Array.isArray(estimate?.manufacturing_notes) ? estimate.manufacturing_notes : ["Restaurant/menu nutrition is estimated from public menu text and may vary by portion."],
      confidence_reason: String(estimate?.confidence_reason || "Imported from menu text and estimated without a full product label.").slice(0, 500),
      processing_level: String(estimate?.processing_level || "medium"),
      nutrition_confidence: Math.round(Number(estimate?.confidence || 55)),
      nutrition_score: Math.round(Number(estimate?.health_score || 0)),
      ...nutrition,
    };
  });

  const { error } = await supabase.from("meals").insert(rows);
  if (error) throw new Error(error.message);

  await Promise.all(rows.map(async (row: any) => {
    const nutrition = nutritionKeys.reduce<Record<string, number>>((acc, key) => { acc[key] = Number(row[key] || 0); return acc; }, {});
    await recordIngredientUsage(supabase, user.id, {
      label: row.label,
      brandName: row.brand_name,
      sourceUrl: row.source_url || row.product_source_url,
      imageUrl: row.image_url,
      sourceType: row.product_data_source || row.card_kind,
      confidence: row.product_data_confidence || row.nutrition_confidence,
      ingredientsText: row.ingredients,
      ingredientsJson: row.ingredients_json,
      nutritionJson: row.nutrition_json,
      allergens: row.allergen_flags,
      dietaryFlags: row.dietary_flags,
      lookupJson: row.product_lookup_json,
      nutrition,
    });
    await upsertGlobalProductFromIngredient({
      label: row.label,
      brandName: row.brand_name,
      sourceUrl: row.source_url || row.product_source_url,
      imageUrl: row.image_url,
      sourceType: row.product_data_source || row.card_kind,
      confidence: row.product_data_confidence || row.nutrition_confidence,
      ingredientsText: row.ingredients,
      lookupJson: row.product_lookup_json,
      nutrition,
    });
  }));

  try {
    const firstSource = rows[0]?.brand_name || "menu import";
    await supabase.from("app_notifications").insert({
      user_id: user.id,
      notification_type: "nutrition_menu_import_saved",
      category: "lifestyle",
      channel: "in_app",
      title: "Menu items saved",
      body: `${rows.length} item(s) from ${firstSource} were added to your LoopHealth product database.`,
      cta_label: "Open nutrition",
      cta_href: "/nutrition",
      status: "unread",
    });
  } catch {
    // notification is helpful but should never block saving menu products
  }

  revalidatePath("/nutrition");
  revalidatePath("/lifestyle");
}

export async function updateNutritionMeal(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");
  const label = labelFromForm(formData, "Recipe");
  const { error } = await supabase.from("meals").update({
    person_id: nullableString(formData.get("person_id")),
    label,
    source_url: nullableString(formData.get("source_url")),
    card_kind: normaliseCardKind(formData, productPayload(formData).product_data_source ? "product" : "recipe"),
    image_url: nullableString(formData.get("image_url")) || fallbackFoodImageUrl(label),
    image_prompt: nullableString(formData.get("image_prompt")),
    servings: Math.max(1, numberField(formData, "servings", 1)),
    adult_serving_multiplier: numberField(formData, "adult_serving_multiplier", 1),
    child_serving_multiplier: numberField(formData, "child_serving_multiplier", 0.55),
    estimated_cost: numberField(formData, "estimated_cost", 0),
    supermarket_id: nullableString(formData.get("supermarket_id")),
    ...productPayload(formData),
    ingredients: nullableString(formData.get("ingredients")),
    ingredients_json: jsonField(formData, "ingredients_json", []),
    notes: nullableString(formData.get("notes")),
    nutrition_json: mergedNutritionJson(formData, {}),
    ingredient_ratio_json: jsonField(formData, "ingredient_ratio_json", []),
    allergen_flags: jsonField(formData, "allergen_flags", []),
    dietary_flags: jsonField(formData, "dietary_flags", []),
    manufacturing_notes: jsonField(formData, "manufacturing_notes", []),
    confidence_reason: nullableString(formData.get("confidence_reason")),
    processing_level: String(formData.get("processing_level") || "unknown"),
    nutrition_confidence: Math.round(numberField(formData, "nutrition_confidence", 0)),
    nutrition_score: Math.round(numberField(formData, "nutrition_score", 0)),
    ...nutritionPayload(formData),
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/nutrition");
  revalidatePath("/nutrition/cards");
  revalidatePath("/nutrition/ingredients");
  revalidatePath("/lifestyle");
}

export async function refreshMealImage(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing meal id.");
  const { data: meal, error: mealError } = await supabase.from("meals").select("id, label, brand_name, image_prompt").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (mealError) throw new Error(mealError.message);
  if (!meal) throw new Error("Card not found.");
  const label = String(meal.label || "Food");
  const prompt = `A clean realistic product or meal image for ${meal.brand_name ? `${meal.brand_name} ` : ""}${label}`;
  const { error } = await supabase
    .from("meals")
    .update({ image_url: fallbackFoodImageUrl(label), image_prompt: prompt, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/nutrition/cards");
  revalidatePath(`/nutrition/cards/${id}`);
  revalidatePath("/nutrition");
}

export async function deleteNutritionMeal(formData: FormData) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("meals").delete().eq("id", String(formData.get("id") || "")).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/nutrition");
  revalidatePath("/lifestyle");
}

export async function logFoodEntry(formData: FormData) {
  const { supabase, user } = await requireUser();
  const mealId = nullableString(formData.get("meal_id"));
  const multiplier = Math.max(0.05, numberField(formData, "serving_multiplier", 1));
  const allocationMode = String(formData.get("serving_allocation_mode") || "per_person") === "split" ? "split" : "per_person";
  const eatenOn = String(formData.get("eaten_on") || new Date().toISOString().slice(0, 10));
  const freehandText = String(formData.get("freehand_description") || formData.get("ingredients") || formData.get("label") || "");
  const parsedVolumeMl = extractVolumeMl(freehandText);
  const eatenAt = nullableString(formData.get("eaten_at"));
  const drinkVolumeMl = Math.max(0, Math.round(numberField(formData, "drink_volume_ml", parsedVolumeMl || 0)));
  const mealSlot = String(formData.get("meal_slot") || (drinkVolumeMl > 0 ? "drink" : "meal"));
  const label = labelFromForm(formData, "Food entry");
  const imageUrl = nullableString(formData.get("image_url"));
  const notes = nullableString(formData.get("notes"));
  let base: any = null;

  if (mealId) {
    const { data, error } = await supabase
      .from("meals")
      .select("id, label, person_id, image_url, calories, protein_g, carbs_g, fat_g, fibre_g, soluble_fibre_g, insoluble_fibre_g, sugar_g, added_sugar_g, natural_sugar_g, salt_g, saturated_fat_g, trans_fat_g, monounsaturated_fat_g, polyunsaturated_fat_g, sodium_mg, potassium_mg, calcium_mg, iron_mg, magnesium_mg, zinc_mg, folate_ug, niacin_mg, thiamin_mg, vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug, omega_3_g, caffeine_mg, energy_density_kcal_per_g, glycemic_impact_score")
      .eq("id", mealId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    base = data;
  }

  const directNutrition = nutritionPayload(formData);
  const productMeta = productPayload(formData);

  let autoMealId = mealId;
  if (!autoMealId && label) {
    const gtin = nullableString(formData.get("gtin")) || nullableString(formData.get("barcode"));
    let existingQuery = supabase.from("meals").select("id, image_url").eq("user_id", user.id).limit(1);
    if (gtin) existingQuery = existingQuery.or(`gtin.eq.${gtin},barcode.eq.${gtin}`);
    else existingQuery = existingQuery.ilike("label", label);
    const { data: existingMeal } = await existingQuery.maybeSingle();
    autoMealId = existingMeal?.id || null;
    const betterImage = imageUrl || productMeta.product_image_url || null;
    if (autoMealId && betterImage && betterImage !== existingMeal?.image_url) {
      await supabase.from("meals").update({ image_url: betterImage, product_image_url: productMeta.product_image_url || betterImage, updated_at: new Date().toISOString() }).eq("id", autoMealId).eq("user_id", user.id);
    }
    if (!autoMealId) {
      const fullMealPayload = {
        user_id: user.id,
        person_id: null,
        label,
        source_url: nullableString(formData.get("source_url")) || productMeta.product_source_url,
        card_kind: productMeta.product_data_source === "restaurant_menu_import" ? "menu" : (isProductLikeKind(productMeta.product_data_source) ? "product" : normaliseCardKind(formData, "ingredient")),
        image_url: imageUrl || productMeta.product_image_url || fallbackFoodImageUrl(label),
        image_prompt: nullableString(formData.get("image_prompt")) || `A clear food photo of ${label}`,
        servings: 1,
        adult_serving_multiplier: 1,
        child_serving_multiplier: 0.55,
        estimated_cost: 0,
        supermarket_id: null,
        ...productMeta,
        ingredients: nullableString(formData.get("ingredients")),
        ingredients_json: jsonField(formData, "ingredients_json", []),
        notes: "Auto-saved from food log so this can be reused.",
        nutrition_json: mergedNutritionJson(formData, {}),
        ingredient_ratio_json: jsonField(formData, "ingredient_ratio_json", []),
        allergen_flags: jsonField(formData, "allergen_flags", []),
        dietary_flags: jsonField(formData, "dietary_flags", []),
        manufacturing_notes: jsonField(formData, "manufacturing_notes", []),
        confidence_reason: nullableString(formData.get("confidence_reason")),
        processing_level: nullableString(formData.get("processing_level")) || "unknown",
        nutrition_confidence: Math.round(numberField(formData, "nutrition_confidence", 0)),
        nutrition_score: Math.round(numberField(formData, "nutrition_score", 0)),
        ...directNutrition,
      };
      let insertedMealResult = await supabase.from("meals").insert(fullMealPayload).select("id").single();
      if (insertedMealResult.error) {
        const minimalMealPayload = {
          user_id: user.id,
          person_id: null,
          label,
          source_url: nullableString(formData.get("source_url")) || productMeta.product_source_url,
          card_kind: productMeta.product_data_source === "restaurant_menu_import" ? "menu" : (isProductLikeKind(productMeta.product_data_source) ? "product" : normaliseCardKind(formData, "ingredient")),
          image_url: imageUrl || productMeta.product_image_url || fallbackFoodImageUrl(label),
          image_prompt: nullableString(formData.get("image_prompt")) || `A clear food photo of ${label}`,
          servings: 1,
          adult_serving_multiplier: 1,
          child_serving_multiplier: 0.55,
          ingredients: nullableString(formData.get("ingredients")),
          notes: "Auto-saved from food log so this can be reused.",
          nutrition_confidence: Math.round(numberField(formData, "nutrition_confidence", 0)),
          nutrition_score: Math.round(numberField(formData, "nutrition_score", 0)),
          ...directNutrition,
        };
        insertedMealResult = await supabase.from("meals").insert(minimalMealPayload).select("id").single();
      }
      autoMealId = insertedMealResult.data?.id || null;
    }
  }

  const shouldTrackIngredient = !mealId && label && (productMeta.product_data_source || productMeta.product_source_url || nullableString(formData.get("source_url")) || nullableString(formData.get("ingredients")));
  if (shouldTrackIngredient) {
    await recordIngredientUsage(supabase, user.id, {
      mealId: autoMealId,
      label,
      brandName: productMeta.brand_name,
      sourceUrl: nullableString(formData.get("source_url")) || productMeta.product_source_url,
      imageUrl: imageUrl || productMeta.product_image_url || fallbackFoodImageUrl(label),
      sourceType: productMeta.product_data_source || "food_log",
      confidence: numberField(formData, "nutrition_confidence", productMeta.product_data_confidence || 0),
      barcode: productMeta.barcode,
      gtin: productMeta.gtin,
      servingLabel: productMeta.product_lookup_json?.serving_label || null,
      packageQuantity: productMeta.product_lookup_json?.package_quantity || null,
      lookupJson: productMeta.product_lookup_json,
      ingredientsText: nullableString(formData.get("ingredients")),
      ingredientsJson: jsonField(formData, "ingredients_json", []),
      nutritionJson: jsonField(formData, "nutrition_json", {}),
      allergens: jsonField(formData, "allergen_flags", []),
      dietaryFlags: jsonField(formData, "dietary_flags", []),
      nutrition: directNutrition,
    });
  }

  const repeatedPersonIds = formData.getAll("person_ids").map((value) => String(value || "")).filter(Boolean);
  const selectedPersonIds = [...(jsonField(formData, "person_ids_json", []) as string[]), ...repeatedPersonIds];
  const includeHousehold = selectedPersonIds.includes("__household__") || (!selectedPersonIds.length && !nullableString(formData.get("person_id")));
  const explicitIds = Array.from(new Set(selectedPersonIds.filter((id) => id && id !== "__household__")));
  const fallbackPersonId = nullableString(formData.get("person_id")) || base?.person_id || null;
  const personTargets = explicitIds.length ? explicitIds : (fallbackPersonId ? [fallbackPersonId] : []);

  const rows = [
    ...(includeHousehold ? [{ person_id: null as string | null }] : []),
    ...personTargets.map((person_id) => ({ person_id })),
  ];
  if (!rows.length) rows.push({ person_id: null });

  const splitDivisor = allocationMode === "split" ? Math.max(1, rows.length) : 1;
  const insertedLogs = await supabase.from("food_logs").insert(
    rows.map((target) => {
      const rowMultiplier = multiplier / splitDivisor;
      const scaled = base ? scaleNutritionTotals(base, rowMultiplier) : scaleNutritionTotals(directNutrition, rowMultiplier);
      return {
        user_id: user.id,
        person_id: target.person_id,
        meal_id: autoMealId,
        eaten_on: eatenOn,
        eaten_at: eatenAt,
        drink_volume_ml: allocationMode === "split" ? Math.round(drinkVolumeMl / splitDivisor) : drinkVolumeMl,
        meal_slot: mealSlot,
        serving_multiplier: rowMultiplier,
        label: label || base?.label || "Food entry",
        image_url: imageUrl || base?.image_url || productMeta.product_image_url || fallbackFoodImageUrl(label || base?.label || "Food entry"),
        notes: allocationMode === "split" ? [notes, `Split from ${multiplier} serving(s) across ${rows.length} selected target(s).`].filter(Boolean).join("\n") : notes,
        ...scaled,
      };
    }),
  ).select("id, person_id");
  if (insertedLogs.error) throw new Error(insertedLogs.error.message);

  const linkedTargets = personTargets.length
    ? await supabase.from("people").select("id, name, linked_user_id, account_status").in("id", personTargets)
    : { data: [], error: null };

  if (!linkedTargets.error && linkedTargets.data?.length) {
    for (const person of linkedTargets.data as any[]) {
      if (!person.linked_user_id || person.linked_user_id === user.id || person.account_status === "managed_by_household") continue;
      const logIds = (insertedLogs.data || []).filter((row: any) => row.person_id === person.id).map((row: any) => row.id);
      if (!logIds.length) continue;
      await supabase.rpc("app_request_nutrition_allocation_claim", {
        p_food_log_ids: logIds,
        p_person_id: person.id,
        p_target_user_id: person.linked_user_id,
        p_label: label || base?.label || "Food entry",
        p_eaten_on: eatenOn,
      });
    }
  }

  revalidatePath("/nutrition");
  revalidatePath("/nutrition/cards");
  revalidatePath("/nutrition/ingredients");
  revalidatePath("/nutrition/day");
}



export async function setNutritionMealCardKind(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");
  const cardKind = String(formData.get("card_kind") || "product").toLowerCase();
  if (!id) throw new Error("Missing card id.");
  if (!["recipe", "meal", "ingredient", "product", "drink_product", "menu"].includes(cardKind)) throw new Error("Unsupported card type.");
  const { error } = await supabase.from("meals").update({ card_kind: cardKind, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/nutrition");
  revalidatePath("/nutrition/cards");
  revalidatePath(`/nutrition/cards/${id}`);
}

export async function queueNutritionProductCorrection(formData: FormData) {
  const { supabase, user } = await requireUser();
  const mealId = nullableString(formData.get("meal_id"));
  const label = labelFromForm(formData, "Product correction");
  const sourceUrl = nullableString(formData.get("source_url"));
  const labelImageUrl = nullableString(formData.get("label_image_url"));
  const notes = nullableString(formData.get("notes"));
  if (!sourceUrl && !labelImageUrl && !notes) throw new Error("Add a source URL, label image URL or note so the product can be corrected.");
  const { error } = await supabase.from("nutrition_product_corrections").insert({
    user_id: user.id,
    meal_id: mealId,
    label,
    source_url: sourceUrl,
    label_image_url: labelImageUrl,
    notes,
    status: "queued",
  });
  if (error) throw new Error(error.message);
  if (mealId) {
    try {
      const { data: meal } = await supabase.from("meals").select("nutrition_json").eq("id", mealId).eq("user_id", user.id).maybeSingle();
      const json = meal?.nutrition_json && typeof meal.nutrition_json === "object" ? meal.nutrition_json : {};
      await supabase.from("meals").update({ nutrition_json: { ...json, product_update_status: "queued", product_update_requested_at: new Date().toISOString(), product_update_source_url: sourceUrl, product_update_label_image_url: labelImageUrl }, updated_at: new Date().toISOString() }).eq("id", mealId).eq("user_id", user.id);
    } catch {}
  }
  revalidatePath("/nutrition");
  revalidatePath("/nutrition/cards");
  if (mealId) revalidatePath(`/nutrition/cards/${mealId}`);
}


export async function applyLabelImageCandidateToMeal(formData: FormData) {
  const { supabase, user } = await requireUser();
  const mealId = String(formData.get("meal_id") || "");
  const candidate = jsonField(formData, "candidate_json", null);
  if (!mealId) throw new Error("Missing card id.");
  if (!candidate || typeof candidate !== "object") throw new Error("Missing label extraction data.");

  const estimate = candidate.estimate || {};
  const per = estimate.per_serving || {};
  const cleanLabel = cleanProductOrMealLabel(candidate.label || candidate.product_name || candidate.name || "Product");
  const inferredKind = inferFoodEntityType({ label: cleanLabel, source: candidate.source_url || "label_image", cardKind: candidate.card_kind, ingredients: `${candidate.ingredients_text || ""} ${candidate.serving_label || ""} ${candidate.directions || ""}` });
  const cardKind = ["product", "drink_product", "ingredient"].includes(String(candidate.card_kind || "")) ? String(candidate.card_kind) : inferredKind;
  const currentJson = {
    ...(candidate.nutrition_json && typeof candidate.nutrition_json === "object" ? candidate.nutrition_json : {}),
    per_serving: per,
    supplement_facts: estimate.supplement_facts || candidate.supplement_facts || {},
    product_update_status: "updated",
    product_update_source: "label_image_scan",
    product_update_applied_at: new Date().toISOString(),
    serving_label: candidate.serving_label || null,
    package_quantity: candidate.package_quantity || null,
    directions: candidate.directions || null,
    prepared_volume_ml: Number(estimate.prepared_volume_ml || per.prepared_volume_ml || (/drink|scoop|water|gfuel|g fuel/i.test(`${candidate.label || ""} ${candidate.serving_label || ""} ${candidate.directions || ""}`) ? 500 : 0)) || null,
    ingredients_json: estimate.ingredients_json || candidate.ingredients_json || [],
    ingredient_ratio_json: estimate.ingredient_ratio_json || [],
    allergen_flags: estimate.allergen_flags || candidate.allergen_flags || [],
    dietary_flags: estimate.dietary_flags || candidate.dietary_flags || [],
    manufacturing_notes: estimate.manufacturing_notes || [],
    micronutrient_notes: estimate.micronutrient_notes || [],
    assumptions: estimate.assumptions || [],
  };

  const update = {
    label: cleanLabel,
    brand_name: nullableStringValue(candidate.brand_name || candidate.brand || null),
    card_kind: cardKind,
    product_data_source: "label_image_scan",
    product_data_confidence: Number(candidate.data_confidence || estimate.confidence || 80),
    nutrition_confidence: Number(estimate.confidence || candidate.data_confidence || 80),
    confidence_reason: nullableStringValue(candidate.confidence_reason || estimate.confidence_reason || "Read from submitted label image/source."),
    product_source_url: nullableStringValue(candidate.source_url || null),
    product_image_url: nullableStringValue(candidate.image_url || null),
    image_url: nullableStringValue(candidate.image_url || null) || undefined,
    calories: Number(per.calories || 0),
    protein_g: Number(per.protein_g || 0),
    carbs_g: Number(per.carbs_g || 0),
    fat_g: Number(per.fat_g || 0),
    fibre_g: Number(per.fibre_g || 0),
    sugar_g: Number(per.sugar_g || 0),
    added_sugar_g: Number(per.added_sugar_g || 0),
    salt_g: Number(per.salt_g || 0),
    saturated_fat_g: Number(per.saturated_fat_g || 0),
    sodium_mg: Number(per.sodium_mg || 0),
    potassium_mg: Number(per.potassium_mg || 0),
    calcium_mg: Number(per.calcium_mg || 0),
    iron_mg: Number(per.iron_mg || 0),
    magnesium_mg: Number(per.magnesium_mg || 0),
    zinc_mg: Number(per.zinc_mg || 0),
    folate_ug: Number(per.folate_ug || 0),
    niacin_mg: Number(per.niacin_mg || 0),
    thiamin_mg: Number(per.thiamin_mg || 0),
    vitamin_c_mg: Number(per.vitamin_c_mg || 0),
    vitamin_d_ug: Number(per.vitamin_d_ug || 0),
    vitamin_b12_ug: Number(per.vitamin_b12_ug || 0),
    caffeine_mg: Number(per.caffeine_mg || 0),
    ingredients: nullableStringValue(candidate.ingredients_text || candidate.other_ingredients || ""),
    ingredients_json: estimate.ingredients_json || candidate.ingredients_json || [],
    ingredient_ratio_json: estimate.ingredient_ratio_json || [],
    allergen_flags: estimate.allergen_flags || candidate.allergen_flags || [],
    dietary_flags: estimate.dietary_flags || candidate.dietary_flags || [],
    nutrition_json: currentJson,
    updated_at: new Date().toISOString(),
  } as Record<string, unknown>;

  Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);

  const { error } = await supabase.from("meals").update(update).eq("id", mealId).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  await supabase.from("nutrition_product_corrections").insert({
    user_id: user.id,
    meal_id: mealId,
    label: cleanLabel,
    source_url: nullableStringValue(candidate.source_url || null),
    notes: "Applied from label image scan.",
    status: "updated",
    resolved_at: new Date().toISOString(),
  }).then(() => null, () => null);

  revalidatePath("/nutrition");
  revalidatePath("/nutrition/cards");
  revalidatePath(`/nutrition/cards/${mealId}`);
}

function nullableStringValue(value: unknown) {
  const text = String(value || "").trim();
  return text ? text : null;
}


export async function createIngredientIntelligenceFromSearch(formData: FormData) {
  const { supabase, user } = await requireUser();
  const label = cleanProductOrMealLabel(formData.get("label") || formData.get("q") || "");
  const sourceUrl = nullableString(formData.get("source_url"));
  const notes = nullableString(formData.get("notes"));
  if (!label) throw new Error("Enter an ingredient or product name first.");

  const { data: existing } = await supabase
    .from("nutrition_ingredients")
    .select("id")
    .eq("user_id", user.id)
    .ilike("label", label)
    .limit(1)
    .maybeSingle();

  if (!existing?.id) {
    const starterText = sourceUrl
      ? `Starter intelligence record for ${label}. Source queued for AI/scraper review: ${sourceUrl}`
      : `Starter intelligence record for ${label}. Add a product URL, ingredient label or source to improve macro/micro accuracy.`;

    const { error } = await supabase.from("nutrition_ingredients").insert({
      user_id: user.id,
      label,
      source_url: sourceUrl,
      image_url: fallbackFoodImageUrl(label),
      source_type: "ai_seed_pending",
      data_confidence: sourceUrl ? 45 : 30,
      serving_label: "Unknown serving — needs source",
      ingredients_text: starterText,
      ingredients_json: [],
      nutrition_json: {
        intelligence_status: "queued_for_enrichment",
        created_from: "ingredient_info_button",
        source_url: sourceUrl,
        notes,
        caution: "Starter record only. Values remain zero until a verified source, label scan or AI/scrape enrichment updates it.",
      },
      allergen_flags: [],
      dietary_flags: ["needs_source"],
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fibre_g: 0,
      sugar_g: 0,
      salt_g: 0,
      saturated_fat_g: 0,
      caffeine_mg: 0,
      use_count: 0,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  }

  await supabase.from("nutrition_product_corrections").insert({
    user_id: user.id,
    label,
    source_url: sourceUrl,
    notes: notes || "Create/enrich ingredient intelligence from the empty ingredient page.",
    status: "queued",
    result_json: {
      request_type: "ingredient_intelligence_enrichment",
      requested_from: "/nutrition/ingredients",
      source_url: sourceUrl,
    },
  }).then(() => null, () => null);

  revalidatePath("/nutrition/ingredients");
  redirect(`/nutrition/ingredients?q=${encodeURIComponent(label)}`);
}

export async function generateMealMethod(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing card id.");
  const { data: meal, error: mealError } = await supabase.from("meals").select("id, label, card_kind, product_data_source, ingredients_json, ingredients, nutrition_json").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (mealError) throw new Error(mealError.message);
  if (!meal) throw new Error("Card not found.");
  if (isProductLikeKind(`${meal.card_kind || ""} ${meal.product_data_source || ""}`)) throw new Error("Products do not need a cooking method.");
  const ingredientRows = Array.isArray(meal.ingredients_json) && meal.ingredients_json.length ? meal.ingredients_json : String(meal.ingredients || "").split(/\r?\n|,/).map((name) => ({ name: name.trim() })).filter((item) => item.name);
  const instructions = simpleGeneratedMethod(String(meal.label || "recipe"), ingredientRows);
  const currentJson = meal.nutrition_json && typeof meal.nutrition_json === "object" ? meal.nutrition_json : {};
  const { error } = await supabase.from("meals").update({ nutrition_json: { ...currentJson, instructions, method_generated_at: new Date().toISOString(), method_source: "inside_loop_generated" }, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/nutrition/cards");
  revalidatePath(`/nutrition/cards/${id}`);
  revalidatePath("/nutrition");
}

export async function updateFoodEntry(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing food log id.");
  const label = String(formData.get("label") || "Food entry").trim() || "Food entry";
  const multiplier = Math.max(0.05, numberField(formData, "serving_multiplier", 1));
  const eatenAt = nullableString(formData.get("eaten_at"));
  const drinkVolumeMl = Math.max(0, Math.round(numberField(formData, "drink_volume_ml", 0)));
  const imageUrl = nullableString(formData.get("image_url")) || fallbackFoodImageUrl(label);
  const nutrition = scaleNutritionTotals(nutritionPayload(formData), multiplier);
  const { error } = await supabase
    .from("food_logs")
    .update({
      person_id: nullableString(formData.get("person_id")),
      eaten_on: String(formData.get("eaten_on") || new Date().toISOString().slice(0, 10)),
      eaten_at: eatenAt,
      drink_volume_ml: drinkVolumeMl,
      meal_slot: String(formData.get("meal_slot") || "meal"),
      serving_multiplier: multiplier,
      label,
      image_url: imageUrl,
      notes: nullableString(formData.get("notes")),
      ...nutrition,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  const linkedMealId = nullableString(formData.get("meal_id"));
  if (linkedMealId && imageUrl) {
    await supabase.from("meals").update({ image_url: imageUrl, product_image_url: imageUrl, updated_at: new Date().toISOString() }).eq("id", linkedMealId).eq("user_id", user.id);
  }
  revalidatePath("/nutrition");
  revalidatePath("/nutrition/day");
  revalidatePath("/lifestyle");
}

export async function deleteFoodEntry(formData: FormData) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("food_logs").delete().eq("id", String(formData.get("id") || "")).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/nutrition");
  revalidatePath("/nutrition/cards");
  revalidatePath("/nutrition/ingredients");
}

export async function updateNutritionSettings(formData: FormData) {
  const { supabase, user } = await requireUser();
  const payload = {
    user_id: user.id,
    health_child_scaling_enabled: formData.get("health_child_scaling_enabled") === "on",
    health_child_logging_enabled: formData.get("health_child_logging_enabled") === "on",
    health_apple_health_enabled: formData.get("health_apple_health_enabled") === "on",
    health_prompt_for_time_enabled: formData.get("health_prompt_for_time_enabled") === "on",
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("app_user_profiles").upsert(payload, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/nutrition");
  revalidatePath("/account");
}
