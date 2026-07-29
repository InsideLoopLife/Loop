/**
 * Transitional code contract for future domain-specific sharing records.
 * Database-backed sharing rules will be added in the later schema phase.
 */
export type DomainSharingLevel =
  | "none"
  | "summary"
  | "view"
  | "contribute"
  | "edit"
  | "admin";

export type DomainSharingDecision = {
  domain: "account" | "wealth" | "health";
  ownerUserId: string;
  viewerUserId: string;
  level: DomainSharingLevel;
  source: "owner" | "legacy_household" | "explicit_permission";
};
