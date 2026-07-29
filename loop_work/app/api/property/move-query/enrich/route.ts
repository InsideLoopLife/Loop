import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildMoveAssumptions, estimateCouncilTaxAnnual, fetchSourceText, parseMoveListingFromSource } from "@/lib/wealth/source-ingestion";

function compactPostcode(value: string) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function mapEmbedFromLatLon(lat: number, lon: number) {
  const delta = 0.01;
  const bbox = [lon - delta, lat - delta, lon + delta, lat + delta].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`;
}

async function lookupPostcodeContext(postcode: string | null) {
  if (!postcode) return null;
  try {
    const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(compactPostcode(postcode))}`, {
      headers: { accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 * 14 },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const result = data?.result;
    if (!result) return null;
    const lat = typeof result.latitude === "number" ? result.latitude : null;
    const lon = typeof result.longitude === "number" ? result.longitude : null;
    return {
      postcode: result.postcode || postcode,
      authority: result.admin_district || result.parish || result.admin_county || null,
      region: result.region || null,
      latitude: lat,
      longitude: lon,
      mapEmbedUrl: lat !== null && lon !== null ? mapEmbedFromLatLon(lat, lon) : null,
      councilLookupUrl: `https://www.gov.uk/pay-council-tax/${encodeURIComponent(compactPostcode(postcode))}`,
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const url = String(body?.url || "").trim();
  if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });

  try {
    const source = await fetchSourceText(url);
    const parsed = parseMoveListingFromSource({ sourceUrl: source.url, text: source.text, rawText: source.rawText, fallbackPrice: Number(body?.asking_price || 0) || null });
    const postcodeContext = await lookupPostcodeContext(parsed.postcode);
    const councilEstimate = estimateCouncilTaxAnnual({ band: parsed.councilTaxBand, authority: postcodeContext?.authority });
    const additionalProperty = ["second_home", "buy_to_let"].includes(String(body?.purchase_context || ""));
    const assumptions = buildMoveAssumptions({
      askingPrice: parsed.askingPrice,
      targetDeposit: Number(body?.target_deposit || 0),
      expectedRate: Number(body?.expected_rate || 4.75),
      expectedTermYears: Number(body?.expected_term_years || 30),
      epcRating: parsed.epcRating,
      councilTaxBand: parsed.councilTaxBand,
      councilTaxAuthority: postcodeContext?.authority,
      additionalProperty,
    });
    return NextResponse.json({
      ok: true,
      parsed: {
        ...parsed,
        title: parsed.cleanTitle || parsed.title,
        postcode: postcodeContext?.postcode || parsed.postcode,
        councilTaxSourceUrl: councilEstimate.sourceUrl || postcodeContext?.councilLookupUrl || null,
        councilTaxAuthority: councilEstimate.authority || postcodeContext?.authority || null,
        councilTaxEstimateConfidence: councilEstimate.confidence,
        mapLatitude: postcodeContext?.latitude || null,
        mapLongitude: postcodeContext?.longitude || null,
        mapEmbedUrl: postcodeContext?.mapEmbedUrl || null,
      },
      assumptions: {
        ...assumptions,
        councilTaxAnnual: councilEstimate.annual || assumptions.councilTaxAnnual,
        councilTaxSourceUrl: councilEstimate.sourceUrl || postcodeContext?.councilLookupUrl || null,
        councilTaxAuthority: councilEstimate.authority || postcodeContext?.authority || null,
        councilTaxEstimateConfidence: councilEstimate.confidence || assumptions.councilTaxEstimateConfidence,
        mapLatitude: postcodeContext?.latitude || null,
        mapLongitude: postcodeContext?.longitude || null,
        mapEmbedUrl: postcodeContext?.mapEmbedUrl || null,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Could not enrich listing" }, { status: 500 });
  }
}
