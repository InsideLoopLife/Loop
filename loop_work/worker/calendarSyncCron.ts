// worker/calendarSyncCron.ts
//
// Daily cron entry point. Iterates households (not raw user rows) since
// planned_items/food_logs materialization needs the full member list per
// household, not one user at a time — otherwise a household's payments/
// calories would be processed (and partially duplicated in effort) once
// per member instead of once per household.
//
// TODO: confirm this is how your other workers are scheduled (cron
// syntax / Render cron job type / long-running loop) and wire it in
// the same way as the rates/pension workers.

import { createWorkerDatabaseClient } from '@/platform/database/worker-client';
import { getActiveHouseholdContext } from '@/domains/identity/household';
import { materializeAllForHousehold } from '../lib/calendar/materialize';
import { pullGoogleEvents, pushLoopEventsToGoogle } from '../lib/google/sync';

async function run() {
  // "platform" domain marker — calendar spans wealth (payments/income)
  // and health (calories) data, but both still live in the one main
  // Supabase project today (only "rates" is split out), so any domain
  // marker resolves to the same admin client. Using "platform" flags
  // this worker as cross-domain rather than picking one arbitrarily.
  const db = createWorkerDatabaseClient('platform');

  const { data: users, error: usersError } = await db.from('app_user_profiles').select('user_id');
  if (usersError || !users?.length) {
    console.error('[calendar-cron] could not load users:', usersError?.message);
    return;
  }

  const processedHouseholds = new Set<string>(); // dedupe by householdId (or synthetic "solo:<userId>")

  for (const { user_id: userId } of users) {
    try {
      const household = await getActiveHouseholdContext(db, { id: userId });
      const dedupeKey = household.householdId ?? `solo:${userId}`;
      if (processedHouseholds.has(dedupeKey)) continue;
      processedHouseholds.add(dedupeKey);

      await materializeAllForHousehold({ db, household });
    } catch (err) {
      console.error(`[calendar-cron] materialize failed for household of ${userId}:`, err);
    }
  }

  const { data: connections, error: connError } = await db.from('google_calendar_connections').select('*');
  if (connError) {
    console.error('[calendar-cron] could not load google connections:', connError.message);
    return;
  }

  for (const conn of connections ?? []) {
    try {
      await pullGoogleEvents(db, conn);
      await pushLoopEventsToGoogle(db, conn);
      await db
        .from('google_calendar_connections')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('user_id', conn.user_id);
    } catch (err) {
      console.error(`[calendar-cron] google sync failed for ${conn.user_id}:`, err);
    }
  }

  console.log(
    `[calendar-cron] completed for ${processedHouseholds.size} households, ${connections?.length ?? 0} google connections`
  );
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[calendar-cron] fatal error:', err);
    process.exit(1);
  });
