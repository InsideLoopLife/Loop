import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureDefaultAssumptions, recordAssumptionCheck } from "@/lib/assumptions/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  await ensureDefaultAssumptions(supabase, user.id);
  await recordAssumptionCheck({
    supabase,
    userId: user.id,
    area: "api_check",
    status: "ok",
    message: "Assumptions API check completed and baseline assumptions are present.",
    assumptionKeys: [],
  });

  return NextResponse.json({ ok: true });
}
