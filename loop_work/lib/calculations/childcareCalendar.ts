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

// Known dates for recent years; other years use the usual England pattern
// (typicalHolidayPeriods below), so estimates never run off the end.
const KNOWN_HOLIDAY_PERIODS: HolidayPeriod[] = [
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

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** First Monday on or after a date. */
const mondayOnOrAfter = (d: Date) => addDays(d, (8 - d.getDay()) % 7);
/** Last Monday of a month (month is 0-based). */
const lastMonday = (year: number, month: number) => {
  const last = new Date(year, month + 1, 0);
  return addDays(last, -((last.getDay() + 6) % 7));
};

/** Easter Sunday (Gregorian). */
export function easterSunday(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** Usual England state-school holidays for the school year starting September `year`. */
export function typicalHolidayPeriods(year: number): HolidayPeriod[] {
  const next = year + 1;
  const period = (key: HolidayPeriodKey, start: Date, end: Date) => ({ key, label: HOLIDAY_PERIOD_LABELS[key], start: iso(start), end: iso(end) });
  const autumn = lastMonday(year, 9);
  const christmas = mondayOnOrAfter(new Date(year, 11, 18));
  const february = mondayOnOrAfter(new Date(next, 1, 12));
  const easter = easterSunday(next);
  const may = lastMonday(next, 4);
  let summer = new Date(next, 6, 22);
  if (summer.getDay() === 0 || summer.getDay() === 6) summer = mondayOnOrAfter(summer);
  return [
    period("autumn_half_term", autumn, addDays(autumn, 4)),
    period("christmas", christmas, addDays(christmas, 11)),
    period("spring_half_term", february, addDays(february, 4)),
    period("easter", addDays(easter, -6), addDays(easter, 5)),
    period("summer_half_term", may, addDays(may, 4)),
    period("summer", summer, new Date(next, 7, 31)),
  ];
}

const knownYears = new Set(KNOWN_HOLIDAY_PERIODS.filter((p) => p.key === "autumn_half_term").map((p) => Number(p.start.slice(0, 4))));
export const UK_HOLIDAY_PERIODS: HolidayPeriod[] = [
  ...KNOWN_HOLIDAY_PERIODS,
  ...Array.from({ length: 21 }, (_, i) => 2020 + i).filter((year) => !knownYears.has(year)).flatMap(typicalHolidayPeriods),
].sort((a, b) => a.start.localeCompare(b.start));

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

export type HalfTermBlock = { start: string; end: string };

/**
 * School half-terms: the stretches of term between one holiday and the next.
 * Each starts the weekday after a holiday ends and runs to the day before the
 * next holiday starts. Clubs that invoice "half-termly" bill each one as a block.
 */
export function halfTermBlocks(): HalfTermBlock[] {
  const holidays = UK_HOLIDAY_PERIODS;
  const blocks: HalfTermBlock[] = [];
  for (let i = 0; i < holidays.length - 1; i += 1) {
    let start = addDays(parseIsoDate(holidays[i].end), 1);
    while (!isWeekday(start)) start = addDays(start, 1);
    let end = addDays(parseIsoDate(holidays[i + 1].start), -1);
    while (!isWeekday(end)) end = addDays(end, -1);
    if (start <= end) blocks.push({ start: iso(start), end: iso(end) });
  }
  return blocks;
}
