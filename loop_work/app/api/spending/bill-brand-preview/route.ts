import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";

const COMMON_BRAND_DOMAINS: { match: RegExp; brandName: string; domain: string }[] = [
  { match: /spotify/i, brandName: "Spotify", domain: "spotify.com" },
  { match: /netflix/i, brandName: "Netflix", domain: "netflix.com" },
  { match: /apple|icloud/i, brandName: "Apple", domain: "apple.com" },
  { match: /barclays/i, brandName: "Barclays", domain: "barclays.co.uk" },
  { match: /ecologi/i, brandName: "Ecologi", domain: "ecologi.com" },
  { match: /omaze/i, brandName: "Omaze", domain: "omaze.co.uk" },
  { match: /postcode lottery|people.?s postcode/i, brandName: "People's Postcode Lottery", domain: "postcodelottery.co.uk" },
  { match: /volkswagen|\bvw\b/i, brandName: "Volkswagen", domain: "volkswagen.co.uk" },
  { match: /plum/i, brandName: "Plum", domain: "withplum.com" },
  { match: /cottontails/i, brandName: "Cottontails", domain: "cottontailsdaynursery.co.uk" },
];

function normaliseDomain(value: string | null | undefined) {
  const clean = String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .replace(/[^a-z0-9.-]/g, "")
    .trim();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean) ? clean : null;
}

function logoUrlForDomain(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

function guessBrandFromLabel(label: string) {
  const hit = COMMON_BRAND_DOMAINS.find((entry) => entry.match.test(label));
  if (!hit) return null;
  return { brandName: hit.brandName, domain: hit.domain, logoUrl: logoUrlForDomain(hit.domain), source: "known_brand" };
}

export async function GET(request: NextRequest) {
  const label = String(request.nextUrl.searchParams.get("label") || "").trim().slice(0, 120);
  if (label.length < 2) return NextResponse.json({ brand: null });

  const local = guessBrandFromLabel(label);
  if (local) return NextResponse.json({ brand: local });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ brand: null }, { status: 401 });

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  if (!secret?.value) return NextResponse.json({ brand: null, needsToken: true });

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
      body: JSON.stringify({
        model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
        tools: [{ type: "web_search_preview" }],
        input: [{
          role: "user",
          content: [{
            type: "input_text",
            text: `Find the official consumer-facing brand/domain for this household bill or subscription label: "${label}". Return JSON only with keys brandName, domain and confidence. The domain must be the official website host only. If uncertain, return confidence below 0.6.`,
          }],
        }],
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ brand: null });

    const text = String(payload.output_text || payload.output?.flatMap?.((item: { content?: { text?: string }[] }) => item.content?.map((content) => content.text) || []).join("\n") || "");
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0] || "";
    if (!jsonText) return NextResponse.json({ brand: null });

    const parsed = JSON.parse(jsonText) as { brandName?: string; domain?: string; confidence?: number };
    const domain = normaliseDomain(parsed.domain);
    const confidence = Number(parsed.confidence ?? 0);
    if (!domain || confidence < 0.55) return NextResponse.json({ brand: null });

    return NextResponse.json({
      brand: {
        brandName: String(parsed.brandName || label).slice(0, 80),
        domain,
        logoUrl: logoUrlForDomain(domain),
        source: "openai_web_search",
      },
    });
  } catch {
    return NextResponse.json({ brand: null });
  }
}
