import { calculateMonthlyMortgagePayment } from "@/lib/calculations/mortgage";
import { calculateStampDutyEngland } from "@/lib/calculations/property";
import { normaliseProviderSlug } from "@/lib/wealth/provider-normalise";

export type ParsedSavingsDeal = {
  providerSlug: string;
  providerName: string;
  productName: string;
  accountType: string;
  grossAer: number | null;
  requiresExistingCustomer: boolean;
  eligibilityNote: string | null;
  sourceUrl: string;
  confidence: number;
  summary: string;
};

export type ParsedMortgageDeal = {
  lenderSlug: string;
  lenderName: string;
  productName: string;
  rateType: string;
  initialTermMonths: number | null;
  ltvMax: number | null;
  ltvMin: number | null;
  ratePercent: number | null;
  productFee: number | null;
  existingCustomerOnly: boolean;
  newCustomerAvailable: boolean;
  sourceUrl: string;
  confidence: number;
  summary: string;
};

export type ParsedMoveListing = {
  title: string;
  cleanTitle: string;
  askingPrice: number | null;
  postcode: string | null;
  addressHint: string | null;
  bedrooms: number | null;
  councilTaxBand: string | null;
  councilTaxBandConfidence: number | null;
  epcRating: string | null;
  imageUrl: string | null;
  sourceConfidence: number;
  sourceStatus: "url_ingested" | "url_partial" | "manual_price";
  sourceSummary: string;
};

const fetchTimeoutMs = 9000;

