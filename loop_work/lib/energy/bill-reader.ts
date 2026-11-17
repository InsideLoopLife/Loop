import "server-only";

// Reads an energy bill, tariff email or app screenshot and pulls out the tariff figures for the
// person to check. Nothing is stored here: the file is read in memory and the draft goes back to
// the browser for confirmation. Personal details (account numbers, MPAN/MPRN, names, addresses)
// are never extracted.

import { extractReadableTextFromFile } from "@/lib/loopwatch/extract";
import { recordOpenAiUsageFromPayload } from "@/lib/ai/usage";

export type BillDraft = {
  supplier: string | null;
  tariffName: string | null;
  fuel: "electricity" | "gas" | "dual" | null;
  electricityUnitP: number | null;
  electricityNightUnitP: number | null;
  electricityStandingP: number | null;
  gasUnitP: number | null;
  gasStandingP: number | null;
  paymentMethod: string | null;
  fixedUntil: string | null;
  exitFeeGbp: number | null;
  monthlyPaymentGbp: number | null;
  annualElectricityKwh: number | null;
  annualGasKwh: number | null;
};

export type BillReadResult = { draft: BillDraft; method: "ai_image" | "ai_text" | "pattern" | "none"; warnings: string[] };

const EMPTY: BillDraft = { supplier: null, tariffName: null, fuel: null, electricityUnitP: null, electricityNightUnitP: null, electricityStandingP: null, gasUnitP: null, gasStandingP: null, paymentMethod: null, fixedUntil: null, exitFeeGbp: null, monthlyPaymentGbp: null, annualElectricityKwh: null, annualGasKwh: null };

const SUPPLIER_NAMES = ["Octopus", "British Gas", "EDF", "E.ON Next", "E.ON", "OVO", "Scottish Power", "So Energy", "Outfox the Market", "Utility Warehouse", "Ecotricity", "Good Energy", "Utilita", "Sainsbury's Energy", "Co-op Energy", "Fuse Energy", "Shell Energy", "SSE"];

const INSTRUCTIONS = `You read UK household energy bills, tariff confirmation emails and supplier-app screenshots.
Return ONLY JSON with these keys (null when not shown — never guess):
supplier, tariffName, fuel ("electricity"|"gas"|"dual"),
electricityUnitP, electricityNightUnitP, electricityStandingP, gasUnitP, gasStandingP  (all in PENCE including VAT; unit rates per kWh, standing charges per day — convert £ to pence if needed),
paymentMethod (e.g. "Direct Debit"), fixedUntil (YYYY-MM-DD end of a fixed deal), exitFeeGbp (per fuel, number),
monthlyPaymentGbp (the regular Direct Debit amount), annualElectricityKwh, annualGasKwh (estimated annual consumption if shown).
If two electricity unit rates are shown (day/night, peak/off-peak), put the day/peak rate in electricityUnitP and the night/off-peak in electricityNightUnitP.
Do NOT return account numbers, MPAN/MPRN, meter serials, names, addresses or phone numbers.`;

function aiKey() {
  return process.env.LOOP_DOCUMENT_AI_KEY || process.env.OPENAI_API_KEY || process.env.OPENAI_PREMIUM_API_KEY || null;
}

const asNumber = (value: unknown, min: number, max: number) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[£p,\s]/gi, ""));
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 1000) / 1000 : null;
};
const asPence = (value: unknown) => {
  const n = asNumber(value, 0, 500);
  // £0.2786 written as a pound figure → 27.86p
  return n != null && n > 0 && n < 1.5 ? Math.round(n * 100 * 1000) / 1000 : n;
};

