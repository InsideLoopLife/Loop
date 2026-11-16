import "server-only";

// Reads a shop's product page for its name, picture and price (Open Graph tags and
// schema.org Product data). Only public web addresses are allowed: anything that resolves
// to a private, loopback or link-local address is refused, and each redirect is re-checked.
// Many large retailers block automated requests, so callers must cope with an empty result.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ProductPreview = {
  ok: boolean;
  title: string | null;
  image: string | null;
  price: number | null;
  brand: string | null;
  /** Why nothing came back, in plain words. */
  reason?: string;
};

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 7000;

function privateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const v6 = ip.toLowerCase();
    if (v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb")) return true;
    const mapped = v6.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? privateAddress(mapped[1]) : false;
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only web links work here.");
  if (url.username || url.password) throw new Error("That link can't be used.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("That link can't be used.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error("That link can't be used.");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) throw new Error("That link can't be used.");
}

function decode(text: string) {
  return text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, " ").trim();
}

function meta(html: string, keys: string[]) {
  for (const key of keys) {
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*content=["']([^"']+)["']`, "i"));
    const b = a || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${key}["']`, "i"));
    if (b?.[1]) return decode(b[1]);
  }
  return null;
}

function productFromJsonLd(html: string) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const block of blocks) {
    let parsed: unknown;
    try { parsed = JSON.parse(block.trim()); } catch { continue; }
    const queue: unknown[] = [parsed];
    while (queue.length) {
      const node = queue.shift() as any;
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node)) { queue.push(...node); continue; }
      if (node["@graph"]) queue.push(node["@graph"]);
      const type = [].concat(node["@type"] || []).map(String);
      if (type.some((t) => /product/i.test(t))) {
        const offers = [].concat(node.offers || []).flatMap((o: any) => (o?.offers ? [].concat(o.offers) : [o])) as any[];
        const price = offers.map((o) => Number(o?.price ?? o?.lowPrice)).find((n) => Number.isFinite(n) && n > 0) ?? null;
        const image = [].concat(node.image || []).map((img: any) => (typeof img === "string" ? img : img?.url)).find(Boolean) || null;
        const brand = typeof node.brand === "string" ? node.brand : node.brand?.name || null;
        return { title: node.name ? decode(String(node.name)) : null, image, price, brand: brand ? decode(String(brand)) : null };
      }
    }
  }
  return null;
}

export async function lookupProductPage(raw: string): Promise<ProductPreview> {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return { ok: false, title: null, image: null, price: null, brand: null, reason: "That doesn't look like a link." }; }
  try {
    let response: Response | null = null;
    for (let hop = 0; hop < 4; hop += 1) {
      await assertPublic(url);
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LoopHome/1.0; +https://loop-web-jf7p.onrender.com)", Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-GB,en;q=0.9" },
      });
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        url = new URL(response.headers.get("location")!, url);
        continue;
      }
      break;
    }
    if (!response || !response.ok) return { ok: false, title: null, image: null, price: null, brand: null, reason: response?.status === 403 || response?.status === 429 ? "That shop blocks automatic lookups." : "Couldn't open that page." };
    if (!/html/i.test(response.headers.get("content-type") || "")) return { ok: false, title: null, image: null, price: null, brand: null, reason: "That link isn't a web page." };
    const reader = response.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      let size = 0;
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        html += decoder.decode(value, { stream: true });
      }
      reader.cancel().catch(() => undefined);
    }
    const ld = productFromJsonLd(html);
    const title = ld?.title || meta(html, ["og:title", "twitter:title"]) || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ? decode(html.match(/<title[^>]*>([^<]+)<\/title>/i)![1]) : null);
    let image = ld?.image || meta(html, ["og:image:secure_url", "og:image", "twitter:image", "image"]);
    if (image) { try { image = new URL(image, url).toString(); } catch { image = null; } }
    if (image && !image.startsWith("https://")) image = null;
    const metaPrice = Number(meta(html, ["product:price:amount", "og:price:amount", "price"]) || NaN);
    const price = ld?.price ?? (Number.isFinite(metaPrice) && metaPrice > 0 ? metaPrice : null);
    const brand = ld?.brand || meta(html, ["product:brand", "og:brand"]);
    const cleanTitle = title ? title.replace(/\s*[|–-]\s*(Currys|Argos|AO\.com|AO|John Lewis.*|Amazon\.co\.uk.*|Very\.co\.uk|Richer Sounds)\s*$/i, "").slice(0, 120) : null;
    const ok = Boolean(cleanTitle || image || price);
    return { ok, title: cleanTitle, image, price, brand, reason: ok ? undefined : "That page didn't share product details." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { ok: false, title: null, image: null, price: null, brand: null, reason: /can't be used|Only web links/.test(message) ? message : /timeout|aborted/i.test(message) ? "That shop took too long to answer." : "Couldn't open that page." };
  }
}
