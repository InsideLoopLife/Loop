import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { snapTradeRequest } from "@/lib/snaptrade/client";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const status = await snapTradeRequest("GET", "/");
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "SnapTrade status failed" }, { status: 500 });
  }
}
