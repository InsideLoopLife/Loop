import { createAdminClient } from "@/lib/supabase/admin";
import { fetchLandgFundPrice, findLandgSourceUrl, isLegalGeneral } from "./pension-provider-fetch";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

function isoProviderDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value} 12:00:00 UTC`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function sourceIsin(url: string | null) {
  if (!url) return null;
  try { return new URL(url).searchParams.get("isin_code")?.trim().toUpperCase() || null; } catch { return null; }
}

function trustedLandgUrl(url: string | null) {
  if (!url) return false;
  try { const parsed = new URL(url); return parsed.protocol === "https:" && parsed.hostname === "fundcentres.landg.com"; } catch { return false; }
}

export type PensionSnapshotResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  checked: number;
  updated: number;
  needsReview: number;
  skipped: number;
  failures: Array<{ glossaryId: string; fundName: string; reason: string }>;
};

export type ConfirmedPriceInput = {
  glossaryId: string;
  isin?: string | null;
  unitPrice: number;
  providerDate: string; // ISO yyyy-mm-dd
  source: string; // e.g. "landg_fund_centre" | "agent_confirmed"
  sourceUrl?: string | null;
  parseConfidence: string;
};

export type ConfirmedPriceResult =
  | { ok: true; applied: true; glossaryId: string; unitPrice: number; providerDate: string; accountsUpdated: string[] }
  | { ok: false; applied: false; glossaryId: string; reason: string };

/**
 * The single place that ever writes a price into the live tables. Used by
 * both the automated daily scrape (runPensionDailyPriceSnapshot below) and
 * the agent-confirm endpoint (/api/cron/pensions-confirm-price) — same
 * validation, same snapshot upsert, same recompute, same account rollup,
 * regardless of whether the price came from a regex match, the AI
 * disambiguation fallback, or a Cowork-scheduled agent reading the page
 * directly. Deliberately the ONLY function that does this, so "how do we
 * safely apply a price" never has two copies to drift apart — that's the
 * exact failure mode this codebase has already hit once (see the
 * pension-provider-fetch.ts history) and shouldn't repeat here.
 *
 * Every caller gets the same guardrails:
 *   - glossary row must actually exist
 *   - if an ISIN is supplied, it must match the glossary's own ISIN —
 *     catches a caller (human, agent, or code) accidentally applying a
 *     price to the wrong fund
 *   - a >25% day-over-day move against the glossary's current price is
 *     rejected rather than applied, for EVERY caller, not just AI-assisted
 *     matches — an external source (agent or otherwise) can misread a page
 *     exactly as easily as a regex can
 *   - units are never touched here — only price and the value units×price
 */
export async function applyConfirmedPensionPrice(
  supabase: SupabaseAdmin,
  input: ConfirmedPriceInput,
  options?: { logger?: Pick<Console, "log" | "warn" | "error"> },
): Promise<ConfirmedPriceResult> {
  const logger = options?.logger || console;
  const { glossaryId, unitPrice, providerDate, source, parseConfidence } = input;

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    return { ok: false, applied: false, glossaryId, reason: `Invalid unit price: ${unitPrice}` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(providerDate)) {
    return { ok: false, applied: false, glossaryId, reason: `Invalid provider date: ${providerDate}` };
  }

  const { data: glossary, error: glossaryError } = await supabase
    .from("provider_fund_glossary")
    .select("id, internal_fund_code, underlying_isin, unit_price")
    .eq("id", glossaryId)
    .maybeSingle();

  if (glossaryError || !glossary) {
    return { ok: false, applied: false, glossaryId, reason: glossaryError?.message || "Glossary entry not found" };
  }

  const configuredIsin = String(glossary.underlying_isin || "").trim().toUpperCase() || null;
  const suppliedIsin = String(input.isin || "").trim().toUpperCase() || null;
  if (configuredIsin && suppliedIsin && configuredIsin !== suppliedIsin) {
    return { ok: false, applied: false, glossaryId, reason: `identity_mismatch: glossary ISIN ${configuredIsin} does not match supplied ISIN ${suppliedIsin}` };
  }

  const priorPrice = Number(glossary.unit_price || 0);
  const deviates = priorPrice > 0 && Math.abs(unitPrice - priorPrice) / priorPrice > 0.25;
  if (deviates) {
    return { ok: false, applied: false, glossaryId, reason: `Found ${unitPrice} vs previous ${priorPrice} (>25% move) — routed to review rather than applied automatically.` };
  }

  const { error: snapshotError } = await supabase
    .from("pension_fund_price_snapshots")
    .upsert(
      {
        glossary_id: glossaryId,
        fund_code: glossary.internal_fund_code || null,
        isin: configuredIsin || suppliedIsin,
        unit_price_gbp: unitPrice,
        point_date: providerDate,
        observed_at: new Date().toISOString(),
        source,
        source_url: input.sourceUrl || null,
        parse_confidence: parseConfidence,
      },
      { onConflict: "glossary_id,point_date" },
    );

  if (snapshotError) {
    return { ok: false, applied: false, glossaryId, reason: `Snapshot write failed: ${snapshotError.message}` };
  }

  await supabase.from("provider_fund_glossary").update({ unit_price: unitPrice, updated_at: new Date().toISOString() }).eq("id", glossaryId);

  const { data: fundsForGlossary } = await supabase.from("pension_funds").select("id, units, pension_account_id").eq("glossary_id", glossaryId);
  const affectedAccountIds = new Set<string>();
  for (const fund of fundsForGlossary || []) {
    const units = Number(fund.units || 0);
    await supabase
      .from("pension_funds")
      .update({
        unit_price: unitPrice,
        current_value: Math.round(units * unitPrice * 100) / 100,
        price_as_of_date: providerDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fund.id);
    if (fund.pension_account_id) affectedAccountIds.add(fund.pension_account_id);
  }

  // Roll up just the accounts this price actually touched — a caller using
  // this outside the bulk daily job (e.g. the agent-confirm endpoint) needs
  // the account total to be current immediately, not stale until the next
  // full run.
  const today = new Date().toISOString().slice(0, 10);
  for (const accountId of affectedAccountIds) {
    const { data: funds } = await supabase.from("pension_funds").select("current_value,price_as_of_date").eq("pension_account_id", accountId);
    if (!funds || funds.length === 0) continue;
    const total = funds.reduce((sum, f) => sum + Number(f.current_value || 0), 0);
    await supabase
      .from("pension_accounts")
      .update({ current_value: Math.round(total * 100) / 100, value_as_of_date: funds.map((fund) => fund.price_as_of_date).filter(Boolean).sort().at(0) || today, updated_at: new Date().toISOString() })
      .eq("id", accountId);
  }

  logger.log(`[pension-price-snapshot] applied glossary=${glossaryId} price=${unitPrice} source=${source} confidence=${parseConfidence}`);
  return { ok: true, applied: true, glossaryId, unitPrice, providerDate, accountsUpdated: Array.from(affectedAccountIds) };
}

/**
 * Runs daily (via loop-pensions-daily). For every provider_fund_glossary
 * entry that:
 *   - is actually held by at least one pension_funds row (no point fetching
 *     funds nobody has), and
 *   - has a provider we know how to fetch (currently: Legal & General)
 *
 * ...fetches the current price from the provider's own fund centre, writes
 * one snapshot row per day (upsert on glossary_id+point_date, so re-runs
 * the same day don't duplicate), and — only when the fetch was confident,
 * never on an ambiguous multi-share-class page — updates the glossary's
 * live unit_price and every pension_funds row's price + recomputed value.
 *
 * "Recomputed value" here means units × new price. It deliberately does
 * NOT touch units — units only ever change via the contribution-event
 * ledger (see pension-contribution-runner.ts), so this job can run safely
 * every day without ever being able to corrupt how many units someone
 * actually holds.
 */
export async function runPensionDailyPriceSnapshot(
  supabaseArg?: SupabaseAdmin,
  options?: { logger?: Pick<Console, "log" | "warn" | "error"> },
): Promise<PensionSnapshotResult> {
  const supabase = supabaseArg || createAdminClient();
  const logger = options?.logger || console;
  const startedAt = new Date().toISOString();
  const result: PensionSnapshotResult = {
    ok: true,
    startedAt,
    finishedAt: startedAt,
    checked: 0,
    updated: 0,
    needsReview: 0,
    skipped: 0,
    failures: [],
  };

  // Only fetch funds someone actually holds — same "don't spend on funds
  // nobody has" principle as the investment worker's polling-enabled filter.
  const { data: heldFunds, error: heldError } = await supabase
    .from("pension_funds")
    .select("id, glossary_id, fund_name")
    .not("glossary_id", "is", null);

  if (heldError) {
    logger.error("[pension-price-snapshot] failed to load held funds", heldError);
    result.ok = false;
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const glossaryIds = Array.from(new Set((heldFunds || []).map((f) => f.glossary_id).filter(Boolean))) as string[];
  if (glossaryIds.length === 0) {
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const { data: glossaryRows, error: glossaryError } = await supabase
    .from("provider_fund_glossary")
    .select("id, internal_fund_name, internal_fund_code, underlying_isin, unit_price, source_url")
    .in("id", glossaryIds);

  if (glossaryError) {
    logger.error("[pension-price-snapshot] failed to load glossary entries", glossaryError);
    result.ok = false;
    result.finishedAt = new Date().toISOString();
    return result;
  }

  for (const glossary of glossaryRows || []) {
    result.checked += 1;
    const fundName = String(glossary.internal_fund_name || "");
    // Provider isn't stored directly on the glossary row — infer from the
    // fund name pattern the same way findLandgSourceUrl already does, since
    // every currently-fetchable provider (L&G) puts "L&G"/"Legal & General"
    // in the fund name itself. A genuinely different provider would need
    // its own fetch module rather than reusing this one.
    if (!isLegalGeneral(fundName)) {
      result.skipped += 1;
      continue;
    }

    const mapped = findLandgSourceUrl(fundName, "Legal & General");
    const url = String(glossary.source_url || mapped.url || "") || null;
    const configuredIsin = String(glossary.underlying_isin || "").trim().toUpperCase() || null;
    const urlIsin = sourceIsin(url);
    if (!trustedLandgUrl(url) || !urlIsin || (configuredIsin && configuredIsin !== urlIsin)) {
      result.needsReview += 1;
      result.failures.push({ glossaryId: glossary.id, fundName, reason: configuredIsin && urlIsin && configuredIsin !== urlIsin ? `identity_mismatch: glossary ISIN ${configuredIsin} does not match source ISIN ${urlIsin}` : "Verified official provider URL and ISIN are required before prices can be applied." });
      continue;
    }
    const verifiedIsin = configuredIsin || urlIsin;
    const verifiedUrl = url as string;
    if (!configuredIsin || !glossary.source_url) {
      await supabase.from("provider_fund_glossary").update({ underlying_isin: verifiedIsin, source_url: url, updated_at: new Date().toISOString() }).eq("id", glossary.id);
      await supabase.from("pension_funds").update({ underlying_isin: verifiedIsin, updated_at: new Date().toISOString() }).eq("glossary_id", glossary.id).is("underlying_isin", null);
    }

    try {
      const parsed = await fetchLandgFundPrice(verifiedUrl, fundName, verifiedIsin);
      const providerDate = isoProviderDate(parsed.as_of_date);

      if (parsed.unit_price === null || !providerDate) {
        result.needsReview += 1;
        result.failures.push({
          glossaryId: glossary.id,
          fundName,
          reason: parsed.candidate_count > 1
            ? `Page showed ${parsed.candidate_count} share-class prices and none matched "${fundName}" exactly — needs manual review rather than guessing. Headings found on page: ${JSON.stringify(parsed.headingsFound || [])}`
            : "No price and dated provider observation could be verified on the source page.",
        });
        continue;
      }

      // All actual writing (snapshot upsert, glossary/fund/account update,
      // the day-over-day sanity bound) now lives in one shared function —
      // see applyConfirmedPensionPrice above. Keeps this loop and the
      // agent-confirm endpoint from ever having two copies of "how do we
      // safely apply a price" that could drift apart.
      const applied = await applyConfirmedPensionPrice(
        supabase,
        {
          glossaryId: glossary.id,
          isin: verifiedIsin,
          unitPrice: parsed.unit_price,
          providerDate,
          source: "landg_fund_centre",
          sourceUrl: verifiedUrl,
          parseConfidence: parsed.confidence,
        },
        { logger },
      );

      if (!applied.ok) {
        result.needsReview += 1;
        result.failures.push({ glossaryId: glossary.id, fundName, reason: applied.reason });
        continue;
      }

      result.updated += 1;
    } catch (caught) {
      result.failures.push({ glossaryId: glossary.id, fundName, reason: caught instanceof Error ? caught.message : String(caught) });
    }
  }

  result.finishedAt = new Date().toISOString();
  if (result.failures.length > 0) result.ok = false;
  logger.log(
    `[pension-price-snapshot] done checked=${result.checked} updated=${result.updated} needsReview=${result.needsReview} skipped=${result.skipped} failed=${result.failures.length}`,
  );
  return result;
}