export async function fetchSourceText(url: string) {
  const safeUrl = new URL(url);
  if (!["http:", "https:"].includes(safeUrl.protocol)) throw new Error("Only http/https source URLs can be checked.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    const response = await fetch(safeUrl.toString(), {
      headers: {
        "user-agent": "LOOP Wealth Watch source check/1.0 (+admin initiated)",
        accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.8,*/*;q=0.5",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Source returned ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();
    return { url: safeUrl.toString(), contentType, rawText: rawText.slice(0, 600_000), text: stripHtml(rawText).slice(0, 250_000) };
  } finally {
    clearTimeout(timeout);
  }
}

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function firstRate(text: string) {
  const matches = Array.from(text.matchAll(/(\d{1,2}(?:\.\d{1,3})?)\s*%/g))
    .map((match) => Number(match[1]))
    .filter((value) => value > 0 && value < 25);
  return matches.length ? Math.max(...matches.slice(0, 20)) : null;
}

function firstMoney(text: string) {
  const match = text.match(/£\s?([0-9][0-9,]*(?:\.\d{1,2})?)/);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ""));
}

function firstLtv(text: string) {
  const matches = Array.from(text.matchAll(/(\d{2,3})\s*%\s*LTV/gi))
    .map((match) => Number(match[1]))
    .filter((value) => value > 0 && value <= 100);
  return matches.length ? Math.max(...matches) : null;
}

function firstTermMonths(text: string) {
  const years = text.match(/(2|3|5|10)\s*(?:year|yr)[-\s]*(?:fixed|fix)/i);
  if (years) return Number(years[1]) * 12;
  const months = text.match(/(24|36|60|120)\s*month/i);
  return months ? Number(months[1]) : null;
}

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&pound;/gi, "£")
    .replace(/\u0026/g, "&")
    .replace(/\u002F/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMoveListingTitle(input: string, postcode?: string | null) {
  let value = decodeHtmlEntities(input || "")
    .replace(/\s*[|\-–—]\s*(Rightmove|Zoopla|OnTheMarket|PrimeLocation).*$/i, "")
    .replace(/\s*Skip to content\s*!?.*$/i, "")
    .replace(/\s*It appears that JavaScript is disabled.*$/i, "")
    .replace(/\s*Marketed by.*$/i, "")
    .replace(/\s*Read full description.*$/i, "")
    .trim();

  const saleMatch = value.match(/(?:for sale|for rent)\s+in\s+(.+)$/i);
  if (saleMatch?.[1]) value = saleMatch[1].trim();
  value = value
    .replace(/^\d+\s+bedroom\s+(?:detached|semi-detached|terraced|end of terrace|house|flat|bungalow|property)\s+(?:house|property|flat|bungalow)?\s*/i, "")
    .replace(/^\d+\s+bed(?:s|room)?\s*/i, "")
    .replace(/^for sale\s+in\s+/i, "")
    .replace(/\bWA\d[A-Z]?\s?\d[A-Z]{2}\b.*$/i, (match) => postcode ? postcode.toUpperCase() : match)
    .replace(/\s+/g, " ")
    .trim();
  if (/javascript is disabled|skip to content|cookie|privacy/i.test(value)) value = "";
  return value.slice(0, 140) || "Move search";
}

function normaliseCouncilBand(value: string | undefined | null) {
  const band = String(value || "").trim().toUpperCase();
  return /^[A-H]$/.test(band) ? band : null;
}

const councilBandRatios: Record<string, number> = {
  A: 6 / 9,
  B: 7 / 9,
  C: 8 / 9,
  D: 1,
  E: 11 / 9,
  F: 13 / 9,
  G: 15 / 9,
  H: 18 / 9,
};

const knownCouncilBandDAnnual: Record<string, { authority: string; annual: number; sourceUrl: string; confidence: number }> = {
  warrington: {
    authority: "Warrington Borough Council",
    annual: 2448,
    sourceUrl: "https://www.warrington.gov.uk/council-tax-bands-and-charges",
    confidence: 86,
  },
};

export function estimateCouncilTaxAnnual(input: { band?: string | null; authority?: string | null }) {
  const band = normaliseCouncilBand(input.band);
  if (!band) return { annual: null as number | null, confidence: 0, sourceUrl: null as string | null, authority: input.authority || null };
  const key = String(input.authority || "").toLowerCase();
  const matched = Object.entries(knownCouncilBandDAnnual).find(([slug, row]) => key.includes(slug) || row.authority.toLowerCase().includes(key));
  const profile = matched?.[1];
  const bandD = profile?.annual ?? 2392; // England average Band D fallback until local council row is added.
  return {
    annual: Math.round(bandD * councilBandRatios[band]),
    confidence: profile ? profile.confidence : 55,
    sourceUrl: profile?.sourceUrl ?? null,
    authority: profile?.authority ?? input.authority ?? null,
  };
}

function titleFromSource(text: string, fallback: string, rawText?: string) {
  const rawCandidates = rawText
    ? [
        rawText.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1],
        rawText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1],
        rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],
        rawText.match(/"displayAddress"\s*:\s*"([^"]+)"/i)?.[1],
        rawText.match(/"address"\s*:\s*"([^"]+)"/i)?.[1],
      ].filter(Boolean) as string[]
    : [];
  const textCandidates = [
    text.match(/((?:\d+\s+)?bedroom[^£]{8,160}?(?:for sale|for rent)[^£]{0,120})/i)?.[1],
    text.match(/([A-Z][A-Za-z'\- ]+\s(?:Road|Street|Close|Lane|Avenue|Drive|Way|Crescent|Gardens|Brook|Rise|Place|Court|Grove|Mews)[^£]{0,100})/i)?.[1],
    text.slice(0, 180),
  ].filter(Boolean) as string[];
  const candidate = [...rawCandidates, ...textCandidates]
    .map((value) => cleanMoveListingTitle(String(value)))
    .find((value) => value.length >= 8 && !/javascript is disabled|skip to content|cookie|privacy/i.test(value));
  return (candidate || fallback).slice(0, 180).trim();
}

function extractImageUrl(rawText: string | undefined, sourceUrl: string) {
  if (!rawText) return null;
  const candidates = [
    rawText.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1],
    rawText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1],
    rawText.match(/"propertyImages"\s*:\s*\{[\s\S]{0,5000}?"url"\s*:\s*"([^"]+)"/i)?.[1],
    rawText.match(/"mainImage"\s*:\s*"([^"]+)"/i)?.[1],
    rawText.match(/"image"\s*:\s*"(https?:\\?\/\\?\/[^"\\]+)"/i)?.[1],
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      const decoded = decodeHtmlEntities(candidate).replace(/\\\//g, "/");
      return new URL(decoded, sourceUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}

function extractCouncilTaxBand(text: string, rawText?: string) {
  const combined = decodeHtmlEntities(stripHtml(`${rawText || ""} ${text}`));
  const rawCombined = decodeHtmlEntities(`${rawText || ""} ${text}`);
  const structuredPatterns = [
    /"councilTaxBand"\s*:\s*"?([A-H])"?/i,
    /"council_tax_band"\s*:\s*"?([A-H])"?/i,
    /"councilTax"\s*:\s*\{[\s\S]{0,260}?"band"\s*:\s*"?([A-H])"?/i,
    /"councilTax"\s*:\s*"Band\s*([A-H])"/i,
  ];
  for (const pattern of structuredPatterns) {
    const match = rawCombined.match(pattern);
    const band = normaliseCouncilBand(match?.[1]);
    if (band) return { band, confidence: 99 };
  }

  const visibleWindows = Array.from(combined.matchAll(/Council\s*Tax[\s\S]{0,220}/gi)).map((match) => match[0]);
  for (const window of visibleWindows) {
    const explicit = window.match(/\bBand\s*[:\-]?\s*([A-H])\b/i) || window.match(/\bCouncil\s*Tax\s*[:\-]?\s*([A-H])\b/i);
    const band = normaliseCouncilBand(explicit?.[1]);
    if (band && !/ask agent|not known|tbc/i.test(window)) return { band, confidence: 97 };
  }

  // Last-resort visible text pattern. Kept deliberately strict so "Accessibility: Ask agent" cannot become Band A.
  const strict = combined.match(/Council\s*Tax\s*Band\s*[:\-]?\s*([A-H])\b/i);
  const strictBand = normaliseCouncilBand(strict?.[1]);
  if (strictBand) return { band: strictBand, confidence: 96 };

  return { band: null as string | null, confidence: null as number | null };
}

function extractEpcRating(text: string, rawText?: string) {
  const combined = `${rawText || ""} ${text}`;
  const patterns = [
    /"epcRating"\s*:\s*"?([A-G])"?/i,
    /"epc_rating"\s*:\s*"?([A-G])"?/i,
    /EPC[\s\S]{0,60}?(?:rating|current)?\s*[:\-]?\s*([A-G])\b/i,
  ];
  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return null;
}

function extractAddressHint(text: string, rawText: string | undefined, postcode: string | null, title: string) {
  const rawAddress = rawText?.match(/"displayAddress"\s*:\s*"([^"]+)"/i)?.[1]
    || rawText?.match(/"address"\s*:\s*"([^"]+)"/i)?.[1]
    || rawText?.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || null;
  const decodedRaw = rawAddress ? cleanMoveListingTitle(rawAddress, postcode) : null;
  const titleWithoutSale = cleanMoveListingTitle(title, postcode);
  if (decodedRaw && decodedRaw.length >= 6) return decodedRaw.slice(0, 160);
  if (titleWithoutSale && !/javascript|skip to content/i.test(titleWithoutSale)) return titleWithoutSale.slice(0, 160);
  return postcode ? `Near ${postcode.toUpperCase()}` : null;
}

