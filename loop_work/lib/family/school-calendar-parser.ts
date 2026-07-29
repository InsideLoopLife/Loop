export type ParsedSchoolTerm = {
  label: string;
  openingDate: string;
  closingDate: string;
};

export type ParsedSchoolImport = {
  terms: ParsedSchoolTerm[];
  insetDays: Array<{ label: string; date: string }>;
  bankHolidays: Array<{ label: string; date: string }>;
  confidence: number;
  notes: string[];
};

const monthMap: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function cleanOrdinal(text: string) {
  return text.replace(/(\d+)(st|nd|rd|th)/gi, "$1").replace(/\s+/g, " ").trim();
}

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseUkDate(text: string): string | null {
  const cleaned = cleanOrdinal(text);
  const named = cleaned.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})/i);
  if (named) {
    const day = Number(named[1]);
    const month = monthMap[named[2].toLowerCase()];
    const year = Number(named[3]);
    if (day && month && year) return iso(year, month, day);
  }
  const numeric = cleaned.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = Number(numeric[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return iso(year, month, day);
  }
  return null;
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function dateBefore(date: string) {
  return addDays(date, -1);
}

function labelForBreak(previous: ParsedSchoolTerm, next: ParsedSchoolTerm) {
  const previousLabel = previous.label.toLowerCase();
  const nextLabel = next.label.toLowerCase();
  if (previousLabel.includes("autumn") && nextLabel.includes("autumn")) return "Autumn half-term";
  if (previousLabel.includes("autumn") && nextLabel.includes("spring")) return "Christmas holiday";
  if (previousLabel.includes("spring") && nextLabel.includes("spring")) return "February half-term";
  if (previousLabel.includes("spring") && nextLabel.includes("summer")) return "Easter holiday";
  if (previousLabel.includes("summer") && nextLabel.includes("summer")) return "May half-term";
  if (previousLabel.includes("summer")) return "Summer holiday";
  return `${previous.label} break`;
}

export function generateHolidayPeriodsFromTerms(terms: ParsedSchoolTerm[]) {
  const sorted = [...terms].sort((a, b) => a.openingDate.localeCompare(b.openingDate));
  const rows: Array<{ label: string; start_date: string; end_date: string }> = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    const start = addDays(current.closingDate, 1);
    const end = dateBefore(next.openingDate);
    if (start <= end) rows.push({ label: labelForBreak(current, next), start_date: start, end_date: end });
  }
  return rows;
}

export function parseSchoolCalendarText(input: string): ParsedSchoolImport {
  const text = cleanOrdinal(input || "");
  const notes: string[] = [];
  const terms: ParsedSchoolTerm[] = [];
  const insetDays: Array<{ label: string; date: string }> = [];
  const bankHolidays: Array<{ label: string; date: string }> = [];

  const readableDate = String.raw`(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*\d{1,2}\s+[A-Za-z]+\s+20\d{2}|\b\d{1,2}[\/.-]\d{1,2}[\/.-]20\d{2}\b`;

  const termRegexes = [
    /((?:Autumn|Spring|Summer)\s*[12]?\s*20\d{2}).{0,180}?((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*\d{1,2}\s+[A-Za-z]+\s+20\d{2}).{0,180}?((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*\d{1,2}\s+[A-Za-z]+\s+20\d{2})/gis,
    /((?:Autumn|Spring|Summer)\s*(?:Term)?\s*(?:[12])?).{0,120}?((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*\d{1,2}\s+[A-Za-z]+\s+20\d{2}).{0,120}?((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*\d{1,2}\s+[A-Za-z]+\s+20\d{2})/gis,
  ];
  const seenTerms = new Set<string>();
  for (const termRegex of termRegexes) {
    for (const match of text.matchAll(termRegex)) {
      const openingDate = parseUkDate(match[2]);
      const closingDate = parseUkDate(match[3]);
      if (openingDate && closingDate) {
        const label = match[1].replace(/\s+/g, " ").trim().replace(/\s+$/, "") || "School term";
        const key = `${label}:${openingDate}:${closingDate}`;
        if (!seenTerms.has(key)) {
          seenTerms.add(key);
          terms.push({ label, openingDate, closingDate });
        }
      }
    }
  }

  const insetBlock = text.split(/Inset Days?/i)[1]?.split(/Bank Holidays?|Twilight|Notes?|$|\n\s*\n/i)[0] || "";
  const insetDateRegex = /(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*\d{1,2}\s+[A-Za-z]+\s+20\d{2}|\b\d{1,2}[\/.-]\d{1,2}[\/.-]20\d{2}\b/gi;
  for (const match of insetBlock.match(insetDateRegex) || []) {
    const date = parseUkDate(match);
    if (date) insetDays.push({ label: "Inset day", date });
  }

  const bankBlock = text.split(/Bank Holidays?/i)[1]?.split(/Inset Days?|Notes?|$|\n\s*\n/i)[0] || "";
  for (const match of bankBlock.match(insetDateRegex) || []) {
    const date = parseUkDate(match);
    if (date) bankHolidays.push({ label: "Bank holiday", date });
  }

  if (!terms.length) notes.push("No term table could be parsed confidently. Paste the table text or enter periods manually.");
  if (!insetDays.length) notes.push("No inset days were detected. Add them manually if the school has inset days.");

  const confidence = Math.min(95, Math.max(15, terms.length * 14 + insetDays.length * 4 + bankHolidays.length * 3));
  return { terms, insetDays, bankHolidays, confidence, notes };
}
