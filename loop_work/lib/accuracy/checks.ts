/**
 * "Keep LOOP accurate": figures LOOP is estimating, or that nobody has checked
 * for six months, each with a way to check the real figure.
 *
 * Check opens the provider's sign-in page (or an email search) in a new tab
 * and keeps a small form open in LOOP for the real figure.
 *
 * Pure: the loader passes rows in, and this decides what to ask.
 */

export const CHECK_EVERY_DAYS = 183;

export type CheckLink = { label: string; url: string };

export type AccuracyCheck = {
  key: string;
  kind: "student_loan" | "mortgage" | "pension" | "price_confirm";
  recordId: string;
  title: string;
  /** Why LOOP is asking, in a sentence. */
  reason: string;
  /** The figure LOOP is using now. */
  current: number | null;
  currentLabel: string;
  lastChecked: string | null;
  isEstimate: boolean;
  link: CheckLink | null;
  /** Words to search an inbox for, when the answer is usually in an email. */
  emailSearch?: string;
  form: {
    amountLabel: string;
    /** Ask for the date of the last payment (mortgage: sets the payment day). */
    askLastPayment?: boolean;
    /** Ask when the new figure starts (price changes). */
    askEffective?: boolean;
    effectiveDefault?: string | null;
  };
  /** Extra ids the save action needs. */
  meta?: Record<string, string | null>;
};

export type StudentLoanRow = { id: string; person_id?: string | null; plan?: string | null; current_balance: number | string | null; balance_date?: string | null };
export type MortgageRow = { id: string; lender?: string | null; product_name?: string | null; balance?: number | string | null; balance_as_of_date?: string | null; end_date?: string | null; start_date?: string | null };
export type PensionRow = { id: string; label?: string | null; provider?: string | null; current_value?: number | string | null; value_as_of_date?: string | null; valuation_mode?: string | null };
export type WatchRow = { watch_key: string; planned_item_id: string | null; response: string; value?: string | null };
export type PlannedRow = { id: string; label: string; amount: number | string; start_date: string; end_date?: string | null };

