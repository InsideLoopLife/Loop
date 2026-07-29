import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const profileId = request.nextUrl.searchParams.get("profile_id");

  if (!profileId) {
    return NextResponse.json({ error: "profile_id is required." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("loop_money_deal_candidates", {
    p_profile_id: profileId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ candidates: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();

  const { data, error } = await supabase.rpc("loop_money_generate_opportunities", {
    p_profile_id: body.profile_id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
