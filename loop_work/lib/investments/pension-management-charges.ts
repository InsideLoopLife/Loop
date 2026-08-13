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
  failures: Array<{ pensionFundId: string; fundName: string; reason: string }>;
};

/**
 * Confirmed real via the person's own L&G statement screenshot this
 * session: a "Management Charge" line item lands on the 1st of every
 * month, e.g. -£26.12, -£25.22, -£25.57 — sized off the fund's own value,
 * not a flat fee. This was completely unmodeled in Loop before now; the
 * pot was silently missing a real, recurring reduction every single month.
 *
 * Modelled as: monthly_charge = (annual_fund_fee_percent / 100 / 12) ×
 * current fund value. That's charged by cancelling units at the fund's
 * current price — same mechanism a real charge uses (reducing your unit
 * holding, not a separate cash deduction) — recorded as a NEGATIVE row in
 * pension_contribution_events with source='management_charge', so it
 * lives in the exact same ledger real contributions do.
 *
 * Critically: pension_funds.units is then recomputed by re-summing every
 * event for that fund (contributions minus charges), not by subtracting a
 * number from whatever units already held. One source of truth, always
 * derived — the same principle the contribution-event ledger already
 * needs to hold for contributions to stay trustworthy.
 *
 * Idempotent: checks whether a charge already exists for this fund this
 * calendar month before applying another one, so re-running the job (or
 * running it more than once on the 1st) can't double-charge.
 */
export async function runPensionMonthlyManagementCharges(
  supabaseArg?: SupabaseAdmin,
  options?: { logger?: Pick<Console, "log" | "warn" | "error">; now?: Date },
): Promise<ManagementChargeResult> {
  const supabase = supabaseArg || createAdminClient();
  const logger = options?.logger || console;
  const now = options?.now || new Date();
  const startedAt = now.toISOString();
  const thisMonth = startedAt.slice(0, 7); // YYYY-MM

  const result: ManagementChargeResult = {
    ok: true,
    startedAt,
    finishedAt: startedAt,
    fundsChecked: 0,
    chargesApplied: 0,
    skippedAlreadyCharged: 0,
    skippedNoFee: 0,
    failures: [],
  };

  const { data: funds, error: fundsError } = await supabase
    .from("pension_funds")
    .select("id, fund_name, pension_account_id, units, unit_price, current_value, annual_fund_fee_percent");

  if (fundsError) {
    logger.error("[pension-management-charges] failed to load funds", fundsError);
    result.ok = false;
    result.finishedAt = new Date().toISOString();
    return result;
  }

  for (const fund of funds || []) {
    result.fundsChecked += 1;
    const feePercent = Number(fund.annual_fund_fee_percent || 0);
    const price = Number(fund.unit_price || 0);
    const units = Number(fund.units || 0);

    if (!(feePercent > 0) || !(price > 0) || !(units > 0)) {
      result.skippedNoFee += 1;
      continue;
    }

    // Idempotency check: has a management_charge event already been
    // recorded for this fund this calendar month?
    const { data: existingCharge } = await supabase
      .from("pension_contribution_events")
      .select("id")
      .eq("pension_fund_id", fund.id)
      .eq("source", "management_charge")
      .eq("contribution_month", thisMonth)
      .maybeSingle();

    if (existingCharge) {
      result.skippedAlreadyCharged += 1;
      continue;
    }

    try {
      const fundValue = units * price;
      const monthlyChargeAmount = Math.round(((feePercent / 100 / 12) * fundValue) * 100) / 100;
      if (!(monthlyChargeAmount > 0)) {
        result.skippedNoFee += 1;
        continue;
      }
      const unitsCancelled = monthlyChargeAmount / price;

      const { error: insertError } = await supabase.from("pension_contribution_events").insert({
        pension_fund_id: fund.id,
        pension_account_id: fund.pension_account_id,
        investment_date: startedAt.slice(0, 10),
        contribution_date: startedAt.slice(0, 10),
        contribution_month: thisMonth,
        contribution_amount: -monthlyChargeAmount,
        unit_price: price,
        units_bought: -unitsCancelled,
        source: "management_charge",
        event_status: "invested",
        notes: `Modelled monthly management charge: ${feePercent.toFixed(3)}%/yr ÷ 12 × fund value (£${fundValue.toFixed(2)}).`,
      });

      if (insertError) {
        result.failures.push({ pensionFundId: fund.id, fundName: fund.fund_name, reason: insertError.message });
        continue;
      }

      // Recompute units for this fund by re-summing its ENTIRE ledger —
      // never just subtracting from whatever was already stored. This is
      // the invariant that keeps units trustworthy: it is always exactly
      // what the recorded events justify, nothing more, nothing less.
      const { data: allEvents } = await supabase
        .from("pension_contribution_events")
        .select("units_bought")
        .eq("pension_fund_id", fund.id);
      const recomputedUnits = (allEvents || []).reduce((sum, e) => sum + Number(e.units_bought || 0), 0);

      await supabase
        .from("pension_funds")
        .update({
          units: recomputedUnits,
          current_value: Math.round(recomputedUnits * price * 100) / 100,
          updated_at: new Date().toISOString(),
        })
        .eq("id", fund.id);

      result.chargesApplied += 1;
    } catch (caught) {
      result.failures.push({ pensionFundId: fund.id, fundName: fund.fund_name, reason: caught instanceof Error ? caught.message : String(caught) });
    }
  }

  // Roll account totals back up after charges, same as the price-snapshot job.
  const accountIds = Array.from(new Set((funds || []).map((f) => f.pension_account_id)));
  for (const accountId of accountIds) {
    const { data: accountFunds } = await supabase.from("pension_funds").select("current_value").eq("pension_account_id", accountId);
    if (!accountFunds || accountFunds.length === 0) continue;
    const total = accountFunds.reduce((sum, f) => sum + Number(f.current_value || 0), 0);
    await supabase
      .from("pension_accounts")
      .update({ current_value: Math.round(total * 100) / 100, value_as_of_date: startedAt.slice(0, 10), updated_at: new Date().toISOString() })
      .eq("id", accountId);
  }

  result.finishedAt = new Date().toISOString();
  logger.log(
    `[pension-management-charges] done checked=${result.fundsChecked} applied=${result.chargesApplied} alreadyCharged=${result.skippedAlreadyCharged} noFee=${result.skippedNoFee} failed=${result.failures.length}`,
  );
  return result;
}
