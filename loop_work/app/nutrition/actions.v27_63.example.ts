"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function lookupServingOptions(query: string, cardId?: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("app_food_serving_options_for_query", {
    p_query: query,
    p_card_id: cardId || null,
  });

  if (error) throw new Error(error.message);
  return data;
}

export async function queueFoodProductCorrection(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("app_queue_food_product_correction", {
    p_household_id: String(formData.get("household_id") || "") || null,
    p_card_id: String(formData.get("card_id") || "") || null,
    p_log_entry_id: String(formData.get("log_entry_id") || "") || null,
    p_submitted_name: String(formData.get("submitted_name") || ""),
    p_source_url: String(formData.get("source_url") || "") || null,
    p_label_image_url: String(formData.get("label_image_url") || "") || null,
    p_note: String(formData.get("note") || "") || null,
    p_correction_kind: String(formData.get("correction_kind") || "product_data"),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/nutrition/cards");
}

export async function validateDrinkBeforeSave(input: {
  mealSlot: string;
  cardKind?: string | null;
  drinkVolumeMl?: number | null;
  servingOptionId?: string | null;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("app_food_log_drink_volume_required", {
    p_meal_slot: input.mealSlot,
    p_card_kind: input.cardKind || null,
    p_volume_ml: input.drinkVolumeMl || null,
    p_serving_option_id: input.servingOptionId || null,
  });

  if (error) throw new Error(error.message);
  if (data?.volume_required) {
    throw new Error(data.message || "Drink volume is required.");
  }

  return data;
}
