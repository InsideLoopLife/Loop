import { Buffer } from "node:buffer";
import { parseSchoolCalendarText } from "@/lib/family/school-calendar-parser";

export type LoopWatchDocumentType =
  | "car_insurance"
  | "home_insurance"
  | "life_insurance"
  | "pet_insurance"
  | "travel_insurance"
  | "car_finance"
  | "vehicle_contract"
  | "mortgage_offer"
  | "savings_terms"
  | "broadband_contract"
  | "mobile_contract"
  | "utility_contract"
  | "employment_contract"
  | "tenancy_agreement"
  | "warranty"
  | "school_nursery_contract"
  | "school_calendar"
  | "school_agenda"
  | "bill_statement"
  | "council_tax_bill"
  | "appointment_letter"
  | "vehicle_service"
  | "general_contract";

export type LoopWatchExtraction = {
  documentType: LoopWatchDocumentType;
  providerName: string | null;
  productName: string | null;
  referenceHint: string | null;
  startDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  noticePeriodDays: number | null;
  paymentAmount: number | null;
  paymentFrequency: "monthly" | "annual" | "weekly" | "quarterly" | "one_off" | null;
  annualCost: number | null;
  autoRenews: boolean | null;
  coverLevel: string | null;
  excessTotal: number | null;
  mileageLimit: number | null;
  interestRatePercent: number | null;
  aprPercent: number | null;
  cancellationSummary: string | null;
  increaseSummary: string | null;
  keyTerms: Record<string, unknown>;
  riskFlags: string[];
  confidence: Record<string, number>;
  summary: string;
  source: "heuristic" | "ai" | "ai_with_heuristic_fallback";
};

export type LoopWatchTextResult = {
  text: string;
  extractionMethod: "text" | "pdf_best_effort" | "image_ai" | "image_unread" | "binary_unread";
  warning: string | null;
};

const MAX_TEXT_CHARS = 32000;
const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const LOOPWATCH_DOCUMENT_TYPE_VALUES: LoopWatchDocumentType[] = [
  "car_insurance",
  "home_insurance",
  "life_insurance",
  "pet_insurance",
  "travel_insurance",
  "car_finance",
  "vehicle_contract",
  "mortgage_offer",
  "savings_terms",
  "broadband_contract",
  "mobile_contract",
  "utility_contract",
  "employment_contract",
  "tenancy_agreement",
  "warranty",
  "school_nursery_contract",
  "school_calendar",
  "school_agenda",
  "bill_statement",
  "council_tax_bill",
  "appointment_letter",
  "vehicle_service",
  "general_contract",
];
const LOOPWATCH_DOCUMENT_TYPE_SET = new Set<string>(LOOPWATCH_DOCUMENT_TYPE_VALUES);
const SCHOOL_NO_COST_TYPES = new Set<LoopWatchDocumentType>(["school_calendar", "school_agenda"]);

function exactDocumentTypeHint(value?: string | null): LoopWatchDocumentType | null {
  const clean = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return LOOPWATCH_DOCUMENT_TYPE_SET.has(clean) ? (clean as LoopWatchDocumentType) : null;
}

