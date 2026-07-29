import type { ProductImportNormalised } from "./types";

const HEADER_ALIASES: Record<string, keyof ProductImportNormalised> = {
  import_key: "import_key",
  card_kind: "card_kind",
  visibility: "visibility",
  name: "product_name",
  title: "product_name",
  product: "product_name",
  product_title: "product_name",
  product_name: "product_name",
  display_name: "product_name",
  formal_name: "formal_name",
  brand: "brand",
  brand_name: "brand",
  vendor: "brand",
  manufacturer: "brand",
  variant: "variant_name",
  variant_name: "variant_name",
  type: "product_type",
  product_type: "product_type",
  kind: "product_type",
  category: "category",
  category_path: "category_path",
  shop_tag: "shop_tag",
  retailer_article_number: "retailer_article_number",
  article_number: "retailer_article_number",
  dedupe_key: "dedupe_key",

  serving: "serving_size",
  serving_size: "serving_size",
  serving_amount: "serving_size",
  serving_unit: "serving_unit",
  unit: "serving_unit",
  serving_label: "serving_label",
  serving_ml: "serving_ml",
  serving_g: "serving_g",
  volume_ml: "prepared_volume_ml",
  drink_volume_ml: "prepared_volume_ml",
  prepared_volume_ml: "prepared_volume_ml",
  ml: "prepared_volume_ml",
  package_count: "package_count",
  pack_count: "package_count",
  pack_size: "pack_size",
  servings: "pack_size",
  product_size_text: "product_size_text",

  barcode: "barcode",
  gtin: "barcode",
  ean: "barcode",
  upc: "barcode",
  url: "source_url",
  source: "source_url",
  source_url: "source_url",
  product_url: "source_url",
  source_host: "source_host",
  image: "image_url",
  image_url: "image_url",
  main_image_url: "image_url",
  image_harvest_mode: "image_harvest_mode",
  image_alt: "image_alt",

  ingredients: "ingredients",
  ingredient_list: "ingredients",
  ingredients_text: "ingredients",
  ingredients_source_type: "ingredients_source_type",
  allergens: "allergens",
  allergy: "allergens",
  allergy_advice: "allergens",
  contains_allergens_source: "allergens",
  may_contain: "may_contain",
  traces: "may_contain",
  may_contain_allergens_source: "may_contain",
  inferred_possible_allergens: "inferred_possible_allergens",
  allergen_source_type: "allergen_source_type",

  calories: "calories",
  kcal: "calories",
  energy_kcal: "calories",
  protein: "protein_g",
  protein_g: "protein_g",
  carbs: "carbs_g",
  carbohydrate: "carbs_g",
  carbohydrates: "carbs_g",
  carbs_g: "carbs_g",
  fat: "fat_g",
  fat_g: "fat_g",
  fibre: "fibre_g",
  fiber: "fibre_g",
  fibre_g: "fibre_g",
  sugar: "sugar_g",
  sugars: "sugar_g",
  sugar_g: "sugar_g",
  added_sugar: "added_sugar_g",
  added_sugars: "added_sugar_g",
  added_sugar_g: "added_sugar_g",
  saturated_fat: "saturated_fat_g",
  saturates: "saturated_fat_g",
  saturated_fat_g: "saturated_fat_g",
  salt: "salt_g",
  salt_g: "salt_g",
  sodium: "sodium_mg",
  sodium_mg: "sodium_mg",
  caffeine: "caffeine_mg",
  caffeine_mg: "caffeine_mg",

  alcohol_g: "alcohol_g",
  abv_percent: "abv_percent",
  abv: "abv_percent",
  is_alcohol: "is_alcohol",
  nutrition_source_type: "nutrition_source_type",
  estimate_confidence: "estimate_confidence",
  confidence: "confidence",
  score: "score",
  is_verified: "is_verified",
  dietary_flags_pipe: "dietary_flags",
  dietary_flags: "dietary_flags",

  price: "price",
  price_amount: "price",
  price_currency: "price_currency",
  price_text: "price_text",
  retailer: "retailer",
  retailer_name: "retailer",
  shop: "retailer",
  notes: "notes",
  raw_notes: "raw_notes",
  consumer_notice: "consumer_notice",
  nutrition_json: "nutrition_json",
};

const NUMBER_FIELDS = new Set<keyof ProductImportNormalised>([
  "serving_size",
  "serving_ml",
  "serving_g",
  "prepared_volume_ml",
  "package_count",
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "fibre_g",
  "sugar_g",
  "added_sugar_g",
  "saturated_fat_g",
  "salt_g",
  "sodium_mg",
  "caffeine_mg",
  "alcohol_g",
  "abv_percent",
  "estimate_confidence",
  "confidence",
  "score",
  "price",
]);

