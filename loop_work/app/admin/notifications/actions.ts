"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { refreshAdminAttentionQueue } from "@/lib/admin/checks";

export async function runAdminChecks() {
  await refreshAdminAttentionQueue();
  revalidatePath("/admin/notifications");
}

export async function updateAlertStatus(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("alert_id") || "");
  const status = String(formData.get("status") || "open");

  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("loop_admin_alerts")
    .update({
      status,
      resolved_at: ["resolved", "dismissed"].includes(status) ? new Date().toISOString() : null,
      resolved_by: ["resolved", "dismissed"].includes(status) ? userData.user?.id || null : null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  await supabase.from("loop_admin_alert_events").insert({
    alert_id: id,
    event_kind: "status_changed",
    note: `Status changed to ${status}`,
    actor_user_id: userData.user?.id || null,
  });

  revalidatePath("/admin/notifications");
}
