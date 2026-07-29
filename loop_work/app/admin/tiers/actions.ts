"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function numOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function penceFromPounds(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const number = Number(raw);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function penceRaw(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const number = Number(raw);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function revalidateTierViews() {
  revalidatePath("/admin/tiers");
  revalidatePath("/admin/tier-control");
  revalidatePath("/account/plan");
}

// Legacy loop_plan_tiers action kept for older admin widgets that still submit to it.
export async function saveTier(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.from("loop_plan_tiers").upsert({
    tier_key: String(formData.get("tier_key") || "").trim(),
    display_name: String(formData.get("display_name") || "").trim(),
    description: String(formData.get("description") || ""),
    monthly_price_pence: penceFromPounds(formData.get("monthly_price")),
    status: String(formData.get("status") || "active"),
    sort_order: Number(formData.get("sort_order") || 100),
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
  revalidateTierViews();
}

// Legacy loop_plan_features action kept for older admin widgets that still submit to it.
export async function saveTierFeature(formData: FormData) {
  const supabase = await createClient();

  const rawJson = String(formData.get("feature_value") || "{}");
  let featureValue = {};
  try {
    featureValue = JSON.parse(rawJson);
  } catch {
    featureValue = { note: rawJson };
  }

  const { error } = await supabase.from("loop_plan_features").upsert({
    tier_key: String(formData.get("tier_key") || "free"),
    feature_key: String(formData.get("feature_key") || ""),
    feature_label: String(formData.get("feature_label") || ""),
    enabled: formData.get("enabled") === "on",
    feature_value: featureValue,
    limit_value: numOrNull(formData.get("limit_value")),
    limit_unit: String(formData.get("limit_unit") || ""),
    description: String(formData.get("description") || ""),
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
  revalidateTierViews();
}

export async function saveUserFacingPlan(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("app_admin_upsert_plan", {
    p_slug: String(formData.get("slug") || "").trim(),
    p_name: String(formData.get("name") || "").trim(),
    p_description: String(formData.get("description") || "").trim(),
    p_visible_to_users: formData.get("visible_to_users") === "on",
    p_is_active: formData.get("is_active") === "on",
    p_is_paid: formData.get("is_paid") === "on",
    p_monthly_price_pence: penceRaw(formData.get("monthly_price_pence")),
    p_annual_price_pence: penceRaw(formData.get("annual_price_pence")),
    p_sort_order: Number(formData.get("sort_order") || 100),
  });

  if (error) throw new Error(error.message);
  revalidateTierViews();
}

export async function deleteUserFacingPlan(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("app_admin_delete_plan", {
    p_slug: String(formData.get("slug") || "").trim(),
  });
  if (error) throw new Error(error.message);
  revalidateTierViews();
}

export async function saveUserFacingFeatureDefinition(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("app_admin_upsert_feature_definition", {
    p_feature_key: String(formData.get("feature_key") || "").trim(),
    p_category: String(formData.get("category") || "General").trim(),
    p_name: String(formData.get("name") || "").trim(),
    p_description: String(formData.get("description") || "").trim(),
    p_is_active: formData.get("is_active") !== "off",
  });
  if (error) throw new Error(error.message);
  revalidateTierViews();
}

export async function deleteUserFacingFeature(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("app_admin_delete_feature", {
    p_feature_key: String(formData.get("feature_key") || "").trim(),
  });
  if (error) throw new Error(error.message);
  revalidateTierViews();
}

export async function saveUserFacingPlanFeature(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("app_admin_set_feature_for_plan", {
    p_plan_slug: String(formData.get("plan_slug") || "").trim(),
    p_feature_key: String(formData.get("feature_key") || "").trim(),
    p_enabled: formData.get("enabled") === "on",
    p_limit_value: numOrNull(formData.get("limit_value")),
    p_limit_period: String(formData.get("limit_period") || "none"),
    p_enforcement_mode: String(formData.get("enforcement_mode") || "audit"),
    p_health_status: String(formData.get("health_status") || "active"),
    p_user_message: String(formData.get("user_message") || ""),
  });

  if (error) throw new Error(error.message);
  revalidateTierViews();
}

export async function setUserPlan(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("app_admin_set_user_plan", {
    p_user_id: String(formData.get("user_id") || ""),
    p_plan_slug: String(formData.get("plan_slug") || "free"),
    p_reason: String(formData.get("reason") || "Admin tier change"),
    p_expires_at: String(formData.get("expires_at") || "") || null,
  });

  if (error) throw new Error(error.message);
  revalidateTierViews();
}

export async function reviewPlanRequest(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("app_admin_review_plan_request", {
    p_request_id: String(formData.get("request_id") || ""),
    p_approve: formData.get("decision") === "approve",
    p_note: String(formData.get("note") || ""),
  });

  if (error) throw new Error(error.message);
  revalidateTierViews();
}

export async function saveTierAiModelConfig(formData: FormData) {
  const supabase = await createClient();

  const tierKey = String(formData.get("tier_key") || "free").trim();
  const routeKey = String(formData.get("route_key") || "quick_runtime").trim();
  const model = String(formData.get("model") || "gpt-4.1-mini").trim();
  const apiKeyEnvName = String(formData.get("api_key_env_name") || "OPENAI_API_KEY").trim();

  const { error } = await supabase.from("loop_tier_ai_model_config").upsert({
    tier_key: tierKey,
    route_key: routeKey,
    provider: String(formData.get("provider") || "openai"),
    model,
    api_key_env_name: apiKeyEnvName,
    daily_limit: numOrNull(formData.get("daily_limit")),
    monthly_budget_pence: numOrNull(formData.get("monthly_budget_pence")),
    enabled: formData.get("enabled") === "on",
    notes: String(formData.get("notes") || ""),
    updated_at: new Date().toISOString(),
  }, { onConflict: "tier_key,route_key" });

  if (error) throw new Error(error.message);
  revalidateTierViews();
}
