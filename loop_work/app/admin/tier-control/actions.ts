"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setUserPlan(formData: FormData) {
  const supabase = await createClient();

  const userId = String(formData.get("user_id") || "");
  const planSlug = String(formData.get("plan_slug") || "free");
  const reason = String(formData.get("reason") || "Admin beta override");
  const expires = String(formData.get("expires_at") || "") || null;

  const { error } = await supabase.rpc("app_admin_set_user_plan", {
    p_user_id: userId,
    p_plan_slug: planSlug,
    p_reason: reason,
    p_expires_at: expires,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/admin/tier-control");
}

export async function savePlanFeature(formData: FormData) {
  const supabase = await createClient();

  const limitRaw = String(formData.get("limit_value") || "");
  const limitValue = limitRaw ? Number(limitRaw) : null;

  const { error } = await supabase.rpc("app_admin_set_feature_for_plan", {
    p_plan_slug: String(formData.get("plan_slug") || ""),
    p_feature_key: String(formData.get("feature_key") || ""),
    p_enabled: formData.get("enabled") === "on",
    p_limit_value: limitValue,
    p_limit_period: String(formData.get("limit_period") || "none"),
    p_enforcement_mode: String(formData.get("enforcement_mode") || "audit"),
    p_health_status: String(formData.get("health_status") || "active"),
    p_user_message: String(formData.get("user_message") || ""),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/admin/tier-control");
}

export async function savePlan(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("app_admin_upsert_plan", {
    p_slug: String(formData.get("slug") || ""),
    p_name: String(formData.get("name") || ""),
    p_description: String(formData.get("description") || ""),
    p_visible_to_users: formData.get("visible_to_users") === "on",
    p_is_active: formData.get("is_active") === "on",
    p_is_paid: formData.get("is_paid") === "on",
    p_monthly_price_pence: Number(formData.get("monthly_price_pence") || 0),
    p_annual_price_pence: Number(formData.get("annual_price_pence") || 0),
    p_sort_order: Number(formData.get("sort_order") || 100),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/admin/tier-control");
}
