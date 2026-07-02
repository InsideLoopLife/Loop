"use server";

import { revalidatePath } from "next/cache";
import { requireAdminAccess, createBestAdminClient } from "@/lib/admin/access";
import { describeSupabaseAdminKey } from "@/lib/supabase/admin";
import { writeAdminAuditEvent } from "@/lib/admin/audit";

function adminClient() {
  const supabase = createBestAdminClient();
  if (!supabase) {
    const status = describeSupabaseAdminKey();
    throw new Error(`${status.reason} Investment storage admin settings need SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY set server-side as a service_role JWT or Supabase sb_secret_ key.`);
  }
  return supabase;
}

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

function numberOr(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}

export async function saveInvestmentSnapshotSettings(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = adminClient();
  const rows = [
    ["investment_snapshots_enabled", bool(formData.get("enabled"))],
    ["investment_snapshots_min_minutes", Math.max(5, numberOr(formData.get("min_minutes"), 15))],
    ["investment_snapshots_retain_days", Math.max(1, numberOr(formData.get("retain_days"), 365))],
    ["investment_snapshots_max_points_per_holding", Math.max(10, numberOr(formData.get("max_points_per_holding"), 5000))],
    ["investment_snapshots_market_hours_only", bool(formData.get("market_hours_only"))],
    ["investment_snapshots_realtime_users_only", bool(formData.get("realtime_users_only"))],
    ["investment_global_raw_price_points", bool(formData.get("global_raw_points"))],
    ["investment_realtime_minutes_between_points", Math.max(1, numberOr(formData.get("realtime_minutes"), 1))],
    ["investment_plus_pro_minutes_between_points", Math.max(5, numberOr(formData.get("plus_pro_minutes"), 15))],
    ["investment_free_minutes_between_points", Math.max(10, numberOr(formData.get("free_minutes"), 30))],
    ["investment_manual_refresh_uses_latest_global", bool(formData.get("manual_refresh_uses_latest_global"))],
  ].map(([setting_key, setting_value]) => ({ setting_key, setting_value: String(setting_value), updated_by: access.user.id, updated_at: new Date().toISOString() }));

  const { error } = await supabase.from("wealth_watch_settings").upsert(rows, { onConflict: "setting_key" });
  if (error) throw new Error(error.message);
  await writeAdminAuditEvent({ actionKey: "investment_snapshot_settings_update", entityKind: "wealth_watch_settings", afterPayload: rows });
  revalidatePath("/admin/investment-storage");
}

export async function pruneInvestmentSnapshotsNow() {
  const access = await requireAdminAccess();
  const supabase = adminClient();
  const { data, error } = await supabase.rpc("loop_admin_prune_investment_price_snapshots");
  if (error) throw new Error(error.message);
  let global: { data: any; error: any };
  try {
    global = await supabase.rpc("loop_admin_compact_investment_instrument_price_points") as any;
  } catch (caught: any) {
    global = { data: null, error: caught };
  }
  await writeAdminAuditEvent({ actionKey: "investment_snapshots_prune_manual", entityKind: "investment_price_snapshots", afterPayload: { user_snapshots: data, global_points: global.data, global_error: global.error?.message }, severity: "warning" });
  revalidatePath("/admin/investment-storage");
}
