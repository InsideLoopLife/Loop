"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createBestAdminClient, requireAdminAccess } from "@/lib/admin/access";
import { toCsv } from "@/lib/nutrition/imports/csv";
import { parseProductImportFile } from "@/lib/nutrition/imports/package";
import { normaliseImportRow, servingLabel, sizeForCard, sourceHost } from "@/lib/nutrition/imports/normalise";
import { enrichProductRow } from "@/lib/nutrition/imports/enrichment";
import { parseIngredientTextToTree } from "@/lib/nutrition/v27_67/ingredients";
import { parseAllergenFacts } from "@/lib/nutrition/v27_67/allergens";
import type { ProductEnrichmentResult, ProductImportNormalised } from "@/lib/nutrition/imports/types";

async function adminClient() {
  return createBestAdminClient() || await createClient();
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").replace(/,/g, "").replace(/[^0-9.\-]/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown) {
  const text = String(value ?? "").trim();
  return text && text.toLowerCase() !== "nan" && text.toLowerCase() !== "null" ? text : null;
}

function productDisplayName(row: ProductImportNormalised | ProductEnrichmentResult) {
  const base = row.product_name || "Unnamed product";
  if (row.prepared_volume_ml && !base.toLowerCase().includes("ml")) return `${base} (${row.prepared_volume_ml}ml)`;
  if (row.serving_ml && !base.toLowerCase().includes("ml")) return `${base} (${row.serving_ml}ml)`;
  if (row.serving_g && !base.toLowerCase().includes("g")) return `${base} (${row.serving_g}g)`;
  if (row.serving_size && row.serving_unit && !base.toLowerCase().includes(String(row.serving_unit).toLowerCase())) {
    return `${base} (${row.serving_size}${row.serving_unit})`;
  }
  return base;
}

function cardPayload(row: ProductImportNormalised | ProductEnrichmentResult, accessUserId: string, batchId?: string, rowId?: string) {
  const calories = asNumber(row.calories);
  const productType = row.product_type || "food";
  const flags = Array.isArray(row.dietary_flags) ? row.dietary_flags : [];
  const sizes = sizeForCard(row);

  return {
    card_kind: row.card_kind || "product",
    visibility: row.visibility || "shared_database",
    product_type: productType,
    owner_user_id: accessUserId,
    display_name: productDisplayName(row),
    formal_name: row.formal_name || row.product_name,
    brand_name: row.brand || null,
    variant_name: row.variant_name || null,
    category: row.category || row.category_path || null,
    barcode: row.barcode || null,
    shop_tag: row.shop_tag || null,
    retailer_article_number: row.retailer_article_number || null,
    dedupe_key: row.dedupe_key || null,
    source_url: row.source_url || null,
    source_host: row.source_host || sourceHost(row.source_url),
    main_image_url: row.image_url || null,
    image_harvest_mode: row.image_harvest_mode || null,
    image_alt: row.image_alt || null,
    serving_label: servingLabel(row),
    serving_ml: sizes.serving_ml,
    serving_g: sizes.serving_g,
    prepared_volume_ml: sizes.prepared_volume_ml,
    package_count: row.package_count || null,
    product_size_text: row.product_size_text || row.pack_size || null,
    calories,
    protein_g: asNumber(row.protein_g),
    carbs_g: asNumber(row.carbs_g),
    fat_g: asNumber(row.fat_g),
    fibre_g: asNumber(row.fibre_g),
    sugar_g: asNumber(row.sugar_g),
    added_sugar_g: asNumber(row.added_sugar_g),
    saturated_fat_g: asNumber(row.saturated_fat_g),
    salt_g: asNumber(row.salt_g),
    sodium_mg: asNumber(row.sodium_mg),
    caffeine_mg: asNumber(row.caffeine_mg),
    nutrition: {
      imported: true,
      import_batch_id: batchId || null,
      import_row_id: rowId || null,
      import_key: row.import_key || null,
      shop_tag: row.shop_tag || null,
      retailer_article_number: row.retailer_article_number || null,
      product_size_text: row.product_size_text || null,
      ingredients: row.ingredients || null,
      allergens: row.allergens || null,
      may_contain: row.may_contain || null,
      inferred_possible_allergens: row.inferred_possible_allergens || null,
      is_alcohol: row.is_alcohol ?? false,
      abv_percent: row.abv_percent ?? null,
      alcohol_g: row.alcohol_g ?? null,
      nutrition_source_type: row.nutrition_source_type || null,
      ingredients_source_type: row.ingredients_source_type || null,
      allergen_source_type: row.allergen_source_type || null,
      consumer_notice: row.consumer_notice || null,
      raw_notes: row.raw_notes || row.notes || null,
      source_snapshot: row.source_snapshot || null,
      nutrition_json: row.nutrition_json || null,
    },
    dietary_flags: flags,
    confidence: asNumber(row.confidence) || asNumber(row.estimate_confidence) || 50,
    score: asNumber(row.score),
    status: "active",
    is_verified: Boolean(row.is_verified),
    data_quality_status: "data_quality_status" in row ? row.data_quality_status : row.is_verified ? "verified" : row.nutrition_source_type === "estimated_from_product_class" ? "estimated" : "imported",
    enrichment_status: "confidence" in row ? "ai_enriched" : "not_requested",
    enrichment_note: "warnings" in row && row.warnings?.length ? row.warnings.join(" | ") : null,
    last_enriched_at: "confidence" in row ? new Date().toISOString() : null,
    price_refresh_status: row.source_url ? "queued" : "not_requested",
    import_batch_id: batchId || null,
    import_row_id: rowId || null,
  };
}

