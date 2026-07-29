import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nestIngredientRows } from "@/lib/nutrition/v27_67/ingredients";

export async function GET(_request: NextRequest, context: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await context.params;
  const supabase = await createClient();

  const { data: card, error: cardError } = await supabase
    .from("loop_nutrition_cards")
    .select("*")
    .eq("id", cardId)
    .single();

  if (cardError) return NextResponse.json({ error: cardError.message }, { status: 404 });

  const [{ data: ingredients }, { data: allergens }, { data: prices }] = await Promise.all([
    supabase.from("loop_nutrition_card_ingredients").select("*").eq("card_id", cardId).order("sort_order"),
    supabase.from("loop_nutrition_card_allergens").select("*").eq("card_id", cardId).order("presence"),
    supabase.from("loop_nutrition_price_observations").select("*").eq("card_id", cardId).order("observed_at", { ascending: false }).limit(1),
  ]);

  return NextResponse.json({
    card,
    ingredients: nestIngredientRows((ingredients || []) as any),
    allergens: allergens || [],
    latest_price: prices?.[0] || null,
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await context.params;
  const supabase = await createClient();
  const body = await request.json();

  const allowed = [
    "display_name",
    "formal_name",
    "brand_name",
    "variant_name",
    "product_type",
    "main_image_url",
    "source_url",
    "serving_label",
    "serving_ml",
    "serving_g",
    "prepared_volume_ml",
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
    "nutrition",
    "dietary_flags",
    "score",
  ];

  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  const { data, error } = await supabase
    .from("loop_nutrition_cards")
    .update(patch)
    .eq("id", cardId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ card: data });
}
