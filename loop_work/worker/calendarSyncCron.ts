// worker/calendarSyncCron.ts — manual entry point. In production the same job
// runs daily via /api/cron/calendar-sync from the rates worker's maintenance list.
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { runCalendarSync } from "../lib/calendar/sync-all";

runCalendarSync(createWorkerDatabaseClient("platform") as any)
  .then((result) => { console.log(JSON.stringify(result)); process.exit(result.failed ? 1 : 0); })
  .catch((err) => { console.error("[calendar-cron] fatal error:", err); process.exit(1); });
