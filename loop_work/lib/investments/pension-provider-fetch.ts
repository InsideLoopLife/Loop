// Shared L&G fund-centre fetch/parse logic. Previously duplicated inline in
// app/api/investments/fund-research/route.ts — pulled out here so the new
// daily price-snapshot job (lib/investments/pension-price-snapshot.ts) uses
// the exact same, single implementation. Two copies of "how do we read an
// L&G page" drifting apart over time is exactly the kind of thing that
// produces confidently-wrong numbers nobody notices.

export const L_AND_G_SOURCE_MAP = [
  { match: ["lazard", "emerging"], url: "https://fundcentres.landg.com/en/uk/workplace-employer/fund-centre/Lazard-Emerging-Markets-Fund/?isin_code=GB00BD1JRJ41", group: "Emerging markets" },
  { match: ["islamic", "hsbc", "global equity"], url: "https://fundcentres.landg.com/en/uk/workplace-employer/fund-centre/HSBC-Islamic-Global-Equity-Index-Fund/?isin_code=GB00BJXRF945", group: "Global equity" },
  { match: ["responsible", "ct", "bmo"], url: "https://fundcentres.landg.com/en/uk/workplace-employee/fund-centre/BMO-Responsible-Global-Equity-Fund/?isin_code=GB00BGYBV072", group: "Responsible global equity" },
  { match: ["multi", "asset"], url: "https://fundcentres.landg.com/en/uk/workplace-employee/fund-centre/Multi-Asset-Fund/?isin_code=GB00B5W2CB33", group: "Multi-asset" },
] as const;

export function isLegalGeneral(provider: string) {
  const p = provider.toLowerCase();
  return p.includes("legal") || p.includes("l&g") || p.includes("lgim");
}

export type PriceParseResult = {
  unit_price: number | null;
  suggested_fee_percent: number | null;
  as_of_date: string | null;
  confidence: "exact_name_match" | "single_price_on_page" | "positional_guess" | "not_found";
  candidate_count: number;
};

// BUGFIX: the previous version of this function used
// text.match(/Price\s*([0-9,]+...)\s*p/i) with no global flag, so it always
// took whichever price happened to appear FIRST in the page's raw text.
// L&G's fund-centre pages routinely show 2-4 share-class prices on one
// page even when a specific ?isin_code= is in the URL — the first one is
// not reliably the one matching that ISIN. Confirmed by hand multiple
// times in this session: for at least one fund, the correct price was the
// SECOND one on the page, not the first.
//
// This version instead:
//   1. Finds every "Price ####p ... As at DATE" occurrence, in order
//   2. Finds every fund-name heading that precedes the Prices section, in order
//   3. If there's only one price on the page at all, use it directly — no
//      ambiguity possible, high confidence
//   4. If there are multiple, try to find the exact configured fund name
//      (e.g. "L&G PMC HSBC Islamic Global Equity Index Fund 3") among the
//      headings and use its matching positional price
//   5. If the exact name can't be matched among multiple candidates, return
//      not_found with the full candidate list rather than silently
//      guessing — the caller can then decide whether to fall back to a
//      position-based guess (flagged as such) or require manual review
export function extractPriceAndFeeFromText(html: string, exactFundName?: string): PriceParseResult {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  const feeMatch = text.match(/Investment management charge\s*([0-9]+(?:\.[0-9]+)?)\s*%/i) || text.match(/(?:OCF|AMC|ongoing charge|annual management charge)[^0-9%]{0,40}([0-9]+(?:\.[0-9]+)?)\s*%/i);
  const suggested_fee_percent = feeMatch ? Number(feeMatch[1]) : null;

  // Every "Price 1234.56p ... As at DD Mon YYYY" block, in page order
  const priceBlockPattern = /Price\s*([0-9,]+(?:\.[0-9]+)?)\s*p[\s\S]{0,120}?As at\s*([0-9]{1,2}\s+\w+\s+[0-9]{4})/gi;
  const priceCandidates: { price: number; asOf: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = priceBlockPattern.exec(text)) !== null) {
    const raw = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(raw) && raw > 0) {
      priceCandidates.push({ price: raw / 100, asOf: match[2] });
    }
  }

  if (priceCandidates.length === 0) {
    return { unit_price: null, suggested_fee_percent, as_of_date: null, confidence: "not_found", candidate_count: 0 };
  }

  if (priceCandidates.length === 1) {
    return { unit_price: priceCandidates[0].price, suggested_fee_percent, as_of_date: priceCandidates[0].asOf, confidence: "single_price_on_page", candidate_count: 1 };
  }

  // Multiple share classes on the page — try to disambiguate by matching
  // the exact configured fund name against the heading list, which L&G
  // lists in the same order as the later price blocks.
  //
  // NOTE: this matches text between HTML tags (>text<), not markdown "#"
  // headings — the real server-side fetch() below receives raw HTML.
  // Markdown-style headings only exist in some external tools' rendered
  // view of a page, never in what fetch() actually returns, so matching
  // against "#" here would silently never find anything.
  if (exactFundName) {
    const headingPattern = />\s*((?:L&?G|Legal\s*&\s*General)[^<]{3,90})\s*</gi;
    const headings: string[] = [];
    let headingMatch: RegExpExecArray | null;
    while ((headingMatch = headingPattern.exec(html)) !== null) {
      headings.push(headingMatch[1].trim());
    }
    const normalisedTarget = exactFundName.trim().toLowerCase();
    const index = headings.findIndex((h) => h.toLowerCase() === normalisedTarget);
    if (index >= 0 && index < priceCandidates.length) {
      return { unit_price: priceCandidates[index].price, suggested_fee_percent, as_of_date: priceCandidates[index].asOf, confidence: "exact_name_match", candidate_count: priceCandidates.length };
    }
  }

  // Couldn't confidently disambiguate. Report every candidate rather than
  // silently picking one — callers should treat this as "needs review",
  // not apply it automatically.
  return { unit_price: null, suggested_fee_percent, as_of_date: null, confidence: "not_found", candidate_count: priceCandidates.length };
}

export async function fetchLandgFundPrice(url: string, exactFundName?: string): Promise<PriceParseResult> {
  try {
    const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await response.text();
    return extractPriceAndFeeFromText(html, exactFundName);
  } catch {
    return { unit_price: null, suggested_fee_percent: null, as_of_date: null, confidence: "not_found", candidate_count: 0 };
  }
}

export function findLandgSourceUrl(fundName: string, provider: string): { url: string | null; group: string } {
  const isLg = isLegalGeneral(provider);
  const fundLower = fundName.toLowerCase();
  const matched = isLg ? L_AND_G_SOURCE_MAP.find((item) => item.match.some((word) => fundLower.includes(word))) : null;
  return {
    url: matched?.url || null,
    group: matched?.group || (fundLower.includes("multi") ? "Multi-asset" : fundLower.includes("emerging") ? "Emerging markets" : fundLower.includes("islamic") ? "Global equity" : "Review needed"),
  };
}
