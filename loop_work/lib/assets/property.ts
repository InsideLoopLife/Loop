export function buildMapLinks(input: { latitude?: number | null; longitude?: number | null; address?: string | null }) {
  const query = input.latitude && input.longitude
    ? `${input.latitude},${input.longitude}`
    : encodeURIComponent(input.address || "");

  return {
    mapUrl: query ? `https://www.google.com/maps/search/?api=1&query=${query}` : null,
    satelliteUrl: query ? `https://www.google.com/maps/@?api=1&map_action=map&center=${query}&zoom=18&basemap=satellite` : null,
  };
}

export function normalisePostcode(postcode?: string | null) {
  return String(postcode || "").toUpperCase().replace(/\s+/g, " ").trim();
}

export type PropertyEnrichmentResult = {
  status: "enriched" | "partial" | "needs_review" | "failed";
  sourceStatus: Record<string, unknown>;
  patch: Record<string, unknown>;
};

/**
 * Provider-ready property enrichment.
 * This intentionally stores source statuses even when providers are not configured.
 */
export async function enrichProperty(input: {
  addressLine1?: string | null;
  postcode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<PropertyEnrichmentResult> {
  const address = [input.addressLine1, input.postcode].filter(Boolean).join(", ");
  const mapLinks = buildMapLinks({ latitude: input.latitude, longitude: input.longitude, address });

  const sourceStatus: Record<string, unknown> = {
    map: { status: mapLinks.mapUrl ? "ready" : "needs_address" },
    epc: { status: process.env.UK_EPC_API_AUTH ? "configured" : "not_configured" },
    council_tax: { status: process.env.LOOP_COUNCIL_TAX_SOURCE ? "configured" : "manual_or_ai_required" },
    schools: { status: process.env.LOOP_SCHOOLS_SOURCE ? "configured" : "manual_or_ai_required" },
    insurance: { status: "estimate_only" },
  };

  return {
    status: "partial",
    sourceStatus,
    patch: {
      map_image_url: mapLinks.mapUrl,
      satellite_image_url: mapLinks.satelliteUrl,
      source_status: sourceStatus,
      enrichment_status: "partial",
      last_enriched_at: new Date().toISOString(),
    },
  };
}
