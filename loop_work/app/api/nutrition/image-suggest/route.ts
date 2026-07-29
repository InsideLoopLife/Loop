import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { enforceUserRateLimit } from "@/lib/security/rate-limit";
import { cleanText } from "@/lib/security/external-data";

function extractTextFromResponse(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function parseJsonLoose(text: string) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch {}
  }
  return null;
}

function imageSearchUrl(label: string) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(label)}`;
}

function cleanImageUrl(value: unknown) {
  const raw = cleanText(value || "", 800);
  if (!/^https?:\/\//i.test(raw)) return null;
  if (/google\.com\/search|bing\.com\/images|duckduckgo\.com/i.test(raw)) return null;
  if (!/\.(png|jpe?g|webp|avif)(\?|$)/i.test(raw) && !/cdn|images|media|shop|product|image/i.test(raw)) return null;
  return raw;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 8_000) return NextResponse.json({ error: "Image request is too large." }, { status: 413 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limit = await enforceUserRateLimit({ userId: user.id, bucket: "nutrition_image_suggest", limit: 80, windowSeconds: 60 * 60 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many image lookups. Try again shortly.", resetAt: limit.resetAt }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const label = cleanText(body.label || body.imagePrompt || "food", 180) || "food";
  const sourceUrl = cleanText(body.sourceUrl || "", 600);
  const searchUrl = imageSearchUrl(label);

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  if (!secret?.value) {
    return NextResponse.json({ image_url: null, search_url: searchUrl, note: "No OpenAI token is saved, so open image search and paste the preferred image URL." });
  }

  const prompt = `Find a suitable public image URL for this private household food diary entry: "${label}".
${sourceUrl ? `Preferred source page: ${sourceUrl}` : ""}

Return ONLY JSON: {"image_url":"https://...","source_url":"https://...","confidence":0-100,"reason":"short"}.
Use a direct product/food image where possible, preferably from the brand, retailer, recipe page or Wikimedia-style public source. Do not return a Google/Bing search results URL. If you cannot find a direct image, return image_url as null.`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
      body: JSON.stringify({ model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini", tools: [{ type: "web_search_preview" }], input: prompt }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || "Image search failed");
    const parsed = parseJsonLoose(extractTextFromResponse(payload)) || {};
    return NextResponse.json({
      image_url: cleanImageUrl(parsed.image_url),
      source_url: cleanText(parsed.source_url || "", 600) || null,
      confidence: Number(parsed.confidence || 0),
      reason: cleanText(parsed.reason || "", 300) || null,
      search_url: searchUrl,
      note: cleanImageUrl(parsed.image_url) ? "Image suggestion found. Check it looks right, then save." : "No direct image URL found; open image search and paste the preferred image URL.",
    });
  } catch (error) {
    return NextResponse.json({ image_url: null, search_url: searchUrl, note: `Image lookup fell back to manual search. ${error instanceof Error ? error.message : ""}`.trim() });
  }
}
