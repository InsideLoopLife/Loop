import { easterSunday, isDateInHolidayPeriod } from "@/lib/calculations/childcareCalendar";

export type FundingMode = "none" | "stretched" | "term_time";
/**
 * all_year: charged for every weekday in the month.
 * term_time: charged only for days in school term time, in the months they fall.
 * term_time_spread: term-time days, with the year's total spread evenly over 12 months.
 */
export type BillingSchedule = "all_year" | "term_time" | "term_time_spread";
export type DaySession = "off" | "full" | "part";
export type ActivityBillingMode = "calendar" | "averaged_term";

export type NurseryCostInput = {
  billingMonth: string;
  dailyRate: number;
  extraDailyCost: number;
  fundedHoursPerWeek: number;
  fundingMode: FundingMode;
  hourlyFundingCredit: number;
  termWeeksPerYear: number;
  mondayHours?: number;
  tuesdayHours?: number;
  wednesdayHours?: number;
  thursdayHours?: number;
  fridayHours?: number;
  mondaySession?: DaySession;
  tuesdaySession?: DaySession;
  wednesdaySession?: DaySession;
  thursdaySession?: DaySession;
  fridaySession?: DaySession;
  billingSchedule?: BillingSchedule;
  bankHolidaysAreFree?: boolean;
  taxFreeChildcareEnabled?: boolean;
  taxFreeChildcareCapPerQuarter?: number;
  partDayMultiplier?: number;
  fullDayHours?: number;
  partDayHours?: number;
};

export type NurseryCostResult = {
  attendanceDays: number;
  attendedHours: number;
  grossCost: number;
  fundingCredit: number;
  taxFreeChildcareTopUp: number;
  estimatedMonthlyCost: number;
  parentCostBeforeTaxFreeChildcare: number;
  bankHolidayDaysRemoved: number;
  explanation: string;
};

export type ActivityCostInput = {
  billingMonth: string;
  weeklyCost: number;
  activityWeekday: number;
  activityBillingMode: ActivityBillingMode;
  activityTermWeeksPerYear: number;
  bankHolidaysAreFree?: boolean;
};

export type ActivityCostResult = {
  sessions: number;
  grossCost: number;
  bankHolidaySessionsRemoved: number;
  estimatedMonthlyCost: number;
  explanation: string;
};

export type MonthForecast = {
  month: string;
  label: string;
  amount: number;
  explanation: string;
};

const dayKeys = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Seeded from the public GOV.UK bank-holidays feed for England & Wales.
// Later, we can replace this with a nightly fetch into a bank_holidays table.
const ENGLAND_WALES_BANK_HOLIDAYS = new Set([
  "2026-01-01",
  "2026-04-03",
  "2026-04-06",
  "2026-05-04",
  "2026-05-25",
  "2026-08-31",
  "2026-12-25",
  "2026-12-28",
  "2027-01-01",
  "2027-03-26",
  "2027-03-29",
  "2027-05-03",
  "2027-05-31",
  "2027-08-30",
  "2027-12-27",
  "2027-12-28",
]);

function safeNumber(value: number | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function calculateTaxFreeChildcareTopUp(parentBill: number, capPerQuarter = 500) {
  if (parentBill <= 0) return 0;
  // GOV.UK Tax-Free Childcare works as £2 added for every £8 paid in.
  // That means the household cash cost is roughly 80% of the approved childcare bill,
  // capped by the quarterly top-up. We use a monthly planning cap here.
  const monthlyCap = Math.max(0, capPerQuarter) / 3;
  return Math.min(parentBill * 0.2, monthlyCap || parentBill * 0.2);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** England & Wales bank holidays for any year (with weekend substitutes). */
function bankHolidaysForYear(year: number) {
  const days: string[] = [];
  const add = (d: Date) => days.push(toIsoDate(d));
  const shift = (d: Date) => (d.getDay() === 6 ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 2) : d.getDay() === 0 ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) : d);
  add(shift(new Date(year, 0, 1)));
  const easter = easterSunday(year);
  add(new Date(year, easter.getMonth(), easter.getDate() - 2));
  add(new Date(year, easter.getMonth(), easter.getDate() + 1));
  const firstMonday = (m: number) => { const d = new Date(year, m, 1); return new Date(year, m, 1 + ((8 - d.getDay()) % 7)); };
  const lastMonday = (m: number) => { const d = new Date(year, m + 1, 0); return new Date(year, m, d.getDate() - ((d.getDay() + 6) % 7)); };
  add(firstMonday(4));
  add(lastMonday(4));
  add(lastMonday(7));
  const christmas = new Date(year, 11, 25);
  const boxing = new Date(year, 11, 26);
  if (christmas.getDay() === 6) { add(new Date(year, 11, 27)); add(new Date(year, 11, 28)); }
  else if (christmas.getDay() === 0) { add(new Date(year, 11, 26)); add(new Date(year, 11, 27)); }
  else if (christmas.getDay() === 5) { add(christmas); add(new Date(year, 11, 28)); }
  else { add(christmas); add(boxing); }
  return days;
}
const computedBankHolidays = new Map<number, Set<string>>();

