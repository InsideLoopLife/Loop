import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest, context: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await context.params;
  const supabase = await createClient();
  const body = await request.json();

  const { data, error } = await supabase.rpc("loop_nutrition_queue_source_refresh", {
    p_card_id: cardId,
    p_source_url: body.source_url,
    p_note: body.note || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
