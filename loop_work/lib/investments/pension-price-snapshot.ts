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

  const today = new Date().toISOString().slice(0, 10);

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
      const parsed = await fetchLandgFundPrice(verifiedUrl, fundName);
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

      // Write the snapshot row — never overwritten, one per fund per day.
      const { error: snapshotError } = await supabase
        .from("pension_fund_price_snapshots")
        .upsert(
          {
            glossary_id: glossary.id,
            fund_code: glossary.internal_fund_code || null,
            isin: verifiedIsin,
            unit_price_gbp: parsed.unit_price,
            point_date: providerDate,
            observed_at: new Date().toISOString(),
            source: "landg_fund_centre",
            source_url: verifiedUrl,
            parse_confidence: parsed.confidence,
          },
          { onConflict: "glossary_id,point_date" },
        );

      if (snapshotError) {
        result.failures.push({ glossaryId: glossary.id, fundName, reason: `Snapshot write failed: ${snapshotError.message}` });
        continue;
      }

      // Only apply to the live glossary/fund rows on a confident parse.
      // "single_price_on_page" and "exact_name_match" are both safe to
      // trust automatically; anything else was already routed to
      // needsReview above and never reaches here with a non-null price.
      await supabase.from("provider_fund_glossary").update({ unit_price: parsed.unit_price, updated_at: new Date().toISOString() }).eq("id", glossary.id);

      const fundsForGlossary = (heldFunds || []).filter((f) => f.glossary_id === glossary.id);
      for (const fund of fundsForGlossary) {
        const { data: fundRow } = await supabase.from("pension_funds").select("units").eq("id", fund.id).maybeSingle();
        const units = Number(fundRow?.units || 0);
        await supabase
          .from("pension_funds")
          .update({
            unit_price: parsed.unit_price,
            current_value: Math.round(units * parsed.unit_price * 100) / 100,
            price_as_of_date: providerDate,
            updated_at: new Date().toISOString(),
          })
          .eq("id", fund.id);
      }

      result.updated += 1;
    } catch (caught) {
      result.failures.push({ glossaryId: glossary.id, fundName, reason: caught instanceof Error ? caught.message : String(caught) });
    }
  }

  // Roll each affected pension_account's current_value up from its funds,
  // same as the manual recompute done earlier tonight — but now automatic.
  const { data: accounts } = await supabase.from("pension_accounts").select("id");
  for (const account of accounts || []) {
    const { data: funds } = await supabase.from("pension_funds").select("current_value,price_as_of_date").eq("pension_account_id", account.id);
    if (!funds || funds.length === 0) continue;
    const total = funds.reduce((sum, f) => sum + Number(f.current_value || 0), 0);
    await supabase
      .from("pension_accounts")
      .update({ current_value: Math.round(total * 100) / 100, value_as_of_date: funds.map(fund => fund.price_as_of_date).filter(Boolean).sort().at(0) || today, updated_at: new Date().toISOString() })
      .eq("id", account.id);
  }

  result.finishedAt = new Date().toISOString();
  if (result.failures.length > 0) result.ok = false;
  logger.log(
    `[pension-price-snapshot] done checked=${result.checked} updated=${result.updated} needsReview=${result.needsReview} skipped=${result.skipped} failed=${result.failures.length}`,
  );
  return result;
}