function schoolSignalScore(value: string) {
  const h = value.toLowerCase();
  let score = 0;
  if (/\b(term dates?|school calendar|academic year|school year|holiday dates?)\b/.test(h)) score += 4;
  if (/\b(inset|teacher training day|staff training day|closure day)\b/.test(h)) score += 3;
  if (/\b(autumn term|spring term|summer term|half term|end of term|start of term|term starts|term ends)\b/.test(h)) score += 3;
  if (/\b(school holidays?|academy|primary school|secondary school|nursery|college)\b/.test(h)) score += 2;
  if (/\b(parents'? evening|school trip|permission slip|homework|class assembly)\b/.test(h)) score += 2;
  if (/\b(policy|insurance|premium|excess|comprehensive cover|mortgage|apr|credit agreement)\b/.test(h)) score -= 3;
  return score;
}

function cleanText(value: string) {
  return value
    .replace(/\u0000/g, " ")
    .replace(/[\t\r]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function decodePdfHex(value: string) {
  const cleaned = value.replace(/\s+/g, "");
  if (!cleaned || cleaned.length < 4) return "";
  try {
    const bytes: number[] = [];
    for (let index = 0; index < cleaned.length - 1; index += 2) {
      const parsed = Number.parseInt(cleaned.slice(index, index + 2), 16);
      if (Number.isFinite(parsed)) bytes.push(parsed);
    }
    const utf16LooksLikely = bytes.length > 2 && bytes[0] === 0xfe && bytes[1] === 0xff;
    if (utf16LooksLikely) {
      let out = "";
      for (let index = 2; index < bytes.length - 1; index += 2) {
        out += String.fromCharCode((bytes[index] << 8) + bytes[index + 1]);
      }
      return out;
    }
    return Buffer.from(bytes).toString("utf8");
  } catch {
    return "";
  }
}

function extractPdfTextBestEffort(buffer: Buffer) {
  const raw = buffer.toString("latin1");
  const chunks: string[] = [];

  const streamBlocks = raw.match(/BT[\s\S]*?ET/g) || [];
  for (const block of streamBlocks.slice(0, 250)) {
    for (const match of block.matchAll(/\((?:\\.|[^\\)])*\)\s*T[Jj]/g)) {
      chunks.push(decodePdfLiteral(match[0].replace(/\)\s*T[Jj]$/, "").slice(1)));
    }
    for (const match of block.matchAll(/<([0-9A-Fa-f\s]{8,})>\s*T[Jj]/g)) {
      chunks.push(decodePdfHex(match[1] || ""));
    }
  }

  if (chunks.join(" ").trim().length < 80) {
    for (const match of raw.matchAll(/\((?:\\.|[^\\)]){3,}\)/g)) {
      chunks.push(decodePdfLiteral(match[0].slice(1, -1)));
      if (chunks.length > 1000) break;
    }
  }

  if (chunks.join(" ").trim().length < 80) {
    const printable = raw
      .replace(/[^\x20-\x7E\n]/g, " ")
      .replace(/\s+/g, " ")
      .match(/[A-Za-z][A-Za-z0-9 £$€.,:/%()\-]{4,}/g);
    if (printable) chunks.push(...printable.slice(0, 700));
  }

  return cleanText(chunks.join("\n"));
}

async function extractImageTextWithOpenAi(file: File, model = process.env.LOOP_DOCUMENT_VISION_MODEL || process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini") {
  const key = process.env.LOOP_DOCUMENT_AI_KEY || process.env.OPENAI_API_KEY || process.env.OPENAI_PREMIUM_API_KEY;
  if (!key) return null;
  const mime = file.type || "image/jpeg";
  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "Extract readable text only from the document image. Do not add commentary. Preserve dates, pounds, provider names, policy terms and renewal wording.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Read this contract/policy image and return the text you can see." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return cleanText(String(payload?.choices?.[0]?.message?.content || ""));
}

export async function extractReadableTextFromFile(file: File): Promise<LoopWatchTextResult> {
  const name = file.name.toLowerCase();
  const mime = file.type || "application/octet-stream";
  if (mime.startsWith("text/") || /\.(txt|csv|md|json|rtf|html|xml)$/i.test(name)) {
    return { text: cleanText(await file.text()), extractionMethod: "text", warning: null };
  }

  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    const text = extractPdfTextBestEffort(Buffer.from(await file.arrayBuffer()));
    return {
      text,
      extractionMethod: "pdf_best_effort",
      warning: text.length < 120 ? "This PDF may be scanned or compressed. LoopWatch saved a review card, but you may need to fill a few fields manually." : null,
    };
  }

  if (mime.startsWith("image/")) {
    const text = await extractImageTextWithOpenAi(file);
    if (text) return { text, extractionMethod: "image_ai", warning: null };
    return {
      text: "",
      extractionMethod: "image_unread",
      warning: "Image OCR needs LOOP_DOCUMENT_AI_KEY or OPENAI_API_KEY. LoopWatch saved a blank review card and deleted the source image.",
    };
  }

  return {
    text: "",
    extractionMethod: "binary_unread",
    warning: "This file type cannot be read yet. LoopWatch saved a blank review card and deleted the source file.",
  };
}

function normaliseWhitespace(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lower(value: string) {
  return value.toLowerCase();
}

function toIsoDate(day: number, month: number, year: number) {
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  const fullYear = year < 100 ? 2000 + year : year;
  if (fullYear < 1990 || fullYear > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(fullYear, month - 1, day));
  if (date.getUTCFullYear() !== fullYear || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(value: string) {
  const trimmed = value.trim();
  let match = trimmed.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (match) return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = trimmed.match(/\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\b/);
  if (match) return toIsoDate(Number(match[3]), Number(match[2]), Number(match[1]));
  match = trimmed.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/i);
  if (match) return toIsoDate(Number(match[1]), Number(MONTHS[match[2].toLowerCase()]), Number(match[3]));
  match = trimmed.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})\b/i);
  if (match) return toIsoDate(Number(match[2]), Number(MONTHS[match[1].toLowerCase()]), Number(match[3]));
  return null;
}

function daysBetween(a: string, b: string) {
  const start = Date.parse(a);
  const end = Date.parse(b);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86400000);
}

