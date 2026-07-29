"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addUptimeTarget(formData: FormData) {
  const supabase = await createClient();
  const payload = {
    target_name: String(formData.get("target_name") || ""),
    target_url: String(formData.get("target_url") || ""),
    area: String(formData.get("area") || "system_continuity"),
    check_frequency_minutes: Number(formData.get("check_frequency_minutes") || 15),
    timeout_ms: Number(formData.get("timeout_ms") || 8000),
    enabled: true,
  };

  const { error } = await supabase.from("loop_uptime_targets").insert(payload);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/uptime");
}