function clean(raw: Record<string, unknown>): BillDraft {
  const text = (value: unknown, max = 80) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
  const date = typeof raw.fixedUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.fixedUntil) ? raw.fixedUntil : null;
  const fuel = raw.fuel === "electricity" || raw.fuel === "gas" || raw.fuel === "dual" ? raw.fuel : null;
  const draft: BillDraft = {
    supplier: text(raw.supplier, 60),
    tariffName: text(raw.tariffName),
    fuel,
    electricityUnitP: asPence(raw.electricityUnitP),
    electricityNightUnitP: asPence(raw.electricityNightUnitP),
    electricityStandingP: asPence(raw.electricityStandingP),
    gasUnitP: asPence(raw.gasUnitP),
    gasStandingP: asPence(raw.gasStandingP),
    paymentMethod: text(raw.paymentMethod, 40),
    fixedUntil: date,
    exitFeeGbp: asNumber(raw.exitFeeGbp, 0, 1000),
    monthlyPaymentGbp: asNumber(raw.monthlyPaymentGbp, 0, 5000),
    annualElectricityKwh: asNumber(raw.annualElectricityKwh, 0, 100000),
    annualGasKwh: asNumber(raw.annualGasKwh, 0, 200000),
  };
  if (!draft.fuel) draft.fuel = draft.electricityUnitP != null && draft.gasUnitP != null ? "dual" : draft.gasUnitP != null ? "gas" : draft.electricityUnitP != null ? "electricity" : null;
  return draft;
}

/** A best-effort read without AI: "27.86p per kWh", "Standing charge 54.83p per day", supplier names. */
export function patternRead(text: string): BillDraft {
  const lower = text.toLowerCase();
  const supplier = SUPPLIER_NAMES.find((name) => lower.includes(name.toLowerCase())) || null;
  // The first mention of the fuel that is followed by a p/kWh figure (so "British Gas" in a header doesn't count).
  const section = (word: string) => {
    const pattern = new RegExp(`(?<!british |scottish |co-op |sainsbury's )${word}`, "g");
    for (const match of lower.matchAll(pattern)) {
      const chunk = lower.slice(match.index!, match.index! + 400);
      if (/\d\s*p(?:ence)?\s*(?:per|\/)\s*kwh/.test(chunk)) return chunk;
    }
    return "";
  };
  const unit = (chunk: string) => { const m = chunk.match(/(\d{1,2}(?:\.\d{1,4})?)\s*p(?:ence)?\s*(?:per|\/)\s*kwh/); return m ? Number(m[1]) : null; };
  const standing = (chunk: string) => { const m = chunk.match(/standing charge[^0-9]{0,40}(\d{1,3}(?:\.\d{1,4})?)\s*p/); return m ? Number(m[1]) : null; };
  const elec = section("electricity");
  const gas = section("gas");
  const annual = (chunk: string) => {
    const m = chunk.match(/(?:annual|a year|per year|yearly)[^0-9]{0,30}(\d[\d,]{2,6})\s*kwh/) || chunk.match(/(\d[\d,]{2,6})\s*kwh\s*(?:a|per)\s*year/);
    return m ? m[1].replace(/,/g, "") : null;
  };
  const tariffName = text.match(/(?:your tariff|tariff name|tariff)\s*[:\-]\s*([^\n.]{3,60})/i)?.[1]?.trim() || null;
  const exitFee = lower.match(/exit fees?[^£\d]{0,25}£\s*(\d+(?:\.\d{1,2})?)/)?.[1] ?? null;
  const monthly = lower.match(/(?:monthly (?:direct debit|payment)|direct debit (?:amount|of))[^£]{0,25}£\s*(\d+(?:\.\d{1,2})?)/)?.[1] ?? null;
  const paymentMethod = /direct debit/.test(lower) ? "Direct Debit" : /prepay|pay as you go/.test(lower) ? "Prepayment" : /receipt of bill|pay on receipt/.test(lower) ? "On receipt of bill" : null;
  return clean({
    supplier, tariffName, paymentMethod,
    fixedUntil: endDate(lower),
    exitFeeGbp: exitFee, monthlyPaymentGbp: monthly,
    electricityUnitP: unit(elec), electricityStandingP: standing(elec), annualElectricityKwh: annual(elec),
    gasUnitP: unit(gas), gasStandingP: standing(gas), annualGasKwh: annual(gas),
  });
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "ends 31 October 2027", "fixed until 31/10/2027", "end date: 31 Oct 2027" → 2027-10-31 */
export function endDate(lower: string): string | null {
  const lead = String.raw`(?:ends?(?: on)?|end date|fixed until|until|expires?(?: on)?)\s*[:\-]?\s*`;
  const named = lower.match(new RegExp(lead + String.raw`(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\s+(\d{4})`));
  if (named) {
    const month = MONTHS.findIndex((m) => m.startsWith(named[2].slice(0, 3)));
    if (month >= 0) return iso(Number(named[3]), month + 1, Number(named[1]));
  }
  const numeric = lower.match(new RegExp(lead + String.raw`(\d{1,2})\/(\d{1,2})\/(\d{4})`));
  if (numeric) return iso(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  return null;
}

function iso(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

async function callOpenAi(messages: unknown[], supabase: any, userId: string, component: string) {
  const key = aiKey();
  if (!key || process.env.LOOP_AI_DISABLED === "true") {
    console.warn(JSON.stringify({ event: "energy_bill_ai_skipped", reason: key ? "disabled" : "no_key" }));
    return null;
  }
  const model = process.env.LOOP_DOCUMENT_VISION_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(45000),
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages }),
    });
  } catch (error) {
    console.warn(JSON.stringify({ event: "energy_bill_ai_failed", status: "network", model, detail: String((error as Error)?.message || error).slice(0, 200) }));
    return null;
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.warn(JSON.stringify({ event: "energy_bill_ai_failed", status: response.status, model, detail: detail.slice(0, 300) }));
    return null;
  }
  const payload = await response.json();
  await recordOpenAiUsageFromPayload(supabase, payload, { model, scope: "energy_bill_reader", component, userId });
  try { return JSON.parse(String(payload?.choices?.[0]?.message?.content || "{}")) as Record<string, unknown>; } catch { return null; }
}

