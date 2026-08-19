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
  confidence: "exact_name_match" | "isin_match" | "ai_assisted" | "single_price_on_page" | "positional_guess" | "not_found";
  candidate_count: number;
  headingsFound?: string[];
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
function decodeHtmlEntities(text: string) {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normaliseForMatch(text: string) {
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim().toLowerCase();
}

export function extractPriceAndFeeFromText(html: string, exactFundName?: string, isin?: string | null): PriceParseResult {
  const text = decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));

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

  const decodedHtml = decodeHtmlEntities(html);
  const priceBlockRegex = /Price\s*([0-9,]+(?:\.[0-9]+)?)\s*p[\s\S]{0,120}?As at\s*([0-9]{1,2}\s+\w+\s+[0-9]{4})/i;
  const PROXIMITY_WINDOW = 50000;

  function tryAnchor(pos: number): { price: string; asOf: string } | null {
    const forwardText = decodedHtml.slice(pos, pos + PROXIMITY_WINDOW);
    const backwardText = decodedHtml.slice(Math.max(0, pos - PROXIMITY_WINDOW), pos);
    const nearbyPriceMatch = forwardText.match(priceBlockRegex) || backwardText.match(priceBlockRegex);
    return nearbyPriceMatch ? { price: nearbyPriceMatch[1], asOf: nearbyPriceMatch[2] } : null;
  }

  // STRATEGY 1 (most reliable, tried first): match on the exact ISIN inside
  // an L&G data-shareclass-code="..." attribute. Confirmed by inspecting
  // real failure logs — every share-class heading on these pages carries
  // its ISIN as a data attribute right alongside the visible name. Unlike
  // the visible fund name (which also appears, unhelpfully, throughout a
  // sitewide "browse other funds" list with hundreds of unrelated entries),
  // an ISIN in a data-shareclass-code attribute is unique to exactly one
  // share class on the entire page — this can't collide with page noise
  // the way name-matching can. Requires the caller to pass the ISIN
  // (available from the glossary row / source URL) — falls through
  // silently to strategy 2 if not provided.
  if (isin) {
    const escapedIsin = isin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const isinRegex = new RegExp(`data-shareclass-code=["']${escapedIsin}["']`, "i");
    const isinMatch = decodedHtml.match(isinRegex);
    if (isinMatch && isinMatch.index !== undefined) {
      const found = tryAnchor(isinMatch.index);
      if (found) {
        const raw = Number(found.price.replace(/,/g, ""));
        if (Number.isFinite(raw) && raw > 0) {
          return { unit_price: raw / 100, suggested_fee_percent, as_of_date: found.asOf, confidence: "isin_match", candidate_count: priceCandidates.length };
        }
      }
    }
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
    // BUGFIX: the previous version built two separate flat lists (every
    // heading anywhere on the page, every price anywhere on the page) and
    // matched by index — assuming they stayed aligned in the same order.
    // Confirmed false from a real cron run: L&G's pages embed a sitewide
    // "switch to another fund" dropdown listing their ENTIRE fund range
    // (hundreds of entries, completely unrelated to the page's own share
    // classes). The exact fund name was genuinely present in that list,
    // just at some arbitrary index far past the handful of real price
    // blocks — so index-based alignment was structurally broken, not just
    // occasionally wrong.
    //
    // This now finds the actual character position of the exact fund name
    // in the raw HTML, then looks for the nearest price block that
    // follows within a reasonable window — proximity, not list position.
    // A dropdown option isn't followed by its own "Price ###p As at..."
    // block, so this naturally ignores dropdown noise without needing to
    // detect or filter it explicitly.
    // BUGFIX #3: even a wide bidirectional window wasn't enough — confirmed
    // via a live fetch of the Lazard page. L&G embeds a sitewide "browse
    // other funds" list on EVERY fund page containing hundreds of unrelated
    // fund names as plain link text (no price attached to any of them). The
    // page's OWN price section sits far below that list, past Fund facts,
    // Charges, and large Performance/Portfolio tables — genuinely tens of
    // thousands of raw HTML characters from an occurrence picked up inside
    // that list, no matter how wide the window is made.
    //
    // STRATEGY 2: anchor on the fund name specifically where it appears as
    // the page's own <h1> heading. Verified directly on a live fetch — the
    // H1 is reliably followed, within a bounded distance, by that share
    // class's own "Price ###p ... As at DATE" block. The sitewide list
    // never uses <h1> for its entries, only plain <a> links, so this skips
    // the noise entirely instead of trying to out-widen it.
    const escapedName = exactFundName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    // Allow for a nested tag (e.g. a <span>) between <h1> and the name text
    // — don't assume the name is always the immediate child of the h1.
    const headingRegex = new RegExp(`<h1[^>]*>(?:\\s*<[^>]+>)*\\s*${escapedName}\\s*(?:<|</h1>)`, "i");
    const headingMatch = decodedHtml.match(headingRegex);

    const anchors: number[] = [];
    if (headingMatch && headingMatch.index !== undefined) {
      anchors.push(headingMatch.index);
    }

    // STRATEGY 3 (last-resort deterministic pass): any occurrence of the
    // name at all, in case a future page redesign uses a different tag for
    // its own heading. Kept as a safety net, not the primary strategy.
    const normalisedTarget = normaliseForMatch(exactFundName);
    let searchFrom = 0;
    while (searchFrom < decodedHtml.length) {
      const idx = decodedHtml.toLowerCase().indexOf(normalisedTarget, searchFrom);
      if (idx === -1) break;
      if (!anchors.includes(idx)) anchors.push(idx);
      searchFrom = idx + normalisedTarget.length;
    }

    for (const pos of anchors) {
      const found = tryAnchor(pos);
      if (found) {
        const raw = Number(found.price.replace(/,/g, ""));
        if (Number.isFinite(raw) && raw > 0) {
          return { unit_price: raw / 100, suggested_fee_percent, as_of_date: found.asOf, confidence: "exact_name_match", candidate_count: priceCandidates.length };
        }
      }
    }
  }

  // Couldn't confidently disambiguate. Report every candidate rather than
  // silently picking one — callers should treat this as "needs review",
  // not apply it automatically. Debug info here is deliberately bounded —
  // dumping every heading on the page produced an unusably large log on a
  // real run (L&G's sitewide fund-switcher dropdown alone is 500+
  // entries). Instead: was the exact name found at all, and if so, what
  // actually follows it (so a real failure is diagnosable from a short
  // snippet, not another giant dump).
  const foundHeadings = exactFundName
    ? (() => {
        const decodedHtml = decodeHtmlEntities(html);
        const normalisedTarget = normaliseForMatch(exactFundName);
        const lower = decodedHtml.toLowerCase();
        const occurrences: string[] = [];
        let searchFrom = 0;
        while (occurrences.length < 3) {
          const idx = lower.indexOf(normalisedTarget, searchFrom);
          if (idx === -1) break;
          occurrences.push(decodedHtml.slice(idx, idx + 200).replace(/\s+/g, " ").trim());
          searchFrom = idx + normalisedTarget.length;
        }
        return occurrences.length
          ? occurrences.map((s, i) => `occurrence ${i + 1}: "${s}..."`)
          : [`exact name "${exactFundName}" not found anywhere in the fetched page at all`];
      })()
    : undefined;
  return { unit_price: null, suggested_fee_percent, as_of_date: null, confidence: "not_found", candidate_count: priceCandidates.length, headingsFound: foundHeadings };
}

