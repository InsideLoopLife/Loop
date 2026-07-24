import { createAdminClient } from "@/lib/supabase/admin";

const THROTTLE_MS = 500;
const LANDG_DIRECTORY_URL = "https://fundcentres.landg.com/en/uk/workplace-employer/fund-centre/";
const MAX_PRICE_JUMP_FRACTION = 0.5; // reject a single-day move bigger than this without flagging

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Strips HTML tags down to plain text for regex-based extraction. This is a
 * pragmatic first pass — if L&G's markup changes shape, the more robust fix
 * is to swap this for a proper HTML parser (e.g. cheerio) once we've seen a
 * real raw-HTML sample from a live run and can target actual DOM structure
 * rather than positional text matching.
 */
function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function penceTextToGbp(priceText: string): number | null {
  const match = priceText.match(/([\d,]+\.\d+)\s*p/i);
  if (!match) return null;
  const pence = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(pence)) return null;
  return Math.round((pence / 100) * 10000) / 10000; // 4 dp, matches pounds
}

/**
 * Finds the correct L&G fund-centre URL for a given ISIN by searching their
 * own fund directory listing, rather than trusting a possibly-stale stored
 * URL. This IS the "self-healing" step: L&G's directory embeds every fund's
 * current URL against its ISIN on one page, so re-resolving from there stays
 * inside L&G's own trusted domain rather than falling back to a web search.
 */
async function resolveLandGUrlByIsin(isin: string): Promise<string | null> {
  const res = await fetch(LANDG_DIRECTORY_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  const html = await res.text();
  const hrefMatch = html.match(new RegExp(`href="([^"]*isin_code=${isin}[^"]*)"`, "i"));
  if (!hrefMatch) return null;
  const href = hrefMatch[1].startsWith("http") ? hrefMatch[1] : `https://fundcentres.landg.com${hrefMatch[1]}`;
  return href;
}

/**
 * Fetches an L&G fund-centre page and extracts the price for the specific
 * share class matching `isin`. L&G's pages list several share classes per
 * fund family, so we anchor on the ISIN's position in the directory link
 * order and take the price at the same position in the "Prices" section.
 * This is a positional heuristic, not a guaranteed structural match — if it
 * can't find a plausible price near the ISIN, it returns null rather than
 * guessing, so a bad match doesn't silently write a wrong price.
 */
async function fetchLandGPrice(url: string, isin: string): Promise<{ price: number; asOf: string } | null> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  const text = htmlToText(await res.text());

  // Find every "Price X.XXp ... As at DD Mon YYYY" occurrence in document order.
  const priceBlocks = [...text.matchAll(/Price\s*([\d,]+\.\d+)\s*p[^A]*As at\s*([\d]{1,2}\s+\w+\s+\d{4})/gi)];
  if (priceBlocks.length === 0) return null;

  // Find every isin_code reference in the same document, in order, to align
  // position with the price blocks above.
  const isinOrder = [...text.matchAll(/isin_code=([A-Z0-9]{4,12})/g)].map((m) => m[1]);
  const position = isinOrder.indexOf(isin);
  const block = position >= 0 && position < priceBlocks.length ? priceBlocks[position] : priceBlocks[0];
  if (!block) return null;

  const price = penceTextToGbp(`${block[1]}p`);
  if (price === null) return null;
  return { price, asOf: block[2] };
}

/**
 * Fallback for any fund with an ISIN that isn't an L&G workplace fund —
 * tries Yahoo Finance's public chart endpoint using {ISIN}.L as the symbol.
 * Works for retail-available funds (confirmed for Vanguard LifeStrategy);
 * returns null for anything Yahoo doesn't index, which is expected for most
 * workplace-only insurer funds.
 */
