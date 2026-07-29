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

/**
 * Creates a privileged client for a named worker boundary.
 *
 * The current Supabase project still uses one server secret, so this marker is
 * an application boundary rather than a database role. Keeping the purpose
 * explicit lets LOOP move each worker to restricted credentials later without
 * changing worker business logic.
 */
export function createWorkerDatabaseClient(
  domain: WorkerDatabaseDomain,
): WorkerDatabaseClient {
  // The domain argument is intentionally explicit at each call site. The later
  // database phase can map it to a restricted key/role without changing those
  // workers. Do not mutate the Supabase client object at runtime.
  void domain;
  return createAdminClient() as WorkerDatabaseClient;
}
