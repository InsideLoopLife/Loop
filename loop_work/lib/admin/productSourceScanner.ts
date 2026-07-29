export type ProductSourceScanResult = {
  sourceUrl: string;
  status: "ok" | "needs_review" | "failed" | "blocked";
  title?: string | null;
  productName?: string | null;
  brandName?: string | null;
  imageUrl?: string | null;
  priceText?: string | null;
  ingredientsText?: string | null;
  nutritionText?: string | null;
  candidateProductUrls?: string[];
  confidence: number;
  missingFields: string[];
  sourceSnapshot: Record<string, unknown>;
  error?: string;
};

function absUrl(base: string, href?: string | null) {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html: string, names: string[]) {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
    const match = html.match(re);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function titleFromHtml(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function firstImage(html: string, base: string) {
  const og = meta(html, ["og:image", "twitter:image"]);
  if (og) return absUrl(base, og);
  const img = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1];
  return absUrl(base, img);
}

function extractJsonLd(html: string) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const parsed: any[] = [];
  for (const block of blocks) {
    try {
      const json = JSON.parse(block[1].trim());
      if (Array.isArray(json)) parsed.push(...json);
      else parsed.push(json);
    } catch {
      // ignore malformed site JSON-LD
    }
  }
  return parsed;
}

function discoverLinks(html: string, base: string) {
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)]
    .map((m) => absUrl(base, m[1]))
    .filter(Boolean) as string[];

  const productish = links.filter((url) =>
    /product|products|groceries|shop|p\//i.test(url)
    && !/login|basket|checkout|account|help|privacy|terms/i.test(url)
  );

  return [...new Set(productish)].slice(0, 100);
}

export async function scanProductSourceUrl(sourceUrl: string): Promise<ProductSourceScanResult> {
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": process.env.LOOP_PRODUCT_IMPORT_USER_AGENT || "InsideLoopProductImport/0.1 (support@insideloop.life)",
      },
      cache: "no-store",
    });

    if ([401, 403, 429].includes(res.status)) {
      return {
        sourceUrl,
        status: "blocked",
        confidence: 0,
        missingFields: ["page_access"],
        sourceSnapshot: { httpStatus: res.status },
        error: `Source blocked/rate-limited with HTTP ${res.status}. Use feed/API/manual review.`,
      };
    }

    if (!res.ok) {
      return {
        sourceUrl,
        status: "failed",
        confidence: 0,
        missingFields: ["page_access"],
        sourceSnapshot: { httpStatus: res.status },
        error: `HTTP ${res.status}`,
      };
    }

    const html = await res.text();
    const text = stripHtml(html);
    const jsonLd = extractJsonLd(html);
    const productLd = jsonLd.find((item) => {
      const type = Array.isArray(item["@type"]) ? item["@type"].join(" ") : item["@type"];
      return /Product/i.test(String(type || ""));
    });

    const title = meta(html, ["og:title", "twitter:title"]) || titleFromHtml(html);
    const productName = productLd?.name || title;
    const brandName =
      (typeof productLd?.brand === "string" ? productLd.brand : productLd?.brand?.name)
      || meta(html, ["product:brand", "og:site_name"]);
    const imageUrl =
      (Array.isArray(productLd?.image) ? productLd.image[0] : productLd?.image)
      || firstImage(html, sourceUrl);
    const priceText =
      productLd?.offers?.price
      ? `${productLd.offers.priceCurrency || ""} ${productLd.offers.price}`.trim()
      : meta(html, ["product:price:amount", "og:price:amount"]);

    const lowerText = text.toLowerCase();
    const ingredientsIndex = lowerText.indexOf("ingredients");
    const nutritionIndex = lowerText.indexOf("nutrition");

    const ingredientsText = ingredientsIndex >= 0 ? text.slice(ingredientsIndex, ingredientsIndex + 1200) : null;
    const nutritionText = nutritionIndex >= 0 ? text.slice(nutritionIndex, nutritionIndex + 1600) : null;

    const candidateProductUrls = discoverLinks(html, sourceUrl);
    const missingFields = [
      productName ? null : "name",
      imageUrl ? null : "image",
      ingredientsText ? null : "ingredients",
      nutritionText ? null : "nutrition",
    ].filter(Boolean) as string[];

    const confidence =
      25
      + (productName ? 20 : 0)
      + (imageUrl ? 15 : 0)
      + (priceText ? 10 : 0)
      + (ingredientsText ? 15 : 0)
      + (nutritionText ? 15 : 0);

    return {
      sourceUrl,
      status: missingFields.length ? "needs_review" : "ok",
      title,
      productName,
      brandName,
      imageUrl,
      priceText,
      ingredientsText,
      nutritionText,
      candidateProductUrls,
      confidence: Math.min(90, confidence),
      missingFields,
      sourceSnapshot: {
        httpStatus: res.status,
        jsonLdCount: jsonLd.length,
        productLd,
        textSample: text.slice(0, 2000),
      },
    };
  } catch (error: any) {
    return {
      sourceUrl,
      status: "failed",
      confidence: 0,
      missingFields: ["scan_failed"],
      sourceSnapshot: {},
      error: error?.message || "Product source scan failed.",
    };
  }
}
