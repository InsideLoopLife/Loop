import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { verifyCronRequest } from "@/lib/security/cron";
import { sendTransactionalEmail } from "@/lib/notifications/send";
import { buildWeeklyDigest } from "@/lib/notifications/weekly-digest";
import { notify, weekKey } from "@/lib/notifications/notify";

export const maxDuration = 120;

// Monday email. The rates worker calls this on Mondays (twice, 07:00 and
// 08:00 UTC); anyone already sent this week is skipped, so nobody gets two.
export async function GET(request: NextRequest) {
  const guard = verifyCronRequest(request);
  if (!guard.ok) return guard.response;

  const supabase = createWorkerDatabaseClient("notifications");
  const appUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://loop-web-jf7p.onrender.com";
  const today = new Date();
  const week = weekKey(today);
  const since = new Date(today.getTime() - 5 * 86400000).toISOString();

  const { data: prefs, error } = await supabase
    .from("app_notification_preferences")
    .select("user_id, household_id, weekly_email_enabled, finance_digest_enabled, health_digest_enabled, in_app_enabled")
    .eq("weekly_email_enabled", true)
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ user: string; status: string; note?: string | null }> = [];
  for (const pref of prefs || []) {
    try {
      const { data: already } = await supabase.from("app_email_runs").select("id").eq("user_id", pref.user_id).eq("run_type", "scheduled").eq("status", "sent").gte("created_at", since).limit(1);
      if (already?.length) { results.push({ user: pref.user_id, status: "already_sent" }); continue; }

      const { data: userRow } = await supabase.auth.admin.getUserById(pref.user_id);
      const email = userRow?.user?.email;
      if (!email) { results.push({ user: pref.user_id, status: "no_email" }); continue; }
      const { data: profile } = await supabase.from("app_user_profiles").select("display_name, household_id").eq("user_id", pref.user_id).maybeSingle();
      const householdId = pref.household_id || profile?.household_id || null;

      const digest = await buildWeeklyDigest(supabase, { user_id: pref.user_id, household_id: householdId, name: profile?.display_name }, {
        today, appUrl, finance: pref.finance_digest_enabled !== false, health: pref.health_digest_enabled !== false,
      });
      if (digest.empty) { results.push({ user: pref.user_id, status: "nothing_to_say" }); continue; }

      let status = "failed";
      let note: string | null = null;
      try {
        const sent = await sendTransactionalEmail({ to: email, subject: digest.subject, html: digest.html, text: digest.text });
        status = sent.sent ? "sent" : "created";
        note = sent.skipped;
      } catch (err: any) {
        note = err?.message || "Send failed";
      }

      await supabase.from("app_email_runs").insert({
        user_id: pref.user_id,
        household_id: householdId,
        run_type: "scheduled",
        status,
        subject: digest.subject,
        preview_body: digest.text,
        send_to_email_hash: crypto.createHash("sha256").update(email.toLowerCase()).digest("hex"),
        sent_at: status === "sent" ? new Date().toISOString() : null,
        error_message: note,
      });

      if (pref.in_app_enabled !== false) {
        await notify(supabase, {
          user_id: pref.user_id, household_id: householdId, notification_type: "weekly_digest", key: week, category: "wealth",
          title: "Your week in LOOP", body: digest.summary, cta_label: "Open summary", cta_href: "/dashboard",
          expires_at: new Date(today.getTime() + 8 * 86400000).toISOString(),
        });
      }
      results.push({ user: pref.user_id, status, note });
    } catch (err: any) {
      results.push({ user: pref.user_id, status: "error", note: err?.message || String(err) });
    }
  }
  return NextResponse.json({ ok: true, processed: results.length, results });
}
