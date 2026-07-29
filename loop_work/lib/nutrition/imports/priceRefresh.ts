import { fetchProductSourceSnapshot } from "@/lib/nutrition/v27_67/sourceHarvest";

export type PriceRefreshResult = {
  ok: boolean;
  source_url: string;
  price_amount?: number | null;
  price_currency?: string | null;
  price_text?: string | null;
  main_image_url?: string | null;
  retailer_name?: string | null;
  formal_name?: string | null;
  error?: string;
};

export async function refreshProductPriceAndImage(sourceUrl: string): Promise<PriceRefreshResult> {
  try {
    const snapshot = await fetchProductSourceSnapshot(sourceUrl);
    return {
      ok: true,
      source_url: sourceUrl,
      price_amount: snapshot.priceAmount ?? null,
      price_currency: snapshot.priceCurrency || "GBP",
      price_text: snapshot.priceText || null,
      main_image_url: snapshot.mainImageUrl || null,
      retailer_name: snapshot.retailerName || snapshot.sourceHost || null,
      formal_name: snapshot.formalName || null,
    };
  } catch (error: any) {
    return {
      ok: false,
      source_url: sourceUrl,
      error: error?.message || "Price refresh failed.",
    };
  }
}

/**
 * Important: this does not bypass anti-bot systems.
 * Use retailer APIs/feeds where possible. The cron route should run slowly,
 * cache results, and record failures rather than retry aggressively.
 */
export function nextPriceRefreshDue(lastObservedAt?: string | null) {
  if (!lastObservedAt) return true;
  const last = new Date(lastObservedAt).getTime();
  return Date.now() - last > 1000 * 60 * 60 * 12; // 12 hours
}
