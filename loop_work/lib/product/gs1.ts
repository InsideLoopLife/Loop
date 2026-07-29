import { gtinTo14, isValidGtin } from "./providers";

export function buildGs1DigitalLink(gtinOrBarcode: string) {
  const gtin14 = gtinTo14(gtinOrBarcode);
  if (!gtin14) return null;
  return `https://id.gs1.org/01/${gtin14}`;
}

export function explainGs1Barcode(value: string) {
  const gtin14 = gtinTo14(value);
  return {
    input: value,
    isValidGtin: isValidGtin(value),
    gtin14,
    digitalLink: gtin14 ? buildGs1DigitalLink(gtin14) : null,
    note: "GTIN identifies the trade item. LOOP validates/stores it, then checks local imports, Open Food Facts, retailer links and optional GS1/affiliate adapters.",
  };
}

export async function lookupGs1ConfiguredAdapter(gtinOrBarcode: string) {
  const gtin14 = gtinTo14(gtinOrBarcode);
  if (!gtin14) return null;
  const baseUrl = process.env.GS1_API_BASE_URL || process.env.LOOP_GS1_API_BASE_URL;
  const apiKey = process.env.GS1_API_KEY || process.env.LOOP_GS1_API_KEY;
  if (!baseUrl || !apiKey) return { status: "not_configured", gtin14, digitalLink: buildGs1DigitalLink(gtin14) };
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/products/${encodeURIComponent(gtin14)}`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json", "user-agent": "InsideLoop/0.1 (support@insideloop.life)" },
    cache: "no-store",
  });
  if (!res.ok) return { status: res.status === 404 ? "not_found" : "failed", gtin14, digitalLink: buildGs1DigitalLink(gtin14), httpStatus: res.status };
  return { status: "found", gtin14, digitalLink: buildGs1DigitalLink(gtin14), data: await res.json() };
}
