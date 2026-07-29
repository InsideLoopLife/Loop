import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminAccess } from "@/lib/admin/access";

export async function POST(_request: NextRequest) {
  const access = await getAdminAccess();
  if (!access.isAdmin) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const supabase = await createClient();
  await supabase.from("app_security_events").insert({
    user_id: access.user.id,
    event_type: "admin_digest_send_route_called",
    status: "info",
    metadata: { note: "Use /api/cron/weekly-digest with CRON_SECRET for scheduled sends." },
  });

  return NextResponse.json({ ok: true, message: "Admin route reachable. Scheduled sending is handled by /api/cron/weekly-digest." });
}
