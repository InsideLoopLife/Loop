export type MoneyDealRefreshResult = {
  status: "ok" | "needs_review" | "failed" | "blocked";
  sourceUrl: string;
  providerName?: string | null;
  productName?: string | null;
  rateAer?: number | null;
  priceText?: string | null;
  rawText?: string | null;
  confidence: number;
  error?: string;
};

function textFromHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rateFromText(text: string) {
  const patterns = [
    /(\d+(?:\.\d+)?)\s*%\s*AER/i,
    /AER\s*(?:\/\s*gross)?\s*(\d+(?:\.\d+)?)\s*%/i,
    /(\d+(?:\.\d+)?)\s*%\s*(?:gross|variable|fixed)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }

  return null;
}

/**
 * Polite page check for a savings-rate source URL.
 * It is deliberately basic: if a bank/comparison site blocks or hides data,
 * mark needs_review/blocked rather than attempting to evade bot controls.
 */
export async function refreshSavingsDealFromUrl(sourceUrl: string): Promise<MoneyDealRefreshResult> {
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": process.env.LOOP_MONEY_USER_AGENT || "InsideLoopMoneyBot/0.1 (support@insideloop.life)",
      },
      cache: "no-store",
    });

    if ([401, 403, 429].includes(res.status)) {
      return {
        status: "blocked",
        sourceUrl,
        confidence: 0,
        error: `Source blocked or rate limited with HTTP ${res.status}. Use manual/admin review or an official feed.`,
      };
    }

    if (!res.ok) {
      return {
        status: "failed",
        sourceUrl,
        confidence: 0,
        error: `HTTP ${res.status}`,
      };
    }

    const html = await res.text();
    const text = textFromHtml(html).slice(0, 8000);
    const rateAer = rateFromText(text);

    return {
      status: rateAer ? "ok" : "needs_review",
      sourceUrl,
      rateAer,
      rawText: text.slice(0, 2000),
      confidence: rateAer ? 65 : 30,
    };
  } catch (error: any) {
    return {
      status: "failed",
      sourceUrl,
      confidence: 0,
      error: error?.message || "Unknown refresh failure.",
    };
  }
}
