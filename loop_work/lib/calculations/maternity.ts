import { calculateIncomeTaxEnglandWalesNorthernIreland, estimateAnnualTakeHome, PensionMethod, StudentLoanPlan } from "@/lib/calculations/tax";

export type MaternityPayMode = "spread_equal" | "actual_by_week" | "nhs_spread_occupational_actual_smp";

export type NhsMaternityInput = {
  month?: string;
  /** "scotland" applies Scottish income tax to maternity and KIT pay. */
  taxRegion?: string | null;
  grossAnnualSalary: number;
  leaveStart: string;
  leaveEnd: string;
  fullPayWeeks?: number;
  halfPayWeeks?: number;
  smpOnlyWeeks?: number;
  unpaidWeeks?: number;
  smpWeeklyRate?: number;
  payMode?: MaternityPayMode;
  pensionPercent?: number;
  pensionMethod?: PensionMethod;
  studentLoanPlan?: StudentLoanPlan;
  /** Raw `pay_events.maternity_extras` JSON (KIT days + pension arrears settings). Parsed defensively. */
  extras?: unknown;
};

export type NhsMaternityMonth = {
  month: string;
  label: string;
  grossAmount: number;
  estimatedNetAmount: number;
  explanation: string;
  kitGrossAmount?: number;
  kitDaysInMonth?: number;
};

