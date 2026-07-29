// Placeholder England state-school term calendar, in the same spirit as the
// seeded ENGLAND_WALES_BANK_HOLIDAYS list in childcare.ts: good enough for
// live estimates today, replaceable once real term-date PDF parsing lands
// (see UPDATE notes on the childcare module overhaul). Dates are typical
// England state-school dates and are NOT specific to any one local authority
// or academy trust — a school's actual dates can vary by a few days either
// side of these.

export type HolidayPeriodKey =
  | "autumn_half_term"
  | "christmas"
  | "spring_half_term"
  | "easter"
  | "summer_half_term"
  | "summer";

export type HolidayPeriod = {
  key: HolidayPeriodKey;
  label: string;
  start: string; // ISO date, inclusive
  end: string; // ISO date, inclusive
};

export const HOLIDAY_PERIOD_LABELS: Record<HolidayPeriodKey, string> = {
  autumn_half_term: "October half-term",
  christmas: "Christmas holidays",
  spring_half_term: "February half-term",
  easter: "Easter holidays",
  summer_half_term: "May half-term",
  summer: "Summer holidays",
};

// Two academic years of placeholder dates. Extend this list as years roll on,
// or (better) replace with rows parsed from an uploaded term-dates PDF/ICS.
export const UK_HOLIDAY_PERIODS: HolidayPeriod[] = [
  { key: "autumn_half_term", label: HOLIDAY_PERIOD_LABELS.autumn_half_term, start: "2025-10-27", end: "2025-10-31" },
  { key: "christmas", label: HOLIDAY_PERIOD_LABELS.christmas, start: "2025-12-22", end: "2026-01-02" },
  { key: "spring_half_term", label: HOLIDAY_PERIOD_LABELS.spring_half_term, start: "2026-02-16", end: "2026-02-20" },
  { key: "easter", label: HOLIDAY_PERIOD_LABELS.easter, start: "2026-03-30", end: "2026-04-10" },
  { key: "summer_half_term", label: HOLIDAY_PERIOD_LABELS.summer_half_term, start: "2026-05-25", end: "2026-05-29" },
  { key: "summer", label: HOLIDAY_PERIOD_LABELS.summer, start: "2026-07-22", end: "2026-09-01" },

  { key: "autumn_half_term", label: HOLIDAY_PERIOD_LABELS.autumn_half_term, start: "2026-10-26", end: "2026-10-30" },
  { key: "christmas", label: HOLIDAY_PERIOD_LABELS.christmas, start: "2026-12-21", end: "2027-01-01" },
  { key: "spring_half_term", label: HOLIDAY_PERIOD_LABELS.spring_half_term, start: "2027-02-15", end: "2027-02-19" },
  { key: "easter", label: HOLIDAY_PERIOD_LABELS.easter, start: "2027-03-29", end: "2027-04-09" },
  { key: "summer_half_term", label: HOLIDAY_PERIOD_LABELS.summer_half_term, start: "2027-05-31", end: "2027-06-04" },
  { key: "summer", label: HOLIDAY_PERIOD_LABELS.summer, start: "2027-07-21", end: "2027-08-31" },
];

function parseIsoDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function isWeekday(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function isDateInHolidayPeriod(date: Date): HolidayPeriod | null {
  for (const period of UK_HOLIDAY_PERIODS) {
    const start = parseIsoDate(period.start);
    const end = parseIsoDate(period.end);
    if (date >= start && date <= end) return period;
  }
  return null;
}

/** Whether a date falls in school term time (not a selected holiday period). */
export function isTermTime(date: Date) {
  return isDateInHolidayPeriod(date) === null;
}

/**
 * Count weekdays that overlap between a holiday period and a given
 * `YYYY-MM` billing month — used to spread holiday-camp costs into the
 * calendar months they actually fall in, rather than smearing evenly
 * across all 12 months.
 */
export function weekdaysOverlappingMonth(period: HolidayPeriod, billingMonth: string) {
  const [year, month] = billingMonth.split("-").map(Number);
  const monthStart = new Date(year, (month ?? 1) - 1, 1);
  const monthEnd = new Date(year, month ?? 1, 0);

  const periodStart = parseIsoDate(period.start);
  const periodEnd = parseIsoDate(period.end);

  const overlapStart = periodStart > monthStart ? periodStart : monthStart;
  const overlapEnd = periodEnd < monthEnd ? periodEnd : monthEnd;

  if (overlapStart > overlapEnd) return 0;

  let count = 0;
  for (let d = new Date(overlapStart); d <= overlapEnd; d.setDate(d.getDate() + 1)) {
    if (isWeekday(d)) count += 1;
  }
  return count;
}
