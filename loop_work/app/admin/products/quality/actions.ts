
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createBestAdminClient, requireAdminAccess } from "@/lib/admin/access";
import { parseNumber } from "@/lib/format/money";

const MAX_PRODUCT_IMAGE_BYTES = 6 * 1024 * 1024;

function text(value: FormDataEntryValue | null) {
  const out = String(value || "").trim();
  return out.length ? out : null;
}

function safeExternalImageUrl(raw: string | null) {
  const value = String(raw || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isAppOwnedImage(raw: string | null) {
  const value = String(raw || "").toLowerCase();
  return value.includes("/storage/v1/object/public/product-images/") || value.includes("supabase") && value.includes("product-images");
}

function extFromContentType(contentType: string) {
  const clean = contentType.toLowerCase();
  if (clean.includes("png")) return "png";
  if (clean.includes("webp")) return "webp";
  if (clean.includes("gif")) return "gif";
  return "jpg";
}

async function importExternalProductImage(admin: ReturnType<typeof createBestAdminClient>, productId: string, imageUrl: string | null) {
  const safeUrl = safeExternalImageUrl(imageUrl);
  if (!admin || !safeUrl || isAppOwnedImage(safeUrl)) return { cachedUrl: imageUrl, sourceUrl: null as string | null, path: null as string | null, imported: false };

  try {
    const response = await fetch(safeUrl, {
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": "Inside LOOP product-image-import/1.0",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.1",
        Referer: new URL(safeUrl).origin,
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`Image fetch failed ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) throw new Error("URL did not return an image");
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_PRODUCT_IMAGE_BYTES) throw new Error("Image too large");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_PRODUCT_IMAGE_BYTES) throw new Error("Image too large");
    const ext = extFromContentType(contentType);
    const path = `admin-products/${productId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await admin.storage.from("product-images").upload(path, Buffer.from(bytes), {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });
    if (uploadError) throw uploadError;
    const { data } = admin.storage.from("product-images").getPublicUrl(path);
    return { cachedUrl: data.publicUrl, sourceUrl: safeUrl, path, imported: true };
  } catch {
    return { cachedUrl: imageUrl, sourceUrl: safeUrl, path: null as string | null, imported: false };
  }
}

function qualityFrom(input: {
  image: string | null;
  source: string | null;
  calories: number | null | undefined;
  confidence: number;
  protein: number | null | undefined;
  carbs: number | null | undefined;
  fat: number | null | undefined;
  fibre: number | null | undefined;
  sugar: number | null | undefined;
  salt: number | null | undefined;
  micronutrients: string | null;
}) {
  const hasImage = Boolean(input.image);
  const hasNutrition = input.calories !== null && input.calories !== undefined;
  const macroValues = [input.protein, input.carbs, input.fat, input.fibre, input.sugar, input.salt];
  const hasMacros = macroValues.filter((value) => value !== null && value !== undefined).length >= 4;
  const hasMicros = Boolean(input.micronutrients && input.micronutrients.trim().length > 2);
  const hasSource = Boolean(input.source);
  const confidenceOk = input.confidence >= 70;
  const score = (hasImage ? 15 : 0) + (hasNutrition ? 25 : 0) + (hasMacros ? 15 : 0) + (hasMicros ? 10 : 0) + (hasSource ? 20 : 0) + (confidenceOk ? 15 : 0);
  const missing = [
    hasImage ? null : "image",
    hasNutrition ? null : "nutrition",
    hasMacros ? null : "macro_nutrients",
    hasMicros ? null : "micro_nutrients",
    hasSource ? null : "verified_source",
    confidenceOk ? null : "confidence",
  ].filter(Boolean) as string[];
  return { score, missing, hasImage, hasNutrition, hasMacros, hasMicros, hasSource };
}

export async function saveProductQualityOverride(formData: FormData) {
  await requireAdminAccess();
  const supabase = await createClient();
  const admin = createBestAdminClient();
  const db = admin || supabase;
  const productId = String(formData.get("product_id") || "").trim();
  if (!productId) throw new Error("Missing product id.");

  const rawImage = text(formData.get("main_image_url"));
  const importedImage = await importExternalProductImage(admin, productId, rawImage);
  const image = text(formData.get("cached_main_image_url")) || importedImage.cachedUrl || rawImage;
  const source = text(formData.get("source_url"));
  const calories = parseNumber(formData.get("calories"));
  const protein = parseNumber(formData.get("protein_g"));
  const carbs = parseNumber(formData.get("carbs_g"));
  const fat = parseNumber(formData.get("fat_g"));
  const fibre = parseNumber(formData.get("fibre_g"));
  const sugar = parseNumber(formData.get("sugar_g"));
  const salt = parseNumber(formData.get("salt_g"));
  const micronutrients = text(formData.get("micronutrients"));
  const confidence = Math.max(0, Math.min(100, Math.round(parseNumber(formData.get("confidence")) ?? 100)));
  const quality = qualityFrom({ image, source: source || text(formData.get("source_provider")), calories, confidence, protein, carbs, fat, fibre, sugar, salt, micronutrients });

  const payload = {
    card_id: productId,
    item_kind: text(formData.get("item_kind")) || "product",
    display_name: text(formData.get("display_name")) || "Unnamed product",
    brand_name: text(formData.get("brand_name")),
    product_type: text(formData.get("product_type")),
    source_provider: text(formData.get("source_provider")),
    source_url: source,
    source_image_url: importedImage.sourceUrl,
    main_image_url: image,
    cached_main_image_url: importedImage.imported ? image : text(formData.get("cached_main_image_url")),
    image_storage_path: importedImage.path,
    calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    fibre_g: fibre,
    sugar_g: sugar,
    salt_g: salt,
    micronutrients,
    confidence,
    has_image: quality.hasImage,
    has_nutrition: quality.hasNutrition,
    has_verified_source: quality.hasSource,
    has_macros: quality.hasMacros,
    has_micros: quality.hasMicros,
    quality_score: quality.score,
    missing_fields: quality.missing,
    admin_note: text(formData.get("admin_note")),
    status: quality.missing.length ? "needs_review" : "complete",
    hidden_by_admin: false,
    last_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await db.from("loop_product_quality_snapshots").upsert(payload, { onConflict: "card_id" });
  if (error) {
    // Fallback to the security-definer RPC installed by v27.89. This avoids RLS blocking admin edits.
    const rpc = await supabase.rpc("loop_admin_save_product_quality_snapshot", { p_payload: payload });
    if (rpc.error) throw new Error(`${error.message}; RPC fallback failed: ${rpc.error.message}`);
  }
  revalidatePath("/admin/products/quality");
}

export async function archiveProductQualityItem(formData: FormData) {
  await requireAdminAccess();
  const supabase = await createClient();
  const admin = createBestAdminClient();
  const db = admin || supabase;
  const productId = String(formData.get("product_id") || "").trim();
  if (!productId) throw new Error("Missing product id.");
  const displayName = text(formData.get("display_name")) || "Archived product";
  const payload = {
    card_id: productId,
    display_name: displayName,
    hidden_by_admin: true,
    status: "archived",
    updated_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
  };
  const { error } = await db.from("loop_product_quality_snapshots").upsert(payload, { onConflict: "card_id" });
  if (error) {
    const rpc = await supabase.rpc("loop_admin_archive_product_quality_item", { p_card_id: productId, p_display_name: displayName });
    if (rpc.error) throw new Error(`${error.message}; RPC fallback failed: ${rpc.error.message}`);
  }
  revalidatePath("/admin/products/quality");
}
