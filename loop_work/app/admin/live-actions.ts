"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createBestAdminClient, requireAdminAccess } from "@/lib/admin/access";

async function adminClient() {
  return createBestAdminClient() || await createClient();
}

export async function backfillUserFoundation() {
  await requireAdminAccess();
  const supabase = await adminClient();
  const { data, error } = await supabase.rpc("loop_admin_backfill_user_foundation");
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  return data;
}
