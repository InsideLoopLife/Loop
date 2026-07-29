"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function requestPlanChange(formData: FormData) {
  const supabase = await createClient();
  const planSlug = String(formData.get("plan_slug") || "").trim();
  const note = String(formData.get("note") || "").trim() || null;

  if (!planSlug) throw new Error("Choose a plan.");

  const { data, error } = await supabase.rpc("app_request_plan_change", {
    p_plan_slug: planSlug,
    p_note: note,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/account/plan");
  return data;
}
