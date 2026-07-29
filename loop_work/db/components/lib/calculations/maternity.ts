import { estimateAnnualTakeHome, PensionMethod, StudentLoanPlan } from "@/lib/calculations/tax";

export type MaternityPayMode = "spread_equal" | "actual_by_week";

export type NhsMaternityInput = {
  month?: string;
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
};

export type NhsMaternityMonth = {
  month: string;
  label: string;
  grossAmount: number;
  estimatedNetAmount: number;
  explanation: string;
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

function estimateMonthlyNetFromGross(monthlyGross: number, pensionPercent: number, pensionMethod: PensionMethod, studentLoanPlan: StudentLoanPlan) {
  if (monthlyGross <= 0) return 0;

  return estimateAnnualTakeHome({
    grossAnnual: monthlyGross * 12,
    pensionPercent,
    pensionMethod,
    studentLoanPlan,
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

  if (payMode === "spread_equal") {
    const pot = calculateNhsMaternityGrossPot(input);
    const leaveDays = daysInclusive(leaveStart, leaveEnd);
    grossAmount = (pot.totalGross / Math.max(leaveDays, 1)) * inLeaveDays;
    explanation = `Spread equally: ${inLeaveDays} leave days in ${monthLabel(input.month)} from a gross maternity pot of £${pot.totalGross.toFixed(0)}.`;
  } else {
    const actual = actualByWeekGrossForMonth({ ...input, leaveStart: input.leaveStart, leaveEnd: input.leaveEnd }, input.month);
    grossAmount = actual.grossAmount;
    explanation = actual.explanation;
  }

  const estimatedNetAmount = estimateMonthlyNetFromGross(
    grossAmount,
    Number(input.pensionPercent ?? 0),
    input.pensionMethod ?? "nhs_pension",
    input.studentLoanPlan ?? "none",
  );

  return { grossAmount, estimatedNetAmount, explanation };
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
