"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveUserPlan(formData: FormData) {
  const supabase = await createClient();
  const userId = String(formData.get("user_id") || "");
  const currentPlan = String(formData.get("current_plan") || "free");
  const realtime = formData.get("realtime_market_data_enabled") === "on";

  const { error } = await supabase.from("loop_user_admin_profiles").upsert({
    user_id: userId,
    current_plan: currentPlan,
    realtime_market_data_enabled: realtime,
    provider_checks_mode: String(formData.get("provider_checks_mode") || "manual"),
    account_status: String(formData.get("account_status") || "active"),
    admin_notes: String(formData.get("admin_notes") || ""),
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function approveTierRequest(formData: FormData) {
  const supabase = await createClient();
  const requestId = String(formData.get("request_id") || "");
  const userId = String(formData.get("user_id") || "");
  const requestedTier = String(formData.get("requested_tier") || "plus");
  const note = String(formData.get("admin_decision_note") || "");

  const { data: authData } = await supabase.auth.getUser();

  const { error: profileError } = await supabase.from("loop_user_admin_profiles").upsert({
    user_id: userId,
    current_plan: requestedTier,
    account_status: "active",
    admin_notes: note,
    updated_at: new Date().toISOString(),
  });
  if (profileError) throw new Error(profileError.message);

  const { error } = await supabase
    .from("loop_user_tier_requests")
    .update({
      status: "approved",
      admin_decision_note: note,
      decided_by: authData.user?.id || null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function rejectTierRequest(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("loop_user_tier_requests")
    .update({
      status: "rejected",
      admin_decision_note: String(formData.get("admin_decision_note") || ""),
      decided_by: authData.user?.id || null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", String(formData.get("request_id") || ""));

  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}

export async function saveUserFeatureOverride(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  const userId = String(formData.get("user_id") || "");
  const featureKey = String(formData.get("feature_key") || "");
  const limitRaw = String(formData.get("limit_value") || "");
  const enabled = formData.get("enabled") === "on";

  const { error } = await supabase.from("loop_user_feature_overrides").upsert({
    user_id: userId,
    feature_key: featureKey,
    feature_label: String(formData.get("feature_label") || featureKey),
    enabled,
    limit_value: limitRaw ? Number(limitRaw) : null,
    limit_unit: String(formData.get("limit_unit") || ""),
    override_value: {
      note: String(formData.get("override_note") || ""),
    },
    reason: String(formData.get("reason") || ""),
    created_by: authData.user?.id || null,
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/admin/users");
}