const daysBetween = (from: string, to: string) =>
  Math.floor((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86400000);

const niceDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "Checked 15 June 2026, five months ago" style reason, or null if recent. */
function staleReason(lastChecked: string | null | undefined, today: string, what: string): string | null {
  if (!lastChecked) return `LOOP doesn't know when the ${what} was last checked.`;
  const days = daysBetween(String(lastChecked).slice(0, 10), today);
  if (days < CHECK_EVERY_DAYS) return null;
  const months = Math.floor(days / 30.4);
  return `The ${what} was last checked on ${niceDate(String(lastChecked).slice(0, 10))}, ${months} months ago.`;
}

// Sign-in pages LOOP is sure of. Anything else gets a search for "<name> log in",
// so the button always goes somewhere sensible.
const KNOWN_SIGN_IN: Array<[RegExp, CheckLink]> = [
  [/natwest/i, { label: "NatWest", url: "https://www.natwest.com/" }],
  [/nationwide/i, { label: "Nationwide", url: "https://www.nationwide.co.uk/" }],
  [/barclays/i, { label: "Barclays", url: "https://www.barclays.co.uk/" }],
  [/halifax/i, { label: "Halifax", url: "https://www.halifax.co.uk/" }],
  [/lloyds/i, { label: "Lloyds", url: "https://www.lloydsbank.com/" }],
  [/santander/i, { label: "Santander", url: "https://www.santander.co.uk/" }],
  [/hsbc/i, { label: "HSBC", url: "https://www.hsbc.co.uk/" }],
  [/virgin money/i, { label: "Virgin Money", url: "https://uk.virginmoney.com/" }],
  [/pensionbee/i, { label: "PensionBee", url: "https://www.pensionbee.com/" }],
  [/\bnhs\b|nhsbsa/i, { label: "NHS Pensions", url: "https://www.nhsbsa.nhs.uk/member-hub" }],
  [/legal ?& ?general|\bl ?& ?g\b/i, { label: "Legal & General", url: "https://www.legalandgeneral.com/" }],
  [/aviva/i, { label: "Aviva", url: "https://www.aviva.co.uk/" }],
  [/scottish widows/i, { label: "Scottish Widows", url: "https://www.scottishwidows.co.uk/" }],
  [/\bnest\b/i, { label: "Nest", url: "https://www.nestpensions.org.uk/" }],
  [/united utilities/i, { label: "United Utilities", url: "https://www.unitedutilities.com/" }],
];

export function signInLink(name: string | null | undefined, fallbackWhat = "log in"): CheckLink | null {
  const text = String(name || "").trim();
  if (!text) return null;
  for (const [pattern, link] of KNOWN_SIGN_IN) if (pattern.test(text)) return link;
  return { label: text, url: `https://www.google.com/search?q=${encodeURIComponent(`${text} ${fallbackWhat}`)}` };
}

/** GOV.UK's page for a council links to the council's own site. */
export function councilLink(councilName: string | null | undefined): CheckLink {
  const slug = String(councilName || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug
    ? { label: `${councilName} council`, url: `https://www.gov.uk/find-local-council/${slug}` }
    : { label: "your council", url: "https://www.gov.uk/find-local-council" };
}

/**
 * Applied price changes that were estimates, and when the real figure is usually
 * known. Before that date there's nothing to check yet.
 */
const ESTIMATE_RULES: Array<{ prefix: string; confirmFrom: string; what: string; source: "council" | "provider" | "email" }> = [
  { prefix: "council-tax-2027:", confirmFrom: "2027-03-01", what: "2027–28 council tax", source: "council" },
  { prefix: "water-2027:", confirmFrom: "2027-02-01", what: "2027–28 water bill", source: "provider" },
  { prefix: "energy-cap-2027-01:", confirmFrom: "2026-11-27", what: "January energy price", source: "email" },
  { prefix: "broadband-2027:", confirmFrom: "2027-01-15", what: "April broadband price", source: "email" },
  { prefix: "mobile-2027:", confirmFrom: "2027-01-15", what: "April mobile price", source: "email" },
];

export function buildAccuracyChecks(input: {
  today: string;
  studentLoans?: StudentLoanRow[];
  mortgages?: MortgageRow[];
  pensions?: PensionRow[];
  watch?: WatchRow[];
  planned?: PlannedRow[];
  councilName?: string | null;
}): AccuracyCheck[] {
  const { today } = input;
  const checks: AccuracyCheck[] = [];

  for (const loan of input.studentLoans || []) {
    const reason = staleReason(loan.balance_date, today, "student loan balance");
    if (!reason) continue;
    checks.push({
      key: `student-loan:${loan.id}`, kind: "student_loan", recordId: loan.id,
      title: `Student loan${loan.plan ? ` (${String(loan.plan).replace("_", " ")})` : ""}`,
      reason: `${reason} LOOP is estimating it from your pay since then.`,
      current: Number(loan.current_balance || 0), currentLabel: "Balance when last checked",
      lastChecked: loan.balance_date || null, isEstimate: true,
      link: { label: "Student Loans Company", url: "https://www.gov.uk/sign-in-to-manage-your-student-loan-balance" },
      form: { amountLabel: "Balance today" },
    });
  }

  for (const deal of input.mortgages || []) {
    if (deal.end_date && deal.end_date < today) continue;
    const reason = staleReason(deal.balance_as_of_date, today, "mortgage balance");
    if (!reason) continue;
    checks.push({
      key: `mortgage:${deal.id}`, kind: "mortgage", recordId: deal.id,
      title: `Mortgage${deal.lender ? ` · ${deal.lender}` : ""}`,
      reason: `${reason} LOOP is working the balance down from your payments.`,
      current: Number(deal.balance || 0), currentLabel: "Balance when last checked",
      lastChecked: deal.balance_as_of_date || null, isEstimate: true,
      link: signInLink(deal.lender, "mortgage log in"),
      form: { amountLabel: "Balance today", askLastPayment: true },
    });
  }

  for (const pension of input.pensions || []) {
    // Funds LOOP prices every day don't need a manual check.
    // Fund-unit pensions are priced every day. Only pots valued by the provider
    // (PensionBee, Nest and similar) need someone to look.
    if (!/manual|provider_value/i.test(String(pension.valuation_mode || ""))) continue;
    const reason = staleReason(pension.value_as_of_date, today, "pension value");
    if (!reason) continue;
    checks.push({
      key: `pension:${pension.id}`, kind: "pension", recordId: pension.id,
      title: pension.label || pension.provider || "Pension",
      reason,
      current: Number(pension.current_value || 0), currentLabel: "Value when last checked",
      lastChecked: pension.value_as_of_date || null, isEstimate: false,
      link: signInLink(pension.provider || pension.label, "pension log in"),
      form: { amountLabel: "Value today" },
    });
  }

  const confirmed = new Set((input.watch || []).filter((row) => row.watch_key.startsWith("confirmed:")).map((row) => row.watch_key.slice("confirmed:".length)));
  const plannedById = new Map((input.planned || []).map((row) => [row.id, row]));
  for (const row of input.watch || []) {
    if (row.response !== "applied" || confirmed.has(row.watch_key)) continue;
    const rule = ESTIMATE_RULES.find((r) => row.watch_key.startsWith(r.prefix));
    if (!rule || today < rule.confirmFrom) continue;
    const item = row.planned_item_id ? plannedById.get(row.planned_item_id) : null;
    if (!item) continue;
    const link = rule.source === "council" ? councilLink(input.councilName) : rule.source === "provider" ? signInLink(item.label, "log in") : null;
    checks.push({
      key: `price:${row.watch_key}`, kind: "price_confirm", recordId: item.id,
      title: item.label,
      reason: `Your plan uses an estimate for the ${rule.what}. The real figure should be out now.`,
      current: row.value != null ? Number(row.value) : null, currentLabel: "Estimate in your plan (a month)",
      lastChecked: null, isEstimate: true, link,
      emailSearch: rule.source === "email" || rule.source === "provider" ? `${item.label} price` : undefined,
      form: { amountLabel: "Confirmed amount a month", askEffective: true, effectiveDefault: null },
      meta: { watchKey: row.watch_key },
    });
  }

  return checks;
}
