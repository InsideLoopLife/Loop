"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function reportIssue(formData: FormData) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not authenticated.");

  const payload = {
    user_id: user.id,
    issue_area: String(formData.get("issue_area") || "other"),
    title: String(formData.get("title") || ""),
    description: String(formData.get("description") || ""),
    page_path: String(formData.get("page_path") || ""),
    severity: String(formData.get("severity") || "medium"),
    status: "new",
  };

  const { data: issue, error } = await supabase.from("loop_user_issue_reports").insert(payload).select("*").single();
  if (error) throw new Error(error.message);

  await supabase.rpc("loop_admin_raise_alert", {
    p_area: "user_issues",
    p_severity: payload.severity,
    p_alert_key: "user_issue_open",
    p_title: "User issue raised",
    p_summary: payload.title,
    p_detail: payload.description,
    p_entity_kind: "user_issue",
    p_entity_id: issue.id,
    p_action_url: "/admin/notifications?area=user_issues",
    p_payload: issue,
    p_check_cadence_minutes: 720,
  });

  revalidatePath("/help/report-issue");
}
