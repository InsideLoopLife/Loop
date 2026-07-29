import { NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;

  if (!expected || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createWorkerDatabaseClient("wealth");
  const today = new Date().toISOString().slice(0, 10);

  const { data: accounts, error: accountsError } = await supabase
    .from("financial_accounts")
    .select("id, user_id, current_balance");

  if (accountsError) {
    return NextResponse.json({ error: accountsError.message }, { status: 500 });
  }

  const payload = (accounts ?? []).map((account) => ({
    user_id: account.user_id,
    account_id: account.id,
    snapshot_date: today,
    balance: Number(account.current_balance ?? 0),
    source: "cron_manual_balance",
  }));

  if (payload.length === 0) {
    return NextResponse.json({ inserted: 0, date: today });
  }

  const { error } = await supabase
    .from("account_balance_snapshots")
    .upsert(payload, { onConflict: "account_id,snapshot_date" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: payload.length, date: today });
}
