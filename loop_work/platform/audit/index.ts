export type AuditActorKind = "user" | "admin" | "worker" | "system";

export type DomainAuditEvent = {
  domain: "account" | "wealth" | "health" | "market" | "platform";
  actorKind: AuditActorKind;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
};
