import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, context: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await context.params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("loop_nutrition_serving_options")
    .select("*")
    .eq("card_id", cardId)
    .order("is_default", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ options: data || [] });
}
