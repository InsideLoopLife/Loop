"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildNotifications } from "@/lib/notifications/insights";
import { areaOf, needsDecision } from "@/lib/notifications/areas";
import { buildWeeklyDigest } from "@/lib/notifications/weekly-digest";
import { sendTransactionalEmail } from "@/lib/notifications/send";
import { WRITE_OFF_NOTIFICATION_TYPE, writeOffHolding } from "@/lib/investments/write-off";

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
  if (notification?.notification_type === WRITE_OFF_NOTIFICATION_TYPE) {
    const holdingId = String((notification.metadata as any)?.holding_id || "");
    if (holdingId) await writeOffHolding(supabase, holdingId, user.id);
    const { error } = await supabase
      .from("app_notifications")
      .update({ status: "read", action_status: "accepted", read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/investments");
  } else if (notification?.notification_type === "household_profile_claim" && claimRequestId) {
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



export async function createWeeklyPreview() {
  const { supabase, user } = await requireUser();
  const [{ data: membership }, { data: prefs }] = await Promise.all([
    supabase.from("app_household_members").select("household_id").eq("user_id", user.id).eq("status", "active").maybeSingle(),
    supabase.from("app_notification_preferences").select("in_app_enabled, renewal_reminders_enabled, finance_digest_enabled, health_digest_enabled").eq("user_id", user.id).maybeSingle(),
  ]);
  // Same builder as the daily job, so pressing this never adds duplicates.
  await buildNotifications(supabase, { user_id: user.id, household_id: membership?.household_id || null }, { prefs: prefs ? { ...prefs, in_app_enabled: true } : null });
  revalidatePath("/notifications");
}

const ACTIVE = () => `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`;

/** Mark notifications read: the ids given, or every unread one (in one area if named). */
export async function markRead(input: { ids?: string[]; area?: string | null }) {
  const { supabase, user } = await requireUser();
  let ids = (input.ids || []).filter((id) => typeof id === "string" && id.length < 64);
  if (!input.ids) {
    const { data } = await supabase.from("app_notifications").select("id, notification_type, cta_href, status, action_status").eq("user_id", user.id).eq("status", "unread").or(ACTIVE()).limit(500);
    ids = (data || [])
      .filter((n: any) => !needsDecision(n)) // a yes/no is never cleared by "mark all read"
      .filter((n: any) => !input.area || areaOf(n) === input.area)
      .map((n: any) => n.id);
  }
  if (!ids.length) return;
  const { error } = await supabase.from("app_notifications").update({ status: "read", read_at: new Date().toISOString() }).in("id", ids).eq("user_id", user.id).eq("status", "unread");
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}

export async function markAllReadForm(formData: FormData) {
  await markRead({ area: String(formData.get("area") || "") || null });
}

export async function dismissById(id: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("app_notifications").update({ status: "dismissed", read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}

/** Send this week's digest to yourself now, to see what it looks like. */
export async function emailMyDigest(): Promise<{ ok: boolean; message: string }> {
  const { supabase, user } = await requireUser();
  if (!user.email) return { ok: false, message: "Your account has no email address." };
  const [{ data: membership }, { data: profile }, { data: prefs }] = await Promise.all([
    supabase.from("app_household_members").select("household_id").eq("user_id", user.id).eq("status", "active").maybeSingle(),
    supabase.from("app_user_profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
    supabase.from("app_notification_preferences").select("finance_digest_enabled, health_digest_enabled").eq("user_id", user.id).maybeSingle(),
  ]);
  const appUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://loop-web-jf7p.onrender.com";
  const digest = await buildWeeklyDigest(supabase, { user_id: user.id, household_id: membership?.household_id || null, name: profile?.display_name }, {
    appUrl, finance: prefs?.finance_digest_enabled !== false, health: prefs?.health_digest_enabled !== false,
  });
  const sent = await sendTransactionalEmail({ to: user.email, subject: digest.subject, html: digest.html, text: digest.text }).catch((e: any) => ({ sent: false, skipped: e?.message || "Send failed" }));
  return sent.sent
    ? { ok: true, message: `Sent to ${user.email}. It can take a minute to arrive.` }
    : { ok: false, message: `Couldn't send it: ${sent.skipped || "email isn't set up"}.` };
}