// STRATEGY 4 (genuine last resort — only reached if strategies 1-3 all
// failed): ask an LLM to find the right price. This exists for the case
// none of the deterministic strategies were built for: a future page
// redesign that changes the tag structure AND drops/renames the
// data-shareclass-code attribute at the same time. Deliberately NOT the
// first thing tried — an LLM call is slower, costs money, and (unlike a
// regex match, which either finds the exact string or doesn't) can be
// confidently wrong in a way that's harder to detect. Two things keep
// that risk bounded:
//   1. The model is only asked to CHOOSE among the deterministically
//      extracted price candidates (real numbers already found by the
//      regex above) — never asked to read/invent a number itself. It's
//      doing disambiguation, not extraction.
//   2. The caller (pension-price-snapshot.ts) applies a day-over-day
//      sanity bound before ever writing an AI-assisted price — if it's
//      wildly different from yesterday's price, it goes to needsReview
//      instead of being applied, same as any other low-confidence result.
export async function aiDisambiguatePrice(
  html: string,
  exactFundName: string,
  isin: string | null,
  priceCandidates: { price: number; asOf: string }[],
): Promise<{ unit_price: number; as_of_date: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || priceCandidates.length === 0) return null;

  const decodedHtml = decodeHtmlEntities(html);
  // Raw HTML (tags/attributes intact) around each candidate's approximate
  // location — attributes like data-shareclass-code only exist in raw
  // HTML, not the tag-stripped text used for the regex pass, so this is
  // the model's only chance to see them if strategy 1 didn't find a match.
  const priceBlockRegexLoose = /Price\s*(?:<[^>]+>\s*)*([0-9,]+(?:\.[0-9]+)?)\s*p[\s\S]{0,400}?As at\s*(?:<[^>]+>\s*)*([0-9]{1,2}\s+\w+\s+[0-9]{4})/gi;
  const contexts: string[] = [];
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = priceBlockRegexLoose.exec(decodedHtml)) !== null && i < priceCandidates.length + 4) {
    const start = Math.max(0, m.index - 600);
    contexts.push(`Candidate ${i}: ...${decodedHtml.slice(start, m.index + 200).replace(/\s+/g, " ").trim()}...`);
    i++;
  }
  if (contexts.length === 0) return null;

  const prompt = `You are matching a UK pension fund's price on a Legal & General fund-centre page that lists several share classes together.

Target fund name (must match exactly, including the share-class suffix like "3" or "G25"): "${exactFundName}"
${isin ? `Target ISIN: ${isin}\n` : ""}
Below are raw HTML snippets, each centred on one "Price ... As at ..." block found on the page, including any surrounding HTML tags/attributes:

${contexts.join("\n\n")}

Which candidate index belongs to the target fund? Respond with ONLY a JSON object, no other text: {"matched_index": number or null, "confidence": "high" | "medium" | "low", "reasoning": "one short sentence"}`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_PENSION_MATCH_MODEL || "gpt-4.1-mini",
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return null;

    const textOut = typeof payload?.output_text === "string"
      ? payload.output_text
      : (payload?.output || []).flatMap((item: any) => item?.content || []).map((c: any) => c?.text || "").join("\n");

    const jsonMatch = String(textOut || "").match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    // Only ever act on high confidence — medium/low go to needsReview via
    // the normal not_found path, same as an unmatched deterministic pass.
    if (parsed.confidence !== "high") return null;
    const idx = Number(parsed.matched_index);
    if (!Number.isInteger(idx) || idx < 0) return null;

    // Re-derive the actual price from our own regex-extracted candidates,
    // NOT from anything the model wrote — the model only ever picks an
    // index, it never supplies the number that gets applied.
    const priceBlockRegexPlain = /Price\s*([0-9,]+(?:\.[0-9]+)?)\s*p[\s\S]{0,400}?As at\s*([0-9]{1,2}\s+\w+\s+[0-9]{4})/gi;
    const plainMatches: { price: number; asOf: string }[] = [];
    let pm: RegExpExecArray | null;
    while ((pm = priceBlockRegexPlain.exec(decodedHtml)) !== null) {
      const raw = Number(pm[1].replace(/,/g, ""));
      if (Number.isFinite(raw) && raw > 0) plainMatches.push({ price: raw / 100, asOf: pm[2] });
    }
    const chosen = plainMatches[idx];
    if (!chosen) return null;
    return { unit_price: chosen.price, as_of_date: chosen.asOf };
  } catch {
    return null;
  }
}

