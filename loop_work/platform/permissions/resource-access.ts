import { notFound } from "next/navigation";
import type { ActiveHouseholdContext } from "@/domains/identity/household";
import type { DomainPermission, LoopDomain } from "./types";

export type ResourceAccessRequest = {
  domain: LoopDomain;
  permission: DomainPermission;
  currentUserId: string;
  ownerUserId: string;
  householdContext?: ActiveHouseholdContext | null;
  visibility?: "private" | "household" | null;
};

/**
 * Transitional resource guard.
 * Health remains private to the owner unless a later explicit sharing decision
 * is supplied. Wealth may continue using the current household visibility flag.
 */
export function canAccessResource(request: ResourceAccessRequest): boolean {
  if (request.currentUserId === request.ownerUserId) return true;
  if (request.domain === "health" || request.domain === "account") return false;

  if (
    request.domain === "wealth" &&
    request.visibility === "household" &&
    request.householdContext?.householdId &&
    request.householdContext.memberUserIds.includes(request.ownerUserId)
  ) {
    return request.permission === "summary" || request.permission === "view";
  }

  return false;
}

export function requireResourceAccess(request: ResourceAccessRequest): void {
  if (!canAccessResource(request)) notFound();
}
