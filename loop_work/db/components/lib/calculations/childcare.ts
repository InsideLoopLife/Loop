export type FundingMode = "none" | "stretched" | "term_time";
export type BillingSchedule = "all_year" | "term_time";
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

export function isEnglandWalesBankHoliday(date: Date) {
  return ENGLAND_WALES_BANK_HOLIDAYS.has(toIsoDate(date));
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

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const key = dayKeys[date.getDay()];
    const hours = hoursByDay[key] ?? 0;
    const chargeMultiplier = chargeMultiplierByDay[key] ?? 0;

    if (hours > 0 || chargeMultiplier > 0) {
      if (input.bankHolidaysAreFree && isEnglandWalesBankHoliday(date)) {
        bankHolidayDaysRemoved += 1;
        continue;
      }

      attendanceDays += 1;
      attendedHours += hours;
      chargeUnits += chargeMultiplier || 1;
    }
  }

  return { attendanceDays, attendedHours, chargeUnits, bankHolidayDaysRemoved };
}

export function calculateNurseryMonthlyCost(input: NurseryCostInput): NurseryCostResult {
  const dailyRate = safeNumber(input.dailyRate);
  const extraDailyCost = safeNumber(input.extraDailyCost);
  const fundedHoursPerWeek = safeNumber(input.fundedHoursPerWeek);
  const hourlyFundingCredit = safeNumber(input.hourlyFundingCredit);
  const termWeeksPerYear = safeNumber(input.termWeeksPerYear) || 38;
  const billingSchedule = input.billingSchedule ?? "all_year";
  const { attendanceDays, attendedHours, chargeUnits, bankHolidayDaysRemoved } = countAttendanceInMonth(input);

  let grossCost = chargeUnits * (dailyRate + extraDailyCost);

  if (billingSchedule === "term_time") {
    grossCost *= termWeeksPerYear / 52;
  }

  let fundedHoursThisMonth = 0;
  if (input.fundingMode === "stretched") {
    fundedHoursThisMonth = (fundedHoursPerWeek * 52) / 12;
  }

  if (input.fundingMode === "term_time") {
    fundedHoursThisMonth = (fundedHoursPerWeek * termWeeksPerYear) / 12;
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

  if (billingSchedule === "term_time") {
    explanationParts.push(`term-time averaged at ${termWeeksPerYear} weeks/year`);
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
