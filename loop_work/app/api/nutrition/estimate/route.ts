import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { heuristicEstimate } from "@/lib/nutrition/v27_67/aiEstimate";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const text = String(body.text || "").trim();
  if (!text) return NextResponse.json({ error: "Text is required." }, { status: 400 });

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  // Start with deterministic guardrailed heuristics.
  // Wire paid AI calls here later using tier allowances and model env keys.
  const estimate = heuristicEstimate(text);

  const visibility =
    estimate.card_kind === "product" || estimate.card_kind === "ingredient"
      ? "shared_database"
      : body.household_id
        ? "household_private"
        : "user_private";

  const { data: card, error } = await supabase
    .from("loop_nutrition_cards")
    .insert({
      card_kind: estimate.card_kind,
      visibility,
      product_type: estimate.product_type,
      owner_user_id: user.id,
      household_id: body.household_id || null,
      display_name: estimate.display_name,
      serving_label: estimate.serving_label || null,
      serving_ml: estimate.serving_ml || null,
      calories: estimate.calories,
      protein_g: estimate.protein_g,
      carbs_g: estimate.carbs_g,
      fat_g: estimate.fat_g,
      fibre_g: estimate.fibre_g,
      salt_g: estimate.salt_g,
      caffeine_mg: estimate.caffeine_mg,
      confidence: estimate.confidence,
      nutrition: { source: "heuristic", notes: estimate.notes },
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ estimate, card });
}
