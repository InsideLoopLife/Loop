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
    .replace(/&gt;/g, " ");
}

function meta(html: string, names: string[]) {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
    const match = html.match(re);
    if (match?.[1]) return unescapeHtml(match[1].trim());
  }
  return null;
}

function jsonLd(html: string): unknown[] {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const parsed: unknown[] = [];

  for (const block of blocks) {
    try {
      parsed.push(JSON.parse(block[1].trim()));
    } catch {
      // ignore
    }
  }

  return parsed;
}

function productFromJsonLd(items: unknown[]): any | null {
  const q = [...items] as any[];
  while (q.length) {
    const item = q.shift();
    if (!item) continue;
    if (Array.isArray(item)) {
      q.push(...item);
      continue;
    }
    if (typeof item === "object") {
      const type = item["@type"];
      if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) return item;
      if (item["@graph"]) q.push(...item["@graph"]);
    }
  }
  return null;
}

function textNearHeading(html: string, headings: string[]) {
  const clean = html.replace(/\s+/g, " ");
  for (const heading of headings) {
    const re = new RegExp(`<[^>]*>\\s*${heading}\\s*<\\/[^>]+>([\\s\\S]{0,3000})`, "i");
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

export async function fetchProductSourceSnapshot(sourceUrl: string): Promise<ProductSourceHarvest> {
  const res = await fetch(sourceUrl, {
    headers: {
      "user-agent": "InsideLoopBot/0.1 (+https://insideloop.life)",
      "accept": "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`Could not fetch product source: ${res.status}`);

  const html = await res.text();
  const product = productFromJsonLd(jsonLd(html));
  const host = hostFromUrl(sourceUrl);
  const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const image = Array.isArray(product?.image) ? product.image[0] : product?.image;

  const priceText = offer?.price || meta(html, ["product:price:amount", "og:price:amount"]);
  const priceAmount = priceText ? Number(String(priceText).replace(/[^0-9.]/g, "")) : null;

  return {
    sourceUrl,
    sourceHost: host,
    retailerName: host,
    formalName:
      product?.name ||
      meta(html, ["og:title", "twitter:title"]) ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
      null,
    mainImageUrl: image || meta(html, ["og:image", "twitter:image"]),
    priceAmount: Number.isFinite(priceAmount) ? priceAmount : null,
    priceCurrency: offer?.priceCurrency || meta(html, ["product:price:currency", "og:price:currency"]) || "GBP",
    priceText: priceText ? String(priceText) : null,
    ingredientsText: textNearHeading(html, ["Ingredients", "Ingredient"]),
    allergensText: textNearHeading(html, ["Allergens", "Allergen", "Allergy Advice"]),
    nutritionText: textNearHeading(html, ["Nutrition", "Nutritional Information", "Typical Values"]),
    confidence: product ? 82 : 65,
    raw: {
      jsonLdProductFound: Boolean(product),
      ogTitle: meta(html, ["og:title"]),
      ogImage: meta(html, ["og:image"]),
    },
  };
}
