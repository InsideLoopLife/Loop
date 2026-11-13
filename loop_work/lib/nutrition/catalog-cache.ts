import "server-only";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { cleanBarcode, isShareableExternalCandidate, type ProductLookupCandidate } from "@/lib/nutrition/product-data";
import { compactJson } from "@/lib/security/external-data";

export function productKey(value: { label?: string | null; brand_name?: string | null; brand?: string | null; source_url?: string | null; gtin?: string | null; barcode?: string | null }) {
  const id = cleanBarcode(value.gtin || value.barcode);
  if (id) return `gtin:${id}`;
  const base = `${value.brand_name || value.brand || ""} ${value.label || ""} ${value.source_url || ""}`
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
  return base ? `name:${base}` : null;
}

/**
 * Shares a product with other Loop users only once someone has actually picked and logged it,
 * and only when it came from a real source, is reasonably confident and its calories add up.
 */
export async function sharePickedProduct(candidate: ProductLookupCandidate | null | undefined) {
  if (!candidate || !candidate.label || !candidate.estimate) return false;
  if (!hasSupabaseAdminKey() || !isShareableExternalCandidate(candidate)) return false;
  const key = productKey(candidate);
  if (!key) return false;
  const row = {
    product_key: key,
    barcode: candidate.barcode || null,
    gtin: candidate.gtin || candidate.barcode || null,
    product_name: candidate.label.slice(0, 220),
    brand_name: candidate.brand_name || null,
    source: candidate.source === "global_cache" ? "open_food_facts" : candidate.source,
    source_url: candidate.source_url || null,
    image_url: candidate.image_url || null,
    ingredients_text: candidate.ingredients_text || null,
    serving_label: candidate.serving_label || null,
    package_quantity: candidate.package_quantity || null,
    data_confidence: candidate.data_confidence,
    lookup_json: compactJson({ ...candidate, suggested_amount: null, match_score: undefined }, 65_000),
    last_seen_at: new Date().toISOString(),
  };
  try {
    const { error } = await createAdminClient().from("nutrition_global_product_catalog").upsert(row, { onConflict: "product_key", ignoreDuplicates: false });
    return !error;
  } catch {
    return false;
  }
}