function findDates(text: string) {
  const hits: Array<{ value: string; date: string; index: number; context: string }> = [];
  const regexes = [
    /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g,
    /\b\d{4}[\/-]\d{1,2}[\/-]\d{1,2}\b/g,
    /\b\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+\d{2,4}\b/gi,
    /\b[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{2,4}\b/gi,
  ];
  for (const regex of regexes) {
    for (const match of text.matchAll(regex)) {
      const value = match[0];
      const date = parseDate(value);
      if (!date) continue;
      const index = match.index || 0;
      hits.push({ value, date, index, context: text.slice(Math.max(0, index - 90), index + value.length + 90).toLowerCase() });
    }
  }
  const byDate = new Map<string, { value: string; date: string; index: number; context: string }>();
  for (const hit of hits) if (!byDate.has(`${hit.date}:${hit.index}`)) byDate.set(`${hit.date}:${hit.index}`, hit);
  return Array.from(byDate.values()).sort((a, b) => a.index - b.index);
}

function chooseDate(dates: ReturnType<typeof findDates>, words: string[]) {
  const scored = dates
    .map((hit) => {
      let score = 0;
      for (const word of words) {
        if (hit.context.includes(word)) score += word.length > 8 ? 3 : 2;
      }
      if (/date of birth|birth date|dob/.test(hit.context)) score -= 8;
      if (/printed|issued|statement date|quote date/.test(hit.context)) score -= 2;
      return { ...hit, score };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0]?.date || null;
}

function detectDocumentType(text: string, hint?: string | null): LoopWatchDocumentType {
  const exactHint = exactDocumentTypeHint(hint);
  if (exactHint && exactHint !== "general_contract") return exactHint;

  const h = lower(`${hint || ""} ${text}`);
  const parsedSchoolCalendar = parseSchoolCalendarText(text);
  if (parsedSchoolCalendar.terms.length >= 2 || parsedSchoolCalendar.insetDays.length >= 2) return "school_calendar";
  const schoolScore = schoolSignalScore(h);
  if (schoolScore >= 4) {
    if (/\b(school agenda|homework|parents'? evening|school trip|class assembly|permission slip|school notice)\b/.test(h)) return "school_agenda";
    if (/\b(nursery fees?|childcare fees?|wraparound care|breakfast club|after school club)\b/.test(h)) return "school_nursery_contract";
    return "school_calendar";
  }

  if (/school calendar|term dates|inset days?|school holidays?|academy calendar|academic year|autumn term|spring term|summer term|half term/.test(h)) return "school_calendar";
  if (/school agenda|homework|parents'? evening|school trip|class assembly|permission slip|school notice/.test(h)) return "school_agenda";
  if (/nursery|school fees|childcare|term time|wraparound/.test(h)) return "school_nursery_contract";
  if (/car insurance|motor insurance|vehicle insurance|comprehensive cover|third party fire/.test(h)) return "car_insurance";
  if (/home insurance|buildings insurance|contents insurance|escape of water/.test(h)) return "home_insurance";
  if (/life insurance|life assurance|critical illness|sum assured/.test(h)) return "life_insurance";
  if (/pet insurance|veterinary fees/.test(h)) return "pet_insurance";
  if (/travel insurance|medical expenses abroad|trip cancellation/.test(h)) return "travel_insurance";
  if (/hire purchase|pcp|personal contract purchase|balloon payment|optional final payment|car finance|vehicle finance/.test(h)) return "car_finance";
  if (/looking for (?:a )?(?:new|used)?\s*(?:car|vehicle)|new car|car lease|lease deal|pcp deal|vehicle search|vehicle contract|lease agreement|mileage allowance|excess mileage/.test(h)) return "vehicle_contract";
  if (/mortgage offer|mortgage illustration|initial rate|standard variable rate|loan to value/.test(h)) return "mortgage_offer";
  if (/savings account|fixed rate bond|cash isa|gross aer|interest paid|maturity date/.test(h)) return "savings_terms";
  if (/broadband|fibre|minimum term|router|line rental/.test(h)) return "broadband_contract";
  if (/mobile contract|airtime plan|handset plan|data allowance|sim only/.test(h)) return "mobile_contract";
  if (/energy tariff|electricity|gas tariff|standing charge|unit rate|utility/.test(h)) return "utility_contract";
  if (/employment contract|salary|notice period|probation|holiday entitlement/.test(h)) return "employment_contract";
  if (/tenancy agreement|landlord|tenant|rent deposit|assured shorthold/.test(h)) return "tenancy_agreement";
  if (/council tax|local authority bill|council bill/.test(h)) return "council_tax_bill";
  if (/mot certificate|service plan|vehicle service|car service|maintenance plan/.test(h)) return "vehicle_service";
  if (/appointment letter|appointment confirmation|clinic appointment|consultation appointment/.test(h)) return "appointment_letter";
  if (/bill|statement|invoice|monthly statement/.test(h) && /amount due|payment due|direct debit|balance due/.test(h)) return "bill_statement";
  if (/warranty|guarantee|repair plan|care plan/.test(h)) return "warranty";
  return exactHint || "general_contract";
}

function extractProvider(text: string, filename: string, documentType?: LoopWatchDocumentType | null) {
  const cleanFilename = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  if (documentType && (documentType === "school_calendar" || documentType === "school_agenda" || documentType === "school_nursery_contract")) {
    const school = text.match(/([A-Z][A-Za-z'&. -]{3,80}\s(?:School|Nursery|Academy|College))/)?.[1];
    if (school) return normaliseWhitespace(school).slice(0, 80);
    return /school|academy|nursery|college|term dates?|academic year/i.test(cleanFilename) ? cleanFilename.slice(0, 80) : null;
  }

  const explicit = [
    /(?:provider|insurer|lender|company|supplier|underwritten by|provided by)\s*[:\-]\s*([^\n]{2,80})/i,
    /(?:your policy with|agreement with|contract with)\s+([^\n]{2,80})/i,
  ];
  for (const regex of explicit) {
    const match = text.match(regex);
    if (match?.[1]) return normaliseWhitespace(match[1]).replace(/[.;,]$/, "").slice(0, 80);
  }
  const known = [
    "Admiral", "Aviva", "Direct Line", "Churchill", "LV", "Legal & General", "AXA", "Hastings", "esure", "More Than", "NFU Mutual",
    "Santander", "Nationwide", "Barclays", "NatWest", "HSBC", "Halifax", "Lloyds", "TSB", "Virgin Money", "Monzo", "Starling",
    "Sky", "BT", "EE", "Vodafone", "O2", "Three", "Plusnet", "TalkTalk", "Virgin Media", "Octopus", "British Gas", "E.ON", "EDF", "OVO",
  ];
  const lowerText = text.toLowerCase();
  const knownHit = known.find((name) => lowerText.includes(name.toLowerCase()));
  if (knownHit) {
    if (knownHit === "LV" && !/\b(lv=|liverpool victoria|insurance|policy|premium|cover|insurer)\b/i.test(`${text} ${filename}`)) return null;
    return knownHit;
  }
  return cleanFilename || null;
}

function extractProductName(text: string, documentType: LoopWatchDocumentType) {
  const regexes = [
    /(?:product|policy|plan|tariff|account|agreement)\s*(?:name)?\s*[:\-]\s*([^\n]{2,100})/i,
    /(?:cover type|type of cover)\s*[:\-]\s*([^\n]{2,80})/i,
  ];
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match?.[1]) return normaliseWhitespace(match[1]).replace(/[.;,]$/, "").slice(0, 100);
  }
  const defaults: Record<LoopWatchDocumentType, string> = {
    car_insurance: "Car insurance",
    home_insurance: "Home insurance",
    life_insurance: "Life insurance",
    pet_insurance: "Pet insurance",
    travel_insurance: "Travel insurance",
    car_finance: "Car finance",
    vehicle_contract: "Vehicle contract",
    mortgage_offer: "Mortgage offer",
    savings_terms: "Savings account terms",
    broadband_contract: "Broadband contract",
    mobile_contract: "Mobile contract",
    utility_contract: "Utility contract",
    employment_contract: "Employment contract",
    tenancy_agreement: "Tenancy agreement",
    warranty: "Warranty / care plan",
    school_nursery_contract: "School / nursery contract",
    school_calendar: "School calendar",
    school_agenda: "School agenda / notice",
    bill_statement: "Bill / statement",
    council_tax_bill: "Council tax bill",
    appointment_letter: "Appointment letter",
    vehicle_service: "Vehicle service / MOT",
    general_contract: "Contract",
  };
  return defaults[documentType];
}

function parseMoney(value: string | undefined) {
  if (!value) return null;
  const cleaned = value.replace(/[,£$€\s]/g, "");
  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function moneyNear(text: string, words: string[]) {
  const moneyRegex = /(?:£|GBP\s*)\s?([0-9][0-9,]*(?:\.\d{1,2})?)/gi;
  const hits: Array<{ amount: number; index: number; context: string; score: number }> = [];
  for (const match of text.matchAll(moneyRegex)) {
    const amount = parseMoney(match[1]);
    if (amount === null) continue;
    const index = match.index || 0;
    const context = text.slice(Math.max(0, index - 80), index + 120).toLowerCase();
    let score = 0;
    for (const word of words) if (context.includes(word)) score += 2;
    if (/excess|deposit|fee|charge|balance|loan|sum assured|cover amount/.test(context)) score -= 1;
    hits.push({ amount, index, context, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.index - b.index)[0] || null;
}

function extractPayment(text: string) {
  const explicit = [
    { regex: /(?:monthly payment|monthly premium|per month|each month|monthly cost)\D{0,40}(?:£|GBP\s*)\s?([0-9][0-9,]*(?:\.\d{1,2})?)/i, frequency: "monthly" as const },
    { regex: /(?:annual premium|annual cost|yearly premium|per year|each year)\D{0,40}(?:£|GBP\s*)\s?([0-9][0-9,]*(?:\.\d{1,2})?)/i, frequency: "annual" as const },
    { regex: /(?:weekly payment|per week|each week)\D{0,40}(?:£|GBP\s*)\s?([0-9][0-9,]*(?:\.\d{1,2})?)/i, frequency: "weekly" as const },
    { regex: /(?:quarterly payment|per quarter)\D{0,40}(?:£|GBP\s*)\s?([0-9][0-9,]*(?:\.\d{1,2})?)/i, frequency: "quarterly" as const },
    { regex: /(?:total premium|total cost|total payable)\D{0,40}(?:£|GBP\s*)\s?([0-9][0-9,]*(?:\.\d{1,2})?)/i, frequency: "one_off" as const },
  ];
  for (const candidate of explicit) {
    const match = text.match(candidate.regex);
    const amount = parseMoney(match?.[1]);
    if (amount !== null) {
      const annualCost = candidate.frequency === "monthly" ? amount * 12 : candidate.frequency === "weekly" ? amount * 52 : candidate.frequency === "quarterly" ? amount * 4 : amount;
      return { paymentAmount: amount, paymentFrequency: candidate.frequency, annualCost: Math.round(annualCost * 100) / 100 };
    }
  }
  const general = moneyNear(text, ["premium", "payment", "monthly", "annual", "cost", "amount due"]);
  if (general?.amount) {
    const frequency = general.context.includes("month") ? "monthly" : general.context.includes("week") ? "weekly" : general.context.includes("quarter") ? "quarterly" : general.context.includes("annual") || general.context.includes("year") ? "annual" : null;
    return {
      paymentAmount: general.amount,
      paymentFrequency: frequency as any,
      annualCost: frequency === "monthly" ? Math.round(general.amount * 1200) / 100 : frequency === "weekly" ? general.amount * 52 : frequency === "quarterly" ? general.amount * 4 : frequency === "annual" ? general.amount : null,
    };
  }
  return { paymentAmount: null, paymentFrequency: null, annualCost: null };
}

function extractNumberNear(text: string, regexes: RegExp[]) {
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match?.[1]) {
      const value = Number.parseFloat(match[1].replace(/,/g, ""));
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

function sentenceContaining(text: string, words: string[]) {
  const sentences = text.replace(/\n+/g, ". ").split(/(?<=[.!?])\s+/).map((line) => line.trim()).filter(Boolean);
  const hit = sentences.find((sentence) => words.some((word) => sentence.toLowerCase().includes(word)));
  return hit ? hit.slice(0, 260) : null;
}

function stripSensitiveReference(value: string | null) {
  if (!value) return null;
  const trimmed = normaliseWhitespace(value);
  const last = trimmed.match(/([A-Za-z0-9]{4})\b/);
  return last ? `ending ${last[1]}` : null;
}

function extractReferenceHint(text: string) {
  const regexes = [
    /(?:policy number|policy ref|reference|agreement number|account number)\s*[:\-]?\s*([A-Za-z0-9\-\s]{4,40})/i,
  ];
  for (const regex of regexes) {
    const match = text.match(regex);
    const redacted = stripSensitiveReference(match?.[1] || null);
    if (redacted) return redacted;
  }
  return null;
}

function computeSummary(extraction: Omit<LoopWatchExtraction, "summary" | "source">) {
  const parts = [extraction.providerName, extraction.productName].filter(Boolean).join(" · ") || "LoopWatch item";
  const date = extraction.renewalDate || extraction.endDate;
  const cost = extraction.paymentAmount ? `£${extraction.paymentAmount}${extraction.paymentFrequency ? ` ${extraction.paymentFrequency}` : ""}` : null;
  return [parts, date ? `date tracked ${date}` : null, cost].filter(Boolean).join(". ");
}

function confidenceScore(value: unknown, high = 0.86, low = 0.35) {
  if (value === null || value === undefined || value === "") return 0;
  return high || low;
}

export function heuristicLoopWatchExtraction(args: { text: string; filename: string; mimeType?: string | null; documentTypeHint?: string | null; userNote?: string | null }): LoopWatchExtraction {
  const filename = args.filename || "document";
  const userNote = args.userNote || "";
  const text = cleanText([args.documentTypeHint, filename, userNote, args.text || ""].filter(Boolean).join("\n"));
  const type = detectDocumentType(text, args.documentTypeHint || filename);
  const dates = findDates(text);
  const startDate = chooseDate(dates, ["start date", "starts", "commencement", "effective from", "cover from", "from date", "policy starts", "contract starts"]);
  let endDate = chooseDate(dates, ["end date", "ends", "expiry", "expires", "maturity", "until", "cover to", "policy ends", "contract ends", "minimum term ends"]);
  let renewalDate = chooseDate(dates, ["renewal", "renews", "renew", "auto renew", "review date"]);

  if (!endDate && startDate) {
    const futureDates = dates.map((hit) => hit.date).filter((date) => date > startDate && (daysBetween(startDate, date) || 0) > 14).sort();
    endDate = futureDates[0] || null;
  }
  if (!renewalDate && endDate && /auto.?renew|renewal|renews/.test(text.toLowerCase())) renewalDate = endDate;

  const payment = SCHOOL_NO_COST_TYPES.has(type) ? { paymentAmount: null, paymentFrequency: null, annualCost: null } : extractPayment(text);
  const providerName = extractProvider(text, filename, type);
  const noticePeriodDays = extractNumberNear(text, [
    /(?:notice period|give (?:us )?notice|cancellation notice|cancel.*notice)\D{0,40}(\d{1,3})\s*(?:calendar\s*)?days/i,
    /(\d{1,3})\s*(?:calendar\s*)?days(?:'|’)?\s+notice/i,
    /(?:notice period|give (?:us )?notice)\D{0,40}(\d{1,2})\s*months/i,
  ]);
  const noticeDays = noticePeriodDays !== null && /months/i.test(text.match(/(?:notice period|give (?:us )?notice)\D{0,40}\d{1,2}\s*months/i)?.[0] || "") ? Math.round(noticePeriodDays * 30) : noticePeriodDays;

  const autoRenews = /auto.?renew|automatically renew|automatic renewal|continuous payment authority/.test(text.toLowerCase()) ? true : /does not renew|will not renew|no automatic renewal/.test(text.toLowerCase()) ? false : null;
  const coverLevel = text.match(/\b(comprehensive|third party fire and theft|third party only|buildings and contents|buildings only|contents only|fully comprehensive)\b/i)?.[1] || null;
  const excessTotal = extractNumberNear(text, [
    /(?:total excess|compulsory excess|voluntary excess|policy excess)\D{0,40}(?:£|GBP\s*)\s?([0-9][0-9,]*(?:\.\d{1,2})?)/i,
  ]);
  const mileageLimit = extractNumberNear(text, [
    /(?:annual mileage|mileage limit|mileage allowance)\D{0,60}([0-9][0-9,]{2,})\s*(?:miles|mi)?/i,
  ]);
  const interestRatePercent = extractNumberNear(text, [
    /(?:interest rate|gross aer|aer|fixed rate)\D{0,40}([0-9]+(?:\.\d+)?)\s*%/i,
  ]);
  const aprPercent = extractNumberNear(text, [
    /(?:apr|representative apr|annual percentage rate)\D{0,40}([0-9]+(?:\.\d+)?)\s*%/i,
  ]);

  const cancellationSummary = sentenceContaining(text, ["cancel", "cancellation", "cooling-off", "cooling off", "early repayment", "settlement"]);
  const increaseSummary = sentenceContaining(text, ["increase", "inflation", "rpi", "cpi", "price rise", "premium may change", "renewal premium"]);

  const riskFlags: string[] = [];
  if (autoRenews) riskFlags.push("Auto-renewal appears to be enabled.");
  if (noticeDays && noticeDays >= 21) riskFlags.push(`Notice period looks like ${noticeDays} days.`);
  if (payment.paymentFrequency === "monthly" && /interest|credit agreement|apr/.test(text.toLowerCase())) riskFlags.push("Monthly payments may include credit/interest charges.");
  if (String(type).includes("insurance") && !coverLevel) riskFlags.push("Cover level was not clearly found; user should confirm it.");
  if (type === "car_insurance" && !mileageLimit) riskFlags.push("Mileage limit was not clearly found; user should confirm it.");
  if (increaseSummary) riskFlags.push("Document mentions price/premium increases or renewal changes.");
  if (!endDate && !renewalDate) riskFlags.push("End/renewal date was not clearly found.");

  const keyTerms = {
    extraction_method: "heuristic",
    text_chars_used: text.length,
    date_hits: dates.slice(0, 12).map((date) => ({ date: date.date, context: date.context.slice(0, 130) })),
  };

  const base = {
    documentType: type,
    providerName,
    productName: extractProductName(text, type),
    referenceHint: extractReferenceHint(text),
    startDate,
    endDate,
    renewalDate,
    noticePeriodDays: noticeDays,
    paymentAmount: payment.paymentAmount,
    paymentFrequency: payment.paymentFrequency,
    annualCost: payment.annualCost,
    autoRenews,
    coverLevel,
    excessTotal,
    mileageLimit,
    interestRatePercent,
    aprPercent,
    cancellationSummary,
    increaseSummary,
    keyTerms,
    riskFlags,
    confidence: {
      documentType: type === "general_contract" ? 0.35 : 0.82,
      providerName: confidenceScore(providerName, 0.7),
      startDate: confidenceScore(startDate),
      endDate: confidenceScore(endDate),
      renewalDate: confidenceScore(renewalDate, 0.75),
      paymentAmount: confidenceScore(payment.paymentAmount),
      noticePeriodDays: confidenceScore(noticeDays, 0.7),
      coverLevel: confidenceScore(coverLevel, 0.65),
      autoRenews: autoRenews === null ? 0 : 0.72,
    },
  } satisfies Omit<LoopWatchExtraction, "summary" | "source">;

  return sanitiseExtractionForType({ ...base, summary: computeSummary(base), source: "heuristic" });
}

function safeJson(value: string) {
  const cleaned = value.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

function sanitiseExtractionForType(extraction: LoopWatchExtraction): LoopWatchExtraction {
  if (extraction.documentType === "school_calendar" || extraction.documentType === "school_agenda") {
    const productName = extraction.documentType === "school_calendar" ? "School calendar / term dates" : "School agenda / notice";
    return {
      ...extraction,
      productName: extraction.productName && !/contract/i.test(extraction.productName) ? extraction.productName : productName,
      paymentAmount: null,
      paymentFrequency: null,
      annualCost: null,
      autoRenews: null,
      coverLevel: null,
      excessTotal: null,
      mileageLimit: null,
      interestRatePercent: null,
      aprPercent: null,
      cancellationSummary: null,
      increaseSummary: null,
      riskFlags: (extraction.riskFlags || []).filter((flag) => !/renewal|auto-renewal|cover level|premium|mileage|price/i.test(flag)),
      summary: extraction.summary && !/contract/i.test(extraction.summary) ? extraction.summary : productName,
    };
  }
  return extraction;
}

function mergeExtraction(heuristic: LoopWatchExtraction, ai: Partial<LoopWatchExtraction> | null): LoopWatchExtraction {
  if (!ai) return sanitiseExtractionForType(heuristic);
  const heuristicIsSchool = heuristic.documentType === "school_calendar" || heuristic.documentType === "school_agenda" || heuristic.documentType === "school_nursery_contract";
  const aiType = ai.documentType as LoopWatchDocumentType | undefined;
  const aiWouldDowngradeSchool = heuristicIsSchool && (!aiType || aiType === "general_contract" || aiType === "employment_contract" || aiType === "tenancy_agreement");
  const merged: LoopWatchExtraction = {
    ...heuristic,
    ...Object.fromEntries(Object.entries(ai).filter(([, value]) => value !== undefined && value !== null && value !== "")),
    documentType: aiWouldDowngradeSchool ? heuristic.documentType : ((ai.documentType as LoopWatchDocumentType | undefined) || heuristic.documentType),
    keyTerms: { ...heuristic.keyTerms, ...(ai.keyTerms || {}), extraction_method: "ai" },
    riskFlags: Array.from(new Set([...(heuristic.riskFlags || []), ...((ai.riskFlags as string[]) || [])])).slice(0, 10),
    confidence: { ...heuristic.confidence, ...(ai.confidence || {}) },
    source: "ai",
  };
  return sanitiseExtractionForType({ ...merged, summary: ai.summary || computeSummary(merged) });
}

async function aiLoopWatchExtraction(text: string, heuristic: LoopWatchExtraction, context?: { filename?: string; documentTypeHint?: string | null; userNote?: string | null }) {
  const key = process.env.LOOP_DOCUMENT_AI_KEY || process.env.OPENAI_API_KEY || process.env.OPENAI_PREMIUM_API_KEY;
  if (!key || process.env.LOOP_DOCUMENT_AI_DISABLED === "true" || text.length < 40) return null;
  const model = process.env.LOOP_DOCUMENT_AI_MODEL || process.env.OPENAI_RESEARCH_MODEL || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You extract useful facts for LoopWatch from household documents: contracts, policies, bills, school calendars, school agendas, term-date sheets, nursery letters, appointments and warranties. Return only JSON. Never invent details. Use ISO dates. Redact reference numbers to last 4 only. If the document contains term dates, INSET days, academic years, autumn/spring/summer terms or school holidays, classify it as school_calendar, not general_contract. Do not provide legal/financial advice; only extract and flag possible review points.",
        },
        {
          role: "user",
          content: JSON.stringify({
            expected_shape: {
              documentType: "car_insurance | home_insurance | life_insurance | pet_insurance | travel_insurance | car_finance | vehicle_contract | vehicle_service | mortgage_offer | savings_terms | broadband_contract | mobile_contract | utility_contract | council_tax_bill | bill_statement | employment_contract | tenancy_agreement | warranty | school_nursery_contract | school_calendar | school_agenda | appointment_letter | general_contract",
              providerName: "string|null",
              productName: "string|null",
              referenceHint: "ending 1234|null",
              startDate: "YYYY-MM-DD|null",
              endDate: "YYYY-MM-DD|null",
              renewalDate: "YYYY-MM-DD|null",
              noticePeriodDays: "number|null",
              paymentAmount: "number|null",
              paymentFrequency: "monthly|annual|weekly|quarterly|one_off|null",
              annualCost: "number|null",
              autoRenews: "boolean|null",
              coverLevel: "string|null",
              excessTotal: "number|null",
              mileageLimit: "number|null",
              interestRatePercent: "number|null",
              aprPercent: "number|null",
              cancellationSummary: "short string|null",
              increaseSummary: "short string|null",
              keyTerms: "object",
              riskFlags: "array of short strings",
              confidence: "object of field confidence 0..1",
              summary: "short user-facing summary",
            },
            filename: context?.filename || null,
            user_note: context?.userNote || null,
            document_type_hint: context?.documentTypeHint || null,
            heuristic,
            document_text: text.slice(0, MAX_TEXT_CHARS),
          }),
        },
      ],
    }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const content = String(payload?.choices?.[0]?.message?.content || "");
  return safeJson(content) as Partial<LoopWatchExtraction>;
}

export async function extractLoopWatchFacts(args: { text: string; filename: string; mimeType?: string | null; documentTypeHint?: string | null; userNote?: string | null }) {
  const heuristic = heuristicLoopWatchExtraction(args);
  try {
    const ai = await aiLoopWatchExtraction([args.filename, args.userNote || "", args.text || ""].filter(Boolean).join("\n"), heuristic, { filename: args.filename, userNote: args.userNote, documentTypeHint: args.documentTypeHint });
    return ai ? mergeExtraction(heuristic, ai) : heuristic;
  } catch {
    return { ...heuristic, source: "ai_with_heuristic_fallback" as const };
  }
}

function addDays(isoDate: string, days: number) {
  const timestamp = Date.parse(`${isoDate}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return null;
  const next = new Date(timestamp + days * 86400000);
  return next.toISOString().slice(0, 10);
}

export function buildLoopWatchEvents(itemId: string, extraction: LoopWatchExtraction, userId: string, householdId: string | null) {
  const trackedDate = extraction.renewalDate || extraction.endDate;
  if (!trackedDate) return [];
  const events: Array<{ user_id: string; household_id: string | null; visibility_scope: string; loopwatch_item_id: string; event_type: string; event_date: string; status: string; message: string }> = [];
  const baseName = [extraction.providerName, extraction.productName].filter(Boolean).join(" · ") || "LoopWatch item";
  const reminders = [
    { days: -90, type: "compare_window", label: "Start comparing/checking alternatives" },
    { days: -45, type: "renewal_check", label: "Renewal check" },
    { days: -21, type: "notice_window", label: "Notice/cancellation window" },
    { days: -7, type: "urgent_renewal", label: "Renewal/end date soon" },
  ];
  if (extraction.noticePeriodDays && extraction.noticePeriodDays > 0) {
    reminders.push({ days: -(extraction.noticePeriodDays + 7), type: "notice_buffer", label: `Prepare before ${extraction.noticePeriodDays}-day notice period` });
  }
  for (const reminder of reminders) {
    const eventDate = addDays(trackedDate, reminder.days);
    if (!eventDate) continue;
    events.push({
      user_id: userId,
      household_id: householdId,
      visibility_scope: householdId ? "household" : "private",
      loopwatch_item_id: itemId,
      event_type: reminder.type,
      event_date: eventDate,
      status: "scheduled",
      message: `${reminder.label}: ${baseName}`,
    });
  }
  events.push({
    user_id: userId,
    household_id: householdId,
    visibility_scope: householdId ? "household" : "private",
    loopwatch_item_id: itemId,
    event_type: extraction.renewalDate ? "renewal_date" : "end_date",
    event_date: trackedDate,
    status: "scheduled",
    message: `${extraction.renewalDate ? "Renewal" : "End date"}: ${baseName}`,
  });
  const unique = new Map(events.map((event) => [`${event.event_type}:${event.event_date}`, event]));
  return Array.from(unique.values()).sort((a, b) => a.event_date.localeCompare(b.event_date));
}
