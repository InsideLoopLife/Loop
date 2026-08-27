import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { LoopFeatureKey } from "./feature-keys";

export type FeatureAccess = {
  allowed: boolean;
  visible: boolean;
  enabled?: boolean;
  plan_slug?: string;
  feature_key?: string;
  feature_name?: string;
  limit_value?: number | null;
  limit_period?: "none" | "day" | "week" | "month" | "year" | string;
  used?: number;
  remaining?: number | null;
  period_start?: string | null;
  period_end?: string | null;
  health_status?: "active" | "degraded" | "disabled" | "hidden" | string;
  enforcement_mode?: "audit" | "warn" | "block" | "upgrade" | string;
  reason?: string;
  upgrade_required?: boolean;
};

export class FeatureAccessError extends Error {
  access: FeatureAccess;
  status: number;

  constructor(access: FeatureAccess) {
    super(access.reason || "This feature is not available.");
    this.name = "FeatureAccessError";
    this.access = access;

    if (access.reason === "Not authenticated.") {
      this.status = 401;
    } else if (
      access.allowed === false &&
      access.visible === true &&
      access.limit_value != null &&
      Number(access.remaining ?? 0) <= 0
    ) {
      this.status = 429;
    } else {
      this.status = 403;
    }
  }
}

function failClosed(
  featureKey: string,
  reason = "We could not verify access to this feature."
): FeatureAccess {
  return {
    allowed: false,
    visible: false,
    enabled: false,
    feature_key: featureKey,
    reason,
    upgrade_required: false,
  };
}

/**
 * Read-only entitlement check.
 *
 * Use this for:
 * - page visibility
 * - navigation visibility
 * - showing remaining allowance
 * - deciding whether to render an upgrade/limit state
 *
 * This does NOT consume usage.
 */
export async function getFeatureAccess(
  featureKey: LoopFeatureKey | string,
  quantity = 0
): Promise<FeatureAccess> {
  const supabase = await createClient();

  const { data, error } = await (supabase as any).rpc(
    "app_check_feature_access",
    {
      p_feature_key: featureKey,
      p_quantity: quantity,
      p_consume: false,
    }
  );

  if (error) {
    console.error("[entitlements] access check failed", {
      featureKey,
      message: error.message,
    });
    return failClosed(featureKey);
  }

  return (data || failClosed(featureKey)) as FeatureAccess;
}

/**
 * Atomic metered entitlement check + usage consumption.
 *
 * IMPORTANT:
 * Call this on the SERVER immediately before the paid/metered work.
 * Never rely on a client-side check for enforcement.
 *
 * Supabase's app_check_feature_access() takes an advisory transaction lock,
 * checks current period usage, and writes the usage event in the same
 * transaction, preventing simultaneous requests from stepping over the limit.
 */
export async function consumeFeature(
  featureKey: LoopFeatureKey | string,
  quantity = 1
): Promise<FeatureAccess> {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("consumeFeature quantity must be greater than zero.");
  }

  const supabase = await createClient();

  const { data, error } = await (supabase as any).rpc(
    "app_check_feature_access",
    {
      p_feature_key: featureKey,
      p_quantity: quantity,
      p_consume: true,
    }
  );

  if (error) {
    console.error("[entitlements] usage consumption failed", {
      featureKey,
      quantity,
      message: error.message,
    });
    throw new FeatureAccessError(
      failClosed(featureKey, "We could not verify your allowance.")
    );
  }

  const access = (data || failClosed(featureKey)) as FeatureAccess;

  if (!access.allowed) {
    throw new FeatureAccessError(access);
  }

  return access;
}

/**
 * Require access without consuming usage.
 *
 * Best for an unmetered protected server action/API route, or for a second
 * server-side check after a page-level UI gate.
 */
export async function requireFeature(
  featureKey: LoopFeatureKey | string,
  quantity = 0
): Promise<FeatureAccess> {
  const access = await getFeatureAccess(featureKey, quantity);

  if (!access.allowed) {
    throw new FeatureAccessError(access);
  }

  return access;
}

/**
 * Static-capacity helper.
 *
 * app_check_feature_access treats limit_period='none' as a capacity ceiling.
 * Pass the TOTAL quantity that would exist after this operation.
 *
 * Example: household has 3 people, adding one => requestedTotal = 4.
 */
export async function requireFeatureCapacity(
  featureKey: LoopFeatureKey | string,
  requestedTotal: number
): Promise<FeatureAccess> {
  if (!Number.isFinite(requestedTotal) || requestedTotal < 0) {
    throw new Error("requestedTotal must be zero or greater.");
  }

  return requireFeature(featureKey, requestedTotal);
}

/**
 * Turns FeatureAccessError into a safe JSON payload for route handlers.
 */
export function featureErrorResponse(error: unknown): Response | null {
  if (!(error instanceof FeatureAccessError)) return null;

  return Response.json(
    {
      ok: false,
      code:
        error.status === 429
          ? "ALLOWANCE_EXHAUSTED"
          : error.status === 401
            ? "UNAUTHENTICATED"
            : "FEATURE_UNAVAILABLE",
      message: error.message,
      access: error.access,
    },
    { status: error.status }
  );
}
