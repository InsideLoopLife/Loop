import { createClient } from "@/lib/supabase/server";

export function poundsToPence(value: number | string | null | undefined) {
  const n = typeof value === "string" ? Number(value.replace(/[^0-9.\-]/g, "")) : Number(value || 0);
  return Math.round((Number.isFinite(n) ? n : 0) * 100);
}

export function penceToPounds(value: number | null | undefined) {
  return (Number(value || 0) / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
}

export function normalisePostcode(postcode?: string | null) {
  return String(postcode || "").toUpperCase().replace(/\s+/g, "").trim();
}

export function displayPostcode(postcode?: string | null) {
  const compact = normalisePostcode(postcode);
  if (compact.length <= 3) return compact;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

export function postcodeDistrict(postcode?: string | null) {
  return displayPostcode(postcode).split(" ")[0] || displayPostcode(postcode);
}

function countryToCode(country?: string | null) {
  const c = String(country || "").toLowerCase();
  if (c.includes("wales")) return "WLS";
  if (c.includes("scotland")) return "SCT";
  return "ENG";
}

export async function lookupPostcode(postcode: string) {
  const clean = normalisePostcode(postcode);
  const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.result || null;
}

const BAND_RULES: Record<string, Array<{ band: string; min: number | null; max: number | null }>> = {
  ENG: [
    { band: "A", min: null, max: 4000000 }, { band: "B", min: 4000000, max: 5200000 }, { band: "C", min: 5200000, max: 6800000 }, { band: "D", min: 6800000, max: 8800000 },
    { band: "E", min: 8800000, max: 12000000 }, { band: "F", min: 12000000, max: 16000000 }, { band: "G", min: 16000000, max: 32000000 }, { band: "H", min: 32000000, max: null },
  ],
  WLS: [
    { band: "A", min: null, max: 4400000 }, { band: "B", min: 4400000, max: 6500000 }, { band: "C", min: 6500000, max: 9100000 }, { band: "D", min: 9100000, max: 12300000 },
    { band: "E", min: 12300000, max: 16200000 }, { band: "F", min: 16200000, max: 22300000 }, { band: "G", min: 22300000, max: 32400000 }, { band: "H", min: 32400000, max: 42400000 }, { band: "I", min: 42400000, max: null },
  ],
  SCT: [
    { band: "A", min: null, max: 2700000 }, { band: "B", min: 2700000, max: 3500000 }, { band: "C", min: 3500000, max: 4500000 }, { band: "D", min: 4500000, max: 5800000 },
    { band: "E", min: 5800000, max: 8000000 }, { band: "F", min: 8000000, max: 10600000 }, { band: "G", min: 10600000, max: 21200000 }, { band: "H", min: 21200000, max: null },
  ],
};

const HISTORIC_FACTOR: Record<string, number> = {
  london: 0.16, "south east": 0.2, "east of england": 0.2, "south west": 0.22, "north west": 0.27, "north east": 0.3,
  "west midlands": 0.25, "east midlands": 0.25, "yorkshire and the humber": 0.27, wales: 0.48, scotland: 0.24, default: 0.24,
};

const DEFAULT_RATES: Record<string, Record<string, number>> = {
  ENG: { A: 150000, B: 175000, C: 200000, D: 225000, E: 275000, F: 325000, G: 375000, H: 450000 },
  WLS: { A: 140000, B: 165000, C: 190000, D: 215000, E: 265000, F: 315000, G: 365000, H: 435000, I: 505000 },
  SCT: { A: 140000, B: 165000, C: 190000, D: 215000, E: 265000, F: 315000, G: 365000, H: 435000 },
};

async function lookupSoldPrices(postcode: string) {
  const pretty = displayPostcode(postcode);
  const query = `
PREFIX ppd: <http://landregistry.data.gov.uk/def/ppi/>
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
SELECT ?price ?date ?postcode WHERE {
  ?tx a ppd:TransactionRecord ;
      ppd:pricePaid ?price ;
      ppd:transactionDate ?date ;
      ppd:propertyAddress ?addr .
  ?addr lrcommon:postcode "${pretty}" .
  OPTIONAL { ?addr lrcommon:postcode ?postcode . }
}
ORDER BY DESC(?date)
LIMIT 30`;
  const url = `https://landregistry.data.gov.uk/landregistry/query?query=${encodeURIComponent(query)}&format=${encodeURIComponent("application/sparql-results+json")}`;

  try {
    const res = await fetch(url, { headers: { accept: "application/sparql-results+json" }, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const items = (json?.results?.bindings || [])
      .map((row: any) => ({ pricePence: Math.round(Number(row.price?.value || 0) * 100), date: row.date?.value }))
      .filter((x: any) => x.pricePence > 0);
    const prices = items.map((x: any) => x.pricePence).sort((a: number, b: number) => a - b);
    const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;
    return { status: items.length ? "found" : "not_found", count: items.length, medianPricePence: median, comparables: items.slice(0, 12) };
  } catch (error: any) {
    return { status: "failed", count: 0, medianPricePence: null, comparables: [], error: error?.message };
  }
}

function estimateBand(input: { currentValuePence: number; countryCode: string; region?: string | null; comparableCount?: number }) {
  const countryCode = input.countryCode || "ENG";
  const regionKey = String(input.region || "").toLowerCase();
  const factor = countryCode === "WLS" ? HISTORIC_FACTOR.wales : countryCode === "SCT" ? HISTORIC_FACTOR.scotland : (HISTORIC_FACTOR[regionKey] || HISTORIC_FACTOR.default);
  const historicValuePence = Math.round(input.currentValuePence * factor);
  const rules = BAND_RULES[countryCode] || BAND_RULES.ENG;
  let rule = rules[rules.length - 1];
  for (const r of rules) {
    if ((r.min == null || historicValuePence >= r.min) && (r.max == null || historicValuePence < r.max)) {
      rule = r;
      break;
    }
  }
  const idx = rules.findIndex((r) => r.band === rule.band);
  const nearLow = rule.min != null && historicValuePence <= rule.min * 1.1;
  const nearHigh = rule.max != null && historicValuePence >= rule.max * 0.9;
  const low = nearLow && idx > 0 ? rules[idx - 1].band : rule.band;
  const high = nearHigh && idx < rules.length - 1 ? rules[idx + 1].band : rule.band;
  const rates = DEFAULT_RATES[countryCode] || DEFAULT_RATES.ENG;
  const annualLowPence = rates[low] || rates[rule.band] || 225000;
  const annualHighPence = rates[high] || rates[rule.band] || 225000;
  const confidence = Math.max(25, Math.min(82, 45 + Math.min(20, Number(input.comparableCount || 0) * 2) - (low !== high ? 10 : 0)));
  return {
    band: rule.band, bandLow: low, bandHigh: high, historicValuePence, currentToHistoricFactor: factor,
    annualLowPence, annualHighPence, annualMidPence: Math.round((annualLowPence + annualHighPence) / 2), confidence,
    reason: low === high
      ? `Estimated current value ${penceToPounds(input.currentValuePence)} converts to roughly ${penceToPounds(historicValuePence)} at the council-tax valuation date, pointing to Band ${rule.band}.`
      : `Estimated current value ${penceToPounds(input.currentValuePence)} converts to roughly ${penceToPounds(historicValuePence)} at the council-tax valuation date, close to a band boundary, so ${low}-${high} is safer than one band.`,
  };
}

function fallbackValue(input: { valuePence?: number | null; medianPence?: number | null; bedrooms?: number | null; propertyType?: string | null }) {
  if (input.valuePence && input.valuePence > 0) return { valuePence: input.valuePence, basis: "user_entered_value" };
  if (input.medianPence && input.medianPence > 0) return { valuePence: input.medianPence, basis: "nearby_land_registry_median" };
  const beds = Number(input.bedrooms || 3);
  const base = beds <= 1 ? 15000000 : beds === 2 ? 21000000 : beds === 3 ? 28000000 : beds === 4 ? 39000000 : 52000000;
  const adj = /detached/i.test(input.propertyType || "") ? 1.2 : /flat|apartment/i.test(input.propertyType || "") ? 0.8 : 1;
  return { valuePence: Math.round(base * adj), basis: "bedroom_property_type_fallback" };
}

export async function estimatePropertyAffordability(input: {
  postcode: string;
  addressLine1?: string | null;
  estimatedValue?: number | string | null;
  estimatedValuePence?: number | null;
  bedrooms?: number | null;
  propertyType?: string | null;
  householdId?: string | null;
  propertyId?: string | null;
  saveToProperty?: boolean;
}) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not authenticated.");

  const postcode = displayPostcode(input.postcode);
  const postcodeData = await lookupPostcode(postcode);
  const countryCode = countryToCode(postcodeData?.country);
  const sold = await lookupSoldPrices(postcode);
  const explicit = input.estimatedValuePence || (input.estimatedValue ? poundsToPence(input.estimatedValue) : null);
  const value = fallbackValue({ valuePence: explicit, medianPence: sold.medianPricePence, bedrooms: input.bedrooms, propertyType: input.propertyType });
  const band = estimateBand({ currentValuePence: value.valuePence, countryCode, region: postcodeData?.region, comparableCount: sold.count });

  const warnings = [
    "This is an affordability estimate, not an official council tax band.",
    "Verify the exact address against the official valuation list before purchase/rent decisions.",
    "Default council-tax charges are rough until local council rates are configured.",
  ];
  if (!postcodeData) warnings.push("Postcode could not be validated.");
  if (!sold.count) warnings.push("No nearby sold-price comparables were found by the automated check.");

  const result = {
    postcode,
    postcode_district: postcodeDistrict(postcode),
    local_authority_name: postcodeData?.admin_district || null,
    local_authority_code: postcodeData?.codes?.admin_district || null,
    region_name: postcodeData?.region || null,
    country_code: countryCode,
    latitude: postcodeData?.latitude || null,
    longitude: postcodeData?.longitude || null,
    estimated_value_pence: value.valuePence,
    historic_value_basis: value.basis,
    estimated_historic_value_pence: band.historicValuePence,
    estimated_council_tax_band: band.band,
    estimated_council_tax_band_low: band.bandLow,
    estimated_council_tax_band_high: band.bandHigh,
    estimated_council_tax_annual_low_pence: band.annualLowPence,
    estimated_council_tax_annual_high_pence: band.annualHighPence,
    estimated_council_tax_annual_mid_pence: band.annualMidPence,
    council_tax_estimate_confidence: band.confidence,
    council_tax_estimate_reason: band.reason,
    council_tax_estimate_status: "estimated",
    nearby_sold_price_median_pence: sold.medianPricePence,
    nearby_sold_price_count: sold.count,
    comparable_sales_summary: { source: "hm_land_registry_ppd", ...sold },
    source_status: {
      postcodes_io: { status: postcodeData ? "found" : "not_found", result: postcodeData },
      land_registry: { status: sold.status, count: sold.count, median_price_pence: sold.medianPricePence, error: sold.error },
      council_tax: { status: "estimated", note: "Estimated for affordability planning only." },
      epc: { status: "not_configured", note: "Connect EPC API or enter manually." },
      schools: { status: "not_configured", note: "Connect schools/performance sources later." },
    },
    property_affordability_summary: {
      estimated_monthly_council_tax_pence: Math.round(band.annualMidPence / 12),
      estimated_annual_council_tax_range_pence: [band.annualLowPence, band.annualHighPence],
      warnings,
    },
    warnings,
  };

  const { data: run } = await supabase.from("loop_property_estimate_runs").insert({
    property_id: input.propertyId || null,
    user_id: user.id,
    household_id: input.householdId || null,
    postcode,
    address_text: [input.addressLine1, postcode].filter(Boolean).join(", "),
    estimated_value_pence: value.valuePence,
    property_type: input.propertyType || null,
    bedrooms: input.bedrooms || null,
    status: warnings.length ? "partial" : "completed",
    confidence: band.confidence,
    result,
    sources_checked: [result.source_status.postcodes_io, result.source_status.land_registry, result.source_status.council_tax],
    warnings,
  }).select("*").single();

  if (input.saveToProperty && input.propertyId) {
    await supabase.from("loop_household_properties").update({
      postcode,
      postcode_district: result.postcode_district,
      local_authority_name: result.local_authority_name,
      local_authority_code: result.local_authority_code,
      region_name: result.region_name,
      latitude: result.latitude,
      longitude: result.longitude,
      estimated_value_pence: result.estimated_value_pence,
      estimated_historic_value_pence: result.estimated_historic_value_pence,
      historic_value_basis: result.historic_value_basis,
      estimated_council_tax_band: result.estimated_council_tax_band,
      estimated_council_tax_band_low: result.estimated_council_tax_band_low,
      estimated_council_tax_band_high: result.estimated_council_tax_band_high,
      estimated_council_tax_annual_low_pence: result.estimated_council_tax_annual_low_pence,
      estimated_council_tax_annual_high_pence: result.estimated_council_tax_annual_high_pence,
      estimated_council_tax_annual_mid_pence: result.estimated_council_tax_annual_mid_pence,
      council_tax_estimate_confidence: result.council_tax_estimate_confidence,
      council_tax_estimate_reason: result.council_tax_estimate_reason,
      council_tax_estimate_status: "estimated",
      comparable_sales_summary: result.comparable_sales_summary,
      nearby_sold_price_median_pence: result.nearby_sold_price_median_pence,
      nearby_sold_price_count: result.nearby_sold_price_count,
      source_status: result.source_status,
      property_affordability_summary: result.property_affordability_summary,
      enrichment_status: "partial",
      last_enriched_at: new Date().toISOString(),
    }).eq("id", input.propertyId);
  }

  return { ok: true, run_id: run?.id, result };
}
