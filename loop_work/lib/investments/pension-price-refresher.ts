import { createAdminClient } from "@/lib/supabase/admin";
import { chromium, type Browser } from "playwright";

const THROTTLE_MS = 500;
// The bare "/fund-centre/" root returns a generic landing page with no fund
// listing at all. The full sitewide directory of every fund's ISIN + URL
// only renders as a sidebar on an actual fund page, so we anchor on one
// known-working page rather than the root.
const LANDG_DIRECTORY_URL = "https://fundcentres.landg.com/en/uk/workplace-employer/fund-centre/Multi-Asset-Fund/";
const MAX_PRICE_JUMP_FRACTION = 0.5; // reject a single-day move bigger than this without flagging

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (!res.ok) {
    console.warn(`[Price Refresher] L&G directory fetch failed (${res.status}) while resolving ${isin}.`);
    return null;
  }
  const html = await res.text();
  // Require an actual fund-centre path in the match, not just any link that
  // happens to carry ?isin_code=<isin> — some in-page links are relative,
  // query-only hrefs (e.g. "?isin_code=XXXX" with no path at all, meant to
  // combine with the current page's own path), and naively prepending the
  // domain to one of those produces a broken URL that just hits the
  // homepage instead of a real fund page.
  const hrefMatch = html.match(new RegExp(`href="([^"]*\\/fund-centre\\/[^"]*isin_code=${isin}[^"]*)"`, "i"));
  if (hrefMatch) {
    return hrefMatch[1].startsWith("http") ? hrefMatch[1] : `https://fundcentres.landg.com${hrefMatch[1]}`;
  }
  // A fund doesn't link to itself as a directory entry (you don't need a
  // link to the page you're already on) — so if the ISIN belongs to the
  // anchor page's own fund family, this is expected to fail. Try the
  // anchor URL directly with this ISIN as a last resort before giving up.
  const selfUrl = `${LANDG_DIRECTORY_URL}?isin_code=${isin}`;
  const selfCheck = await fetch(selfUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (selfCheck.ok) {
    const selfHtml = await selfCheck.text();
    if (selfHtml.includes(`data-fund-id`) && selfHtml.includes("FundRibbonPrices")) {
      return selfUrl;
    }
  }
  console.warn(`[Price Refresher] L&G directory fetched OK but no href found for ISIN ${isin} — directory page shape may have changed.`);
  return null;
}

/**
 * Fetches an L&G fund-centre page with a real headless browser and reads
 * the price from whichever share-class row is actually rendered visible —
 * using Playwright's :visible pseudo-class, which reflects true computed
 * visibility regardless of how a given page marks it (inline style, a CSS
 * class, or something else). Earlier regex-based attempts against raw HTML
 * broke because different L&G fund pages encode "which row is active"
 * inconsistently; reading real rendered state sidesteps that entirely.
 */
async function fetchLandGPrice(browser: Browser, url: string, isin: string): Promise<{ price: number; asOf: string } | null> {
  const page = await browser.newPage({ userAgent: "Mozilla/5.0" });
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (!response || !response.ok()) {
      console.warn(`[Price Refresher] L&G fund page navigation failed (${response?.status() ?? "no response"}) for ${isin} at ${url}.`);
      return null;
    }

    const visibleRow = page.locator(".FundRibbonPrices-row.shareclass-row:visible").first();
    const rowCount = await page.locator(".FundRibbonPrices-row.shareclass-row").count();
    if (rowCount === 0) {
      console.warn(`[Price Refresher] L&G page loaded for ${isin} but no share-class rows found in rendered DOM — page structure may have changed.`);
      return null;
    }
    if ((await visibleRow.count()) === 0) {
      console.warn(`[Price Refresher] L&G page loaded for ${isin} but no row was rendered visible among ${rowCount} share class row(s).`);
      return null;
    }

    const strongValues = await visibleRow.locator("strong").allTextContents();
    const priceText = (strongValues[0] || "").trim();
    const asOfText = (strongValues[1] || "").trim();

    const price = penceTextToGbp(priceText.endsWith("p") ? priceText : `${priceText}p`);
    if (price === null) {
      console.warn(`[Price Refresher] L&G page found the visible row for ${isin} but couldn't parse a price from "${priceText}".`);
      return null;
    }
    return { price, asOf: asOfText || new Date().toISOString().slice(0, 10) };
  } catch (err) {
    console.warn(`[Price Refresher] Playwright navigation/extraction error for ${isin} at ${url}:`, err);
    return null;
  } finally {
    await page.close();
  }
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

  // One browser for the whole run rather than per-fund — launching Chromium
  // is the expensive part, reusing it across funds keeps this fast and
  // keeps memory bounded to one instance instead of several concurrent ones.
  const needsBrowser = funds.some((f) => f.provider_id === "legal-general");
  const browser = needsBrowser ? await chromium.launch({ headless: true }) : null;

  try {
    for (const fund of funds) {
      const isin = fund.underlying_isin as string;
      const previousPrice = fund.unit_price !== null ? Number(fund.unit_price) : null;
      let result: { price: number; asOf: string } | null = null;
      let sourceUsed = "none";

      try {
        if (fund.provider_id === "legal-general" && browser) {
          // Try the stored URL first if it already targets this ISIN.
          if (fund.source_url && fund.source_url.includes(`isin_code=${isin}`)) {
            result = await fetchLandGPrice(browser, fund.source_url, isin);
          }
          // Self-heal: re-resolve from L&G's own directory if that failed.
          if (!result) {
            const resolvedUrl = await resolveLandGUrlByIsin(isin);
            console.log(`[Price Refresher] Resolved URL for ${isin}: ${resolvedUrl ?? "none"}`);
            if (resolvedUrl) {
              result = await fetchLandGPrice(browser, resolvedUrl, isin);
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
  } finally {
    if (browser) await browser.close();
  }

  return { ok: true, updated: updatedCount, flaggedForReview: flaggedCount, noSource: noSourceCount };
}