export async function fetchLandgFundPrice(url: string, exactFundName?: string, isin?: string | null): Promise<PriceParseResult> {
  try {
    const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await response.text();
    const deterministic = extractPriceAndFeeFromText(html, exactFundName, isin);
    if (deterministic.confidence !== "not_found" || !exactFundName) return deterministic;

    // Deterministic strategies 1-3 all failed — try the AI fallback before
    // giving up. Still returns not_found (needsReview) if the model isn't
    // available, isn't confident, or its answer can't be traced back to a
    // real extracted candidate.
    const text = decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    const priceBlockPattern = /Price\s*([0-9,]+(?:\.[0-9]+)?)\s*p[\s\S]{0,120}?As at\s*([0-9]{1,2}\s+\w+\s+[0-9]{4})/gi;
    const priceCandidates: { price: number; asOf: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = priceBlockPattern.exec(text)) !== null) {
      const raw = Number(m[1].replace(/,/g, ""));
      if (Number.isFinite(raw) && raw > 0) priceCandidates.push({ price: raw / 100, asOf: m[2] });
    }

    const aiResult = await aiDisambiguatePrice(html, exactFundName, isin ?? null, priceCandidates);
    if (aiResult) {
      return { ...deterministic, unit_price: aiResult.unit_price, as_of_date: aiResult.as_of_date, confidence: "ai_assisted" };
    }
    return deterministic;
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