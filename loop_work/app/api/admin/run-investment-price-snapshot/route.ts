import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedAdminEmail } from "@/lib/admin/access";
import { runInvestmentPriceSnapshotJob } from "@/lib/investments/price-snapshot-runner";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAllowedAdminEmail(user.email)) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const result = await runInvestmentPriceSnapshotJob({ force: true, logger: console });
  return NextResponse.json({ ...result, note: "Manual admin force-run. Production cadence still comes from cron." }, { status: result.ok ? 200 : 500 });
}
