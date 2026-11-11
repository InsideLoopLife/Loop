// HM Land Registry UK House Price Index for the home's area: the average
// price, how it has moved over the year, and an index-based value for the
// home (purchase price grown by the area index for its property type).
// Free, no key; published monthly about two months behind. Cached a day.

export type AreaPrices = {
  region: string;
  month: string;
  averagePrice: number;
  annualChange: number | null;
  typeLabel: string | null;
  typeAveragePrice: number | null;
  typeAnnualChange: number | null;
  /** Purchase price × (index now ÷ index at purchase), when both are known. */
  indexValue: number | null;
  sourceUrl: string;
};

const TYPE_KEYS: Array<[RegExp, string, string]> = [
  [/semi/i, "SemiDetached", "semi-detached"],
  [/detached/i, "Detached", "detached"],
  [/terrace/i, "Terraced", "terraced"],
  [/flat|maisonette|apartment/i, "FlatMaisonette", "flats"],
];

const slug = (value: string) => value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function month(region: string, ym: string) {
  try {
    const res = await fetch(`https://landregistry.data.gov.uk/data/ukhpi/region/${region}/month/${ym}.json`, {
      headers: { accept: "application/json", "user-agent": "LOOP house prices (insideloop.life)" },
      next: { revalidate: 24 * 60 * 60 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.result?.primaryTopic ?? null) as Record<string, any> | null;
  } catch {
    return null;
  }
}

const ymBack = (months: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export async function loadAreaPrices(home: {
  city?: string | null;
  property_type?: string | null;
  purchase_date?: string | null;
  purchase_price?: number | string | null;
}): Promise<AreaPrices | null> {
  if (!home.city) return null;
  const region = slug(home.city);
  let latest: Record<string, any> | null = null;
  let latestMonth = "";
  for (let back = 1; back <= 5 && !latest; back++) {
    latestMonth = ymBack(back);
    latest = await month(region, latestMonth);
    if (latest && !Number(latest.averagePrice)) latest = null;
  }
  if (!latest) return null;

  const type = TYPE_KEYS.find(([pattern]) => pattern.test(String(home.property_type || "")));
  const typeKey = type?.[1] ?? null;
  const indexKey = typeKey ? `housePriceIndex${typeKey}` : "housePriceIndex";

  let indexValue: number | null = null;
  const purchasePrice = Number(home.purchase_price || 0);
  const purchaseMonth = String(home.purchase_date || "").slice(0, 7);
  if (purchasePrice > 0 && /^\d{4}-\d{2}$/.test(purchaseMonth)) {
    const then = await month(region, purchaseMonth);
    const indexThen = Number(then?.[indexKey] || then?.housePriceIndex || 0);
    const indexNow = Number(latest[indexKey] || latest.housePriceIndex || 0);
    if (indexThen > 0 && indexNow > 0) indexValue = Math.round((purchasePrice * indexNow) / indexThen / 1000) * 1000;
  }

  const label = Array.isArray(latest.refRegion?.label) ? latest.refRegion.label[0]?._value : null;
  return {
    region: label || home.city,
    month: latestMonth,
    averagePrice: Number(latest.averagePrice),
    annualChange: latest.percentageAnnualChange != null ? Number(latest.percentageAnnualChange) : null,
    typeLabel: type?.[2] ?? null,
    typeAveragePrice: typeKey && latest[`averagePrice${typeKey}`] != null ? Number(latest[`averagePrice${typeKey}`]) : null,
    typeAnnualChange: typeKey && latest[`percentageAnnualChange${typeKey}`] != null ? Number(latest[`percentageAnnualChange${typeKey}`]) : null,
    indexValue,
    sourceUrl: `https://landregistry.data.gov.uk/app/ukhpi/browse?location=http%3A%2F%2Flandregistry.data.gov.uk%2Fid%2Fregion%2F${region}`,
  };
}
