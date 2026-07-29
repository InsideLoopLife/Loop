"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseAllergenFacts } from "@/lib/nutrition/v27_66_allergens";
import { fetchProductSourceSnapshot } from "@/lib/nutrition/v27_66_source_harvest";
import { flattenIngredientTreeForInsert, parseIngredientDeclarationToTree } from "@/lib/nutrition/v27_66_ingredient_tree";

export async function queueProductSourceRefresh(formData: FormData) {
  const supabase = await createClient();
  const cardId = String(formData.get("card_id") || "");
  const sourceUrl = String(formData.get("source_url") || "");
  const note = String(formData.get("note") || "") || null;

  const { error } = await supabase.rpc("app_queue_product_source_refresh", {
    p_card_id: cardId,
    p_source_url: sourceUrl,
    p_note: note,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/nutrition/cards");
  if (cardId) revalidatePath(`/nutrition/cards/${cardId}`);
}

/**
 * Optional admin/background action.
 * This runs the source scrape and stores the result.
 * Wire this behind admin/server-only controls or a scheduled worker.
 */
export async function harvestProductSourceSnapshot(snapshotId: string) {
  const supabase = await createClient();

  const { data: snapshot, error: readError } = await supabase
    .from("app_food_product_source_snapshots")
    .select("*")
    .eq("id", snapshotId)
    .single();

  if (readError) throw new Error(readError.message);
  if (!snapshot?.source_url) throw new Error("Snapshot has no source URL.");

  const result = await fetchProductSourceSnapshot(snapshot.source_url);

  const { error: updateError } = await supabase
    .from("app_food_product_source_snapshots")
    .update({
      source_host: result.sourceHost,
      retailer_name: result.retailerName,
      formal_name: result.formalName,
      main_image_url: result.mainImageUrl,
      price_amount: result.priceAmount,
      price_currency: result.priceCurrency,
      price_text: result.priceText,
      ingredients_text: result.ingredientsText,
      allergens_text: result.allergensText,
      nutrition_text: result.nutritionText,
      raw_payload: result.raw,
      status: "needs_review",
      confidence: result.confidence,
    })
    .eq("id", snapshotId);

  if (updateError) throw new Error(updateError.message);

  const allergenFacts = parseAllergenFacts({
    ingredientsText: result.ingredientsText,
    allergensText: result.allergensText,
  });

  for (const fact of allergenFacts) {
    await supabase.rpc("app_upsert_product_allergen_fact", {
      p_card_id: snapshot.card_id,
      p_source_snapshot_id: snapshotId,
      p_allergen_key: fact.key,
      p_allergen_label: fact.label,
      p_presence: fact.presence,
      p_evidence_text: fact.evidenceText,
      p_source_url: snapshot.source_url,
      p_confidence: fact.confidence,
    });
  }

  if (result.ingredientsText) {
    const tree = parseIngredientDeclarationToTree(result.ingredientsText);
    const flatRows = flattenIngredientTreeForInsert(tree);

    // Clear old AI/source parsed rows for this card snapshot before inserting the new tree.
    await supabase
      .from("app_food_ingredient_tree_items")
      .delete()
      .eq("card_id", snapshot.card_id)
      .eq("source_snapshot_id", snapshotId);

    const idMap = new Map<string, string>();

    for (const row of flatRows) {
      const { data, error } = await supabase
        .from("app_food_ingredient_tree_items")
        .insert({
          card_id: snapshot.card_id,
          source_snapshot_id: snapshotId,
          parent_id: row.parentClientId ? idMap.get(row.parentClientId) || null : null,
          sort_order: row.sortOrder,
          section_label: "Ingredients",
          ingredient_name: row.ingredientName,
          quantity_text: row.quantityText,
          percentage: row.percentage,
          raw_text: row.rawText,
          has_children: row.hasChildren,
          info_mode: row.infoMode,
          confidence: 75,
        })
        .select("id")
        .single();

      if (error) throw new Error(error.message);
      idMap.set(row.clientId, data.id);
    }
  }

  revalidatePath("/nutrition/cards");
  if (snapshot.card_id) revalidatePath(`/nutrition/cards/${snapshot.card_id}`);
}
