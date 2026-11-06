// Fills calendar_events for every household, then runs Google two-way sync.
// Called daily by /api/cron/calendar-sync (rates worker maintenance list).
import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveHouseholdContext } from "@/domains/identity/household";
import { materializeAllForHousehold } from "@/lib/calendar/materialize";
import { pullGoogleEvents, pushLoopEventsToGoogle } from "@/lib/google/sync";

export async function syncCalendarForUser(db: SupabaseClient, userId: string) {
  const household = await getActiveHouseholdContext(db as any, { id: userId });
  return materializeAllForHousehold({ db, household });
}

export async function runCalendarSync(db: SupabaseClient) {
  const { data: users, error } = await db.from("app_user_profiles").select("user_id");
  if (error) throw new Error(error.message);

  const done = new Set<string>();
  const results: Array<{ household: string; ok: boolean; payments?: number; calories?: number; error?: string }> = [];
  for (const { user_id: userId } of users || []) {
    try {
      const household = await getActiveHouseholdContext(db as any, { id: userId });
      const key = household.householdId ?? `solo:${userId}`;
      if (done.has(key)) continue;
      done.add(key);
      const counts = await materializeAllForHousehold({ db, household });
      results.push({ household: key, ok: true, ...counts });
    } catch (err: any) {
      results.push({ household: `user:${userId}`, ok: false, error: err?.message || "failed" });
    }
  }

  const { data: connections } = await db.from("google_calendar_connections").select("*");
  let google = 0;
  for (const conn of connections || []) {
    try {
      await pullGoogleEvents(db as any, conn);
      await pushLoopEventsToGoogle(db as any, conn);
      await db.from("google_calendar_connections").update({ last_synced_at: new Date().toISOString() }).eq("user_id", conn.user_id);
      google += 1;
    } catch (err: any) {
      results.push({ household: `google:${conn.user_id}`, ok: false, error: err?.message || "google sync failed" });
    }
  }
  return { households: done.size, google, failed: results.filter((r) => !r.ok).length, results };
}
