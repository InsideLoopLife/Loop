import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { areaOf, needsDecision } from "@/lib/notifications/areas";

export const dynamic = "force-dynamic";

// The bell dropdown: the latest active notifications, decisions first.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [], unread: 0 }, { status: 401 });
  const { data } = await supabase
    .from("app_notifications")
    .select("id, notification_type, title, body, cta_label, cta_href, severity, status, action_status, created_at")
    .eq("user_id", user.id)
    .neq("status", "dismissed")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(40);
  const rows = (data || []).map((n: any) => ({ ...n, area: areaOf(n), decision: needsDecision(n) }));
  const unread = rows.filter((n) => n.status === "unread").length;
  const items = [...rows.filter((n) => n.decision), ...rows.filter((n) => !n.decision)].slice(0, 12);
  return NextResponse.json({ items, unread }, { headers: { "Cache-Control": "no-store" } });
}
