"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeAdminAuditEvent } from "@/lib/admin/audit";

export async function updateDeploymentCheck(formData: FormData) {
  const supabase = await createClient();
  const key = String(formData.get("check_key") || "");
  const status = String(formData.get("status") || "todo");

  if (!key) throw new Error("Missing check key.");

  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("loop_admin_deployment_checks")
    .update({
      status,
      updated_by: userData.user?.id || null,
      updated_at: new Date().toISOString(),
    })
    .eq("check_key", key);

  if (error) throw new Error(error.message);

  await writeAdminAuditEvent({
    actionKey: "deployment_check_update",
    entityKind: "loop_admin_deployment_checks",
    entityId: key,
    afterPayload: { status },
  });

  revalidatePath("/admin/security");
}
