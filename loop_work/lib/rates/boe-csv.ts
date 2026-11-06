// Parses the CSV the Bank of England database gives a person who downloads
// "Quoted household interest rates" in a browser (CSVF=TT: a SERIES,DESCRIPTION
// block, then a DATE,<code>... table). The Bank's robots.txt disallows
// automated use of that export, so an admin downloads it monthly and uploads
// it at /admin/boe-benchmarks. Mirrors parseBoeBenchmarks in the rates worker.

export const BOE_MORTGAGE_SERIES = [
  "IUMZICQ", "IUMBV34", "IUMZICR", "IUMB482", "IUM2WTL", // 2yr fixed 60/75/85/90/95% LTV
  "IUMBV37", // 3yr fixed
  "IUMZO27", "IUMBV42", "IUMZO28", "IUM5WTL", // 5yr fixed
  "IUMBV45", // 10yr fixed
  "IUMBV48", "IUM2WDT", // 2yr variable / discounted
  "CFMBX2D", "IUMTLMV", // SVR / revert-to-rate
];

const KNOWN_2YR_LTV: Record<string, number> = { IUMZICQ: 60, IUMBV34: 75, IUMZICR: 85, IUMB482: 90, IUM2WTL: 95 };

export type BoeBenchmarkRow = { seriesCode: string; termType: string; ltvTier: number | null; ratePercent: number; effectiveMonth: string; rawTitle: string };

function termType(title: string) {
  const lower = title.toLowerCase();
  if (/official bank rate|^bank rate/.test(lower)) return "bank_rate";
  if (/standard variable|revert.?to.?rate/.test(lower)) return lower.includes("revert") ? "revert_to_rate" : "svr";
  if (/2.?year.*variable|2.?year.*discount/.test(lower)) return "2yr_variable";
  const fixed = lower.match(/(\d+)\s*.?year.*fixed/);
  return fixed ? `${fixed[1]}yr_fixed` : null;
}

export function parseBoeCsvUpload(csvText: string): { rows: BoeBenchmarkRow[]; unrecognised: string[] } {
  const lines = csvText.replace(/\r/g, "").split("\n");
  const dataIndex = lines.findIndex((l) => /^"?DATE"?,/i.test(l.trim()));
  if (dataIndex < 0) return { rows: [], unrecognised: [] };

  const titles: Record<string, string> = {};
  for (const line of lines.slice(0, dataIndex)) {
    const m = line.match(/^"?([A-Z0-9]{5,10})"?,(.*)$/);
    if (m && m[1] !== "SERIES") titles[m[1]] = m[2].replace(/"/g, "").trim();
  }

  const data = lines.slice(dataIndex).filter((l) => l.trim());
  const headers = data[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: BoeBenchmarkRow[] = [];
  const unrecognised: string[] = [];

  for (let col = 1; col < headers.length; col++) {
    const code = headers[col];
    for (let i = data.length - 1; i >= 1; i--) {
      const cells = data[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cells.length !== headers.length) continue;
      const value = Number(cells[col]);
      if (!cells[col] || cells[col] === ".." || !Number.isFinite(value) || value <= 0) continue;
      const date = new Date(cells[0]);
      if (Number.isNaN(date.getTime())) continue;
      const title = titles[code] || "";
      let type = termType(title);
      let ltv: number | null = title.match(/(\d{2})\s*%\s*ltv/i) ? Number(title.match(/(\d{2})\s*%\s*ltv/i)![1]) : null;
      if (!type && KNOWN_2YR_LTV[code] !== undefined) { type = "2yr_fixed"; ltv = KNOWN_2YR_LTV[code]; }
      if (!type && code === "IUDBEDR") type = "bank_rate";
      if (type) rows.push({ seriesCode: code, termType: type, ltvTier: ltv, ratePercent: value, effectiveMonth: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`, rawTitle: title });
      else unrecognised.push(code);
      break;
    }
  }
  return { rows, unrecognised };
}

/** The link an admin opens in a browser to download the last 4 months. */
export function boeDownloadUrl(today = new Date()) {
  const from = new Date(today);
  from.setMonth(from.getMonth() - 4);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const date = `01/${months[from.getMonth()]}/${from.getFullYear()}`;
  return `https://www.bankofengland.co.uk/boeapps/database/_iadb-FromShowColumns.asp?csv.x=yes&Datefrom=${date}&Dateto=now&SeriesCodes=${BOE_MORTGAGE_SERIES.join(",")}&CSVF=TT&UsingCodes=Y&VPD=Y&VFD=N`;
}
