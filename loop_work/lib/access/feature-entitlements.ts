import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { LoopFeatureKey } from "./feature-keys";

export type FeatureAccess = {
  allowed: boolean;
  visible: boolean;
  enabled?: boolean;
  plan_slug?: string;
  own_plan_slug?: string;
  feature_key?: string;
  feature_name?: string;
  limit_value?: number | null;
  limit_period?: string;
  allowance_scope?: "user" | "household" | "account" | string;
  used?: number;
  remaining?: number | null;
  reason?: string;
  upgrade_required?: boolean;
  family_license?: boolean;
  household_id?: string | null;
  license_owner_user_id?: string | null;
};

export class FeatureAccessError extends Error {
  access: FeatureAccess;
  status: number;
  constructor(access: FeatureAccess) {
    super(access.reason || "This feature is not available.");
    this.name = "FeatureAccessError";
    this.access = access;
    this.status = access.reason === "Not authenticated." ? 401 :
      (access.allowed === false && access.visible === true && access.limit_value != null && Number(access.remaining ?? 0) <= 0) ? 429 : 403;
  }
}

function failClosed(featureKey: string, reason = "We could not verify access to this feature."): FeatureAccess {
  return { allowed: false, visible: false, enabled: false, feature_key: featureKey, reason, upgrade_required: false };
}

export async function getFeatureAccess(featureKey: LoopFeatureKey | string, quantity = 0): Promise<FeatureAccess> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc("app_check_feature_access", {
    p_feature_key: featureKey, p_quantity: quantity, p_consume: false,
  });
  return error ? failClosed(featureKey) : (data || failClosed(featureKey));
}

export async function consumeFeature(featureKey: LoopFeatureKey | string, quantity = 1): Promise<FeatureAccess> {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("consumeFeature quantity must be greater than zero.");
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc("app_check_feature_access", {
    p_feature_key: featureKey, p_quantity: quantity, p_consume: true,
  });
  if (error) throw new FeatureAccessError(failClosed(featureKey, "We could not verify your allowance."));
  const access = (data || failClosed(featureKey)) as FeatureAccess;
  if (!access.allowed) throw new FeatureAccessError(access);
  return access;
}

export async function getInvestmentHoldingCapacity(investmentAccountId: string, additional = 1) {
  const supabase = await createClient();
  const { data, error } = await (supabase as any).rpc("app_check_investment_holding_capacity", {
    p_account_id: investmentAccountId, p_additional: Math.trunc(additional),
  });
  return error ? failClosed("investment_holdings_per_account", "We could not verify this account's portfolio allowance.") : data;
}

export async function requireInvestmentHoldingCapacity(investmentAccountId: string, additional = 1) {
  const access = await getInvestmentHoldingCapacity(investmentAccountId, additional);
  if (!access?.allowed) throw new FeatureAccessError(access || failClosed("investment_holdings_per_account"));
  return access;
}

export function featureErrorResponse(error: unknown): Response | null {
  if (!(error instanceof FeatureAccessError)) return null;
  return Response.json({ ok:false, code:error.status===429?"ALLOWANCE_EXHAUSTED":error.status===401?"UNAUTHENTICATED":"FEATURE_UNAVAILABLE", message:error.message, access:error.access }, { status:error.status });
}