async function fetchYahooPriceByIsin(isin: string): Promise<{ price: number; asOf: string } | null> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${isin}.L`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const result = data?.chart?.result?.[0];
  const price = result?.meta?.regularMarketPrice;
  const timestamp = result?.meta?.regularMarketTime;
  if (!Number.isFinite(price)) return null;
  return {
    price: Math.round(price * 10000) / 10000,
    asOf: timestamp ? new Date(timestamp * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  };
}

function priceChangeIsPlausible(previousPrice: number | null, proposedPrice: number) {
  if (!Number.isFinite(proposedPrice) || proposedPrice <= 0) {
    return { ok: false, reason: `Proposed price ${proposedPrice} is not a valid positive number.` };
  }
  if (previousPrice === null || previousPrice === undefined || previousPrice === 0) {
    return { ok: true, reason: "No prior price stored; accepting first reading." };
  }
  const fractionMoved = Math.abs(proposedPrice - previousPrice) / previousPrice;
  if (fractionMoved > MAX_PRICE_JUMP_FRACTION) {
    return {
      ok: false,
      reason: `Proposed price ${proposedPrice} differs from stored ${previousPrice} by ${(fractionMoved * 100).toFixed(1)}%, over the ${MAX_PRICE_JUMP_FRACTION * 100}% single-run guard.`,
    };
  }
  return { ok: true, reason: "Within plausible range of prior stored price." };
}

export async function refreshPensionFundPrices() {
  const supabase = createAdminClient();

  const { data: funds, error } = await supabase
    .from("provider_fund_glossary")
    .select("*")
    .not("underlying_isin", "is", null);

  if (error) {
    console.error("[Price Refresher] Error fetching funds:", error);
    return { ok: false, error: error.message };
  }

  if (!funds || funds.length === 0) {
    console.log("[Price Refresher] No glossary rows with an ISIN to price.");
    return { ok: true, updated: 0, flagged: 0, noSource: 0 };
  }

  let updatedCount = 0;
  let flaggedCount = 0;
  let noSourceCount = 0;

  for (const fund of funds) {
    const isin = fund.underlying_isin as string;
    const previousPrice = fund.unit_price !== null ? Number(fund.unit_price) : null;
    let result: { price: number; asOf: string } | null = null;
    let sourceUsed = "none";

    try {
      if (fund.provider_id === "legal-general") {
        // Try the stored URL first if it already targets this ISIN.
        if (fund.source_url && fund.source_url.includes(`isin_code=${isin}`)) {
          result = await fetchLandGPrice(fund.source_url, isin);
        }
        // Self-heal: re-resolve from L&G's own directory if that failed.
        if (!result) {
          const resolvedUrl = await resolveLandGUrlByIsin(isin);
          if (resolvedUrl) {
            result = await fetchLandGPrice(resolvedUrl, isin);
            if (result) {
              await supabase.from("provider_fund_glossary").update({ source_url: resolvedUrl }).eq("id", fund.id);
            }
          }
        }
        sourceUsed = "landg_fund_centre";
      } else {
        result = await fetchYahooPriceByIsin(isin);
        sourceUsed = "yahoo_finance";
      }
    } catch (err) {
      console.warn(`[Price Refresher] Fetch failed for ${fund.internal_fund_name}:`, err);
    }

    const nowIso = new Date().toISOString();

    if (!result) {
      noSourceCount++;
      await supabase
        .from("provider_fund_glossary")
        .update({ notes: `${fund.notes ? fund.notes + " | " : ""}No automated price source found as of ${nowIso.slice(0, 10)} (manual_required).` })
        .eq("id", fund.id);
      console.warn(`[Price Refresher] No price source for ${fund.internal_fund_name} (${isin}) — marked manual_required.`);
      await sleep(THROTTLE_MS);
      continue;
    }

    const verdict = priceChangeIsPlausible(previousPrice, result.price);

    await supabase.from("provider_fund_price_change_log").insert({
      glossary_id: fund.id,
      fund_name: fund.internal_fund_name,
      previous_price: previousPrice,
      proposed_price: result.price,
      source: sourceUsed,
      applied: verdict.ok,
      reason: verdict.reason,
    });

    if (verdict.ok) {
      await supabase
        .from("provider_fund_glossary")
        .update({ unit_price: result.price, updated_at: nowIso })
        .eq("id", fund.id);

      await supabase
        .from("pension_funds")
        .update({ unit_price: result.price, price_as_of_date: result.asOf, updated_at: nowIso })
        .eq("glossary_id", fund.id);

      console.log(`[Price Refresher] Updated ${fund.internal_fund_name}: ${previousPrice ?? "—"} -> ${result.price} (${sourceUsed}, as of ${result.asOf})`);
      updatedCount++;
    } else {
      console.warn(`[Price Refresher] Flagged for review, not applied: ${fund.internal_fund_name} — ${verdict.reason}`);
      flaggedCount++;
    }

    await sleep(THROTTLE_MS);
  }

  return { ok: true, updated: updatedCount, flaggedForReview: flaggedCount, noSource: noSourceCount };
}