export async function readEnergyBill(input: { file?: File | null; text?: string | null }, supabase: any, userId: string): Promise<BillReadResult> {
  const warnings: string[] = [];
  const file = input.file && input.file.size > 0 ? input.file : null;

  if (file && (file.type || "").startsWith("image/")) {
    const dataUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
    const ai = await callOpenAi([
      { role: "system", content: INSTRUCTIONS },
      { role: "user", content: [{ type: "text", text: "Read the tariff figures from this energy bill or screenshot." }, { type: "image_url", image_url: { url: dataUrl } }] },
    ], supabase, userId, "image");
    if (ai) return { draft: clean(ai), method: "ai_image", warnings };
    warnings.push(aiKey() ? "Couldn't read that image — try a clearer screenshot, or type the rates in." : "Reading images needs Loop's document AI to be switched on. Type the rates in for now.");
    return { draft: { ...EMPTY }, method: "none", warnings };
  }

  let text = String(input.text || "").slice(0, 20000);
  if (file) {
    const read = await extractReadableTextFromFile(file);
    text = `${read.text}\n${text}`.trim();
    if (read.warning) warnings.push(read.warning.replace(/LoopWatch saved a (blank )?review card[^.]*\./i, "").trim());
  }
  if (!text.trim()) return { draft: { ...EMPTY }, method: "none", warnings: warnings.length ? warnings : ["Nothing to read — add a file or paste the text."] };

  const ai = await callOpenAi([
    { role: "system", content: INSTRUCTIONS },
    { role: "user", content: `Bill text:\n${text.slice(0, 16000)}` },
  ], supabase, userId, file ? "pdf" : "text");
  if (ai) return { draft: clean(ai), method: "ai_text", warnings };
  const pattern = patternRead(text);
  warnings.push("Read with Loop's simple reader rather than AI, so check every figure — some may be missed.");
  if (!pattern.electricityUnitP && !pattern.gasUnitP) warnings.push("Couldn't find the rates — check the numbers below or type them in.");
  return { draft: pattern, method: "pattern", warnings };
}
