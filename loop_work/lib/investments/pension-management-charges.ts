import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export type ManagementChargeResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  fundsChecked: number;
  chargesApplied: number;
  skippedAlreadyCharged: number;
  skippedNoFee: number;
  skippedUnconfirmed: number;
  estimatedMonthlyCost: number;
  failures: Array<{ pensionFundId: string; fundName: string; reason: string }>;
};

export function estimatedMonthlyPensionFundCost(input: {
  currentValue: number;
  annualFeePercent: number;
}) {
  const currentValue = Number(input.currentValue || 0);
  const annualFeePercent = Number(input.annualFeePercent || 0);
  if (!(currentValue > 0) || !(annualFeePercent > 0)) return 0;
  return Math.round(((currentValue * annualFeePercent) / 100 / 12) * 100) / 100;
}

/**
 * Reports the estimated monthly cost implied by each fund's configured annual
 * fee. It deliberately does not cancel units or write a synthetic fee event.
 *
 * Fund prices commonly already reflect ongoing charges, and Loop's purchase
 * thread can begin years after the pension opened. Rebuilding a provider unit
 * balance from that partial thread, or subtracting a modelled fee from it,
 * would corrupt the confirmed holding. Only a provider-confirmed transaction
 * may change units; this worker is observational.
 */
export async function runPensionMonthlyManagementCharges(
  supabaseArg?: SupabaseAdmin,
  options?: { logger?: Pick<Console, "log" | "warn" | "error">; now?: Date; force?: boolean },
): Promise<ManagementChargeResult> {
  const supabase = supabaseArg || createAdminClient();
  const logger = options?.logger || console;
  const now = options?.now || new Date();
  const startedAt = now.toISOString();
  const result: ManagementChargeResult = {
    ok: true,
    startedAt,
    finishedAt: startedAt,
    fundsChecked: 0,
    chargesApplied: 0,
    skippedAlreadyCharged: 0,
    skippedNoFee: 0,
    skippedUnconfirmed: 0,
    estimatedMonthlyCost: 0,
    failures: [],
  };

  const { data: funds, error } = await supabase
    .from("pension_funds")
    .select("id, fund_name, current_value, units, unit_price, annual_fund_fee_percent");

  if (error) {
    logger.error("[pension-management-charges] failed to load funds", error);
    result.ok = false;
    result.failures.push({
      pensionFundId: "unknown",
      fundName: "Pension funds",
      reason: error.message,
    });
    result.finishedAt = new Date().toISOString();
    return result;
  }

  for (const fund of funds || []) {
    result.fundsChecked += 1;
    const storedValue = Number(fund.current_value || 0);
    const derivedValue = Number(fund.units || 0) * Number(fund.unit_price || 0);
    const cost = estimatedMonthlyPensionFundCost({
      currentValue: storedValue > 0 ? storedValue : derivedValue,
      annualFeePercent: Number(fund.annual_fund_fee_percent || 0),
    });
    if (!(cost > 0)) {
      result.skippedNoFee += 1;
      continue;
    }
    result.estimatedMonthlyCost += cost;
    result.skippedUnconfirmed += 1;
  }

  result.estimatedMonthlyCost = Math.round(result.estimatedMonthlyCost * 100) / 100;
  result.finishedAt = new Date().toISOString();
  logger.log(
    `[pension-management-charges] estimated monthly cost £${result.estimatedMonthlyCost.toFixed(2)} across ${result.fundsChecked} funds; no units or events changed without provider confirmation`,
  );
  return result;
}
