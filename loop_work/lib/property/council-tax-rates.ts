// Council tax by billing authority. One place for every council-tax figure in
// Loop (property estimate, house page, move planner, guided setup).
//
// Data: MHCLG "Council Tax levels set by local authorities in England",
// Table 10 (Band D by billing authority), loaded once a year by
// /api/cron/council-tax-refresh into loop_council_tax_rate_estimates.
// Other bands are statutory fractions of Band D. Wales and Scotland fall back
// to an average until their tables are added.
import { inflateRawSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";

// Bump each April when MHCLG publishes the new year (URL from the gov.uk page).
export const ENGLAND_TABLE = {
  chargeYear: "2026-27",
  url: "https://assets.publishing.service.gov.uk/media/6a02eeeccd2e0e8b5b20b449/Table_10_2026-27.ods",
  sourcePage: "https://www.gov.uk/government/statistics/council-tax-levels-set-by-local-authorities-in-england-2026-to-2027",
  averageBandD: 2392, // published England average, 2026-27 (incl. ASC and parish precepts)
};

// Band D multipliers. England (A-H) and Wales (A-I): Local Government Finance
// Act 1992 s.5. Scotland: ratios since April 2017.
export const BAND_RATIOS: Record<string, Record<string, number>> = {
  ENG: { A: 6 / 9, B: 7 / 9, C: 8 / 9, D: 1, E: 11 / 9, F: 13 / 9, G: 15 / 9, H: 18 / 9 },
  WLS: { A: 6 / 9, B: 7 / 9, C: 8 / 9, D: 1, E: 11 / 9, F: 13 / 9, G: 15 / 9, H: 18 / 9, I: 21 / 9 },
  SCT: { A: 240 / 360, B: 280 / 360, C: 320 / 360, D: 1, E: 473 / 360, F: 585 / 360, G: 705 / 360, H: 882 / 360 },
};

// Used only when no council row exists. Published national averages for
// 2026-27: England £2,392 (MHCLG), Wales £2,283 (Welsh Government, incl.
// police and community councils). No official all-Scotland average was found,
// so Scotland has no fallback and the person is asked for their amount.
const FALLBACK_BAND_D_POUNDS: Record<string, { pounds: number; source: string }> = {
  ENG: { pounds: ENGLAND_TABLE.averageBandD, source: ENGLAND_TABLE.sourcePage },
  WLS: { pounds: 2283, source: "https://www.gov.wales/council-tax-levels-april-2026-march-2027-html" },
};

export type CouncilTaxQuote = {
  annualPence: number;
  monthlyPence: number; // spread over 12 months
  band: string;
  authorityCode: string | null;
  authorityName: string | null;
  chargeYear: string | null;
  confidence: number;
  source: "council_table" | "national_average";
  sourceUrl: string | null;
};

export function normaliseBand(band: unknown) {
  const b = String(band || "").trim().toUpperCase().replace(/^BAND\s+/, "");
  return /^[A-I]$/.test(b) ? b : null;
}

export async function quoteCouncilTax(
  db: SupabaseClient,
  input: { band: unknown; countryCode?: string | null; authorityCode?: string | null; authorityName?: string | null },
): Promise<CouncilTaxQuote | null> {
  const band = normaliseBand(input.band);
  if (!band) return null;
  const country = (input.countryCode || (String(input.authorityCode || "").startsWith("W") ? "WLS" : String(input.authorityCode || "").startsWith("S") ? "SCT" : "ENG")).toUpperCase();
  const ratio = (BAND_RATIOS[country] || BAND_RATIOS.ENG)[band];
  if (!ratio) return null;

  let row: any = null;
  if (input.authorityCode || input.authorityName) {
    let query = db.from("loop_council_tax_rate_estimates")
      .select("local_authority_code, local_authority_name, annual_charge_pence, charge_year, source_url, confidence")
      .eq("band", "D").order("charge_year", { ascending: false }).limit(1);
    query = input.authorityCode ? query.eq("local_authority_code", input.authorityCode) : query.ilike("local_authority_name", String(input.authorityName));
    const { data } = await query.maybeSingle();
    row = data;
  }

  if (row?.annual_charge_pence) {
    const annual = Math.round(Number(row.annual_charge_pence) * ratio);
    return {
      annualPence: annual, monthlyPence: Math.round(annual / 12), band,
      authorityCode: row.local_authority_code, authorityName: row.local_authority_name,
      chargeYear: row.charge_year, confidence: Number(row.confidence || 90), source: "council_table", sourceUrl: row.source_url,
    };
  }

  const fallback = FALLBACK_BAND_D_POUNDS[country];
  if (!fallback) return null;
  const annual = Math.round(fallback.pounds * 100 * ratio);
  return {
    annualPence: annual, monthlyPence: Math.round(annual / 12), band,
    authorityCode: input.authorityCode || null, authorityName: input.authorityName || null,
    chargeYear: "2026-27", confidence: 55,
    source: "national_average", sourceUrl: fallback.source,
  };
}

// ---------------------------------------------------------------------------
// Minimal ODS reader (an .ods file is a zip whose content.xml holds the
// sheets). Avoids adding a spreadsheet dependency for one yearly import.

function unzipEntry(buf: Buffer, name: string): Buffer {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("Not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const entryName = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (entryName === name) {
      const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
      const data = buf.subarray(dataStart, dataStart + compSize);
      return method === 0 ? Buffer.from(data) : inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${name} not found in archive`);
}

const decodeXml = (s: string) =>
  s.replace(/<text:s(?: text:c="(\d+)")?\s*\/>/g, (_m, n) => " ".repeat(Number(n || 1)))
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .trim();

/** Every sheet as rows of cell strings (numeric cells use their raw value). */
export function readOdsSheets(ods: Buffer): Array<{ name: string; rows: string[][] }> {
  const xml = unzipEntry(ods, "content.xml").toString("utf8");
  const sheets: Array<{ name: string; rows: string[][] }> = [];
  for (const table of xml.matchAll(/<table:table [^>]*table:name="([^"]*)"[^>]*>([\s\S]*?)<\/table:table>/g)) {
    const rows: string[][] = [];
    for (const rowMatch of table[2].matchAll(/<table:table-row[^>]*?(?:\/>|>([\s\S]*?)<\/table:table-row>)/g)) {
      const cells: string[] = [];
      let spanText = "";
      let spanLeft = 0;
      for (const cell of (rowMatch[1] || "").matchAll(/<table:(?:covered-)?table-cell([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)) {
        const attrs = cell[1] || "";
        const repeat = Math.min(Number(attrs.match(/table:number-columns-repeated="(\d+)"/)?.[1] || 1), 50);
        const value = attrs.match(/office:value="([^"]*)"/)?.[1] ?? decodeXml(cell[2] || "");
        // A merged header ("Area Band D council tax") spans several year
        // columns; the covered cells are empty, so carry the text across.
        const span = Number(attrs.match(/table:number-columns-spanned="(\d+)"/)?.[1] || 0);
        if (span > 1) { spanText = value; spanLeft = span; }
        const isCovered = cell[0].startsWith("<table:covered-table-cell");
        for (let r = 0; r < repeat; r++) {
          if (isCovered && spanLeft > 0 && !value) cells.push(spanText);
          else cells.push(value);
          if (spanLeft > 0) spanLeft -= 1;
        }
      }
      rows.push(cells);
    }
    sheets.push({ name: decodeXml(table[1]), rows });
  }
  return sheets;
}

const LA_CODE = /^E0[6-9]\d{6}$/;

/**
 * Finds the billing-authority Band D column. Picks the sheet/column where most
 * rows carry an English local-authority code, then the Band D column, preferring
 * "area Band D" (includes parish precepts) over the headline figure.
 */
export function extractBandD(sheets: Array<{ name: string; rows: string[][] }>) {
  let best: { rows: Array<{ code: string; name: string; bandD: number }>; header: string } | null = null;
  for (const sheet of sheets) {
    const codeRows = sheet.rows.filter((r) => r.some((c) => LA_CODE.test(c)));
    if (codeRows.length < 100) continue;
    const codeCol = codeRows[0].findIndex((c) => LA_CODE.test(c));
    const firstDataIndex = sheet.rows.indexOf(codeRows[0]);
    // The column titles sit above the councils, but in the 2026-27 file
    // there are six summary rows in between (England, Inner London, Outer
    // London, ...). Use the wordiest row above the data as the title row,
    // plus the row above it for any group heading.
    const wordy = (row: string[]) => row.filter((c) => /[a-z]{3,}/i.test(c) && c.length > 12).length;
    let titleIndex = -1;
    for (let i = firstDataIndex - 1; i >= Math.max(0, firstDataIndex - 40); i--) {
      if (titleIndex < 0 || wordy(sheet.rows[i]) > wordy(sheet.rows[titleIndex])) titleIndex = i;
    }
    const headerRows = titleIndex >= 0 ? sheet.rows.slice(Math.max(0, titleIndex - 1), titleIndex + 1) : [];
    const width = Math.max(...codeRows.map((r) => r.length));
    const headerFor = (col: number) => headerRows.map((r) => r[col] || "").join(" ").replace(/\s+/g, " ").trim();

    const candidates: Array<{ col: number; header: string; score: number }> = [];
    for (let col = 0; col < width; col++) {
      if (col === codeCol) continue;
      const nums = codeRows.map((r) => Number(r[col])).filter((n) => Number.isFinite(n) && n >= 900 && n <= 4500);
      if (nums.length < codeRows.length * 0.9) continue;
      const h = headerFor(col).toLowerCase();
      if (!h.includes("band d")) continue;
      const score = (h.includes("area") ? 4 : 0) + (h.includes("parish") ? 2 : 0) + (h.includes(ENGLAND_TABLE.chargeYear) || h.includes("2026") ? 1 : 0) - (h.includes("excluding") ? 3 : 0) - (h.includes("change") || h.includes("%") ? 10 : 0);
      candidates.push({ col, header: headerFor(col), score });
    }
    candidates.sort((a, b) => b.score - a.score || b.col - a.col);
    const pick = candidates[0];
    if (!pick) continue;
    const nameCol = codeRows[0].findIndex((c, i) => i !== codeCol && /[a-z]{3,}/i.test(c) && !LA_CODE.test(c) && !Number.isFinite(Number(c)));
    const rows = codeRows.map((r) => ({ code: r[codeCol], name: nameCol >= 0 ? r[nameCol] : r[codeCol], bandD: Number(r[pick.col]) }))
      .filter((r) => Number.isFinite(r.bandD) && r.bandD >= 900 && r.bandD <= 4500);
    if (!best || rows.length > best.rows.length) best = { rows, header: pick.header };
  }
  return best;
}

export async function refreshEnglandCouncilTax(db: SupabaseClient, opts: { force?: boolean } = {}) {
  const { count } = await db.from("loop_council_tax_rate_estimates")
    .select("id", { count: "exact", head: true }).eq("country_code", "ENG").eq("charge_year", ENGLAND_TABLE.chargeYear).eq("band", "D");
  if (!opts.force && (count || 0) >= 250) return { ok: true, skipped: true, chargeYear: ENGLAND_TABLE.chargeYear, authorities: count };

  const res = await fetch(ENGLAND_TABLE.url, { headers: { "user-agent": "Loop council tax import (insideloop.life)" } });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const extracted = extractBandD(readOdsSheets(Buffer.from(await res.arrayBuffer())));
  if (!extracted) {
    // Say what the file looked like, so the next run's log shows why.
    const sheets = readOdsSheets(Buffer.from(await (await fetch(ENGLAND_TABLE.url, { headers: { "user-agent": "Loop council tax import (insideloop.life)" } })).arrayBuffer()));
    const summary = sheets.map((sheet) => {
      const codeRows = sheet.rows.filter((r) => r.some((c) => LA_CODE.test(c)));
      const first = codeRows[0] ? sheet.rows.indexOf(codeRows[0]) : -1;
      const header = first > 0 ? sheet.rows.slice(Math.max(0, first - 4), first).map((r) => r.filter(Boolean).join(" | ")).join(" // ").slice(0, 400) : "";
      return `${sheet.name}: ${sheet.rows.length} rows, ${codeRows.length} with council codes${header ? `; headers: ${header}` : ""}${codeRows[0] ? `; first row: ${codeRows[0].slice(0, 12).join(" | ").slice(0, 300)}` : ""}`;
    });
    throw new Error(`Could not find a Band D by billing authority column in the file. ${summary.join(" ;; ").slice(0, 3000)}`);
  }

  // Sanity checks before touching the table: right number of councils and a
  // median close to the published national average.
  const sorted = extracted.rows.map((r) => r.bandD).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (extracted.rows.length < 250 || Math.abs(median - ENGLAND_TABLE.averageBandD) > 350) {
    throw new Error(`Parsed figures look wrong (councils=${extracted.rows.length}, median £${median}, column "${extracted.header}") — table left unchanged.`);
  }

  const now = new Date().toISOString();
  const rows = extracted.rows.flatMap((r) => Object.entries(BAND_RATIOS.ENG).map(([band, ratio]) => ({
    local_authority_code: r.code,
    local_authority_name: r.name,
    country_code: "ENG",
    band,
    annual_charge_pence: Math.round(r.bandD * 100 * ratio),
    charge_year: ENGLAND_TABLE.chargeYear,
    source_kind: "mhclg_table_10",
    source_url: ENGLAND_TABLE.sourcePage,
    confidence: 92,
    updated_at: now,
  })));

  const { error: deleteError } = await db.from("loop_council_tax_rate_estimates").delete().eq("country_code", "ENG").eq("charge_year", ENGLAND_TABLE.chargeYear).eq("source_kind", "mhclg_table_10");
  if (deleteError) throw new Error(deleteError.message);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("loop_council_tax_rate_estimates").insert(rows.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  return { ok: true, skipped: false, chargeYear: ENGLAND_TABLE.chargeYear, authorities: extracted.rows.length, medianBandD: median, column: extracted.header };
}
