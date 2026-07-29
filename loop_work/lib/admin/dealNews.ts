export type DealNewsCheckInput = {
  providerName: string;
  productName: string;
  sourceUrl?: string | null;
  reason: string;
};

export type DealNewsCheckResult = {
  status: "needs_admin_review" | "confirmed_removed" | "confirmed_available" | "failed";
  summary: string;
  confidence: number;
  evidenceUrls: Array<{ title?: string; url: string; note?: string }>;
  raw?: unknown;
};

/**
 * Optional AI/search hook for deals where the source is unknown/blocked.
 *
 * In beta this can be left unconfigured: it will create a clear admin review
 * rather than pretending to know. If you later add an AI search provider/API,
 * this function can summarise whether public news/pages suggest a deal has
 * been withdrawn or is still available.
 */
export async function checkDealNewsWithAi(input: DealNewsCheckInput): Promise<DealNewsCheckResult> {
  const customEndpoint = process.env.LOOP_DEAL_NEWS_SEARCH_ENDPOINT;
  const apiKey = process.env.LOOP_DEAL_NEWS_SEARCH_KEY;

  if (!customEndpoint) {
    return {
      status: "needs_admin_review",
      summary:
        "No AI/news search provider is configured. Admin should manually check the provider page, comparison sites, and recent announcements.",
      confidence: 0,
      evidenceUrls: input.sourceUrl ? [{ url: input.sourceUrl, note: "Original source URL" }] : [],
    };
  }

  try {
    const res = await fetch(customEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        query: `${input.providerName} ${input.productName} savings account withdrawn available rate`,
        providerName: input.providerName,
        productName: input.productName,
        sourceUrl: input.sourceUrl,
        reason: input.reason,
      }),
    });

    if (!res.ok) {
      return {
        status: "failed",
        summary: `AI/news search endpoint failed with HTTP ${res.status}.`,
        confidence: 0,
        evidenceUrls: [],
      };
    }

    const json = await res.json();

    return {
      status: json.status || "needs_admin_review",
      summary: json.summary || "Search completed but needs admin interpretation.",
      confidence: Number(json.confidence || 30),
      evidenceUrls: Array.isArray(json.evidenceUrls) ? json.evidenceUrls : [],
      raw: json,
    };
  } catch (error: any) {
    return {
      status: "failed",
      summary: error?.message || "AI/news search failed.",
      confidence: 0,
      evidenceUrls: [],
    };
  }
}