export function isEnglandWalesBankHoliday(date: Date) {
  const key = toIsoDate(date);
  if (ENGLAND_WALES_BANK_HOLIDAYS.has(key)) return true;
  const year = date.getFullYear();
  if (year === 2026 || year === 2027) return false; // listed above from GOV.UK
  if (!computedBankHolidays.has(year)) computedBankHolidays.set(year, new Set(bankHolidaysForYear(year)));
  return computedBankHolidays.get(year)!.has(key);
}

function getMonthDateRange(billingMonth: string) {
  const raw = billingMonth || new Date().toISOString().slice(0, 7);
  const [yearRaw, monthRaw] = raw.slice(0, 7).split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
  }

  return {
    start: new Date(year, monthIndex, 1),
    end: new Date(year, monthIndex + 1, 0),
  };
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

function addMonths(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function sessionToHours(session: DaySession | undefined, fullDayHours: number, partDayHours: number) {
  if (session === "full") return fullDayHours;
  if (session === "part") return partDayHours;
  return 0;
}

function sessionToChargeMultiplier(session: DaySession | undefined, partDayMultiplier: number) {
  if (session === "full") return 1;
  if (session === "part") return partDayMultiplier;
  return 0;
}

export function countAttendanceInMonth(input: NurseryCostInput) {
  const { start, end } = getMonthDateRange(input.billingMonth);
  const fullDayHours = safeNumber(input.fullDayHours) || 10;
  const partDayHours = safeNumber(input.partDayHours) || 5;
  const partDayMultiplier = safeNumber(input.partDayMultiplier) || 0.5;

  const hoursByDay: Record<string, number> = {
    monday: safeNumber(input.mondayHours) || sessionToHours(input.mondaySession, fullDayHours, partDayHours),
    tuesday: safeNumber(input.tuesdayHours) || sessionToHours(input.tuesdaySession, fullDayHours, partDayHours),
    wednesday: safeNumber(input.wednesdayHours) || sessionToHours(input.wednesdaySession, fullDayHours, partDayHours),
    thursday: safeNumber(input.thursdayHours) || sessionToHours(input.thursdaySession, fullDayHours, partDayHours),
    friday: safeNumber(input.fridayHours) || sessionToHours(input.fridaySession, fullDayHours, partDayHours),
  };

  const chargeMultiplierByDay: Record<string, number> = {
    monday: safeNumber(input.mondayHours) > 0 ? 1 : sessionToChargeMultiplier(input.mondaySession, partDayMultiplier),
    tuesday: safeNumber(input.tuesdayHours) > 0 ? 1 : sessionToChargeMultiplier(input.tuesdaySession, partDayMultiplier),
    wednesday: safeNumber(input.wednesdayHours) > 0 ? 1 : sessionToChargeMultiplier(input.wednesdaySession, partDayMultiplier),
    thursday: safeNumber(input.thursdayHours) > 0 ? 1 : sessionToChargeMultiplier(input.thursdaySession, partDayMultiplier),
    friday: safeNumber(input.fridayHours) > 0 ? 1 : sessionToChargeMultiplier(input.fridaySession, partDayMultiplier),
  };

  let attendanceDays = 0;
  let attendedHours = 0;
  let chargeUnits = 0;
  let bankHolidayDaysRemoved = 0;
  let holidayDaysRemoved = 0;
  const termOnly = input.billingSchedule === "term_time";

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const key = dayKeys[date.getDay()];
    const hours = hoursByDay[key] ?? 0;
    const chargeMultiplier = chargeMultiplierByDay[key] ?? 0;

    if (hours > 0 || chargeMultiplier > 0) {
      if (termOnly && isDateInHolidayPeriod(date)) {
        holidayDaysRemoved += 1;
        continue;
      }
      if (input.bankHolidaysAreFree && isEnglandWalesBankHoliday(date)) {
        bankHolidayDaysRemoved += 1;
        continue;
      }

      attendanceDays += 1;
      attendedHours += hours;
      chargeUnits += chargeMultiplier || 1;
    }
  }

  return { attendanceDays, attendedHours, chargeUnits, bankHolidayDaysRemoved, holidayDaysRemoved };
}

