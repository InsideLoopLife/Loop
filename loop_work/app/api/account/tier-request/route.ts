import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json();

  const { data, error } = await supabase.from("loop_user_tier_requests").insert({
    user_id: user.id,
    requested_tier: body.requested_tier || "plus",
    requested_features: Array.isArray(body.requested_features) ? body.requested_features : [],
    request_reason: body.request_reason || null,
    status: "pending",
  }).select("*").single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, request: data });
}
