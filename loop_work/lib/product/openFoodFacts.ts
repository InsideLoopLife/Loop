import { gtinTo14 } from "./providers";

type OffProduct = Record<string, any>;
function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function mapOpenFoodFactsToCard(product: OffProduct, barcode: string) {
  const n = product.nutriments || {};
  const name = product.product_name_en || product.product_name || "Unknown product";
  const image = product.image_front_url || product.image_url || null;
  return {
    card_kind: "product",
    visibility: "shared_database",
    product_type: /drink|beverage|juice|cola|energy drink|water/i.test(`${product.categories || ""} ${name}`) ? "drink" : "food",
    display_name: name,
    formal_name: name,
    brand_name: product.brands?.split(",")[0]?.trim() || null,
    barcode,
    gtin: barcode,
    gtin14: gtinTo14(barcode),
    source_provider: "open_food_facts",
    source_priority: 90,
    source_url: `https://world.openfoodfacts.org/product/${barcode}`,
    source_host: "world.openfoodfacts.org",
    main_image_url: image,
    category: product.categories || null,
    pack_size: product.quantity || null,
    calories: num(n["energy-kcal_100g"]) || num(n["energy-kcal_serving"]),
    protein_g: num(n.proteins_100g) || num(n.proteins_serving),
    carbs_g: num(n.carbohydrates_100g) || num(n.carbohydrates_serving),
    fat_g: num(n.fat_100g) || num(n.fat_serving),
    fibre_g: num(n.fiber_100g) || num(n.fiber_serving),
    sugar_g: num(n.sugars_100g) || num(n.sugars_serving),
    salt_g: num(n.salt_100g) || num(n.salt_serving),
    sodium_mg: num(n.sodium_100g) ? Number(n.sodium_100g) * 1000 : null,
    nutrition: {
      source: "open_food_facts",
      quantity: product.quantity || null,
      ingredients_text: product.ingredients_text_en || product.ingredients_text || null,
      allergens: product.allergens || null,
      traces: product.traces || null,
      nutriments: n,
    },
    confidence: product.product_name || product.product_name_en ? 78 : 55,
    data_origin: "open_food_facts",
    match_status: "provider_match",
    canonical_search_text: [name, product.brands, product.categories, product.quantity].filter(Boolean).join(" ").toLowerCase(),
    external_ids: { open_food_facts_code: barcode },
  };
}

export async function lookupOpenFoodFactsByBarcode(barcode: string) {
  const clean = barcode.replace(/[^0-9]/g, "");
  const gtin14 = gtinTo14(clean);
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(clean)}.json`, {
      headers: { accept: "application/json", "user-agent": process.env.OPEN_FOOD_FACTS_USER_AGENT || "InsideLoop/0.1 (support@insideloop.life)" },
      cache: "no-store",
    });
    if (res.status === 404) return { status: "not_found" as const, source: "open_food_facts", barcode: clean, gtin14 };
    if (!res.ok) return { status: "failed" as const, source: "open_food_facts", barcode: clean, gtin14, error: `HTTP ${res.status}` };
    const raw: any = await res.json();
    const product = raw.product || raw.products?.[0];
    if (!product) return { status: "not_found" as const, source: "open_food_facts", barcode: clean, gtin14, raw };
    return { status: "found" as const, source: "open_food_facts", barcode: clean, gtin14, product, raw };
  } catch (error: any) {
    return { status: "failed" as const, source: "open_food_facts", barcode: clean, gtin14, error: error?.message || "Open Food Facts lookup failed." };
  }
}
