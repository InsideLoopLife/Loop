import type { UserFeatureAccess } from "@/domains/identity/entitlements";

export type LoopDomain =
  | "account"
  | "wealth"
  | "health"
  | "market"
  | "admin";

export type DomainPermission =
  | "summary"
  | "view"
  | "contribute"
  | "edit"
  | "admin";

export type FeatureKey = keyof UserFeatureAccess;

export type DomainAccessRequest = {
  domain: LoopDomain;
  permission?: DomainPermission;
  feature?: FeatureKey;
  anyFeature?: FeatureKey[];
  deniedRedirect?: string;
};