const DEFAULT_FULL_PAY_WEEKS = 8;
const DEFAULT_HALF_PAY_WEEKS = 18;
const DEFAULT_SMP_ONLY_WEEKS = 13;
const DEFAULT_UNPAID_WEEKS = 13;
const DEFAULT_SMP_WEEKLY_RATE = 194.32;
const DAYS_PER_WEEK = 7;
const AVG_DAYS_PER_MONTH = 365.25 / 12;

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1);
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function daysInclusive(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function overlapDays(startA: Date, endA: Date, startB: Date, endB: Date) {
  const start = new Date(Math.max(startA.getTime(), startB.getTime()));
  const end = new Date(Math.min(endA.getTime(), endB.getTime()));
  if (end < start) return 0;
  return daysInclusive(start, end);
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

function monthsBetween(startDate: Date, endDate: Date) {
  const months: string[] = [];
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (current <= last) {
    months.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`);
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

function estimateMonthlyNetFromGross(monthlyGross: number, pensionPercent: number, pensionMethod: PensionMethod, studentLoanPlan: StudentLoanPlan, taxRegion?: string | null) {
  if (monthlyGross <= 0) return 0;

  return estimateAnnualTakeHome({
    grossAnnual: monthlyGross * 12,
    pensionPercent,
    pensionMethod,
    studentLoanPlan,
    taxRegion,
    nhsTierFromPay: false, // reduced maternity pay doesn't change the member's tier
  }).monthlyTakeHome;
}

export function calculateNhsMaternityGrossPot(input: NhsMaternityInput) {
  const grossAnnualSalary = Number(input.grossAnnualSalary || 0);
  const weeklySalary = grossAnnualSalary / 52.143;
  const smpWeeklyRate = Number(input.smpWeeklyRate ?? DEFAULT_SMP_WEEKLY_RATE);
  const fullPayWeeks = Number(input.fullPayWeeks ?? DEFAULT_FULL_PAY_WEEKS);
  const halfPayWeeks = Number(input.halfPayWeeks ?? DEFAULT_HALF_PAY_WEEKS);
  const smpOnlyWeeks = Number(input.smpOnlyWeeks ?? DEFAULT_SMP_ONLY_WEEKS);
  const unpaidWeeks = Number(input.unpaidWeeks ?? DEFAULT_UNPAID_WEEKS);

  const fullPayTotal = weeklySalary * fullPayWeeks;
  const halfPayPlusSmpWeekly = Math.min(weeklySalary, weeklySalary * 0.5 + smpWeeklyRate);
  const halfPayTotal = halfPayPlusSmpWeekly * halfPayWeeks;
  const smpOnlyWeekly = Math.min(smpWeeklyRate, weeklySalary * 0.9);
  const smpOnlyTotal = smpOnlyWeekly * smpOnlyWeeks;
  const unpaidTotal = 0 * unpaidWeeks;

  return {
    weeklySalary,
    fullPayTotal,
    halfPayTotal,
    smpOnlyTotal,
    unpaidTotal,
    totalGross: fullPayTotal + halfPayTotal + smpOnlyTotal + unpaidTotal,
    fullPayWeeks,
    halfPayWeeks,
    smpOnlyWeeks,
    unpaidWeeks,
    smpWeeklyRate,
  };
}

function actualByWeekGrossForMonth(input: Required<Pick<NhsMaternityInput, "leaveStart" | "leaveEnd">> & NhsMaternityInput, month: string) {
  const start = parseDate(input.leaveStart);
  const end = parseDate(input.leaveEnd);
  const mStart = monthStart(month);
  const mEnd = monthEnd(month);
  const pot = calculateNhsMaternityGrossPot(input);
  const weeklySalary = pot.weeklySalary;
  const smpOnlyWeekly = Math.min(pot.smpWeeklyRate, weeklySalary * 0.9);
  const halfPayPlusSmpWeekly = Math.min(weeklySalary, weeklySalary * 0.5 + pot.smpWeeklyRate);

  const blocks = [
    { name: "full pay", weeks: pot.fullPayWeeks, weeklyAmount: weeklySalary },
    { name: "half pay + SMP", weeks: pot.halfPayWeeks, weeklyAmount: halfPayPlusSmpWeekly },
    { name: "SMP only", weeks: pot.smpOnlyWeeks, weeklyAmount: smpOnlyWeekly },
    { name: "unpaid", weeks: pot.unpaidWeeks, weeklyAmount: 0 },
  ];

  let cursor = start;
  let grossAmount = 0;
  const explanationParts: string[] = [];

  blocks.forEach((block) => {
    if (block.weeks <= 0) return;
    const blockStart = cursor;
    const blockEnd = addDays(blockStart, Math.round(block.weeks * DAYS_PER_WEEK) - 1);
    const days = overlapDays(blockStart, blockEnd, mStart, mEnd);
    if (days > 0) {
      grossAmount += (block.weeklyAmount / DAYS_PER_WEEK) * days;
      explanationParts.push(`${days} days ${block.name}`);
    }
    cursor = addDays(blockEnd, 1);
  });

  const inLeaveDays = overlapDays(start, end, mStart, mEnd);
  if (inLeaveDays === 0) grossAmount = 0;

  return {
    grossAmount,
    explanation: explanationParts.length > 0 ? explanationParts.join(", ") : "No maternity leave days in this month.",
  };
}

function nhsSpreadOccupationalPlusActualSmpForMonth(input: Required<Pick<NhsMaternityInput, "leaveStart" | "leaveEnd">> & NhsMaternityInput, month: string) {
  const start = parseDate(input.leaveStart);
  const end = parseDate(input.leaveEnd);
  const mStart = monthStart(month);
  const mEnd = monthEnd(month);
  const pot = calculateNhsMaternityGrossPot(input);
  const inLeaveDays = overlapDays(start, end, mStart, mEnd);
  if (inLeaveDays === 0) return { grossAmount: 0, explanation: "No maternity leave days in this month." };

  const leaveDays = daysInclusive(start, end);
  const occupationalPot = (pot.weeklySalary * pot.fullPayWeeks) + (pot.weeklySalary * 0.5 * pot.halfPayWeeks);
  const occupationalAmount = (occupationalPot / Math.max(leaveDays, 1)) * inLeaveDays;

  const smpWeekly = Math.min(pot.smpWeeklyRate, pot.weeklySalary * 0.9);
  const statutoryStart = addDays(start, Math.round(pot.fullPayWeeks * DAYS_PER_WEEK));
  const statutoryEnd = addDays(statutoryStart, Math.round((pot.halfPayWeeks + pot.smpOnlyWeeks) * DAYS_PER_WEEK) - 1);
  const statutoryDays = overlapDays(statutoryStart, statutoryEnd, mStart, mEnd);
  const statutoryAmount = (smpWeekly / DAYS_PER_WEEK) * statutoryDays;

  return {
    grossAmount: occupationalAmount + statutoryAmount,
    explanation: `NHS spread pay: £${occupationalAmount.toFixed(2)} occupational spread pay + £${statutoryAmount.toFixed(2)} statutory pay for ${monthLabel(month)}.`,
  };
}

export function calculateNhsMaternityMonthlyAmount(input: NhsMaternityInput & { month: string }) {
  if (!input.leaveStart || !input.leaveEnd) {
    return {
      grossAmount: 0,
      estimatedNetAmount: 0,
      explanation: "Add maternity start and end dates to calculate this month.",
    };
  }

  const leaveStart = parseDate(input.leaveStart);
  const leaveEnd = parseDate(input.leaveEnd);
  const mStart = monthStart(input.month);
  const mEnd = monthEnd(input.month);
  const inLeaveDays = overlapDays(leaveStart, leaveEnd, mStart, mEnd);

  if (inLeaveDays === 0) {
    return {
      grossAmount: 0,
      estimatedNetAmount: 0,
      explanation: "Outside maternity leave date range.",
    };
  }

  const payMode = input.payMode ?? "spread_equal";
  let grossAmount = 0;
  let explanation = "";

  if (payMode === "nhs_spread_occupational_actual_smp") {
    const hybrid = nhsSpreadOccupationalPlusActualSmpForMonth({ ...input, leaveStart: input.leaveStart, leaveEnd: input.leaveEnd }, input.month);
    grossAmount = hybrid.grossAmount;
    explanation = hybrid.explanation;
  } else if (payMode === "spread_equal") {
    const pot = calculateNhsMaternityGrossPot(input);
    const leaveDays = daysInclusive(leaveStart, leaveEnd);
    grossAmount = (pot.totalGross / Math.max(leaveDays, 1)) * inLeaveDays;
    explanation = `Spread equally: ${inLeaveDays} leave days in ${monthLabel(input.month)} from a gross maternity pot of £${pot.totalGross.toFixed(0)}.`;
  } else {
    const actual = actualByWeekGrossForMonth({ ...input, leaveStart: input.leaveStart, leaveEnd: input.leaveEnd }, input.month);
    grossAmount = actual.grossAmount;
    explanation = actual.explanation;
  }

  const kit = calculateKitPayForMonth(input, input.month);
  if (kit.grossAmount > 0 || kit.days > 0) {
    grossAmount += kit.grossAmount;
    explanation = `${explanation} ${kit.explanation}`.trim();
  }

  const estimatedNetAmount = estimateMonthlyNetFromGross(
    grossAmount,
    Number(input.pensionPercent ?? 0),
    input.pensionMethod ?? "nhs_pension",
    input.studentLoanPlan ?? "none",
    input.taxRegion,
  );

  return { grossAmount, estimatedNetAmount, explanation, kitGrossAmount: kit.grossAmount, kitDaysInMonth: kit.days };
}

export function maternityForecast(input: NhsMaternityInput, monthsAhead = 12): NhsMaternityMonth[] {
  if (!input.leaveStart || !input.leaveEnd) return [];

  const leaveStart = parseDate(input.leaveStart);
  const leaveEnd = parseDate(input.leaveEnd);
  const months = monthsBetween(leaveStart, leaveEnd).slice(0, monthsAhead);

  return months.map((month) => {
    const estimate = calculateNhsMaternityMonthlyAmount({ ...input, month });
    return {
      month,
      label: monthLabel(month),
      grossAmount: estimate.grossAmount,
      estimatedNetAmount: estimate.estimatedNetAmount,
      explanation: estimate.explanation,
      kitGrossAmount: estimate.kitGrossAmount ?? 0,
      kitDaysInMonth: estimate.kitDaysInMonth ?? 0,
    };
  });
}

export function maternityDefaults() {
  return {
    fullPayWeeks: DEFAULT_FULL_PAY_WEEKS,
    halfPayWeeks: DEFAULT_HALF_PAY_WEEKS,
    smpOnlyWeeks: DEFAULT_SMP_ONLY_WEEKS,
    unpaidWeeks: DEFAULT_UNPAID_WEEKS,
    smpWeeklyRate: DEFAULT_SMP_WEEKLY_RATE,
  };
}

/* -------------------------------------------------------------------------- */
/* Keeping in touch (KIT / SPLIT) days + NHS pension arrears for unpaid leave  */
/* -------------------------------------------------------------------------- */

/**
 * afc_top_up       — NHS AfC default: paid basic rate for hours worked, less the maternity
 *                    pay already due for that day. In the unpaid phase that means full basic pay.
 * full_in_addition — Employer pays the full basic rate on top of maternity pay.
 * time_in_lieu     — No cash in the month; day(s) owed as time off on return.
 */
export type KitPayMethod = "afc_top_up" | "full_in_addition" | "time_in_lieu";

/** full_salary = deemed full pay (prudent); pay_before_unpaid = SMP-phase pay immediately before unpaid leave. */
export type PensionArrearsBasis = "full_salary" | "pay_before_unpaid";

export type MaternityKitDay = { date: string; hours?: number | null; note?: string | null };

export type MaternityExtras = {
  kitDays: MaternityKitDay[];
  kitPayMethod: KitPayMethod;
  contractedWeeklyHours: number;
  kitDayHours: number;
  /** 10 for maternity/adoption KIT, 20 for shared parental leave SPLIT days. */
  kitAllowance: number;
  pensionArrearsOptIn: boolean;
  pensionArrearsBasis: PensionArrearsBasis;
  /** null = same length as the unpaid period (NHS norm). */
  pensionArrearsMonths: number | null;
  /** YYYY-MM. null = the month after the return date. */
  pensionArrearsStartMonth: string | null;
};

export const DEFAULT_KIT_ALLOWANCE = 10;
export const DEFAULT_SPLIT_ALLOWANCE = 20;
const DEFAULT_CONTRACTED_WEEKLY_HOURS = 37.5;
const DEFAULT_KIT_DAY_HOURS = 7.5;
const WEEKS_PER_YEAR = 52.143;

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function positiveOr(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function defaultMaternityExtras(): MaternityExtras {
  return {
    kitDays: [],
    kitPayMethod: "afc_top_up",
    contractedWeeklyHours: DEFAULT_CONTRACTED_WEEKLY_HOURS,
    kitDayHours: DEFAULT_KIT_DAY_HOURS,
    kitAllowance: DEFAULT_KIT_ALLOWANCE,
    pensionArrearsOptIn: false,
    pensionArrearsBasis: "full_salary",
    pensionArrearsMonths: null,
    pensionArrearsStartMonth: null,
  };
}

/** Defensive parse of the `maternity_extras` jsonb column (or a JSON string from a form). */
export function parseMaternityExtras(raw: unknown): MaternityExtras {
  const base = defaultMaternityExtras();
  let value: unknown = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return base; }
  }
  if (!value || typeof value !== "object") return base;
  const v = value as Record<string, unknown>;

  const seen = new Set<string>();
  const kitDays = Array.isArray(v.kitDays)
    ? (v.kitDays as unknown[])
      .map((d) => (d && typeof d === "object" ? (d as Record<string, unknown>) : null))
      .filter((d): d is Record<string, unknown> => Boolean(d && isIsoDate(d.date)))
      .filter((d) => (seen.has(String(d.date)) ? false : (seen.add(String(d.date)), true)))
      .map((d) => ({
        date: String(d.date),
        hours: d.hours === null || d.hours === undefined || d.hours === "" ? null : positiveOr(d.hours, base.kitDayHours),
        note: typeof d.note === "string" ? d.note.slice(0, 200) : null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  const kitPayMethod: KitPayMethod = v.kitPayMethod === "full_in_addition" || v.kitPayMethod === "time_in_lieu" ? v.kitPayMethod : "afc_top_up";
  const pensionArrearsBasis: PensionArrearsBasis = v.pensionArrearsBasis === "pay_before_unpaid" ? "pay_before_unpaid" : "full_salary";
  const monthsRaw = Number(v.pensionArrearsMonths);

  return {
    kitDays,
    kitPayMethod,
    contractedWeeklyHours: positiveOr(v.contractedWeeklyHours, base.contractedWeeklyHours),
    kitDayHours: positiveOr(v.kitDayHours, base.kitDayHours),
    kitAllowance: Math.round(positiveOr(v.kitAllowance, base.kitAllowance)),
    pensionArrearsOptIn: v.pensionArrearsOptIn === true || v.pensionArrearsOptIn === "true",
    pensionArrearsBasis,
    pensionArrearsMonths: v.pensionArrearsMonths !== null && v.pensionArrearsMonths !== "" && Number.isFinite(monthsRaw) && monthsRaw >= 1 ? Math.round(monthsRaw) : null,
    pensionArrearsStartMonth: typeof v.pensionArrearsStartMonth === "string" && /^\d{4}-\d{2}$/.test(v.pensionArrearsStartMonth) ? v.pensionArrearsStartMonth : null,
  };
}

type MaternityPhase = "full_pay" | "half_pay_smp" | "smp_only" | "unpaid" | "outside";

type PhaseWindow = { phase: Exclude<MaternityPhase, "outside">; start: Date; end: Date; weeklyAmount: number };

/** The statutory/occupational schedule (independent of how a Trust spreads it across payslips). */
function maternityPhaseWindows(input: NhsMaternityInput): PhaseWindow[] {
  const pot = calculateNhsMaternityGrossPot(input);
  const weekly = pot.weeklySalary;
  const blocks: Array<{ phase: PhaseWindow["phase"]; weeks: number; weeklyAmount: number }> = [
    { phase: "full_pay", weeks: pot.fullPayWeeks, weeklyAmount: weekly },
    { phase: "half_pay_smp", weeks: pot.halfPayWeeks, weeklyAmount: Math.min(weekly, weekly * 0.5 + pot.smpWeeklyRate) },
    { phase: "smp_only", weeks: pot.smpOnlyWeeks, weeklyAmount: Math.min(pot.smpWeeklyRate, weekly * 0.9) },
    { phase: "unpaid", weeks: pot.unpaidWeeks, weeklyAmount: 0 },
  ];
  const leaveEnd = parseDate(input.leaveEnd);
  let cursor = parseDate(input.leaveStart);
  const windows: PhaseWindow[] = [];
  blocks.forEach((block) => {
    if (block.weeks <= 0) return;
    const start = cursor;
    let end = addDays(start, Math.round(block.weeks * DAYS_PER_WEEK) - 1);
    if (end > leaveEnd) end = leaveEnd;
    if (start <= leaveEnd) windows.push({ phase: block.phase, start, end, weeklyAmount: block.weeklyAmount });
    cursor = addDays(start, Math.round(block.weeks * DAYS_PER_WEEK));
  });
  return windows;
}

function phaseOn(windows: PhaseWindow[], date: Date) {
  return windows.find((w) => date >= w.start && date <= w.end) ?? null;
}

const PHASE_LABEL: Record<MaternityPhase, string> = {
  full_pay: "full-pay phase",
  half_pay_smp: "half-pay phase",
  smp_only: "SMP-only phase",
  unpaid: "unpaid phase",
  outside: "outside leave",
};

export type KitDayBreakdown = {
  date: string;
  hours: number;
  phase: MaternityPhase;
  basicPay: number;
  maternityPayForDay: number;
  kitPay: number;
  overAllowance: boolean;
};

/** Every KIT day with its phase and pay, in date order. Days beyond the allowance are flagged and paid 0. */
export function kitDayBreakdown(input: NhsMaternityInput): KitDayBreakdown[] {
  if (!input.leaveStart || !input.leaveEnd) return [];
  const extras = parseMaternityExtras(input.extras);
  if (extras.kitDays.length === 0) return [];
  const windows = maternityPhaseWindows(input);
  const hourlyRate = Number(input.grossAnnualSalary || 0) / WEEKS_PER_YEAR / extras.contractedWeeklyHours;
  const leaveStart = parseDate(input.leaveStart);
  const leaveEnd = parseDate(input.leaveEnd);
  let counted = 0;

  return extras.kitDays.map((day) => {
    const date = parseDate(day.date);
    const hours = Number(day.hours ?? extras.kitDayHours);
    const inLeave = date >= leaveStart && date <= leaveEnd;
    const window = inLeave ? phaseOn(windows, date) : null;
    const phase: MaternityPhase = window?.phase ?? "outside";
    // Any work on a day counts as one full KIT day against the allowance, even an hour.
    const overAllowance = inLeave && counted >= extras.kitAllowance;
    if (inLeave && !overAllowance) counted += 1;

    const basicPay = hourlyRate * hours;
    // AfC deducts the maternity payment due for that day; maternity pay accrues per calendar day here.
    const maternityPayForDay = window ? window.weeklyAmount / DAYS_PER_WEEK : 0;
    let kitPay = 0;
    if (inLeave && !overAllowance) {
      if (extras.kitPayMethod === "full_in_addition") kitPay = basicPay;
      else if (extras.kitPayMethod === "afc_top_up") kitPay = Math.max(0, basicPay - maternityPayForDay);
    }
    return { date: day.date, hours, phase, basicPay, maternityPayForDay, kitPay, overAllowance };
  });
}

export function calculateKitPayForMonth(input: NhsMaternityInput, month: string) {
  const days = kitDayBreakdown(input).filter((d) => d.date.startsWith(month) && d.phase !== "outside");
  if (days.length === 0) return { grossAmount: 0, days: 0, explanation: "" };
  const extras = parseMaternityExtras(input.extras);
  const grossAmount = days.reduce((sum, d) => sum + d.kitPay, 0);
  const over = days.filter((d) => d.overAllowance).length;
  const phases = Array.from(new Set(days.map((d) => PHASE_LABEL[d.phase]))).join(", ");
  const method = extras.kitPayMethod === "time_in_lieu"
    ? "taken as time in lieu (no extra pay this month)"
    : extras.kitPayMethod === "full_in_addition"
      ? `+£${grossAmount.toFixed(2)} paid in full on top of maternity pay`
      : `+£${grossAmount.toFixed(2)} top-up (basic pay less maternity pay for the day)`;
  return {
    grossAmount,
    days: days.length,
    explanation: `${days.length} KIT day${days.length === 1 ? "" : "s"} (${phases}): ${method}.${over > 0 ? ` ${over} day${over === 1 ? "" : "s"} over the ${extras.kitAllowance}-day allowance not paid — working them would normally end the leave.` : ""}`,
  };
}

export type KitSummary = { used: number; allowance: number; remaining: number; overAllowance: number; totalKitPay: number; outsideLeave: number };

export function kitSummary(input: NhsMaternityInput): KitSummary {
  const extras = parseMaternityExtras(input.extras);
  const days = kitDayBreakdown(input);
  const inLeave = days.filter((d) => d.phase !== "outside");
  const used = inLeave.filter((d) => !d.overAllowance).length;
  return {
    used,
    allowance: extras.kitAllowance,
    remaining: Math.max(0, extras.kitAllowance - used),
    overAllowance: inLeave.filter((d) => d.overAllowance).length,
    totalKitPay: days.reduce((sum, d) => sum + d.kitPay, 0),
    outsideLeave: days.length - inLeave.length,
  };
}

/* ---------------------------- Pension arrears ----------------------------- */

export type PensionArrearsInstalment = { month: string; label: string; grossAmount: number; netCost: number };

export type PensionArrearsPlan = {
  optedIn: boolean;
  unpaidStart: string | null;
  unpaidEnd: string | null;
  unpaidDays: number;
  basis: PensionArrearsBasis;
  basisWeeklyPay: number;
  memberRatePercent: number;
  totalArrears: number;
  totalNetCost: number;
  months: number;
  monthlyInstalment: number;
  monthlyNetCost: number;
  marginalTaxRate: number;
  schedule: PensionArrearsInstalment[];
  explanation: string;
};

function addMonthsToMonth(month: string, count: number) {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 1 + count, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Marginal income tax rate on the slice the arrears come off (NHS net pay arrangement = income tax relief, no NI relief). */
function marginalTaxRateFor(grossAnnualSalary: number, pensionPercent: number, annualisedDeduction: number) {
  const taxableBefore = Math.max(0, grossAnnualSalary * (1 - pensionPercent / 100));
  const slice = Math.max(1, annualisedDeduction);
  const taxBefore = calculateIncomeTaxEnglandWalesNorthernIreland(taxableBefore);
  const taxAfter = calculateIncomeTaxEnglandWalesNorthernIreland(Math.max(0, taxableBefore - slice));
  return Math.min(0.6, Math.max(0, (taxBefore - taxAfter) / slice));
}

/**
 * NHS Pension Scheme: unpaid maternity leave only counts as pensionable service if the member
 * pays the missed member contributions ("arrears"). Payroll collects them from pay after return,
 * typically over the same length of time as the unpaid period. Unpaid = no pension for those weeks.
 */
export function calculateMaternityPensionArrears(input: NhsMaternityInput): PensionArrearsPlan {
  const extras = parseMaternityExtras(input.extras);
  const memberRatePercent = Number(input.pensionPercent ?? 0);
  const empty: PensionArrearsPlan = {
    optedIn: extras.pensionArrearsOptIn,
    unpaidStart: null,
    unpaidEnd: null,
    unpaidDays: 0,
    basis: extras.pensionArrearsBasis,
    basisWeeklyPay: 0,
    memberRatePercent,
    totalArrears: 0,
    totalNetCost: 0,
    months: 0,
    monthlyInstalment: 0,
    monthlyNetCost: 0,
    marginalTaxRate: 0,
    schedule: [],
    explanation: "",
  };
  if (!input.leaveStart || !input.leaveEnd) return { ...empty, explanation: "Add leave dates to work out pension arrears." };

  const windows = maternityPhaseWindows(input);
  const unpaid = windows.find((w) => w.phase === "unpaid");
  if (!unpaid) return { ...empty, explanation: "No unpaid leave in this plan, so there are no pension arrears to buy back." };

  const unpaidDays = daysInclusive(unpaid.start, unpaid.end);
  const pot = calculateNhsMaternityGrossPot(input);
  const smpPhase = windows.find((w) => w.phase === "smp_only") ?? windows.find((w) => w.phase === "half_pay_smp");
  const basisWeeklyPay = extras.pensionArrearsBasis === "pay_before_unpaid" ? (smpPhase?.weeklyAmount ?? 0) : pot.weeklySalary;
  const totalArrears = (basisWeeklyPay / DAYS_PER_WEEK) * unpaidDays * (memberRatePercent / 100);
  const weeks = (unpaidDays / DAYS_PER_WEEK).toFixed(1);

  const base = { ...empty, unpaidStart: toDateString(unpaid.start), unpaidEnd: toDateString(unpaid.end), unpaidDays, basisWeeklyPay, totalArrears };

  if (memberRatePercent <= 0) return { ...base, explanation: "Set the pension contribution rate on this pay event to estimate arrears." };

  if (!extras.pensionArrearsOptIn) {
    return { ...base, explanation: `Not buying back: the ${weeks} unpaid weeks won't count towards the NHS pension. Buying back would cost about £${totalArrears.toFixed(0)} gross from pay after return.` };
  }

  const months = extras.pensionArrearsMonths ?? Math.max(1, Math.ceil(unpaidDays / AVG_DAYS_PER_MONTH));
  const monthlyInstalment = totalArrears / months;
  const marginalTaxRate = marginalTaxRateFor(Number(input.grossAnnualSalary || 0), memberRatePercent, monthlyInstalment * 12);
  const monthlyNetCost = monthlyInstalment * (1 - marginalTaxRate);
  const leaveEnd = parseDate(input.leaveEnd);
  const firstMonth = extras.pensionArrearsStartMonth
    ?? addMonthsToMonth(`${leaveEnd.getFullYear()}-${String(leaveEnd.getMonth() + 1).padStart(2, "0")}`, 1);

  const schedule = Array.from({ length: months }, (_, i) => {
    const month = addMonthsToMonth(firstMonth, i);
    return { month, label: monthLabel(month), grossAmount: monthlyInstalment, netCost: monthlyNetCost };
  });

  return {
    ...base,
    optedIn: true,
    months,
    monthlyInstalment,
    monthlyNetCost,
    marginalTaxRate,
    totalNetCost: monthlyNetCost * months,
    schedule,
    explanation: `Buying back ${weeks} unpaid weeks at ${memberRatePercent}% of £${basisWeeklyPay.toFixed(2)}/week: £${totalArrears.toFixed(2)} gross, deducted as £${monthlyInstalment.toFixed(2)}/month over ${months} month${months === 1 ? "" : "s"} from ${monthLabel(firstMonth)} (≈£${monthlyNetCost.toFixed(2)} after ${Math.round(marginalTaxRate * 100)}% tax relief).`,
  };
}

/** Take-home reduction for a given month from pension arrears (0 outside the repayment window). */
export function pensionArrearsForMonth(input: NhsMaternityInput, month: string) {
  const plan = calculateMaternityPensionArrears(input);
  const index = plan.schedule.findIndex((s) => s.month === month);
  if (index < 0) return { grossAmount: 0, netCost: 0, explanation: "", plan };
  const instalment = plan.schedule[index];
  return {
    grossAmount: instalment.grossAmount,
    netCost: instalment.netCost,
    explanation: `NHS pension arrears for unpaid maternity leave, instalment ${index + 1} of ${plan.months}.`,
    plan,
  };
}

/** Convenience for callers holding a `pay_events` row. */
export function maternityInputFromPayEvent(event: {
  gross_annual_salary: number | string | null;
  effective_from: string;
  effective_until: string | null;
  maternity_leave_start: string | null;
  maternity_leave_end: string | null;
  maternity_full_pay_weeks: number | string | null;
  maternity_half_pay_weeks: number | string | null;
  maternity_smp_only_weeks: number | string | null;
  maternity_unpaid_weeks: number | string | null;
  maternity_smp_weekly_rate: number | string | null;
  maternity_pay_mode: MaternityPayMode | string | null;
  pension_percent: number | string | null;
  pension_method?: PensionMethod | string | null;
  student_loan_plan?: StudentLoanPlan | string | null;
  maternity_extras?: unknown;
  tax_region?: string | null;
}): NhsMaternityInput {
  const mode = event.maternity_pay_mode;
  return {
    taxRegion: event.tax_region ?? null,
    grossAnnualSalary: Number(event.gross_annual_salary ?? 0),
    leaveStart: event.maternity_leave_start ?? event.effective_from,
    leaveEnd: event.maternity_leave_end ?? event.effective_until ?? event.effective_from,
    fullPayWeeks: Number(event.maternity_full_pay_weeks ?? DEFAULT_FULL_PAY_WEEKS),
    halfPayWeeks: Number(event.maternity_half_pay_weeks ?? DEFAULT_HALF_PAY_WEEKS),
    smpOnlyWeeks: Number(event.maternity_smp_only_weeks ?? DEFAULT_SMP_ONLY_WEEKS),
    unpaidWeeks: Number(event.maternity_unpaid_weeks ?? DEFAULT_UNPAID_WEEKS),
    smpWeeklyRate: Number(event.maternity_smp_weekly_rate ?? DEFAULT_SMP_WEEKLY_RATE),
    payMode: mode === "spread_equal" || mode === "actual_by_week" ? mode : "nhs_spread_occupational_actual_smp",
    pensionPercent: Number(event.pension_percent ?? 0),
    pensionMethod: (event.pension_method as PensionMethod) ?? "nhs_pension",
    studentLoanPlan: (event.student_loan_plan as StudentLoanPlan) ?? "none",
    extras: event.maternity_extras,
  };
}

/**
 * Server-action helper: only touches `maternity_extras` when the form actually sent it,
 * so other forms editing the same row don't wipe saved KIT days / pension choices.
 */
export function maternityExtrasFormPatch(formData: FormData): { maternity_extras?: MaternityExtras } {
  if (!formData.has("maternity_extras")) return {};
  if (String(formData.get("pay_kind") || "") !== "maternity") return {};
  return { maternity_extras: parseMaternityExtras(String(formData.get("maternity_extras") || "")) };
}
