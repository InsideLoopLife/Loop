import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nutritionSnapshotFromCard } from "@/lib/nutrition/v27_67/serving";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const personIds = Array.isArray(body.person_ids) ? body.person_ids.filter(Boolean) : [];
  if (!personIds.length) return NextResponse.json({ error: "Choose who had this." }, { status: 400 });

  const { data: card, error: cardError } = await supabase
    .from("loop_nutrition_cards")
    .select("*")
    .eq("id", body.card_id)
    .single();

  if (cardError) return NextResponse.json({ error: cardError.message }, { status: 400 });

  const isDrink = body.meal_slot === "drink" || card.product_type === "drink";
  const knownMl = card.prepared_volume_ml || card.serving_ml || null;

  if (isDrink && !body.drink_volume_ml && !knownMl) {
    return NextResponse.json({ error: "Drink volume is required so hydration and timing context are accurate." }, { status: 400 });
  }

  const multiplier = Number(body.serving_multiplier || 1);
  const snapshot = nutritionSnapshotFromCard(card as any, multiplier);

  const { data: log, error: logError } = await supabase
    .from("loop_nutrition_food_logs")
    .insert({
      household_id: body.household_id || null,
      created_by: user.id,
      card_id: card.id,
      display_name: body.display_name || card.display_name,
      log_date: body.log_date,
      time_eaten: body.time_eaten || null,
      meal_slot: body.meal_slot || "meal",
      serving_multiplier: multiplier,
      serving_mode: body.serving_mode || "each_person",
      drink_volume_ml: body.drink_volume_ml || knownMl || null,
      nutrition_snapshot: snapshot,
      notes: body.notes || null,
      image_url: card.main_image_url || null,
    })
    .select("*")
    .single();

  if (logError) return NextResponse.json({ error: logError.message }, { status: 400 });

  const rows = personIds.map((personId: string) => ({
    log_id: log.id,
    person_id: personId,
    confirmation_status: "accepted",
  }));

  const { error: peopleError } = await supabase.from("loop_nutrition_food_log_people").insert(rows);
  if (peopleError) return NextResponse.json({ error: peopleError.message }, { status: 400 });

  return NextResponse.json({ log: { ...log, people: personIds } });
}
