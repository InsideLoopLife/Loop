"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function markNotificationRead(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");
  const { error } = await supabase
    .from("app_notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}

export async function dismissNotification(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");
  const { error } = await supabase
    .from("app_notifications")
    .update({ status: "dismissed", read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}

export async function acceptNotificationRequest(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");

  const { data: notification, error: readError } = await supabase
    .from("app_notifications")
    .select("id, notification_type, metadata")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const claimRequestId = (notification?.metadata as any)?.claim_request_id;
  const nutritionClaimRequestId = (notification?.metadata as any)?.nutrition_claim_request_id;
  if (notification?.notification_type === "household_profile_claim" && claimRequestId) {
    const { error } = await supabase.rpc("app_resolve_profile_data_claim", {
      p_request_id: claimRequestId,
      p_decision: "accept",
    });
    if (error) throw new Error(`${error.message}. Run db/v27_54_household_notifications_privacy_polish.sql in Supabase.`);
  } else if (notification?.notification_type === "nutrition_allocation_request" && nutritionClaimRequestId) {
    const { error } = await supabase.rpc("app_resolve_nutrition_allocation_claim", {
      p_request_id: nutritionClaimRequestId,
      p_decision: "accept",
    });
    if (error) throw new Error(`${error.message}. Run db/v27_54_household_notifications_privacy_polish.sql in Supabase.`);
  } else {
    const { error } = await supabase
      .from("app_notifications")
      .update({ status: "read", action_status: "accepted", read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/notifications");
  revalidatePath("/nutrition");
  revalidatePath("/household");
  revalidatePath("/income");
  revalidatePath("/spending");
}

export async function declineNotificationRequest(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");

  const { data: notification, error: readError } = await supabase
    .from("app_notifications")
    .select("id, notification_type, metadata")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const claimRequestId = (notification?.metadata as any)?.claim_request_id;
  const nutritionClaimRequestId = (notification?.metadata as any)?.nutrition_claim_request_id;
  if (notification?.notification_type === "household_profile_claim" && claimRequestId) {
    const { error } = await supabase.rpc("app_resolve_profile_data_claim", {
      p_request_id: claimRequestId,
      p_decision: "decline",
    });
    if (error) throw new Error(`${error.message}. Run db/v27_54_household_notifications_privacy_polish.sql in Supabase.`);
  } else if (notification?.notification_type === "nutrition_allocation_request" && nutritionClaimRequestId) {
    const { error } = await supabase.rpc("app_resolve_nutrition_allocation_claim", {
      p_request_id: nutritionClaimRequestId,
      p_decision: "decline",
    });
    if (error) throw new Error(`${error.message}. Run db/v27_54_household_notifications_privacy_polish.sql in Supabase.`);
  } else {
    const { error } = await supabase
      .from("app_notifications")
      .update({ status: "dismissed", action_status: "declined", read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/notifications");
  revalidatePath("/household");
}

function num(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
}

export async function createWeeklyPreview() {
  const { supabase, user } = await requireUser();
  const { data: membership } = await supabase
    .from("app_household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const [holdings, logs] = await Promise.all([
    supabase.from("investment_holdings").select("asset_name, latest_price, average_buy_price, units, imported_current_value, imported_invested_value").eq("user_id", user.id).limit(200),
    supabase.from("food_logs").select("label, calories, protein_g, fibre_g, salt_g, processed_score, gut_health_score, eaten_on").eq("user_id", user.id).gte("eaten_on", new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)).limit(200),
  ]);

  const holdingRows: any[] = holdings.data || [];
  const invested = holdingRows.reduce((sum, h) => sum + (num(h.imported_invested_value) || num(h.average_buy_price) * num(h.units)), 0);
  const current = holdingRows.reduce((sum, h) => sum + (num(h.imported_current_value) || num(h.latest_price) * num(h.units)), 0);
  const delta = current - invested;
  const deltaPct = invested > 0 ? (delta / invested) * 100 : 0;

  const logRows: any[] = logs.data || [];
  const avgFibre = logRows.length ? logRows.reduce((sum, row) => sum + num(row.fibre_g), 0) / 7 : 0;
  const avgProtein = logRows.length ? logRows.reduce((sum, row) => sum + num(row.protein_g), 0) / 7 : 0;
  const avgProcessed = logRows.length ? logRows.reduce((sum, row) => sum + num(row.processed_score), 0) / logRows.length : 0;

  const rows = [
    {
      user_id: user.id,
      household_id: membership?.household_id || null,
      notification_type: "investment_weekly_progress",
      category: "wealth",
      channel: "in_app",
      severity: delta >= 0 ? "success" : "info",
      status: "unread",
      title: "Investment progress snapshot",
      body: holdingRows.length
        ? `Your tracked investments are ${delta >= 0 ? "up" : "down"} ${money(Math.abs(delta))} (${deltaPct.toFixed(1)}%) vs tracked cost/current baseline. Toggle week, month or year from this notification when full history is available.`
        : "Add investment holdings to receive weekly, monthly and yearly performance snapshots.",
      cta_label: "Open investments",
      cta_href: "/investments",
      period_key: "week",
      metadata: { invested, current, delta, deltaPct, periods: ["week", "month", "year"] },
    },
    {
      user_id: user.id,
      household_id: membership?.household_id || null,
      notification_type: "nutrition_weekly_insight",
      category: "lifestyle",
      channel: "in_app",
      severity: avgProcessed > 65 || avgFibre < 10 ? "warning" : "info",
      status: "unread",
      title: "Weekly nutrition insight",
      body: logRows.length
        ? `This week averages around ${avgProtein.toFixed(1)}g protein/day, ${avgFibre.toFixed(1)}g fibre/day and processed load ${avgProcessed.toFixed(0)}/100. LoopHealth will keep nudging balance, not perfection.`
        : "Start logging meals to receive a weekly nutrition trend and simple balance nudges.",
      cta_label: "Open LoopHealth",
      cta_href: "/nutrition",
      period_key: "week",
      metadata: { avgProtein, avgFibre, avgProcessed, loggedItems: logRows.length },
    },
  ];

  const { error } = await supabase.from("app_notifications").insert(rows);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}
