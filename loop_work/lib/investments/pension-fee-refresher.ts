import { createAdminClient } from "@/lib/supabase/admin";
import OpenAI from "openai";

const STALE_FEE_DAYS = 90;
const STALE_ISIN_DAYS = 30;
const THROTTLE_MS = 500;
const MAX_PLAUSIBLE_FEE_PERCENT = 3;
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Decides whether a new fee reading from the LLM is safe to auto-apply, or
 * should be logged for manual review instead. This exists because a single
 * hallucinated number here cascades straight into every user's pension_funds
 * row — there is no source URL or citation to check it against.
 */
function feeChangeIsPlausible(previousFee: number | null, proposedFee: number) {
  if (!Number.isFinite(proposedFee) || proposedFee < 0 || proposedFee > MAX_PLAUSIBLE_FEE_PERCENT) {
    return { ok: false, reason: `Proposed fee ${proposedFee}% is outside the plausible 0-${MAX_PLAUSIBLE_FEE_PERCENT}% range.` };
  }
  if (previousFee === null || previousFee === undefined) {
    return { ok: true, reason: "No prior fee stored; accepting first reading." };
  }
  const delta = Math.abs(proposedFee - previousFee);
  const allowedDelta = Math.max(previousFee * 0.5, 0.15);
  if (delta > allowedDelta) {
    return {
      ok: false,
      reason: `Proposed fee ${proposedFee}% differs from stored ${previousFee}% by more than the allowed ${allowedDelta.toFixed(3)}pp threshold.`,
    };
  }
  return { ok: true, reason: "Within plausible range of prior stored fee." };
}

export async function runStaleFeeVerification() {
  const supabase = createAdminClient();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - STALE_FEE_DAYS);

  console.log(`[Fee Refresher] Checking for funds with fees older than ${STALE_FEE_DAYS} days...`);

  const { data: staleFunds, error } = await supabase
    .from("provider_fund_glossary")
    .select("*")
    .or(`last_fee_check_at.is.null,last_fee_check_at.lt.${thresholdDate.toISOString()}`)
    .limit(20);

  if (error) {
    console.error("[Fee Refresher] Error fetching stale funds:", error);
    return { ok: false, error: error.message };
  }

  if (!staleFunds || staleFunds.length === 0) {
    console.log("[Fee Refresher] All fund fees are up to date!");
    return { ok: true, updated: 0, flaggedForReview: 0 };
  }

  let updatedCount = 0;
  let flaggedCount = 0;

  for (const fund of staleFunds) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a financial database auditor checking UK fund fees. Only return a number you are reasonably confident about; if unsure, return the same value you were given.",
          },
          {
            role: "user",
            content: `Verify current OCF/AMC fee for UK Pension Fund: "${fund.internal_fund_name}" (Provider: ${fund.provider_name}, ISIN: ${fund.underlying_isin || "N/A"}). Stored fee is ${fund.annual_fund_fee_percent}%. Return strictly a JSON with {"annual_fund_fee_percent": number}.`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
      const proposedFee = Number(parsed.annual_fund_fee_percent);
      const previousFee = fund.annual_fund_fee_percent !== null ? Number(fund.annual_fund_fee_percent) : null;
      const nowIso = new Date().toISOString();

      if (!Number.isFinite(proposedFee)) {
        console.warn(`[Fee Refresher] No usable fee returned for ${fund.internal_fund_name}, skipping.`);
        continue;
      }

      const verdict = feeChangeIsPlausible(previousFee, proposedFee);

      await supabase.from("provider_fund_fee_change_log").insert({
        glossary_id: fund.id,
        fund_name: fund.internal_fund_name,
        previous_fee_percent: previousFee,
        proposed_fee_percent: proposedFee,
        applied: verdict.ok,
        reason: verdict.reason,
      });

      if (verdict.ok) {
        await supabase
          .from("provider_fund_glossary")
          .update({ annual_fund_fee_percent: proposedFee, last_fee_check_at: nowIso, updated_at: nowIso })
          .eq("id", fund.id);

        // Cascade to accounts tracking this fund, since that's the actual
        // number used in projections/valuations.
        await supabase
          .from("pension_funds")
          .update({ annual_fund_fee_percent: proposedFee, updated_at: nowIso })
          .eq("glossary_id", fund.id);

        console.log(`[Fee Refresher] Updated ${fund.internal_fund_name}: ${previousFee}% -> ${proposedFee}%`);
        updatedCount++;
      } else {
        // Still bump last_fee_check_at so a bad reading doesn't get re-tried
        // every single run — but do not touch the fee itself.
        await supabase.from("provider_fund_glossary").update({ last_fee_check_at: nowIso }).eq("id", fund.id);
        console.warn(`[Fee Refresher] Flagged for review, not applied: ${fund.internal_fund_name} — ${verdict.reason}`);
        flaggedCount++;
      }
    } catch (err) {
      console.warn(`[Fee Refresher] Failed to check ${fund.internal_fund_name}:`, err);
    }

    await sleep(THROTTLE_MS);
  }

  return { ok: true, updated: updatedCount, flaggedForReview: flaggedCount };
}