/** Weekdays in a month that fall in school term time. */
function termWeekdaysInMonth(billingMonth: string) {
  const { start, end } = getMonthDateRange(billingMonth);
  let count = 0;
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    if (!isDateInHolidayPeriod(date)) count += 1;
  }
  return count;
}

/** The school year (September to August) a month belongs to, as its 12 months. */
function schoolYearMonths(billingMonth: string) {
  const [y, m] = billingMonth.split("-").map(Number);
  const startYear = m >= 9 ? y : y - 1;
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(startYear, 8 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

export function calculateNurseryMonthlyCost(input: NurseryCostInput): NurseryCostResult {
  const dailyRate = safeNumber(input.dailyRate);
  const extraDailyCost = safeNumber(input.extraDailyCost);
  const fundedHoursPerWeek = safeNumber(input.fundedHoursPerWeek);
  const hourlyFundingCredit = safeNumber(input.hourlyFundingCredit);
  const termWeeksPerYear = safeNumber(input.termWeeksPerYear) || 38;
  const billingSchedule = input.billingSchedule ?? "all_year";

  // Spread: work out the whole school year's term-time cost, then a twelfth.
  if (billingSchedule === "term_time_spread") {
    const months = schoolYearMonths(input.billingMonth);
    const results = months.map((month) => calculateNurseryMonthlyCost({ ...input, billingMonth: month, billingSchedule: "term_time" }));
    const avg = (pick: (r: NurseryCostResult) => number) => results.reduce((sum, r) => sum + pick(r), 0) / 12;
    const thisMonth = countAttendanceInMonth({ ...input, billingSchedule: "term_time" });
    const yearTotal = results.reduce((sum, r) => sum + r.estimatedMonthlyCost, 0);
    return {
      attendanceDays: thisMonth.attendanceDays,
      attendedHours: thisMonth.attendedHours,
      grossCost: avg((r) => r.grossCost),
      fundingCredit: avg((r) => r.fundingCredit),
      taxFreeChildcareTopUp: avg((r) => r.taxFreeChildcareTopUp),
      estimatedMonthlyCost: yearTotal / 12,
      parentCostBeforeTaxFreeChildcare: avg((r) => r.parentCostBeforeTaxFreeChildcare),
      bankHolidayDaysRemoved: thisMonth.bankHolidayDaysRemoved,
      explanation: `Term-time only, spread evenly: ${Math.round(yearTotal)} for the school year ÷ 12.`,
    };
  }

  const { attendanceDays, attendedHours, chargeUnits, bankHolidayDaysRemoved, holidayDaysRemoved } = countAttendanceInMonth(input);

  const grossCost = chargeUnits * (dailyRate + extraDailyCost);

  let fundedHoursThisMonth = 0;
  if (input.fundingMode === "stretched") {
    fundedHoursThisMonth = (fundedHoursPerWeek * 52) / 12;
  }

  if (input.fundingMode === "term_time") {
    // Funded hours only run in term weeks, so use this month's actual term weeks.
    fundedHoursThisMonth = fundedHoursPerWeek * (termWeekdaysInMonth(input.billingMonth) / 5);
  }

  const maxUsableFundedHours = Math.min(fundedHoursThisMonth, attendedHours);
  const fundingCredit = maxUsableFundedHours * hourlyFundingCredit;
  const parentCostBeforeTaxFreeChildcare = Math.max(0, grossCost - fundingCredit);
  const taxFreeChildcareTopUp = input.taxFreeChildcareEnabled
    ? calculateTaxFreeChildcareTopUp(parentCostBeforeTaxFreeChildcare, safeNumber(input.taxFreeChildcareCapPerQuarter) || 500)
    : 0;
  const estimatedMonthlyCost = Math.max(0, parentCostBeforeTaxFreeChildcare - taxFreeChildcareTopUp);

  const explanationParts = [
    `${attendanceDays} charged day${attendanceDays === 1 ? "" : "s"}`,
    `${Math.round(attendedHours * 10) / 10} attended hours`,
  ];

  if (bankHolidayDaysRemoved > 0) {
    explanationParts.push(`${bankHolidayDaysRemoved} bank holiday${bankHolidayDaysRemoved === 1 ? "" : "s"} removed`);
  }

  if (billingSchedule === "term_time" && holidayDaysRemoved > 0) {
    explanationParts.push(`${holidayDaysRemoved} school holiday day${holidayDaysRemoved === 1 ? "" : "s"} not charged`);
  }

  if (input.fundingMode !== "none") {
    explanationParts.push(`up to ${Math.round(maxUsableFundedHours * 10) / 10} funded hours deducted`);
  }

  if (taxFreeChildcareTopUp > 0) {
    explanationParts.push(`${Math.round(taxFreeChildcareTopUp)} Tax-Free Childcare top-up offset`);
  }

  return {
    attendanceDays,
    attendedHours,
    grossCost,
    fundingCredit,
    taxFreeChildcareTopUp,
    estimatedMonthlyCost,
    parentCostBeforeTaxFreeChildcare,
    bankHolidayDaysRemoved,
    explanation: `${explanationParts.join(", ")}.`,
  };
}

export function countWeekdayOccurrencesInMonth(billingMonth: string, weekday: number, bankHolidaysAreFree = false) {
  const { start, end } = getMonthDateRange(billingMonth);
  let sessions = 0;
  let bankHolidaySessionsRemoved = 0;

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    if (date.getDay() !== weekday) continue;

    if (bankHolidaysAreFree && isEnglandWalesBankHoliday(date)) {
      bankHolidaySessionsRemoved += 1;
      continue;
    }

    sessions += 1;
  }

  return { sessions, bankHolidaySessionsRemoved };
}

export function calculateActivityMonthlyCost(input: ActivityCostInput): ActivityCostResult {
  const weeklyCost = safeNumber(input.weeklyCost);
  const termWeeks = safeNumber(input.activityTermWeeksPerYear) || 38;

  if (input.activityBillingMode === "averaged_term") {
    const estimatedMonthlyCost = (weeklyCost * termWeeks) / 12;
    return {
      sessions: termWeeks / 12,
      grossCost: estimatedMonthlyCost,
      bankHolidaySessionsRemoved: 0,
      estimatedMonthlyCost,
      explanation: `Averaged across ${termWeeks} term weeks per year.`,
    };
  }

  const { sessions, bankHolidaySessionsRemoved } = countWeekdayOccurrencesInMonth(
    input.billingMonth,
    input.activityWeekday,
    Boolean(input.bankHolidaysAreFree),
  );
  const estimatedMonthlyCost = sessions * weeklyCost;

  return {
    sessions,
    grossCost: estimatedMonthlyCost,
    bankHolidaySessionsRemoved,
    estimatedMonthlyCost,
    explanation: `${sessions} ${dayLabels[input.activityWeekday] ?? "weekly"} session${sessions === 1 ? "" : "s"}${bankHolidaySessionsRemoved ? `, ${bankHolidaySessionsRemoved} bank holiday session removed` : ""}.`,
  };
}

export function nurseryForecast(input: NurseryCostInput, months = 12): MonthForecast[] {
  const startMonth = input.billingMonth || new Date().toISOString().slice(0, 7);

  return Array.from({ length: months }, (_, index) => {
    const month = addMonths(startMonth, index);
    const result = calculateNurseryMonthlyCost({ ...input, billingMonth: month });

    return {
      month,
      label: monthLabel(month),
      amount: result.estimatedMonthlyCost,
      explanation: result.explanation,
    };
  });
}

export function activityForecast(input: ActivityCostInput, months = 12): MonthForecast[] {
  const startMonth = input.billingMonth || new Date().toISOString().slice(0, 7);

  return Array.from({ length: months }, (_, index) => {
    const month = addMonths(startMonth, index);
    const result = calculateActivityMonthlyCost({ ...input, billingMonth: month });

    return {
      month,
      label: monthLabel(month),
      amount: result.estimatedMonthlyCost,
      explanation: result.explanation,
    };
  });
}

/** How a saved nursery cost is billed. The spread option is kept in care_details. */
export function savedBillingSchedule(cost: { billing_schedule?: string | null; care_details?: Record<string, any> | null }): BillingSchedule {
  if (cost.billing_schedule === "term_time") return cost.care_details?.termTimeSpread ? "term_time_spread" : "term_time";
  return "all_year";
}
