// app/api/house/overview/route.ts
// FIX: createClient() is async in this repo — must be awaited (this was the Render build error).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHouseOverview } from "@/lib/house/overview-data";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get("household_id");
  const homeId = searchParams.get("home_id") ?? undefined;

  if (!householdId) {
    return NextResponse.json({ error: "household_id is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = await getHouseOverview(householdId, homeId);
  if (!payload) {
    return NextResponse.json({ error: "No home found for this household" }, { status: 404 });
  }

  return NextResponse.json(payload);
}
