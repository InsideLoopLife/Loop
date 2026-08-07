import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/platform/database/admin-client";

export type WorkerDatabaseDomain =
  | "market"
  | "rates"
  | "wealth"
  | "health"
  | "notifications"
  | "platform";

export type WorkerDatabaseClient = ReturnType<typeof createAdminClient> & {
  /** Marker used for logging and architecture checks. It is not a DB grant. */
  readonly __loopWorkerDomain?: WorkerDatabaseDomain;
};

let cachedRatesClient: WorkerDatabaseClient | null = null;

/**
 * The rates domain (savings/mortgage catalogue) now lives in its own,
 * separate Supabase project — moved off the main database specifically
 * because the rates worker's own scraping/write volume was contributing
 * to the main project's usage overage. This is exactly the "later" the
 * original comment on this file anticipated: only this one function
 * needed to change; every call site that already went through
 * createWorkerDatabaseClient("rates") is fixed automatically.
 */
function createRatesDatabaseClient(): WorkerDatabaseClient {
  if (cachedRatesClient) return cachedRatesClient;
  const url = process.env.SUPABASE_URL_Savings;
  const key = process.env.SUPABASE_SECRET_KEY_Savings;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL_Savings / SUPABASE_SECRET_KEY_Savings — the rates domain now requires its own Supabase project's credentials, separate from the main database's."
    );
  }
  cachedRatesClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as WorkerDatabaseClient;
  return cachedRatesClient;
}

/**
 * Creates a privileged client for a named worker boundary.
 *
 * Every domain except "rates" still uses the main project's one server
 * secret, so for those the domain marker remains an application
 * boundary rather than a real database split — exactly as the original
 * design intended, ready for the same treatment later without changing
 * any worker's business logic.
 */
export function createWorkerDatabaseClient(
  domain: WorkerDatabaseDomain,
): WorkerDatabaseClient {
  if (domain === "rates") return createRatesDatabaseClient();
  return createAdminClient() as WorkerDatabaseClient;
}
