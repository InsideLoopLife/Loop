// Statutory redundancy pay (Employment Rights Act 1996 s.162 and the NI equivalent),
// statutory minimum notice (s.86) and optional enhanced/contractual schemes.
//
// The caps change every 6 April. To update: add one line to REDUNDANCY_LIMITS.
// Max payment is always 30 weeks × the weekly cap (20 years × 1.5 weeks).

export type WorkRegion = "gb" | "ni";

export const REDUNDANCY_LIMITS: { from: string; gb: number; ni: number; source: string }[] = [
  { from: "2026-04-06", gb: 751, ni: 783, source: "Employment Rights (Increase of Limits) Order 2026" },
  { from: "2025-04-06", gb: 719, ni: 749, source: "Employment Rights (Increase of Limits) Order 2025" },
];

export const TAX_FREE_REDUNDANCY_LIMIT = 30_000;

export function weeklyCapFor(date: string, region: WorkRegion) {
  const row = REDUNDANCY_LIMITS.find((limit) => limit.from <= date) || REDUNDANCY_LIMITS[REDUNDANCY_LIMITS.length - 1];
  return { weeklyCap: row[region], maxPayment: row[region] * 30, from: row.from, source: row.source };
}

function parse(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function addYears(date: string, years: number) {
  const { y, m, d } = parse(date);
  // 29 Feb rolls to 28 Feb in non-leap years.
  const target = new Date(Date.UTC(y + years, m - 1, 1));
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Whole years from `from` to `to` (anniversary based). */
export function wholeYears(from: string, to: string) {
  if (!from || !to || to < from) return 0;
  let years = parse(to).y - parse(from).y;
  if (addYears(from, years) > to) years -= 1;
  return Math.max(0, years);
}

function wholeMonths(from: string, to: string) {
  if (!from || !to || to < from) return 0;
  const a = parse(from);
  const b = parse(to);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) months -= 1;
  return Math.max(0, months);
}

export type Enhanced =
  | { mode: "none" }
  | { mode: "weeks_per_year"; weeksPerYear: number; maxWeeks?: number | null }
  | { mode: "fixed"; amount: number };

export type RedundancyInput = {
  serviceStart: string;          // continuous service start date
  birthDate?: string | null;     // needed for the age bands
  onDate: string;                // date the job would end
  grossAnnualPay: number;        // gross salary
  region?: WorkRegion;
  enhanced?: Enhanced;
  noticeWeeksContract?: number | null; // contractual notice if longer than statutory
};

export type RedundancyYear = { yearEnding: string; ageAtStart: number | null; weeks: number };

export type RedundancyEstimate = {
  fullYears: number;
  countedYears: number;
  qualifies: boolean;
  qualifiesOn: string;            // date 2 years' service is reached
  weeklyPay: number;              // actual gross weekly pay
  weeklyCap: number;
  cappedWeeklyPay: number;
  statutoryWeeks: number;
  statutory: number;
  enhancedAmount: number | null;
  payout: number;                 // the higher of statutory and enhanced
  basis: "statutory" | "enhanced" | "none";
  taxFreePart: number;
  taxablePart: number;
  noticeWeeks: number;
  noticeIsContract: boolean;
  noticePayGross: number;         // taxed like normal pay
  ageAssumed: boolean;            // no birth date, so every year counted at 1 week
  years: RedundancyYear[];
  capSource: string;
};

function weeksForAge(age: number | null) {
  if (age === null) return 1;
  if (age >= 41) return 1.5;
  if (age >= 22) return 1;
  return 0.5;
}

export function estimateRedundancy(input: RedundancyInput): RedundancyEstimate {
  const region = input.region || "gb";
  const { weeklyCap, maxPayment, source } = weeklyCapFor(input.onDate, region);
  const fullYears = wholeYears(input.serviceStart, input.onDate);
  const countedYears = Math.min(20, fullYears);
  const qualifiesOn = addYears(input.serviceStart, 2);
  const qualifies = fullYears >= 2;
  const weeklyPay = Math.max(0, input.grossAnnualPay) / 52;
  const cappedWeeklyPay = Math.min(weeklyPay, weeklyCap);

  // Count back from the leaving date. A year earns 1.5 weeks only if the person was
  // 41+ throughout it, 1 week if 22+ throughout it, otherwise half a week.
  const years: RedundancyYear[] = [];
  for (let i = 0; i < countedYears; i += 1) {
    const yearEnding = addYears(input.onDate, -i);
    const yearStart = addYears(input.onDate, -(i + 1));
    const ageAtStart = input.birthDate ? wholeYears(input.birthDate, yearStart) : null;
    years.push({ yearEnding, ageAtStart, weeks: weeksForAge(ageAtStart) });
  }
  const statutoryWeeks = qualifies ? years.reduce((sum, year) => sum + year.weeks, 0) : 0;
  const statutory = Math.min(maxPayment, Math.round(statutoryWeeks * cappedWeeklyPay * 100) / 100);

  let enhancedAmount: number | null = null;
  const enhanced = input.enhanced || { mode: "none" };
  if (enhanced.mode === "weeks_per_year" && enhanced.weeksPerYear > 0) {
    const weeks = Math.min(enhanced.maxWeeks || Infinity, enhanced.weeksPerYear * fullYears);
    enhancedAmount = Math.round(weeks * weeklyPay * 100) / 100;
  } else if (enhanced.mode === "fixed" && enhanced.amount >= 0) {
    enhancedAmount = Math.round(enhanced.amount * 100) / 100;
  }

  const useEnhanced = enhancedAmount !== null && enhancedAmount > statutory;
  const payout = useEnhanced ? (enhancedAmount as number) : statutory;
  const basis = payout <= 0 ? "none" : useEnhanced ? "enhanced" : "statutory";

  // Statutory minimum notice: 1 week after a month, then 1 week per full year up to 12.
  const months = wholeMonths(input.serviceStart, input.onDate);
  const statutoryNotice = months < 1 ? 0 : fullYears < 2 ? 1 : Math.min(12, fullYears);
  const contract = Number(input.noticeWeeksContract || 0);
  const noticeWeeks = Math.max(statutoryNotice, contract);

  return {
    fullYears,
    countedYears,
    qualifies,
    qualifiesOn,
    weeklyPay: Math.round(weeklyPay * 100) / 100,
    weeklyCap,
    cappedWeeklyPay: Math.round(cappedWeeklyPay * 100) / 100,
    statutoryWeeks,
    statutory,
    enhancedAmount,
    payout,
    basis,
    taxFreePart: Math.min(payout, TAX_FREE_REDUNDANCY_LIMIT),
    taxablePart: Math.max(0, payout - TAX_FREE_REDUNDANCY_LIMIT),
    noticeWeeks,
    noticeIsContract: contract > statutoryNotice,
    noticePayGross: Math.round(noticeWeeks * weeklyPay * 100) / 100,
    ageAssumed: !input.birthDate,
    years,
    capSource: source,
  };
}
