import { requireDomainAccess } from "@/platform/permissions";

/**
 * Health is authenticated and private-by-default at the resource guard layer.
 * Existing household-aware page queries are preserved during this code-only
 * migration and will be replaced by explicit sharing rules in the DB phase.
 */
export function requireHealthPageAccess() {
  return requireDomainAccess({ domain: "health", permission: "view" });
}