export function parseSavingsDealFromSource(args: { providerName: string; productName?: string; sourceUrl: string; text: string }): ParsedSavingsDeal {
  const lower = args.text.toLowerCase();
  const providerName = args.providerName || "Unknown provider";
  const accountType = lower.includes("cash isa") || lower.includes("isa") ? "cash_isa" : lower.includes("regular saver") ? "regular_saver" : lower.includes("fixed") ? "fixed_saver" : "easy_access";
  const requiresExistingCustomer = /existing customer|current account required|must hold|eligible if you already|linked current account/i.test(args.text);
  const grossAer = firstRate(args.text);
  const productName = args.productName || titleFromSource(args.text, "Savings product");
  return {
    providerSlug: normaliseProviderSlug(providerName),
    providerName,
    productName: productName.slice(0, 160),
    accountType,
    grossAer,
    requiresExistingCustomer,
    eligibilityNote: requiresExistingCustomer ? "Source appears to reference existing-customer or linked-account eligibility. Admin should confirm." : "Source did not obviously require an existing account. Admin should confirm.",
    sourceUrl: args.sourceUrl,
    confidence: grossAer ? 58 : 35,
    summary: grossAer ? `Detected a possible savings rate of ${grossAer.toFixed(2)}%.` : "Could not confidently detect a savings rate; saved for admin review.",
  };
}

export function parseMortgageDealsFromSource(args: { lenderName: string; sourceUrl: string; text: string }): ParsedMortgageDeal[] {
  const lower = args.text.toLowerCase();
  const lenderName = args.lenderName || "Unknown lender";
  const lenderSlug = normaliseProviderSlug(lenderName);
  const ratePercent = firstRate(args.text);
  const ltvMax = firstLtv(args.text);
  const initialTermMonths = firstTermMonths(args.text);
  const productFee = /fee/i.test(args.text) ? firstMoney(args.text) : null;
  const existingCustomerOnly = /existing customer|product transfer|switching rate|current borrower|existing mortgage customer/i.test(args.text);
  const rateType = lower.includes("tracker") ? "tracker" : lower.includes("variable") ? "variable" : "fixed";
  const productName = titleFromSource(args.text, `${lenderName} mortgage product`);
  return [
    {
      lenderSlug,
      lenderName,
      productName: productName.slice(0, 180),
      rateType,
      initialTermMonths,
      ltvMax,
      ltvMin: null,
      ratePercent,
      productFee,
      existingCustomerOnly,
      newCustomerAvailable: !existingCustomerOnly || /new customer|remortgage|purchase/i.test(args.text),
      sourceUrl: args.sourceUrl,
      confidence: ratePercent ? 55 : 30,
      summary: ratePercent ? `Detected a possible ${rateType} rate of ${ratePercent.toFixed(2)}%.` : "Could not confidently detect a mortgage rate; saved for admin review.",
    },
  ];
}

