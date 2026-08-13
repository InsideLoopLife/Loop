// app/api/house/mortgage/shortlist/route.ts
// FIX x2: createClient() now awaited, and source_kind now uses 'market' —
// the real check constraint on mortgage_deal_preferences only allows
// 'market' | 'recommendation', not the 'mortgage_rate_deal' value this used before.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { home_id, source_id } = await req.json();
  if (!home_id || !source_id) {
    return NextResponse.json({ error: "home_id and source_id are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await supabase
    .from("mortgage_deal_preferences")
    .update({ is_shortlisted: false })
    .eq("home_id", home_id)
    .eq("source_kind", "market")
    .eq("is_shortlisted", true);

  const { data: existing } = await supabase
    .from("mortgage_deal_preferences")
    .select("id")
    .eq("user_id", user.id)
    .eq("source_kind", "market")
    .eq("source_id", source_id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("mortgage_deal_preferences")
      .update({ is_shortlisted: true, home_id })
      .eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase.from("mortgage_deal_preferences").insert({
      user_id: user.id,
      home_id,
      source_kind: "market",
      source_id,
      is_shortlisted: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shortlisted: true });
}
