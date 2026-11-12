import { NextResponse, type NextRequest } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { verifyCronRequest } from "@/lib/security/cron";
import { buildNotifications } from "@/lib/notifications/insights";

// Runs daily (twice, via the rates worker). Each notification has a key, so
// repeat runs update the same one instead of adding another.
export async function GET(request: NextRequest) {
  const guard = verifyCronRequest(request);
  if (!guard.ok) return guard.response;

  const supabase = createWorkerDatabaseClient("notifications");
  const [{ data: profiles, error }, { data: prefs }] = await Promise.all([
    supabase.from("app_user_profiles").select("user_id, household_id").limit(1000),
    supabase.from("app_notification_preferences").select("user_id, in_app_enabled, renewal_reminders_enabled, finance_digest_enabled, health_digest_enabled"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const totals = { created: 0, updated: 0, skipped: 0, failed: 0 };
  for (const profile of profiles || []) {
    try {
      const result = await buildNotifications(supabase, profile, { prefs: (prefs || []).find((p: any) => p.user_id === profile.user_id) ?? null });
      totals.created += result.created;
      totals.updated += result.updated;
      totals.skipped += result.skipped;
    } catch (err) {
      totals.failed += 1;
      console.error("notification-insights", profile.user_id, err);
    }
  }
  return NextResponse.json({ ok: true, ...totals });
}
