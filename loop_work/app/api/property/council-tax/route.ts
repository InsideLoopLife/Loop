// GET /api/property/council-tax?postcode=SW1A1AA
// Finds the council for a postcode (postcodes.io) and returns this year's
// charge for every band from loop_council_tax_rate_estimates, falling back to
// the national average. Used by guided setup's "Your home" step.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estimateBand, lookupPostcode, lookupSoldPrices } from "@/lib/property/estimate";
import { BAND_RATIOS, quoteCouncilTax } from "@/lib/property/council-tax-rates";

function countryCode(country?: string | null) {
  const c = String(country || "").toLowerCase();
  if (c.includes("wales")) return "WLS";
  if (c.includes("scotland")) return "SCT";
  if (c.includes("northern ireland")) return "NIR";
  return "ENG";
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const postcode = String(request.nextUrl.searchParams.get("postcode") || "").trim();
  if (postcode.replace(/\s/g, "").length < 5) return NextResponse.json({ error: "Enter a full postcode." }, { status: 400 });

  const place = await lookupPostcode(postcode).catch(() => null);
  if (!place) return NextResponse.json({ error: "We couldn't find that postcode." }, { status: 404 });

  const country = countryCode(place.country);
  const authorityCode = place.codes?.admin_district || null;
  const authorityName = place.admin_district || null;
  if (country === "NIR") {
    // Northern Ireland uses domestic rates, not council tax bands.
    return NextResponse.json({ postcode: place.postcode, country, authorityName, bands: [], note: "Northern Ireland uses domestic rates rather than council tax. Add your rates bill as a regular bill." });
  }

  // A starting guess from recent sales in the same postcode (HM Land Registry),
  // run through the same band logic the property estimate uses. Only offered
  // when there are real sales to base it on.
  const sold = await lookupSoldPrices(place.postcode || postcode).catch(() => null);
  const guess = sold?.medianPricePence
    ? estimateBand({ currentValuePence: sold.medianPricePence, countryCode: country, region: place.region, comparableCount: sold.count })
    : null;

  const bands = [];
  for (const band of Object.keys(BAND_RATIOS[country] || BAND_RATIOS.ENG)) {
    const quote = await quoteCouncilTax(supabase as any, { band, countryCode: country, authorityCode, authorityName });
    if (quote) bands.push({ band, annual: quote.annualPence / 100, monthly: quote.monthlyPence / 100, source: quote.source, chargeYear: quote.chargeYear });
  }

  return NextResponse.json({
    postcode: place.postcode,
    country,
    authorityCode,
    authorityName,
    region: place.region || null,
    latitude: place.latitude ?? null,
    longitude: place.longitude ?? null,
    bands,
    suggested: guess ? { band: guess.band, low: guess.bandLow, high: guess.bandHigh, salesCount: sold?.count || 0, medianPrice: Math.round((sold?.medianPricePence || 0) / 100) } : null,
    source: bands[0]?.source || null,
    chargeYear: bands[0]?.chargeYear || null,
  });
}
