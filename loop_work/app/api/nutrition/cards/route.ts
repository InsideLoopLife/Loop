import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q") || "";
  const householdId = searchParams.get("household_id") || null;

  const { data, error } = await supabase.rpc("loop_nutrition_search_cards", {
    p_query: q,
    p_household_id: householdId || null,
    p_limit: 24,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ cards: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const cardKind = body.card_kind || "product";
  const visibility =
    cardKind === "product" || cardKind === "ingredient"
      ? "shared_database"
      : body.household_id
        ? "household_private"
        : "user_private";

  const { data, error } = await supabase
    .from("loop_nutrition_cards")
    .insert({
      card_kind: cardKind,
      visibility,
      product_type: body.product_type || "food",
      owner_user_id: user.id,
      household_id: body.household_id || null,
      display_name: body.display_name || "Food / drink",
      formal_name: body.formal_name || body.display_name || null,
      brand_name: body.brand_name || null,
      source_url: body.source_url || null,
      source_host: body.source_url ? new URL(body.source_url).hostname.replace(/^www\./, "") : null,
      main_image_url: body.main_image_url || null,
      serving_label: body.serving_label || null,
      serving_ml: body.serving_ml || null,
      serving_g: body.serving_g || null,
      prepared_volume_ml: body.prepared_volume_ml || null,
      calories: body.calories ?? null,
      protein_g: body.protein_g ?? null,
      carbs_g: body.carbs_g ?? null,
      fat_g: body.fat_g ?? null,
      fibre_g: body.fibre_g ?? null,
      sugar_g: body.sugar_g ?? null,
      salt_g: body.salt_g ?? null,
      caffeine_mg: body.caffeine_mg ?? null,
      confidence: body.confidence || 50,
      score: body.score ?? null,
      nutrition: body.nutrition || {},
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ card: data });
}