async function replaceIngredients(supabase: any, cardId: string, row: ProductImportNormalised | ProductEnrichmentResult) {
  if (!row.ingredients) return;
  try {
    const { error: ingredientsDeleteError } = await supabase.from("loop_nutrition_card_ingredients").delete().eq("card_id", cardId);
    if (ingredientsDeleteError) throw new Error(ingredientsDeleteError.message);
    const tree = parseIngredientTextToTree(row.ingredients);
    const rows: any[] = [];

    function walk(items: any[], parentId: string | null = null, section = "Ingredients") {
      items.forEach((item, index) => {
        const id = crypto.randomUUID();
        rows.push({
          id,
          card_id: cardId,
          parent_id: parentId,
          sort_order: index,
          section_label: section,
          ingredient_name: item.ingredient_name,
          quantity_text: item.quantity_text || null,
          percentage: item.percentage || null,
          raw_text: item.raw_text || null,
          info_mode: item.info_mode || (item.children?.length ? "expand" : "raw_only"),
          confidence: 70,
        });
        if (item.children?.length) walk(item.children, id, item.ingredient_name);
      });
    }

    walk(tree);
    if (rows.length) await supabase.from("loop_nutrition_card_ingredients").insert(rows);
  } catch {
    // Older installs may not have the ingredient tree table yet. Raw ingredient text remains in nutrition JSON.
  }
}