export function parseMoveListingFromSource(args: { sourceUrl: string; text: string; rawText?: string; fallbackTitle?: string; fallbackPrice?: number | null }): ParsedMoveListing {
  const price = firstMoney(args.text) || args.fallbackPrice || null;
  const postcodeMatch = args.text.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/i);
  const bedroomsMatch = args.text.match(/(\d+)\s*(?:bedroom|bed\b)/i);
  const council = extractCouncilTaxBand(args.text, args.rawText);
  const epcRating = extractEpcRating(args.text, args.rawText);
  const imageUrl = extractImageUrl(args.rawText, args.sourceUrl);
  const rawTitle = args.fallbackTitle || titleFromSource(args.text, "Move search", args.rawText);
  const postcode = postcodeMatch?.[1]?.toUpperCase() || null;
  const addressHint = extractAddressHint(args.text, args.rawText, postcode, rawTitle);
  const cleanTitle = cleanMoveListingTitle(addressHint || rawTitle, postcode);
  const evidence = [price, postcode, bedroomsMatch, council.band, epcRating, imageUrl, addressHint].filter(Boolean).length;
  const sourceConfidence = Math.min(99, Math.max(45, 45 + evidence * 8 + (council.confidence ? 10 : 0)));
  return {
    title: cleanTitle,
    cleanTitle,
    askingPrice: price,
    postcode,
    addressHint,
    bedrooms: bedroomsMatch ? Number(bedroomsMatch[1]) : null,
    councilTaxBand: council.band,
    councilTaxBandConfidence: council.confidence,
    epcRating,
    imageUrl,
    sourceConfidence,
    sourceStatus: price || postcodeMatch || bedroomsMatch ? "url_ingested" : "url_partial",
    sourceSummary: `Parsed from listing URL with ${sourceConfidence}% source confidence${council.band ? `; council tax band ${council.band} detected at ${council.confidence}% confidence` : "; council tax band still needs confirmation"}.`,
  };
}

export function buildMoveAssumptions(input: {
  askingPrice: number | null;
  targetDeposit?: number | null;
  expectedRate?: number | null;
  expectedTermYears?: number | null;
  epcRating?: string | null;
  councilTaxBand?: string | null;
  councilTaxAuthority?: string | null;
  additionalProperty?: boolean;
}) {
  const askingPrice = Number(input.askingPrice || 0);
  const targetDeposit = Number(input.targetDeposit || 0);
  const expectedRate = Number(input.expectedRate || 4.75);
  const expectedTermYears = Number(input.expectedTermYears || 30);
  const expectedMortgageBalance = askingPrice > 0 ? Math.max(0, askingPrice - targetDeposit) : null;
  const expectedPayment = expectedMortgageBalance ? calculateMonthlyMortgagePayment({ balance: expectedMortgageBalance, annualInterestRate: expectedRate, termYears: expectedTermYears }) : null;
  const epc = String(input.epcRating || "").toUpperCase();
  const energyAnnual = epc === "A" || epc === "B" ? 1200 : epc === "C" ? 1600 : epc === "D" ? 2100 : epc ? 2800 : null;
  const councilTax = estimateCouncilTaxAnnual({ band: input.councilTaxBand, authority: input.councilTaxAuthority });
  const baseMovingCost = askingPrice > 0 ? Math.max(3000, Math.min(12000, askingPrice * 0.012)) : 4000;
  return {
    stampDutyEstimate: askingPrice > 0 ? calculateStampDutyEngland({ purchasePrice: askingPrice, additionalProperty: Boolean(input.additionalProperty) }) : null,
    movingCostEstimate: baseMovingCost,
    movingCostBasis: askingPrice > 0 ? "1.2% of purchase price, capped between £3,000 and £12,000 until the user overrides it." : "Default £4,000 until price/removal/solicitor assumptions are added.",
    expectedMortgageBalance,
    expectedPayment,
    energyAnnual,
    heatingMonthly: energyAnnual ? energyAnnual / 12 : null,
    councilTaxAnnual: councilTax.annual,
    councilTaxAuthority: councilTax.authority,
    councilTaxSourceUrl: councilTax.sourceUrl,
    councilTaxEstimateConfidence: councilTax.confidence,
  };
}
