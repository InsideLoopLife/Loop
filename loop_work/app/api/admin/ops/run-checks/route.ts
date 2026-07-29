import { NextResponse } from "next/server";
import { refreshAdminAttentionQueue } from "@/lib/admin/checks";

export async function POST() {
  const result = await refreshAdminAttentionQueue();
  return NextResponse.json({ ok: true, result });
}