/**
 * Finds glossary rows with no underlying ISIN and asks the LLM to research
 * one. Only writes an ISIN back automatically if it matches the standard
 * ISIN format (2-letter country code + 9 alphanumeric + check digit);
 * anything else is left null with a note rather than saving a malformed
 * value that looks plausible but isn't.
 */
export async function backfillMissingIsins() {
  const supabase = createAdminClient();
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - STALE_ISIN_DAYS);

  console.log("[ISIN Backfill] Checking for glossary rows missing an underlying ISIN...");

  const { data: rows, error } = await supabase
    .from("provider_fund_glossary")
    .select("*")
    .is("underlying_isin", null)
    .or(`last_isin_check_at.is.null,last_isin_check_at.lt.${thresholdDate.toISOString()}`)
    .limit(20);

  if (error) {
    console.error("[ISIN Backfill] Error fetching rows:", error);
    return { ok: false, error: error.message };
  }

  if (!rows || rows.length === 0) {
    console.log("[ISIN Backfill] Nothing to backfill.");
    return { ok: true, updated: 0, skipped: 0 };
  }

  let updatedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a financial database auditor identifying the underlying market ISIN for a UK pension fund share class. If you are not confident, return null rather than guessing.",
          },
          {
            role: "user",
            content: `Find the standard ISIN (starting GB/LU/IE etc, 12 characters) for UK Pension Fund: "${row.internal_fund_name}" (Provider: ${row.provider_name}, internal code: ${row.internal_fund_code || "N/A"}). Return strictly JSON: {"underlying_isin": string or null}.`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
      const candidate = String(parsed.underlying_isin || "").trim().toUpperCase();
      const nowIso = new Date().toISOString();

      if (candidate && ISIN_PATTERN.test(candidate)) {
        await supabase
          .from("provider_fund_glossary")
          .update({ underlying_isin: candidate, last_isin_check_at: nowIso, updated_at: nowIso })
          .eq("id", row.id);
        console.log(`[ISIN Backfill] Set ${row.internal_fund_name} -> ${candidate}`);
        updatedCount++;
      } else {
        await supabase.from("provider_fund_glossary").update({ last_isin_check_at: nowIso }).eq("id", row.id);
        console.warn(`[ISIN Backfill] No confident/valid ISIN for ${row.internal_fund_name}, left null.`);
        skippedCount++;
      }
    } catch (err) {
      console.warn(`[ISIN Backfill] Failed for ${row.internal_fund_name}:`, err);
    }

    await sleep(THROTTLE_MS);
  }

  return { ok: true, updated: updatedCount, skipped: skippedCount };
}
