import { cleanText } from "@/lib/security/external-data";

export type PublicPageEvidence = {
  url: string;
  finalUrl: string;
  status: "static" | "structured" | "dynamic_headless" | "ai_web_fallback" | "failed";
  pageText: string;
  pageTextChars: number;
  htmlChars: number;
  jsonLd: any[];
  jsonLdSummary: string;
  images: string[];
  apiHints: Array<{ url: string; text: string }>;
  dynamicAppDetected: boolean;
  headlessAttempted: boolean;
  headlessSucceeded: boolean;
  note: string;
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractVisibleText(html: string, maxLength = 52000) {
  return cleanText(
    decodeHtml(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(?:li|p|div|section|article|h[1-6]|tr|dd|dt)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
    maxLength,
  );
}
function extractJsonLdBlocks(html: string) {
  const blocks: any[] = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    const raw = decodeHtml(match[1] || "").trim();
    if (!raw) continue;
    try { blocks.push(JSON.parse(raw)); } catch {}
  }
  return blocks.slice(0, 20);
}

function extractAttribute(tag: string, attr: string) {
  const regex = new RegExp(`${attr}=["']([^"']+)["']`, "i");
  return decodeHtml(tag.match(regex)?.[1] || "");
}

function extractImages(html: string, baseUrl: string) {
  const found = new Set<string>();
  const metaTagRegex = /<meta\b[^>]*>/gi;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = metaTagRegex.exec(html))) {
    const tag = tagMatch[0] || "";
    const prop = extractAttribute(tag, "property") || extractAttribute(tag, "name");
    if (/^(og:image|og:image:secure_url|twitter:image|twitter:image:src)$/i.test(prop)) addUrl(found, extractAttribute(tag, "content"), baseUrl);
  }
  const linkTagRegex = /<link\b[^>]*>/gi;
  while ((tagMatch = linkTagRegex.exec(html))) {
    const tag = tagMatch[0] || "";
    const rel = extractAttribute(tag, "rel");
    if (/image_src|preload/i.test(rel)) addUrl(found, extractAttribute(tag, "href") || extractAttribute(tag, "imagesrcset"), baseUrl);
  }
  const imgTagRegex = /<img\b[^>]*>/gi;
  while ((tagMatch = imgTagRegex.exec(html))) {
    const tag = tagMatch[0] || "";
    addUrl(found, extractAttribute(tag, "src"), baseUrl);
    addUrl(found, extractAttribute(tag, "data-src"), baseUrl);
    addUrl(found, extractAttribute(tag, "data-lazy-src"), baseUrl);
    addUrl(found, extractAttribute(tag, "data-original"), baseUrl);
    addUrl(found, extractAttribute(tag, "data-image"), baseUrl);
    addUrl(found, extractAttribute(tag, "data-image-src"), baseUrl);
    addUrl(found, extractAttribute(tag, "srcset"), baseUrl);
    addUrl(found, extractAttribute(tag, "data-srcset"), baseUrl);
  }
  return Array.from(found).slice(0, 16);
}

function candidateUrlPieces(candidate: string) {
  const clean = decodeHtml(candidate || "").trim();
  if (!clean || clean.startsWith("data:") || clean.startsWith("blob:") || clean.startsWith("?")) return [];
  return clean
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)
    .slice(0, 8);
}

function addUrl(set: Set<string>, candidate: string | undefined, baseUrl: string) {
  if (!candidate) return;
  for (const piece of candidateUrlPieces(candidate)) {
    try {
      const normalised = piece.startsWith("//") ? `https:${piece}` : piece;
      const url = new URL(normalised, baseUrl);
      if (url.protocol !== "https:") continue;
      const full = url.toString();
      if (/sprite|logo|icon|avatar|placeholder|transparent|blank/i.test(`${url.pathname} ${url.search}`)) continue;
      if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(full) && !/images?|media|recipe|food|product/i.test(full)) continue;
      set.add(full);
    } catch {}
  }
}

function stringifyJsonLd(blocks: any[]) {
  if (!blocks.length) return "";
  return cleanText(blocks.map((block) => JSON.stringify(block)).join("\n\n"), 14000);
}

function detectDynamicApp(html: string, visibleText: string, url: string) {
  const lower = html.toLowerCase();
  const host = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } })();
  const scriptCount = (html.match(/<script\b/gi) || []).length;
  return (
    visibleText.length < 900 && scriptCount >= 8
  ) || /tenkites|viewthe\.menu|data-reactroot|__next_data__|id=["']root["']|id=["']app["']|vite|webpack|nuxt|gatsby/.test(lower) || /viewthe\.menu|tenkites/i.test(host);
}

async function fetchStaticEvidence(url: string): Promise<{ html: string; finalUrl: string; ok: boolean; statusCode?: number }> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "LoopHealth nutrition importer/1.0 (+private household nutrition tracker)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
      },
      signal: AbortSignal.timeout(12000),
    });
    const text = await response.text().catch(() => "");
    return { html: text, finalUrl: response.url || url, ok: response.ok, statusCode: response.status };
  } catch {
    return { html: "", finalUrl: url, ok: false };
  }
}