function explicitAllergenRows(cardId: string, row: ProductImportNormalised | ProductEnrichmentResult) {
  const rows: any[] = [];
  const sourceUrl = row.source_url || null;
  const add = (key: string, label: string, presence: "contains" | "may_contain", evidence: string, confidence = 90) => {
    const cleanKey = key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!cleanKey) return;
    rows.push({
      card_id: cardId,
      allergen_key: cleanKey,
      allergen_label: label || key,
      presence,
      evidence_text: evidence || null,
      source_url: sourceUrl,
      confidence,
      locked: true,
    });
  };

  if (Array.isArray(row.source_allergens) && row.source_allergens.length) {
    for (const fact of row.source_allergens) {
      const key = asText(fact.allergen_key) || asText(fact.allergen_label);
      const label = asText(fact.allergen_label) || key;
      const presence = asText(fact.presence) === "may_contain" ? "may_contain" : "contains";
      if (key && label) add(key, label, presence, asText(fact.evidence_text) || "Source allergen package", asNumber(fact.confidence) || 85);
    }
  }

  for (const token of String(row.allergens || "").split(/[|;,]/).map((v) => v.trim()).filter(Boolean)) {
    add(token, token, "contains", row.allergens || "Imported contains allergen", 88);
  }

  for (const token of String(row.may_contain || "").split(/[|;,]/).map((v) => v.trim()).filter(Boolean)) {
    add(token, token, "may_contain", row.may_contain || "Imported may contain warning", 88);
  }

  // Fall back to parser for ingredient evidence only.
  const parsed = parseAllergenFacts({
    ingredientsText: row.ingredients,
    allergensText: row.may_contain ? `May contain ${row.may_contain}` : row.allergens || "",
    sourceUrl,
  });

  for (const fact of parsed) {
    add(fact.allergen_key, fact.allergen_label, fact.presence === "may_contain" ? "may_contain" : "contains", fact.evidence_text || "Parsed evidence", fact.confidence || 60);
  }

  const seen = new Set<string>();
  return rows.filter((item) => {
    const key = `${item.allergen_key}:${item.presence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function replaceAllergens(supabase: any, cardId: string, row: ProductImportNormalised | ProductEnrichmentResult) {
  try {
    const { error: allergensDeleteError } = await supabase.from("loop_nutrition_card_allergens").delete().eq("card_id", cardId);
    if (allergensDeleteError) throw new Error(allergensDeleteError.message);
    const rows = explicitAllergenRows(cardId, row);
    if (rows.length) await supabase.from("loop_nutrition_card_allergens").insert(rows);
  } catch {
    // Older installs may not have the split allergen table yet.
  }
}

async function upsertFacts(supabase: any, cardId: string, row: ProductEnrichmentResult, batchId: string, rowId: string) {
  if (!Array.isArray(row.facts) || !row.facts.length) return;

  const rows = row.facts
    .filter((fact) => fact.value_numeric != null || fact.value_text)
    .map((fact) => ({
      card_id: cardId,
      fact_key: fact.fact_key,
      fact_label: fact.fact_label,
      value_numeric: fact.value_numeric ?? null,
      value_text: fact.value_text ?? null,
      unit: fact.unit ?? null,
      source_kind: fact.source_kind,
      source_url: fact.source_url || row.source_url || null,
      source_batch_id: batchId,
      source_row_id: rowId,
      confidence: fact.confidence,
      is_estimated: fact.is_estimated,
      is_verified: false,
      notes: fact.notes || null,
    }));

  if (rows.length) await supabase.from("loop_nutrition_card_facts").upsert(rows, { onConflict: "card_id,fact_key" });
}

async function replaceServingOptions(supabase: any, cardId: string, row: ProductImportNormalised | ProductEnrichmentResult) {
  const importedOptions = Array.isArray(row.serving_options) ? row.serving_options : [];
  const baseOption = {
    card_id: cardId,
    canonical_name: row.formal_name || row.product_name,
    serving_label: servingLabel(row) || "1 serving",
    serving_ml: row.serving_ml || null,
    serving_g: row.serving_g || null,
    prepared_volume_ml: row.prepared_volume_ml || null,
    package_count: row.package_count || null,
    is_default: true,
    confidence: asNumber(row.confidence) || 70,
    requires_user_confirmation: !(row.is_verified || row.nutrition_source_type === "source_page"),
  };

  const rows = (importedOptions.length ? importedOptions : [baseOption]).map((option: any, index: number) => ({
    card_id: cardId,
    canonical_name: asText(option.canonical_name) || row.formal_name || row.product_name,
    serving_label: asText(option.serving_label) || baseOption.serving_label,
    serving_ml: asNumber(option.serving_ml),
    serving_g: asNumber(option.serving_g),
    prepared_volume_ml: asNumber(option.prepared_volume_ml),
    package_count: asNumber(option.package_count),
    is_default: String(option.is_default ?? (index === 0)).toLowerCase() !== "false",
    confidence: asNumber(option.confidence) || baseOption.confidence,
    requires_user_confirmation: String(option.requires_user_confirmation ?? baseOption.requires_user_confirmation).toLowerCase() === "true",
  })).filter((option: any) => option.serving_ml || option.serving_g || option.prepared_volume_ml || option.serving_label);

  if (!rows.length) return;

  try {
    const { error: servingOptionsDeleteError } = await supabase.from("loop_nutrition_serving_options").delete().eq("card_id", cardId);
    if (servingOptionsDeleteError) throw new Error(servingOptionsDeleteError.message);
    await supabase.from("loop_nutrition_serving_options").insert(rows);
  } catch {
    // Serving options table may not exist yet.
  }
}

async function insertSourceSnapshot(supabase: any, cardId: string, row: ProductImportNormalised | ProductEnrichmentResult, batchId: string, rowId: string, userId: string) {
  if (!row.source_url) return;

  const snapshot = row.source_snapshot || {};
  try {
    await supabase.from("loop_nutrition_source_snapshots").insert({
      card_id: cardId,
      import_batch_id: batchId,
      import_row_id: rowId,
      submitted_by: userId,
      source_url: row.source_url,
      source_host: row.source_host || sourceHost(row.source_url),
      retailer_name: row.retailer || asText(snapshot.retailer_name),
      formal_name: row.formal_name || row.product_name,
      main_image_url: row.image_url || asText(snapshot.main_image_url),
      image_harvest_mode: row.image_harvest_mode || asText(snapshot.image_harvest_mode),
      price_amount: row.price ?? asNumber(snapshot.price_amount),
      price_currency: row.price_currency || asText(snapshot.price_currency) || "GBP",
      price_text: row.price_text || asText(snapshot.price_text),
      ingredients_text: row.ingredients || asText(snapshot.ingredients_text),
      allergens_text: row.allergens || row.may_contain || asText(snapshot.allergens_text),
      nutrition_text: asText(snapshot.nutrition_text) || null,
      raw_payload: {
        import_key: row.import_key,
        raw_snapshot: snapshot,
        nutrition_json: row.nutrition_json,
        consumer_notice: row.consumer_notice,
      },
      status: row.image_url || row.price != null ? "ready_import" : "queued",
      confidence: asNumber(row.confidence) || asNumber(snapshot.confidence) || 50,
    });
  } catch {
    // Source snapshots table may not exist if SQL is not run yet.
  }

  if (row.price != null) {
    try {
      await supabase.from("loop_nutrition_price_observations").insert({
        card_id: cardId,
        retailer_name: row.retailer || sourceHost(row.source_url),
        source_url: row.source_url,
        price_amount: row.price,
        price_currency: row.price_currency || "GBP",
        price_text: row.price_text || String(row.price),
      });
    } catch {
      // Price observation table may not exist.
    }
  }
}

export async function uploadProductImport(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = await adminClient();
  const file = formData.get("file") as File | null;
  const importName = String(formData.get("import_name") || "Product import").trim();
  const notes = String(formData.get("notes") || "").trim();

  if (!file || file.size === 0) throw new Error("Choose a CSV file or a ZIP containing the LOOP import CSVs.");
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".csv") && !lower.endsWith(".zip")) throw new Error("Upload either a CSV file or a ZIP containing the LOOP import CSV package.");

  const parsedPackage = await parseProductImportFile(file);
  if (!parsedPackage.cardRows.length) throw new Error("No product rows found.");

  const { data: batch, error: batchError } = await supabase
    .from("loop_product_import_batches")
    .insert({
      uploaded_by: access.user.id,
      file_name: file.name,
      import_name: importName || file.name,
      source_type: parsedPackage.packageKind,
      status: "staged",
      total_rows: parsedPackage.cardRows.length,
      notes: [
        notes,
        `Primary file: ${parsedPackage.primaryFileName}`,
        `Parsed files: ${parsedPackage.parsedFiles.join(", ")}`,
        ...parsedPackage.warnings,
      ].filter(Boolean).join("\n"),
    })
    .select("*")
    .single();
  if (batchError) throw new Error(batchError.message);

  const rows = parsedPackage.cardRows.map((item, index) => {
    const normalised = normaliseImportRow(item.raw, item.support);
    const missingName = normalised.warnings.includes("Missing product_name. This row will need review.");
    return {
      batch_id: batch.id,
      row_number: index + 1,
      status: missingName ? "needs_review" : "new",
      raw_row: item.raw,
      normalised,
      import_key: normalised.import_key,
      shop_tag: normalised.shop_tag,
      retailer_article_number: normalised.retailer_article_number,
      dedupe_key: normalised.dedupe_key,
      supporting_payload: item.support,
      source_snapshot: item.support.source_snapshot || {},
      serving_options: item.support.serving_options || [],
      source_allergens: item.support.source_allergens || [],
      product_name: normalised.product_name,
      brand: normalised.brand,
      product_type: normalised.product_type,
      category: normalised.category,
      barcode: normalised.barcode,
      source_url: normalised.source_url,
      image_url: normalised.image_url,
      retailer: normalised.retailer,
      price_amount: normalised.price,
      price_currency: normalised.price_currency || "GBP",
      warnings: normalised.warnings,
    };
  });

  const { data: insertedRows, error: rowError } = await supabase
    .from("loop_product_import_rows")
    .insert(rows)
    .select("id");
  if (rowError) throw new Error(rowError.message);

  for (const row of insertedRows || []) {
    await supabase.rpc("loop_product_import_match_row", { p_row_id: row.id });
  }
  await supabase.rpc("loop_product_import_recount", { p_batch_id: batch.id });

  revalidatePath("/admin/product-imports");
  redirect(`/admin/product-imports?batch=${batch.id}`);
}

export async function enrichImportBatch(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = await adminClient();
  const batchId = String(formData.get("batch_id") || "").trim();
  const limit = Math.min(50, Math.max(1, Number(formData.get("limit") || 20)));
  if (!batchId) throw new Error("Batch ID is required.");

  const { data: rows, error } = await supabase
    .from("loop_product_import_rows")
    .select("*")
    .eq("batch_id", batchId)
    .in("status", ["new", "ready_to_create", "matched_existing", "needs_review", "failed"])
    .order("row_number", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  await supabase.from("loop_product_import_batches").update({ status: "enriching" }).eq("id", batchId);

  for (const row of rows || []) {
    const jobInput = row.normalised || {};
    const { data: job } = await supabase
      .from("loop_product_import_enrichment_jobs")
      .insert({
        batch_id: batchId,
        row_id: row.id,
        requested_by: access.user.id,
        status: "processing",
        provider: process.env.OPENAI_API_KEY ? "openai" : "heuristic",
        model: process.env.LOOP_PRODUCT_IMPORT_AI_MODEL || (process.env.OPENAI_API_KEY ? "gpt-4.1-mini" : "heuristic"),
        input_payload: jobInput,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    try {
      await supabase.from("loop_product_import_rows").update({ status: "ai_enriching" }).eq("id", row.id);
      const enriched = await enrichProductRow(jobInput as ProductImportNormalised);
      const nextStatus = enriched.warnings.length || enriched.confidence < 65 ? "needs_review" : "ai_enriched";
      await supabase.from("loop_product_import_rows").update({
        status: nextStatus,
        enriched,
        warnings: enriched.warnings,
        product_name: enriched.product_name,
        brand: enriched.brand,
        product_type: enriched.product_type,
        category: enriched.category,
        source_url: enriched.source_url,
        image_url: enriched.image_url,
        retailer: enriched.retailer,
        price_amount: enriched.price,
        price_currency: enriched.price_currency || "GBP",
        error_message: null,
      }).eq("id", row.id);

      if (job?.id) {
        await supabase.from("loop_product_import_enrichment_jobs").update({
          status: "completed",
          output_payload: enriched,
          finished_at: new Date().toISOString(),
        }).eq("id", job.id);
      }
    } catch (error: any) {
      await supabase.from("loop_product_import_rows").update({
        status: "failed",
        error_message: error?.message || "Enrichment failed",
      }).eq("id", row.id);

      if (job?.id) {
        await supabase.from("loop_product_import_enrichment_jobs").update({
          status: "failed",
          error_message: error?.message || "Enrichment failed",
          finished_at: new Date().toISOString(),
        }).eq("id", job.id);
      }
    }
  }

  await supabase.rpc("loop_product_import_recount", { p_batch_id: batchId });
  await supabase.from("loop_product_import_batches").update({ status: "ai_enriched" }).eq("id", batchId);
  revalidatePath("/admin/product-imports");
}

export async function applyImportBatchToLibrary(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = await adminClient();
  const batchId = String(formData.get("batch_id") || "").trim();
  const mode = String(formData.get("mode") || "missing_only");
  if (!batchId) throw new Error("Batch ID is required.");

  const { data: rows, error } = await supabase
    .from("loop_product_import_rows")
    .select("*")
    .eq("batch_id", batchId)
    .in("status", ["ai_enriched", "ready_to_create", "matched_existing", "needs_review"])
    .order("row_number", { ascending: true })
    .limit(1000);
  if (error) throw new Error(error.message);

  await supabase.from("loop_product_import_batches").update({ status: "applying" }).eq("id", batchId);

  for (const importRow of rows || []) {
    const row = Object.keys(importRow.enriched || {}).length ? importRow.enriched : importRow.normalised;
    const payload = cardPayload(row, access.user.id, batchId, importRow.id);
    let cardId = importRow.existing_card_id as string | null;

    try {
      if (cardId) {
        const { data: existing } = await supabase
          .from("loop_nutrition_cards")
          .select("*")
          .eq("id", cardId)
          .maybeSingle();

        const patch: Record<string, any> = {};
        for (const [key, value] of Object.entries(payload)) {
          if (key === "owner_user_id" || key === "card_kind" || value === undefined) continue;
          const existingValue = existing?.[key];
          const canReplace = mode === "replace_unverified" && !existing?.is_verified;
          if (canReplace || existingValue === null || existingValue === undefined || existingValue === "" || (Array.isArray(existingValue) && existingValue.length === 0)) {
            patch[key] = value;
          }
        }
        patch.updated_at = new Date().toISOString();

        const { error: updateError } = await supabase.from("loop_nutrition_cards").update(patch).eq("id", cardId);
        if (updateError) throw updateError;
        await supabase.from("loop_product_import_rows").update({ status: "updated", created_card_id: cardId }).eq("id", importRow.id);
      } else {
        const { data: created, error: createError } = await supabase
          .from("loop_nutrition_cards")
          .insert(payload)
          .select("id")
          .single();
        if (createError) throw createError;
        cardId = created.id;
        await supabase.from("loop_product_import_rows").update({ status: "created", created_card_id: cardId }).eq("id", importRow.id);
      }

      if (cardId) {
        await replaceIngredients(supabase, cardId, row);
        await replaceAllergens(supabase, cardId, row);
        await replaceServingOptions(supabase, cardId, row);
        await insertSourceSnapshot(supabase, cardId, row, batchId, importRow.id, access.user.id);
        if (Array.isArray(row.facts)) await upsertFacts(supabase, cardId, row, batchId, importRow.id);
      }
    } catch (error: any) {
      await supabase.from("loop_product_import_rows").update({
        status: "failed",
        error_message: error?.message || "Could not apply row to library",
      }).eq("id", importRow.id);
    }
  }

  await supabase.rpc("loop_product_import_recount", { p_batch_id: batchId });
  await supabase.from("loop_product_import_batches").update({ status: "applied" }).eq("id", batchId);
  revalidatePath("/admin/product-imports");
  revalidatePath("/nutrition");
  revalidatePath("/nutrition/cards");
}

export async function reMatchImportBatch(formData: FormData) {
  await requireAdminAccess();
  const supabase = await adminClient();
  const batchId = String(formData.get("batch_id") || "").trim();
  if (!batchId) throw new Error("Batch ID is required.");

  const { data: rows, error } = await supabase.from("loop_product_import_rows").select("id").eq("batch_id", batchId).limit(2000);
  if (error) throw new Error(error.message);

  for (const row of rows || []) await supabase.rpc("loop_product_import_match_row", { p_row_id: row.id });
  await supabase.rpc("loop_product_import_recount", { p_batch_id: batchId });
  revalidatePath("/admin/product-imports");
}

export async function skipImportRow(formData: FormData) {
  await requireAdminAccess();
  const supabase = await adminClient();
  const rowId = String(formData.get("row_id") || "").trim();
  const batchId = String(formData.get("batch_id") || "").trim();
  if (!rowId) throw new Error("Row ID is required.");
  await supabase.from("loop_product_import_rows").update({ status: "skipped" }).eq("id", rowId);
  if (batchId) await supabase.rpc("loop_product_import_recount", { p_batch_id: batchId });
  revalidatePath("/admin/product-imports");
}

export async function productImportTemplateCsv() {
  await requireAdminAccess();
  return toCsv([
    {
      product_name: "GFuel Hype Sauce 2.0",
      brand: "G FUEL",
      product_type: "drink",
      category: "energy drink powder",
      serving_size: "6.2",
      serving_unit: "g",
      prepared_volume_ml: "500",
      pack_size: "40 servings",
      barcode: "",
      source_url: "https://example.com/product",
      image_url: "",
      ingredients: "Citric Acid, Pineapple Fruit Powder, Silicon Dioxide, Natural and Artificial Flavors, Acesulfame Potassium, Sucralose, Red No. 40",
      allergens: "",
      may_contain: "",
      calories: "5",
      protein_g: "0",
      carbs_g: "2",
      fat_g: "0",
      fibre_g: "0",
      sugar_g: "0",
      added_sugar_g: "0",
      saturated_fat_g: "0",
      salt_g: "0.2",
      sodium_mg: "80",
      caffeine_mg: "140",
      price: "34.99",
      retailer: "G FUEL",
      notes: "Label verified",
    },
  ]);
}

function extractUrlCandidates(text: string) {
  const matches = String(text || "").match(/https?:\/\/[^\s)\]"']+/gi) || [];
  const cleaned = matches.map((url) => url.replace(/[.,;]+$/g, "").trim()).filter(Boolean);
  return Array.from(new Set(cleaned)).slice(0, 500);
}

function productFingerprintFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const slug = parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname;
    return `${parsed.hostname}:${slug}`.toLowerCase().replace(/[^a-z0-9:_-]+/g, "-");
  } catch {
    return crypto.createHash("sha256").update(url).digest("hex").slice(0, 24);
  }
}

function absoluteUrl(href: string, baseUrl: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function cleanHtmlText(value: string | null | undefined) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const slug = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || parsed.hostname);
    return cleanHtmlText(slug.replace(/[-_+]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())) || parsed.hostname;
  } catch {
    return "URL product";
  }
}

function extractMetaContent(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanHtmlText(match[1]);
  }
  return null;
}

function extractJsonLdProducts(html: string) {
  const blocks = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)).map((m) => m[1]);
  const products: any[] = [];
  const visit = (value: any) => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== "object") return;
    const type = value["@type"];
    const types = Array.isArray(type) ? type.map(String) : [String(type || "")];
    if (types.some((t) => t.toLowerCase() === "product")) products.push(value);
    if (value["@graph"]) visit(value["@graph"]);
  };
  for (const block of blocks) {
    try { visit(JSON.parse(block.trim())); } catch { /* ignore invalid json ld */ }
  }
  return products;
}

function maybePrice(value: unknown) {
  const num = asNumber(value);
  return num && num > 0 ? num : null;
}

async function fetchProductEvidence(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": process.env.OPEN_FOOD_FACTS_USER_AGENT || "InsideLoopProductImport/0.1 (support@insideloop.life)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
    });
    const finalUrl = response.url || url;
    const html = await response.text();
    const jsonProducts = extractJsonLdProducts(html);
    const product = jsonProducts[0] || {};
    const offers = Array.isArray(product.offers) ? product.offers[0] : product.offers || {};
    const brand = typeof product.brand === "object" ? product.brand?.name : product.brand;
    const title = cleanHtmlText(product.name) || extractMetaContent(html, "og:title") || cleanHtmlText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]) || titleFromUrl(finalUrl);
    const description = cleanHtmlText(product.description) || extractMetaContent(html, "description") || extractMetaContent(html, "og:description");
    const imageRaw = Array.isArray(product.image) ? product.image[0] : product.image || extractMetaContent(html, "og:image");
    const image = imageRaw ? absoluteUrl(String(imageRaw), finalUrl) : null;
    const barcode = product.gtin13 || product.gtin14 || product.gtin12 || product.gtin8 || product.sku || null;
    const price = maybePrice(offers.price || extractMetaContent(html, "product:price:amount"));
    const currency = cleanHtmlText(offers.priceCurrency || extractMetaContent(html, "product:price:currency") || "GBP") || "GBP";
    return {
      ok: true,
      finalUrl,
      htmlLength: html.length,
      title,
      description,
      image,
      brand: cleanHtmlText(brand) || null,
      barcode: barcode ? String(barcode) : null,
      price,
      currency,
      confidence: jsonProducts.length ? 78 : title ? 58 : 35,
      notes: jsonProducts.length ? "Product JSON-LD found; staged for admin review." : "Basic page metadata found; staged for admin review.",
    };
  } catch (error: any) {
    return { ok: false, finalUrl: url, title: titleFromUrl(url), confidence: 25, notes: error?.name === "AbortError" ? "Fetch timed out; staged for manual review." : `Fetch failed: ${error?.message || "unknown error"}` };
  } finally {
    clearTimeout(timeout);
  }
}

function looksLikeProductUrl(url: string, seedHost: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.replace(/^www\./, "") !== seedHost.replace(/^www\./, "")) return false;
    const path = parsed.pathname.toLowerCase();
    if (!path || path === "/") return false;
    if (path.includes("/account") || path.includes("/login") || path.includes("/basket") || path.includes("/cart") || path.includes("/checkout")) return false;
    return /(product|products|prod|item|p\/|shop\/|catalog|catalogue|sweets|drinks|snacks|energy|food)/i.test(path) || path.split("/").filter(Boolean).length >= 2;
  } catch {
    return false;
  }
}

async function discoverProductLinksFromUrl(seedUrl: string, maxLinks = 100) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(seedUrl, {
      signal: controller.signal,
      headers: {
        "user-agent": process.env.OPEN_FOOD_FACTS_USER_AGENT || "InsideLoopProductImport/0.1 (support@insideloop.life)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      cache: "no-store",
    });
    const finalUrl = response.url || seedUrl;
    const html = await response.text();
    const seedHost = new URL(finalUrl).hostname;
    const links = Array.from(html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi))
      .map((match) => absoluteUrl(match[1], finalUrl))
      .filter((url): url is string => Boolean(url))
      .map((url) => url.split("#")[0])
      .filter((url) => looksLikeProductUrl(url, seedHost));
    return Array.from(new Set(links)).slice(0, maxLinks);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function createProductUrlImportBatch(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = await adminClient();
  const importName = String(formData.get("import_name") || "URL product import").trim();
  const input = String(formData.get("source_urls") || "");
  const discoveryMode = String(formData.get("discovery_mode") || "provided_urls_only");
  const batchSize = Math.max(1, Math.min(10, Number(formData.get("batch_size") || 10)));
  const seedUrls = extractUrlCandidates(input);
  if (!seedUrls.length) throw new Error("Paste at least one product/category URL.");

  let urls = seedUrls;
  let discoveryNote = "Provided URLs staged only.";
  if (discoveryMode === "category_discovery_review") {
    const discovered: string[] = [];
    for (const seed of seedUrls.slice(0, 5)) {
      discovered.push(...await discoverProductLinksFromUrl(seed, 100));
    }
    const merged = Array.from(new Set([...discovered, ...seedUrls])).slice(0, 500);
    urls = merged.length ? merged : seedUrls;
    discoveryNote = discovered.length ? `Discovered ${discovered.length} candidate links from provided category/source pages.` : "No product links were confidently discovered; provided URLs were staged.";
  }

  const { data: batch, error: batchError } = await supabase
    .from("loop_product_link_import_batches")
    .insert({
      created_by: access.user.id,
      import_name: importName,
      discovery_mode: discoveryMode,
      source_input: input,
      batch_size: batchSize,
      discovered_count: urls.length,
      status: "staged",
      notes: [String(formData.get("notes") || "").trim(), discoveryNote].filter(Boolean).join("\n") || null,
    })
    .select("id")
    .maybeSingle();
  if (batchError) throw new Error(batchError.message);
  const batchId = batch?.id as string;

  const existingCards = await supabase
    .from("loop_nutrition_cards")
    .select("source_url")
    .in("source_url", urls)
    .then((result) => new Set((result.data || []).map((row: any) => row.source_url).filter(Boolean)), () => new Set<string>());

  const rows = urls.map((url, index) => ({
    batch_id: batchId,
    row_number: index + 1,
    source_url: url,
    source_host: sourceHost(url),
    fingerprint: productFingerprintFromUrl(url),
    status: existingCards.has(url) ? "skipped_existing" : index < batchSize ? "ready_for_batch" : "waiting",
    confidence: existingCards.has(url) ? 100 : 50,
    notes: existingCards.has(url) ? "Already exists in product library by source URL." : "Staged from admin URL batch. Review before enrichment/import.",
  }));

  const { error: rowsError } = await supabase.from("loop_product_link_import_rows").insert(rows);
  if (rowsError) throw new Error(rowsError.message);

  revalidatePath("/admin/product-imports");
  redirect(`/admin/product-imports?linkBatch=${batchId}`);
}

export async function stageNextProductUrlBatch(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = await adminClient();
  const batchId = String(formData.get("batch_id") || "");
  const batchSize = Math.max(1, Math.min(10, Number(formData.get("batch_size") || 10)));
  if (!batchId) throw new Error("Missing URL batch id.");

  const { data: rows, error } = await supabase
    .from("loop_product_link_import_rows")
    .select("id")
    .eq("batch_id", batchId)
    .eq("status", "waiting")
    .order("row_number", { ascending: true })
    .limit(batchSize);
  if (error) throw new Error(error.message);

  const ids = (rows || []).map((row: any) => row.id);
  if (ids.length) {
    const { error: updateError } = await supabase
      .from("loop_product_link_import_rows")
      .update({ status: "ready_for_batch", updated_at: new Date().toISOString(), notes: "Promoted into the next admin-approved batch of 10." })
      .in("id", ids);
    if (updateError) throw new Error(updateError.message);
  }

  await supabase.from("loop_product_link_import_batches").update({ updated_at: new Date().toISOString(), last_action_by: access.user.id }).eq("id", batchId).then(() => null, () => null);
  revalidatePath("/admin/product-imports");
}


export async function processReadyProductUrlBatch(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = await adminClient();
  const batchId = String(formData.get("batch_id") || "");
  const batchSize = Math.max(1, Math.min(10, Number(formData.get("batch_size") || 10)));
  if (!batchId) throw new Error("Missing URL batch id.");

  const { data: linkBatch, error: batchError } = await supabase
    .from("loop_product_link_import_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (batchError) throw new Error(batchError.message);
  if (!linkBatch) throw new Error("URL batch not found.");

  let { data: rows, error } = await supabase
    .from("loop_product_link_import_rows")
    .select("*")
    .eq("batch_id", batchId)
    .in("status", ["ready_for_batch", "reviewed"])
    .order("row_number", { ascending: true })
    .limit(batchSize);
  if (error) throw new Error(error.message);

  if (!rows?.length) {
    const { data: waiting, error: waitingError } = await supabase
      .from("loop_product_link_import_rows")
      .select("id")
      .eq("batch_id", batchId)
      .eq("status", "waiting")
      .order("row_number", { ascending: true })
      .limit(batchSize);
    if (waitingError) throw new Error(waitingError.message);
    const waitingIds = (waiting || []).map((row: any) => row.id);
    if (waitingIds.length) {
      const { error: promoteError } = await supabase
        .from("loop_product_link_import_rows")
        .update({ status: "ready_for_batch", updated_at: new Date().toISOString(), notes: "Promoted and queued for deterministic URL processing." })
        .in("id", waitingIds);
      if (promoteError) throw new Error(promoteError.message);
    }
    const retry = await supabase
      .from("loop_product_link_import_rows")
      .select("*")
      .eq("batch_id", batchId)
      .in("status", ["ready_for_batch", "reviewed"])
      .order("row_number", { ascending: true })
      .limit(batchSize);
    if (retry.error) throw new Error(retry.error.message);
    rows = retry.data || [];
  }

  if (!rows?.length) {
    await supabase.from("loop_product_link_import_batches").update({ status: "reviewed", updated_at: new Date().toISOString(), last_action_by: access.user.id }).eq("id", batchId).then(() => null, () => null);
    revalidatePath("/admin/product-imports");
    redirect(`/admin/product-imports?linkBatch=${batchId}`);
  }

  const { data: productBatch, error: productBatchError } = await supabase
    .from("loop_product_import_batches")
    .insert({
      uploaded_by: access.user.id,
      file_name: "url-batch",
      import_name: `${linkBatch.import_name || "URL product import"} · processed ${new Date().toLocaleString("en-GB")}`,
      status: "staged",
      total_rows: rows.length,
      source_type: "url_batch",
      notes: `Created from URL batch ${batchId}. Deterministic fetch only; no AI/web-search used.`,
    })
    .select("id")
    .maybeSingle();
  if (productBatchError) throw new Error(productBatchError.message);
  const productBatchId = productBatch?.id as string;

  const existingCards = await supabase
    .from("loop_nutrition_cards")
    .select("id, source_url")
    .in("source_url", rows.map((row: any) => row.source_url))
    .then((result) => new Map((result.data || []).map((row: any) => [row.source_url, row.id])), () => new Map<string, string>());

  const importRows = [];
  const linkUpdates: { id: string; status: string; name?: string; confidence?: number; notes?: string; existing?: string | null }[] = [];
  for (let index = 0; index < rows.length; index++) {
    const linkRow: any = rows[index];
    const existingId = existingCards.get(linkRow.source_url) || null;
    if (existingId) {
      linkUpdates.push({ id: linkRow.id, status: "skipped_existing", confidence: 100, notes: "Already exists in product library by source URL.", existing: existingId });
      continue;
    }
    const evidence = await fetchProductEvidence(linkRow.source_url);
    const normalised = {
      product_name: evidence.title || titleFromUrl(linkRow.source_url),
      brand: evidence.brand || null,
      product_type: "food",
      category: "needs_review",
      source_url: evidence.finalUrl || linkRow.source_url,
      source_host: sourceHost(evidence.finalUrl || linkRow.source_url),
      image_url: evidence.image || null,
      barcode: evidence.barcode || null,
      price: evidence.price || null,
      price_currency: evidence.currency || "GBP",
      retailer: sourceHost(evidence.finalUrl || linkRow.source_url),
      notes: evidence.notes,
    };
    importRows.push({
      batch_id: productBatchId,
      row_number: importRows.length + 1,
      status: evidence.ok && evidence.confidence >= 70 ? "ready_to_create" : "needs_review",
      raw_row: { source_url: linkRow.source_url, evidence },
      normalised,
      enriched: {},
      match_confidence: evidence.confidence || 35,
      warnings: evidence.ok ? ["Review nutrition/ingredients before applying."] : ["Fetch failed or timed out; review manually."],
      product_name: normalised.product_name,
      brand: normalised.brand,
      product_type: normalised.product_type,
      category: normalised.category,
      barcode: normalised.barcode,
      source_url: normalised.source_url,
      image_url: normalised.image_url,
      retailer: normalised.retailer,
      price_amount: evidence.price || null,
      price_currency: evidence.currency || "GBP",
    });
    linkUpdates.push({ id: linkRow.id, status: "promoted_to_import", name: normalised.product_name, confidence: evidence.confidence, notes: evidence.notes, existing: null });
  }

  if (importRows.length) {
    const { error: rowsError } = await supabase.from("loop_product_import_rows").insert(importRows);
    if (rowsError) throw new Error(rowsError.message);
  }

  for (const update of linkUpdates) {
    await supabase
      .from("loop_product_link_import_rows")
      .update({
        status: update.status,
        confidence: update.confidence ?? 50,
        staged_product_name: update.name || null,
        matched_card_id: update.existing || null,
        notes: update.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", update.id)
      .then(() => null, () => null);
  }

  await supabase.from("loop_product_link_import_batches").update({ status: "processing", updated_at: new Date().toISOString(), last_action_by: access.user.id }).eq("id", batchId).then(() => null, () => null);
  revalidatePath("/admin/product-imports");
  redirect(`/admin/product-imports?batch=${productBatchId}&linkBatch=${batchId}`);
}

export async function markProductUrlRowReviewed(formData: FormData) {
  await requireAdminAccess();
  const supabase = await adminClient();
  const rowId = String(formData.get("row_id") || "");
  const status = String(formData.get("status") || "reviewed");
  if (!rowId) return;
  const { error } = await supabase
    .from("loop_product_link_import_rows")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", rowId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/product-imports");
}
