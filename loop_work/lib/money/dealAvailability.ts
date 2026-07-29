export type AvailabilityStatus =
  | "available"
  | "withdrawn"
  | "unavailable"
  | "not_found"
  | "blocked"
  | "rate_limited"
  | "failed"
  | "unknown";

export type DealAvailabilityResult = {
  checkStatus: AvailabilityStatus;
  rateAer?: number | null;
  detail: string;
  confidence: number;
  evidenceText?: string | null;
  payload: Record<string, unknown>;
};

const WITHDRAWN_PATTERNS = [
  /no longer available/i,
  /account is no longer available/i,
  /this product is no longer available/i,
  /withdrawn from sale/i,
  /withdrawn/i,
  /closed to new customers/i,
  /not currently available/i,
  /product has been removed/i,
  /this offer has ended/i,
  /deal has ended/i,
  /sorry.*not available/i,
];

const AVAILABLE_PATTERNS = [
  /apply now/i,
  /open an account/i,
  /open this account/i,
  /available to new customers/i,
  /start saving/i,
  /regular saver/i,
  /savings account/i,
];

export function textFromHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractRateAer(text: string) {
  const patterns = [
    /(\d+(?:\.\d+)?)\s*%\s*AER/i,
    /AER\s*(?:\/\s*gross)?\s*(\d+(?:\.\d+)?)\s*%/i,
    /(\d+(?:\.\d+)?)\s*%\s*(?:gross|variable|fixed)/i,
    /interest rate\s*(?:of)?\s*(\d+(?:\.\d+)?)\s*%/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }

  return null;
}

export function classifyDealPage(input: {
  html?: string | null;
  text?: string | null;
  httpStatus?: number;
  sourceUrl: string;
}): DealAvailabilityResult {
  const text = (input.text || (input.html ? textFromHtml(input.html) : "")).slice(0, 12000);
  const rateAer = extractRateAer(text);

  if (input.httpStatus && [401, 403].includes(input.httpStatus)) {
    return {
      checkStatus: "blocked",
      rateAer: null,
      detail: `Source blocked access with HTTP ${input.httpStatus}. Deal hidden until reviewed.`,
      confidence: 70,
      evidenceText: null,
      payload: { httpStatus: input.httpStatus, sourceUrl: input.sourceUrl },
    };
  }

  if (input.httpStatus === 429) {
    return {
      checkStatus: "rate_limited",
      rateAer: null,
      detail: "Source rate-limited the check. Deal hidden until reviewed.",
      confidence: 70,
      evidenceText: null,
      payload: { httpStatus: input.httpStatus, sourceUrl: input.sourceUrl },
    };
  }

  if (input.httpStatus && input.httpStatus >= 400) {
    return {
      checkStatus: input.httpStatus === 404 ? "not_found" : "failed",
      rateAer: null,
      detail: `Source returned HTTP ${input.httpStatus}.`,
      confidence: input.httpStatus === 404 ? 85 : 40,
      evidenceText: null,
      payload: { httpStatus: input.httpStatus, sourceUrl: input.sourceUrl },
    };
  }

  const withdrawn = WITHDRAWN_PATTERNS.find((pattern) => pattern.test(text));
  if (withdrawn) {
    return {
      checkStatus: "withdrawn",
      rateAer,
      detail: "Source page appears to say the product is withdrawn or no longer available.",
      confidence: 85,
      evidenceText: withdrawn.source,
      payload: { sourceUrl: input.sourceUrl, matchedPattern: withdrawn.source, rateAer },
    };
  }

  const available = AVAILABLE_PATTERNS.some((pattern) => pattern.test(text));
  if (available && rateAer) {
    return {
      checkStatus: "available",
      rateAer,
      detail: "Source page still appears available and rate was found.",
      confidence: 75,
      evidenceText: text.slice(0, 500),
      payload: { sourceUrl: input.sourceUrl, rateAer },
    };
  }

  if (rateAer) {
    return {
      checkStatus: "available",
      rateAer,
      detail: "Rate was found but availability wording was not strong. Keep active but with moderate confidence.",
      confidence: 60,
      evidenceText: text.slice(0, 500),
      payload: { sourceUrl: input.sourceUrl, rateAer },
    };
  }

  return {
    checkStatus: "unknown",
    rateAer: null,
    detail: "Could not confidently confirm rate/availability from source. Hide after repeated failures.",
    confidence: 30,
    evidenceText: text.slice(0, 500),
    payload: { sourceUrl: input.sourceUrl },
  };
}

export async function fetchAndClassifyDealPage(sourceUrl: string): Promise<DealAvailabilityResult> {
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": process.env.LOOP_MONEY_USER_AGENT || "InsideLoopMoneyBot/0.1 (support@insideloop.life)",
      },
      cache: "no-store",
    });

    const html = res.ok ? await res.text() : "";

    return classifyDealPage({
      html,
      httpStatus: res.status,
      sourceUrl,
    });
  } catch (error: any) {
    return {
      checkStatus: "failed",
      rateAer: null,
      detail: error?.message || "Source check failed.",
      confidence: 0,
      payload: { sourceUrl, error: error?.message },
    };
  }
}