async function renderWithOptionalHeadless(url: string): Promise<Partial<PublicPageEvidence> | null> {
  if (process.env.LOOP_ENABLE_HEADLESS_IMPORTS !== "true") return null;
  try {
    // Optional runtime import. The app still builds without Playwright installed.
    const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<any>;
    const playwright = await dynamicImport("playwright");
    const chromium = playwright.chromium;
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage({
      userAgent: "LoopHealth nutrition importer/1.0 (+private household nutrition tracker)",
    });
    const apiHints: Array<{ url: string; text: string }> = [];
    page.on("response", async (response: any) => {
      try {
        const responseUrl = String(response.url() || "");
        const contentType = String(response.headers()?.["content-type"] || "");
        if (!/json|text|xml/i.test(contentType)) return;
        if (!/menu|product|catalog|allergen|ingredient|nutrition|item|api|tenkites/i.test(responseUrl)) return;
        const text = cleanText(await response.text(), 5000);
        if (text) apiHints.push({ url: responseUrl.slice(0, 700), text });
      } catch {}
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: Number(process.env.LOOP_HEADLESS_IMPORT_TIMEOUT_MS || 25000) });
    const bodyText = cleanText(await page.locator("body").innerText({ timeout: 8000 }).catch(() => ""), 24000);
    const html = await page.content().catch(() => "");
    const finalUrl = page.url() || url;
    await browser.close();
    return {
      finalUrl,
      status: bodyText.length > 500 || apiHints.length ? "dynamic_headless" : "ai_web_fallback",
      pageText: bodyText || extractVisibleText(html),
      pageTextChars: (bodyText || extractVisibleText(html)).length,
      htmlChars: html.length,
      jsonLd: extractJsonLdBlocks(html),
      jsonLdSummary: stringifyJsonLd(extractJsonLdBlocks(html)),
      images: extractImages(html, finalUrl),
      apiHints: apiHints.slice(0, 20),
      dynamicAppDetected: true,
      headlessAttempted: true,
      headlessSucceeded: bodyText.length > 500 || apiHints.length > 0,
      note: bodyText.length > 500 || apiHints.length
        ? "Rendered the JavaScript page with a headless browser and captured visible text/network hints."
        : "Headless browser ran but did not expose enough menu data, so AI/web extraction is still needed.",
    };
  } catch (error) {
    return {
      status: "ai_web_fallback",
      headlessAttempted: true,
      headlessSucceeded: false,
      note: `Dynamic page detected, but headless rendering is not available in this deployment. ${error instanceof Error ? error.message : ""}`.trim(),
    };
  }
}

export async function getPublicPageEvidence(url: string): Promise<PublicPageEvidence> {
  const staticResult = await fetchStaticEvidence(url);
  const html = staticResult.html || "";
  const pageText = extractVisibleText(html);
  const jsonLd = extractJsonLdBlocks(html);
  const dynamicAppDetected = detectDynamicApp(html, pageText, staticResult.finalUrl);

  if (dynamicAppDetected) {
    const headless = await renderWithOptionalHeadless(staticResult.finalUrl || url);
    if (headless?.headlessSucceeded) {
      return {
        url,
        finalUrl: String(headless.finalUrl || staticResult.finalUrl || url),
        status: "dynamic_headless",
        pageText: String(headless.pageText || ""),
        pageTextChars: Number(headless.pageTextChars || 0),
        htmlChars: Number(headless.htmlChars || html.length),
        jsonLd: Array.isArray(headless.jsonLd) ? headless.jsonLd : jsonLd,
        jsonLdSummary: String(headless.jsonLdSummary || stringifyJsonLd(jsonLd)),
        images: Array.isArray(headless.images) ? headless.images : extractImages(html, staticResult.finalUrl || url),
        apiHints: Array.isArray(headless.apiHints) ? headless.apiHints : [],
        dynamicAppDetected: true,
        headlessAttempted: Boolean(headless.headlessAttempted),
        headlessSucceeded: true,
        note: String(headless.note || "Rendered dynamic page with headless browser."),
      };
    }
    return {
      url,
      finalUrl: staticResult.finalUrl || url,
      status: jsonLd.length || pageText.length > 1200 ? "static" : "ai_web_fallback",
      pageText,
      pageTextChars: pageText.length,
      htmlChars: html.length,
      jsonLd,
      jsonLdSummary: stringifyJsonLd(jsonLd),
      images: extractImages(html, staticResult.finalUrl || url),
      apiHints: [],
      dynamicAppDetected: true,
      headlessAttempted: Boolean(headless?.headlessAttempted),
      headlessSucceeded: false,
      note: headless?.note || "Dynamic JavaScript menu detected. Static HTML was sparse, so AI/web extraction will be used unless headless imports are enabled.",
    };
  }

  const status: PublicPageEvidence["status"] = jsonLd.length ? "structured" : pageText.length > 600 ? "static" : staticResult.ok ? "ai_web_fallback" : "failed";
  return {
    url,
    finalUrl: staticResult.finalUrl || url,
    status,
    pageText,
    pageTextChars: pageText.length,
    htmlChars: html.length,
    jsonLd,
    jsonLdSummary: stringifyJsonLd(jsonLd),
    images: extractImages(html, staticResult.finalUrl || url),
    apiHints: [],
    dynamicAppDetected: false,
    headlessAttempted: false,
    headlessSucceeded: false,
    note: status === "structured"
      ? "Structured JSON-LD evidence was found in the page."
      : status === "static"
        ? "Readable page text was found in the server-rendered HTML."
        : "The public page exposed limited readable text, so AI/web extraction is needed.",
  };
}

