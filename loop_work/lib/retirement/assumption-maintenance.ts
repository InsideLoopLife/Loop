import { createAdminClient } from "@/lib/supabase/admin";
import { refreshPrevailingInflation } from "@/lib/retirement/inflation-refresh";
import { refreshPensionPerformanceAssumptions } from "@/lib/wealth/pension-performance-refresh";

type AdminClient = ReturnType<typeof createAdminClient>;

function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function afterDays(now: Date, days: number) { return new Date(now.getTime() + days * 86400000).toISOString(); }
async function retry<T>(task: () => Promise<T>, attempts = 3) {
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await task(); } catch (error) {
      last = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  throw last;
}

async function recordHealth(supabase: AdminClient, sourceKey: string, now: Date, result: { status: "healthy" | "degraded" | "failed"; payload?: unknown; error?: string; nextDays: number }) {
  const { data: prior } = await supabase.from("retirement_assumption_source_health").select("consecutive_failures,last_success_at").eq("source_key", sourceKey).maybeSingle();
  const { error } = await supabase.from("retirement_assumption_source_health").upsert({
    source_key: sourceKey,
    status: result.status,
    last_attempt_at: now.toISOString(),
    last_success_at: result.status !== "failed" ? now.toISOString() : prior?.last_success_at || null,
    consecutive_failures: result.status !== "failed" ? 0 : Number(prior?.consecutive_failures || 0) + 1,
    last_error: result.status !== "failed" ? null : result.error || "Unknown refresh failure",
    next_refresh_due_at: afterDays(now, result.nextDays),
    payload: result.payload || {}, updated_at: now.toISOString(),
  }, { onConflict: "source_key" });
  if (error) throw new Error(error.message);
}

export async function runRetirementAssumptionMaintenance(supabase: AdminClient = createAdminClient()) {
  const now = new Date();
  const runKey = `retirement-assumptions:${now.toISOString()}`;
  const { data: run, error: runError } = await supabase.from("retirement_assumption_refresh_runs").insert({ run_key: runKey, status: "started", started_at: now.toISOString() }).select("id").single();
  if (runError) throw new Error(runError.message);

  let pensions: Awaited<ReturnType<typeof refreshPensionPerformanceAssumptions>> | null = null;
  let inflation: Awaited<ReturnType<typeof refreshPrevailingInflation>> | null = null;
  let pensionError: string | null = null;
  let inflationError: string | null = null;

  try { pensions = await retry(() => refreshPensionPerformanceAssumptions(supabase)); }
  catch (error) { pensionError = message(error); }
  const pensionHealth = pensionError ? "failed" : (pensions?.needsReview || pensions?.historyBuilding) ? "degraded" : "healthy";
  await recordHealth(supabase, "pension_fund_returns", now, { status: pensionHealth, payload: pensions, error: pensionError || undefined, nextDays: 8 });

  try { inflation = await retry(() => refreshPrevailingInflation(supabase, { now })); }
  catch (error) { inflationError = message(error); }
  await recordHealth(supabase, "uk_cpih_prevailing_10y", now, { status: inflationError ? "failed" : "healthy", payload: inflation, error: inflationError || undefined, nextDays: 32 });

  const failures = [pensionError, inflationError].filter(Boolean);
  const status = failures.length === 0 ? (pensionHealth === "degraded" ? "completed_with_warnings" : "completed") : failures.length === 1 ? "completed_with_warnings" : "failed";
  const finishedAt = new Date().toISOString();
  const payload = { pensions, inflation, pensionError, inflationError };
  const { error: finishError } = await supabase.from("retirement_assumption_refresh_runs").update({
    status, finished_at: finishedAt, pension_status: pensionHealth, inflation_status: inflationError ? "failed" : "healthy",
    funds_checked: pensions?.fundsChecked || 0, assumptions_stored: pensions?.assumptionsStored || 0, funds_needing_review: pensions?.needsReview || 0,
    error: failures.join(" | ") || null, payload,
  }).eq("id", run.id);
  if (finishError) throw new Error(finishError.message);
  return { ok: failures.length === 0, status, runKey, ...payload };
}
