export type ProductSourceHarvest = {
  sourceUrl: string;
  sourceHost?: string | null;
  retailerName?: string | null;
  formalName?: string | null;
  mainImageUrl?: string | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  priceText?: string | null;
  ingredientsText?: string | null;
  allergensText?: string | null;
  nutritionText?: string | null;
  confidence: number;
  raw: Record<string, unknown>;
};

function hostFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function unescapeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function firstMeta(html: string, names: string[]) {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
    const match = html.match(re);
    if (match?.[1]) return unescapeHtml(match[1].trim());
  }
  return null;
}

function extractJsonLd(html: string): unknown[] {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const parsed: unknown[] = [];

  for (const block of blocks) {
    try {
      parsed.push(JSON.parse(block[1].trim()));
    } catch {
      // ignore malformed JSON-LD
    }
  }

  return parsed;
}

function findProductJsonLd(items: unknown[]): any | null {
  const queue = [...items] as any[];
  while (queue.length) {
    const item = queue.shift();
    if (!item) continue;
    if (Array.isArray(item)) {
      queue.push(...item);
      continue;
    }
    if (typeof item === "object") {
      const type = item["@type"];
      if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) return item;
      if (item["@graph"]) queue.push(...item["@graph"]);
    }
  }
  return null;
}

function extractTextNearHeading(html: string, headings: string[]) {
  const clean = html.replace(/\s+/g, " ");
  for (const heading of headings) {
    const re = new RegExp(`<[^>]*>\\s*${heading}\\s*<\\/[^>]+>([\\s\\S]{0,2500})`, "i");
    const match = clean.match(re);
    if (!match) continue;
    const text = match[1]
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) return unescapeHtml(text);
  }
  return null;
}

/**
 * Server-only helper. Use from a route handler / server action.
 * It does not need cheerio. It extracts:
 * - formal product name from JSON-LD / og:title / title
 * - image from JSON-LD / og:image
 * - price from JSON-LD offers / product meta
 * - ingredients/allergen/nutrition text from nearby page sections
 */
export async function fetchProductSourceSnapshot(sourceUrl: string): Promise<ProductSourceHarvest> {
  const res = await fetch(sourceUrl, {
    headers: {
      "user-agent": "InsideLoopBot/0.1 (+https://insideloop.life)",
      "accept": "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Could not fetch product source: ${res.status}`);
  }

  const html = await res.text();
  const jsonLd = extractJsonLd(html);
  const product = findProductJsonLd(jsonLd);

  const formalName =
    product?.name ||
    firstMeta(html, ["og:title", "twitter:title"]) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
    null;

  const productImage = Array.isArray(product?.image) ? product.image[0] : product?.image;
  const mainImageUrl = productImage || firstMeta(html, ["og:image", "twitter:image"]);

  const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const priceText =
    offer?.price ||
    firstMeta(html, ["product:price:amount", "og:price:amount"]) ||
    null;

  const priceAmount = priceText ? Number(String(priceText).replace(/[^0-9.]/g, "")) : null;
  const priceCurrency =
    offer?.priceCurrency ||
    firstMeta(html, ["product:price:currency", "og:price:currency"]) ||
    "GBP";

  const ingredientsText = extractTextNearHeading(html, ["Ingredients", "Ingredient"]);
  const allergensText = extractTextNearHeading(html, ["Allergens", "Allergen", "Allergy Advice"]);
  const nutritionText = extractTextNearHeading(html, ["Nutrition", "Nutritional Information", "Typical Values"]);

  return {
    sourceUrl,
    sourceHost: hostFromUrl(sourceUrl),
    retailerName: hostFromUrl(sourceUrl),
    formalName: formalName ? unescapeHtml(String(formalName)) : null,
    mainImageUrl: mainImageUrl ? String(mainImageUrl) : null,
    priceAmount: Number.isFinite(priceAmount) ? priceAmount : null,
    priceCurrency: priceCurrency ? String(priceCurrency) : "GBP",
    priceText: priceText ? String(priceText) : null,
    ingredientsText,
    allergensText,
    nutritionText,
    confidence: product ? 82 : 65,
    raw: {
      jsonLdProductFound: Boolean(product),
      ogTitle: firstMeta(html, ["og:title"]),
      ogImage: firstMeta(html, ["og:image"]),
    },
  };
}