export function normaliseProductType(value: unknown): "drink" | "food" | "other" {
  const text = String(value || "").toLowerCase();
  if (/drink|beverage|coffee|latte|cola|juice|water|energy|alcohol|beer|wine|cider|smoothie|milkshake|tea/.test(text)) return "drink";
  if (/supplement|vitamin|powder|capsule|tablet|other/.test(text)) return "other";
  return "food";
}

function numberOrNull(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.toLowerCase() === "nan") return null;
  const cleaned = raw.replace(/,/g, "").replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "nan" || text.toLowerCase() === "null") return null;
  return text;
}

function booleanOrNull(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text || text === "nan" || text === "null") return null;
  if (["true", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n"].includes(text)) return false;
  return null;
}

function parseJson(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function splitPipe(value: unknown) {
  const text = cleanText(value);
  if (!text) return [];
  return text.split(/[|;]/).map((x) => x.trim()).filter(Boolean);
}

function supportValue(support: ProductImportNormalised["source_snapshot"], key: string) {
  if (!support) return null;
  const value = support[key];
  return cleanText(value);
}

export function normaliseImportRow(
  row: Record<string, unknown>,
  support?: {
    source_snapshot?: Record<string, unknown>;
    serving_options?: Record<string, unknown>[];
    source_allergens?: Record<string, unknown>[];
  }
): ProductImportNormalised & { warnings: string[] } {
  const normalised: Record<string, unknown> = {};
  const warnings: string[] = [];

  for (const [header, value] of Object.entries(row)) {
    const headerKey = header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const key = HEADER_ALIASES[header] || HEADER_ALIASES[headerKey];
    if (!key) continue;
    normalised[key] = value;
  }

  if (support?.source_snapshot) {
    normalised.source_snapshot = support.source_snapshot;
    normalised.image_url ||= supportValue(support.source_snapshot, "main_image_url");
    normalised.price ||= supportValue(support.source_snapshot, "price_amount");
    normalised.price_text ||= supportValue(support.source_snapshot, "price_text");
    normalised.price_currency ||= supportValue(support.source_snapshot, "price_currency");
    normalised.ingredients ||= supportValue(support.source_snapshot, "ingredients_text");
    normalised.allergens ||= supportValue(support.source_snapshot, "allergens_text");
    normalised.retailer ||= supportValue(support.source_snapshot, "retailer_name");
    normalised.source_host ||= supportValue(support.source_snapshot, "source_host");
  }

  if (support?.serving_options?.length) normalised.serving_options = support.serving_options;
  if (support?.source_allergens?.length) normalised.source_allergens = support.source_allergens;

  for (const key of NUMBER_FIELDS) {
    if (key in normalised) normalised[key] = numberOrNull(normalised[key]);
  }

  if ("is_alcohol" in normalised) normalised.is_alcohol = booleanOrNull(normalised.is_alcohol);
  if ("is_verified" in normalised) normalised.is_verified = booleanOrNull(normalised.is_verified);
  if ("nutrition_json" in normalised) normalised.nutrition_json = parseJson(normalised.nutrition_json);
  if ("dietary_flags" in normalised) normalised.dietary_flags = splitPipe(normalised.dietary_flags);

  const productName = cleanText(normalised.product_name) || cleanText(normalised.formal_name);
  if (!productName) warnings.push("Missing product_name. This row will need review.");

  const productType = normaliseProductType(normalised.product_type || normalised.category_path || normalised.category || productName);
  const sourceUrl = cleanText(normalised.source_url);
  const imageUrl = cleanText(normalised.image_url);
  const ingredients = cleanText(normalised.ingredients);

  if (!sourceUrl) warnings.push("No source_url. Product can import, but cannot refresh price/image automatically.");
  if (!imageUrl && cleanText(normalised.image_harvest_mode)) warnings.push("No image URL supplied. Image will be fetched from source page during enrichment/cron if possible.");
  if (!ingredients) warnings.push("No ingredient text yet. AI/source enrichment should fill or mark as estimate.");

  return {
    import_key: cleanText(normalised.import_key),
    card_kind: (cleanText(normalised.card_kind) as any) || "product",
    visibility: (cleanText(normalised.visibility) as any) || "shared_database",
    product_name: productName || "Unnamed product",
    formal_name: cleanText(normalised.formal_name) || productName || null,
    brand: cleanText(normalised.brand),
    variant_name: cleanText(normalised.variant_name),
    product_type: productType,
    category: cleanText(normalised.category) || cleanText(normalised.category_path),
    category_path: cleanText(normalised.category_path),
    shop_tag: cleanText(normalised.shop_tag),
    retailer_article_number: cleanText(normalised.retailer_article_number),
    dedupe_key: cleanText(normalised.dedupe_key),
    serving_label: cleanText(normalised.serving_label),
    serving_size: numberOrNull(normalised.serving_size),
    serving_unit: cleanText(normalised.serving_unit),
    serving_ml: numberOrNull(normalised.serving_ml),
    serving_g: numberOrNull(normalised.serving_g),
    prepared_volume_ml: numberOrNull(normalised.prepared_volume_ml),
    package_count: numberOrNull(normalised.package_count),
    pack_size: cleanText(normalised.pack_size),
    product_size_text: cleanText(normalised.product_size_text),
    barcode: cleanText(normalised.barcode),
    source_url: sourceUrl,
    source_host: cleanText(normalised.source_host) || sourceHost(sourceUrl),
    image_url: imageUrl,
    image_harvest_mode: cleanText(normalised.image_harvest_mode),
    image_alt: cleanText(normalised.image_alt),
    ingredients,
    ingredients_source_type: cleanText(normalised.ingredients_source_type),
    allergens: cleanText(normalised.allergens),
    may_contain: cleanText(normalised.may_contain),
    inferred_possible_allergens: cleanText(normalised.inferred_possible_allergens),
    allergen_source_type: cleanText(normalised.allergen_source_type),
    calories: numberOrNull(normalised.calories),
    protein_g: numberOrNull(normalised.protein_g),
    carbs_g: numberOrNull(normalised.carbs_g),
    fat_g: numberOrNull(normalised.fat_g),
    fibre_g: numberOrNull(normalised.fibre_g),
    sugar_g: numberOrNull(normalised.sugar_g),
    added_sugar_g: numberOrNull(normalised.added_sugar_g),
    saturated_fat_g: numberOrNull(normalised.saturated_fat_g),
    salt_g: numberOrNull(normalised.salt_g),
    sodium_mg: numberOrNull(normalised.sodium_mg),
    caffeine_mg: numberOrNull(normalised.caffeine_mg),
    alcohol_g: numberOrNull(normalised.alcohol_g),
    abv_percent: numberOrNull(normalised.abv_percent),
    is_alcohol: booleanOrNull(normalised.is_alcohol),
    nutrition_source_type: cleanText(normalised.nutrition_source_type),
    estimate_confidence: numberOrNull(normalised.estimate_confidence),
    confidence: numberOrNull(normalised.confidence),
    score: numberOrNull(normalised.score),
    is_verified: booleanOrNull(normalised.is_verified),
    dietary_flags: Array.isArray(normalised.dietary_flags) ? normalised.dietary_flags as string[] : [],
    price: numberOrNull(normalised.price),
    price_currency: cleanText(normalised.price_currency) || "GBP",
    price_text: cleanText(normalised.price_text),
    retailer: cleanText(normalised.retailer),
    notes: cleanText(normalised.notes),
    raw_notes: cleanText(normalised.raw_notes),
    consumer_notice: cleanText(normalised.consumer_notice),
    nutrition_json: normalised.nutrition_json as Record<string, unknown> | null || null,
    source_snapshot: support?.source_snapshot || null,
    serving_options: support?.serving_options || [],
    source_allergens: support?.source_allergens || [],
    warnings,
  };
}

export function sourceHost(sourceUrl?: string | null) {
  if (!sourceUrl) return null;
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function servingLabel(row: ProductImportNormalised) {
  if (row.serving_label) return row.serving_label;
  if (row.prepared_volume_ml) return `${row.prepared_volume_ml}ml prepared drink`;
  if (row.serving_ml) return `${row.serving_ml}ml`;
  if (row.serving_g) return `${row.serving_g}g`;
  if (row.serving_size && row.serving_unit) return `${row.serving_size}${row.serving_unit}`;
  if (row.serving_size) return String(row.serving_size);
  return row.product_size_text || null;
}

export function sizeForCard(row: ProductImportNormalised) {
  return {
    serving_ml: row.serving_ml || (row.product_type === "drink" ? row.prepared_volume_ml || null : null),
    serving_g: row.serving_g || (row.serving_unit?.toLowerCase() === "g" ? row.serving_size || null : null),
    prepared_volume_ml: row.prepared_volume_ml || null,
  };
}
