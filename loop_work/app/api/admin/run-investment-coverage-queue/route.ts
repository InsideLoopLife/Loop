import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedAdminEmail } from "@/lib/admin/access";
import { processInvestmentCoverageRequests } from "@/app/api/cron/investment-coverage-requests/route";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAllowedAdminEmail(user.email)) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const result = await processInvestmentCoverageRequests(10);
  return NextResponse.json({ ...result, note: "Manual admin queue run." }, { status: result.ok ? 200 : 500 });
}
