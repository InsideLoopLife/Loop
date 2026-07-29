import { NextRequest, NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { verifyCronRequest } from "@/lib/security/cron";

export async function GET(request: NextRequest) {
  const guard = verifyCronRequest(request);
  if (!guard.ok) return guard.response;
  try {
    const supabase = createWorkerDatabaseClient("wealth");
    const cutoff = new Date().toISOString();
    const { data, error } = await supabase
      .from("property_move_queries")
      .delete()
      .eq("status", "archived")
      .not("delete_after", "is", null)
      .lte("delete_after", cutoff)
      .select("id, title");
    if (error) throw error;
    return NextResponse.json({ ok: true, deleted: data?.length || 0, rows: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Property archive cleanup failed" }, { status: 500 });
  }
}
