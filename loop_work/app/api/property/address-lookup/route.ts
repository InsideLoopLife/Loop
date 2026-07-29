import { NextResponse } from "next/server";

function normalisePostcode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function compactPostcode(value: string) {
  return normalisePostcode(value).replace(/\s+/g, "");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const postcode = normalisePostcode(searchParams.get("postcode") || "");
  const houseNumber = String(searchParams.get("houseNumber") || "").trim();

  if (!postcode) {
    return NextResponse.json({ error: "Enter a postcode first." }, { status: 400 });
  }

  const result = {
    houseNumber,
    postcode,
    fullAddress: [houseNumber, postcode].filter(Boolean).join(" "),
    addressLine: houseNumber || null,
    city: null as string | null,
    region: null as string | null,
    country: "United Kingdom",
    latitude: null as number | null,
    longitude: null as number | null,
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([houseNumber, postcode].filter(Boolean).join(" "))}`,
    purchasePrice: null as number | null,
    purchaseDate: null as string | null,
    lookupSource: "postcode_geocode",
    lastLookupAt: new Date().toISOString().slice(0, 10),
    sourceNotes: [
      "Postcode geocoding is automatic.",
      "Exact purchase price/date needs HM Land Registry Price Paid import, PropertyData, or manual entry.",
    ],
    landRegistrySearchUrl: `https://landregistry.data.gov.uk/app/ppd/?postcode=${encodeURIComponent(postcode)}${houseNumber ? `&paon=${encodeURIComponent(houseNumber)}` : ""}`,
  };

  try {
    const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(compactPostcode(postcode))}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 * 7 },
    });

    if (response.ok) {
      const data = await response.json();
      const p = data?.result;
      if (p) {
        result.postcode = p.postcode || postcode;
        result.city = p.admin_district || p.parish || p.nuts || null;
        result.region = p.region || p.admin_county || null;
        result.country = p.country || "United Kingdom";
        result.latitude = typeof p.latitude === "number" ? p.latitude : null;
        result.longitude = typeof p.longitude === "number" ? p.longitude : null;
        result.fullAddress = [houseNumber, p.postcode || postcode].filter(Boolean).join(" ");
        result.mapUrl = result.latitude && result.longitude
          ? `https://www.google.com/maps/search/?api=1&query=${result.latitude},${result.longitude}`
          : result.mapUrl;
      }
    }
  } catch {
    // Keep the manual fallback result. The UI will still be usable.
  }

  return NextResponse.json(result);
}
