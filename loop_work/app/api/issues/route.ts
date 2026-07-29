import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json();

  const { data: issue, error } = await supabase
    .from("loop_user_issue_reports")
    .insert({
      user_id: user.id,
      household_id: body.household_id || null,
      issue_area: body.issue_area || "other",
      title: body.title,
      description: body.description,
      page_path: body.page_path || null,
      browser: request.headers.get("user-agent"),
      device_label: body.device_label || null,
      screenshot_url: body.screenshot_url || null,
      severity: body.severity || "medium",
      status: "new",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data: alertId } = await supabase.rpc("loop_admin_raise_alert", {
    p_area: "user_issues",
    p_severity: body.severity || "medium",
    p_alert_key: "user_issue_open",
    p_title: "User issue raised",
    p_summary: body.title,
    p_detail: body.description,
    p_entity_kind: "user_issue",
    p_entity_id: issue.id,
    p_action_url: "/admin/notifications?area=user_issues",
    p_payload: issue,
    p_check_cadence_minutes: 720,
  });

  if (alertId) {
    await supabase.from("loop_user_issue_reports").update({ linked_alert_id: alertId }).eq("id", issue.id);
  }

  return NextResponse.json({ ok: true, issue });
}
