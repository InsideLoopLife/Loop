"use server";

import { revalidatePath } from "next/cache";
import { createBestAdminClient, getAdminAccess } from "@/lib/admin/access";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const access = await getAdminAccess();
  if (!access.user || !access.isAdmin) throw new Error("Admin access required");
  const supabase = createBestAdminClient() || await createClient();
  return { supabase, user: access.user };
}

export async function completeFutureIntegrationTask(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing task id");
  const { error } = await supabase
    .from("app_future_integration_tasks")
    .update({ status: "done", completed_at: new Date().toISOString(), completed_by: user.id, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/future-integrations");
}

export async function resetFutureIntegrationTask(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing task id");
  const { error } = await supabase
    .from("app_future_integration_tasks")
    .update({ status: "todo", completed_at: null, completed_by: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/future-integrations");
}
