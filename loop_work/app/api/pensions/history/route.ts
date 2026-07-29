import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // Ownership check: only the account's own user (or a household member with access via RLS)
  // can pull its history. RLS on pension_accounts/pension_funds already enforces this at the
  // database level, but we check explicitly here too so a missing row reads as 404, not a
  // confusing empty chart.
  const { data: account, error: accountError } = await supabase
    .from("pension_accounts")
    .select("id, current_value, value_as_of_date")
    .eq("id", accountId)
    .maybeSingle();
  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Pension account not found" }, { status: 404 });

  const { data: funds, error: fundsError } = await supabase
    .from("pension_funds")
    .select("id")
    .eq("pension_account_id", accountId);
  if (fundsError) return NextResponse.json({ error: fundsError.message }, { status: 500 });

  const fundIds = (funds || []).map((fund) => fund.id);
  if (!fundIds.length) return NextResponse.json({ points: [] });

  const { data: snapshots, error: snapshotError } = await supabase
    .from("pension_fund_value_snapshots")
    .select("pension_fund_id, snapshot_date, value")
    .in("pension_fund_id", fundIds)
    .order("snapshot_date", { ascending: true });
  if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 500 });

  const byDate = new Map<string, number>();
  for (const row of snapshots || []) {
    const date = String(row.snapshot_date);
    byDate.set(date, (byDate.get(date) || 0) + Number(row.value || 0));
  }

  const points = Array.from(byDate.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // If today's snapshot hasn't landed yet (e.g. the daily job hasn't run since the account was
  // last edited), still show the account's current known value as the most recent point so the
  // chart isn't stuck a day behind reality.
  const today = new Date().toISOString().slice(0, 10);
  if (Number(account.current_value) > 0 && (!points.length || points[points.length - 1].date < today)) {
    points.push({ date: account.value_as_of_date || today, value: Number(account.current_value) });
  }

  return NextResponse.json({ points });
}
