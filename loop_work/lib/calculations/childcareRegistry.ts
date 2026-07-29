import { FundingMode, isEnglandWalesBankHoliday } from "@/lib/calculations/childcare";
import { UK_HOLIDAY_PERIODS, HolidayPeriodKey, isTermTime, weekdaysOverlappingMonth } from "@/lib/calculations/childcareCalendar";

// ---------------------------------------------------------------------------
// Care types
// ---------------------------------------------------------------------------

export type CareType =
  | "nursery"
  | "childminder"
  | "breakfast_club"
  | "after_school_club"
  | "holiday_camp"
  | "nanny"
  | "fixed";

export type ChildLite = { id: string; name: string; age: number | null };

const WEEKDAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
type Weekday = (typeof WEEKDAY_ORDER)[number];
const WEEKDAY_JS_INDEX: Record<Weekday, number> = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5 };

/** Maps the granular care_type to the existing cost_kind bucket so current
 *  dashboard/spending rollups keep working without modification. */
export function mapCareTypeToCostKind(careType: CareType): "fixed" | "nursery" | "activity" | "nanny" {
  switch (careType) {
    case "nursery":
    case "childminder":
      return "nursery";
    case "breakfast_club":
    case "after_school_club":
    case "holiday_camp":
      return "activity";
    case "nanny":
      return "nanny";
    default:
      return "fixed";
  }
}

export function fundedHoursDefault(age: number | null): { suggested: number; note: string } {
  if (age === null) return { suggested: 0, note: "" };
  if (age >= 3) {
    return { suggested: 15, note: "Universal entitlement from age 3 is 15 hrs/week over 38 term weeks. Working parents may be eligible for 30." };
  }
  if (age === 2) {
    return { suggested: 0, note: "Some 2-year-olds qualify for 15 funded hours depending on household circumstances — check eligibility before assuming this applies." };
  }
  return { suggested: 0, note: "Funded hours don't apply under age 2 in most cases." };
}

/** Cost types worth surfacing first for a given child's age — used to bias
 *  ordering in the typeahead, never to hide options. */
export function likelyCareTypesForAge(age: number | null): CareType[] {
  if (age === null) return [];
  if (age < 5) return ["nursery", "childminder"];
  if (age < 12) return ["breakfast_club", "after_school_club", "holiday_camp"];
  return ["holiday_camp"];
}

// ---------------------------------------------------------------------------
// Wizard step registry
// ---------------------------------------------------------------------------
// Framework-agnostic step descriptors consumed by ChildCostWizard.tsx. Each
// entry drives one screen of the sequential flow. Adding a new cost type
// means adding an entry here — not new UI code.

export type StepType = "child" | "select" | "multiselect" | "number" | "currency" | "percent" | "boolean" | "childMulti";

export type WizardStep = {
  id: string;
  title: string | ((answers: Record<string, any>, child: ChildLite | null) => string);
  hint?: string | ((answers: Record<string, any>, child: ChildLite | null) => string | undefined);
  type: StepType;
  min?: number;
  max?: number;
  suffix?: string;
  options?: string[] | { value: string; label: string }[];
  default?: number | string;
  optional?: boolean;
  condition?: (answers: Record<string, any>) => boolean;
};

export type CostTypeDefinition = {
  id: CareType;
  label: string;
  keywords: string[];
  category: string;
  steps: (answers: Record<string, any>, child: ChildLite | null) => WizardStep[];
};

export const HOLIDAY_PERIOD_OPTIONS = Array.from(new Set(UK_HOLIDAY_PERIODS.map((p) => p.key))).map((key) => ({
  value: key,
  label: UK_HOLIDAY_PERIODS.find((p) => p.key === key)!.label,
}));

export const COST_TYPE_REGISTRY: CostTypeDefinition[] = [
  {
    id: "nursery",
    label: "Nursery",
    keywords: ["nursery", "daycare", "preschool", "early years", "creche"],
    category: "Early years",
    steps: (a, child) => {
      const fh = fundedHoursDefault(child?.age ?? null);
      return [
        { id: "child", title: "Which child is this for?", type: "child" },
        { id: "daysPerWeek", title: `How many days a week does ${child?.name ?? "your child"} attend?`, type: "number", min: 1, max: 5, suffix: "days/week" },
        { id: "dailyRate", title: "What's the daily rate?", type: "currency" },
        { id: "extraDailyCost", title: "Any extra daily charges — meals, nappies? (£/day, leave blank if none)", type: "currency", optional: true },
        { id: "fundingEligible", title: `Is ${child?.name ?? "your child"} currently using government-funded early years hours?`, type: "boolean", hint: fh.note },
        { id: "fundedHoursPerWeek", title: "How many funded hours per week?", type: "number", min: 0, max: 30, suffix: "hrs/week", default: fh.suggested, condition: (ans) => ans.fundingEligible === true },
        { id: "billingSchedule", title: "Is this billed all year, or averaged over term time?", type: "select", options: [{ value: "all_year", label: "Full-time / all year" }, { value: "term_time", label: "Term-time averaged" }] },
        { id: "termWeeksPerYear", title: "How many term weeks a year?", type: "number", min: 30, max: 52, default: 38, condition: (ans) => ans.billingSchedule === "term_time" },
      ];
    },
  },
  {
    id: "childminder",
    label: "Childminder",
    keywords: ["childminder", "minder", "home carer"],
    category: "Early years",
    steps: (a, child) => {
      const fh = fundedHoursDefault(child?.age ?? null);
      return [
        { id: "child", title: "Which child is this for?", type: "child" },
        { id: "daysPerWeek", title: `How many days a week does ${child?.name ?? "your child"} attend?`, type: "number", min: 1, max: 5, suffix: "days/week" },
        { id: "hoursPerDay", title: "How many hours per day, typically?", type: "number", min: 1, max: 12, default: 8, suffix: "hrs/day" },
        { id: "hourlyRate", title: "What's the hourly rate?", type: "currency", suffix: "/hr" },
        { id: "fundingEligible", title: `Is ${child?.name ?? "your child"} currently using government-funded early years hours?`, type: "boolean", hint: fh.note },
        { id: "fundedHoursPerWeek", title: "How many funded hours per week?", type: "number", min: 0, max: 30, suffix: "hrs/week", default: fh.suggested, condition: (ans) => ans.fundingEligible === true },
      ];
    },
  },
  {
    id: "breakfast_club",
    label: "Breakfast Club",
    keywords: ["breakfast club", "before school", "morning club", "wraparound"],
    category: "Wraparound care",
    steps: (a, child) => [
      { id: "child", title: "Which child is this for?", type: "child" },
      { id: "daysPerWeek", title: `How many mornings a week does ${child?.name ?? "your child"} attend?`, type: "number", min: 1, max: 5, suffix: "sessions/week" },
      { id: "sessionRate", title: "What's the price per session?", type: "currency" },
      {
        id: "termDatesConfirmed",
        title: "This runs term-time only. Do you have exact term dates for this school?",
        type: "boolean",
        hint: "If not, we'll use a standard England term calendar for now — you can refine this later once you've added the school's own dates.",
      },
      { id: "cadence", title: "How is this invoiced?", type: "select", options: [{ value: "weekly", label: "Weekly" }, { value: "half_termly", label: "Half-termly" }] },
    ],
  },
  {
    id: "after_school_club",
    label: "After-School Club",
    keywords: ["after school club", "afterschool", "wraparound", "pickup club"],
    category: "Wraparound care",
    steps: (a, child) => [
      { id: "child", title: "Which child is this for?", type: "child" },
      { id: "daysPerWeek", title: `How many afternoons a week does ${child?.name ?? "your child"} attend?`, type: "number", min: 1, max: 5, suffix: "sessions/week" },
      { id: "sessionRate", title: "What's the price per session?", type: "currency" },
      {
        id: "termDatesConfirmed",
        title: "This runs term-time only. Do you have exact term dates for this school?",
        type: "boolean",
        hint: "If not, we'll use a standard England term calendar for now — you can refine this later once you've added the school's own dates.",
      },
      { id: "cadence", title: "How is this invoiced?", type: "select", options: [{ value: "weekly", label: "Weekly" }, { value: "half_termly", label: "Half-termly" }] },
    ],
  },
  {
    id: "holiday_camp",
    label: "Holiday Camp",
    keywords: ["holiday club", "holiday camp", "summer camp", "half term camp"],
    category: "Holiday care",
    steps: (a, child) => [
      { id: "child", title: "Which child is this for?", type: "child" },
      { id: "periods", title: "Which holiday periods does this cover?", type: "multiselect", options: HOLIDAY_PERIOD_OPTIONS },
      { id: "daysPerWeek", title: "On average, how many days a week during those holidays?", type: "number", min: 1, max: 5, suffix: "days/week" },
      { id: "dayRate", title: "What's the day rate?", type: "currency", suffix: "/day" },
      { id: "siblingDiscount", title: "Does a sibling discount apply?", type: "boolean" },
      { id: "siblingDiscountPct", title: "What's the discount?", type: "percent", condition: (ans) => ans.siblingDiscount === true },
    ],
  },
  {
    id: "nanny",
    label: "Nanny",
    keywords: ["nanny", "nanny share", "au pair", "in-home care"],
    category: "In-home care",
    steps: (a) => [
      { id: "coveredChildIds", title: "Which children does this cover?", type: "childMulti" },
      { id: "cadence", title: "How are they paid?", type: "select", options: [{ value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }] },
      { id: "rateAmount", title: (ans) => `What's the ${ans.cadence ?? ""} rate?`, type: "currency" },
      { id: "runsThroughHolidays", title: "Does pay continue through school holidays?", type: "boolean" },
      { id: "shared", title: "Is this a nanny share with another family?", type: "boolean" },
      { id: "shareOfCostPct", title: "What share of the total cost do you pay?", type: "percent", default: 50, condition: (ans) => ans.shared === true },
    ],
  },
];

// ---------------------------------------------------------------------------
// Calculators — one per care type, all taking a billingMonth so the caller
// (getChildCostMonthlyAmount in SpendingPlannerClient) can recompute the
// correct figure for any month in a forecast, exactly like the existing
// nursery/activity calculators do.
// ---------------------------------------------------------------------------

function attendanceWeekdaysForCount(daysPerWeek: number): Weekday[] {
  const clamped = Math.max(0, Math.min(5, Math.round(daysPerWeek || 0)));
  return WEEKDAY_ORDER.slice(0, clamped);
}

function countAttendedDaysInMonth(billingMonth: string, weekdays: Weekday[], opts: { excludeBankHolidays: boolean; excludeSchoolHolidays: boolean }) {
  const [year, month] = billingMonth.slice(0, 7).split("-").map(Number);
  const start = new Date(year, (month ?? 1) - 1, 1);
  const end = new Date(year, month ?? 1, 0);
  const targetIndices = new Set(weekdays.map((w) => WEEKDAY_JS_INDEX[w]));

  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (!targetIndices.has(d.getDay())) continue;
    if (opts.excludeBankHolidays && isEnglandWalesBankHoliday(d)) continue;
    if (opts.excludeSchoolHolidays && !isTermTime(d)) continue;
    count += 1;
  }
  return count;
}

export type ChildminderDetails = {
  daysPerWeek: number;
  hoursPerDay: number;
  hourlyRate: number;
  fundingEligible?: boolean;
  fundedHoursPerWeek?: number;
  fundingMode?: FundingMode;
  termWeeksPerYear?: number;
};

export function calculateChildminderMonthlyCost(details: ChildminderDetails, billingMonth: string) {
  const weekdays = attendanceWeekdaysForCount(details.daysPerWeek);
  const attendedDays = countAttendedDaysInMonth(billingMonth, weekdays, { excludeBankHolidays: true, excludeSchoolHolidays: false });
  const dailyCost = (details.hourlyRate || 0) * (details.hoursPerDay || 0);
  let grossCost = attendedDays * dailyCost;

  let fundingCredit = 0;
  if (details.fundingEligible && details.fundedHoursPerWeek) {
    const fundedHoursThisMonth = ((details.fundedHoursPerWeek || 0) * 52) / 12;
    const attendedHours = attendedDays * (details.hoursPerDay || 0);
    const usableFundedHours = Math.min(fundedHoursThisMonth, attendedHours);
    fundingCredit = usableFundedHours * (details.hourlyRate || 0);
  }

  const estimatedMonthlyCost = Math.max(0, grossCost - fundingCredit);
  return {
    estimatedMonthlyCost,
    explanation: `${attendedDays} attended day${attendedDays === 1 ? "" : "s"} at ${details.hoursPerDay || 0}hrs/day${fundingCredit > 0 ? `, ${Math.round(fundingCredit)} funded-hours credit deducted` : ""}.`,
  };
}

export type WraparoundDetails = {
  daysPerWeek: number;
  sessionRate: number;
};

export function calculateWraparoundMonthlyCost(details: WraparoundDetails, billingMonth: string) {
  const weekdays = attendanceWeekdaysForCount(details.daysPerWeek);
  const sessions = countAttendedDaysInMonth(billingMonth, weekdays, { excludeBankHolidays: true, excludeSchoolHolidays: true });
  const estimatedMonthlyCost = sessions * (details.sessionRate || 0);
  return {
    estimatedMonthlyCost,
    explanation: `${sessions} term-time session${sessions === 1 ? "" : "s"} at ${details.sessionRate || 0}/session.`,
  };
}

export type HolidayCampDetails = {
  periods: HolidayPeriodKey[];
  daysPerWeek: number;
  dayRate: number;
  siblingDiscount?: boolean;
  siblingDiscountPct?: number;
};

export function calculateHolidayCampMonthlyCost(details: HolidayCampDetails, billingMonth: string) {
  const attendanceRatio = Math.max(0, Math.min(5, details.daysPerWeek || 0)) / 5;
  let attendedDays = 0;

  for (const periodKey of details.periods ?? []) {
    const periodsForKey = UK_HOLIDAY_PERIODS.filter((p) => p.key === periodKey);
    for (const period of periodsForKey) {
      const weekdaysInMonth = weekdaysOverlappingMonth(period, billingMonth);
      attendedDays += weekdaysInMonth * attendanceRatio;
    }
  }

  let grossCost = attendedDays * (details.dayRate || 0);
  if (details.siblingDiscount && details.siblingDiscountPct) {
    grossCost *= 1 - Math.min(100, Math.max(0, details.siblingDiscountPct)) / 100;
  }

  const estimatedMonthlyCost = Math.max(0, grossCost);
  return {
    estimatedMonthlyCost,
    explanation: `${Math.round(attendedDays * 10) / 10} attended holiday day${attendedDays === 1 ? "" : "s"} this month at ${details.dayRate || 0}/day.`,
  };
}

export type NannyDetails = {
  coveredChildIds: string[];
  cadence: "weekly" | "monthly";
  rateAmount: number;
  runsThroughHolidays?: boolean;
  shared?: boolean;
  shareOfCostPct?: number;
};

export function calculateNannyMonthlyCost(details: NannyDetails) {
  const weeksPerYear = details.runsThroughHolidays ? 52 : 39;
  let estimatedMonthlyCost = details.cadence === "monthly" ? (details.rateAmount || 0) : ((details.rateAmount || 0) * weeksPerYear) / 12;

  if (details.shared && details.shareOfCostPct) {
    estimatedMonthlyCost *= Math.min(100, Math.max(0, details.shareOfCostPct)) / 100;
  }

  return {
    estimatedMonthlyCost,
    explanation: `${details.cadence === "monthly" ? "Monthly" : `Weekly, averaged over ${weeksPerYear} weeks/year`}${details.shared ? `, ${details.shareOfCostPct ?? 0}% share` : ""}.`,
  };
}

/**
 * Single dispatch point for the new care types. Nursery/activity/fixed rows
 * are intentionally NOT handled here — those keep using the existing
 * calculateNurseryMonthlyCost/calculateActivityMonthlyCost functions in
 * getChildCostMonthlyAmount, unchanged.
 */
export function calculateNewCareTypeMonthlyCost(careType: CareType, careDetails: Record<string, any>, billingMonth: string): { estimatedMonthlyCost: number; explanation: string } {
  switch (careType) {
    case "childminder":
      return calculateChildminderMonthlyCost(careDetails as ChildminderDetails, billingMonth);
    case "breakfast_club":
    case "after_school_club":
      return calculateWraparoundMonthlyCost(careDetails as WraparoundDetails, billingMonth);
    case "holiday_camp":
      return calculateHolidayCampMonthlyCost(careDetails as HolidayCampDetails, billingMonth);
    case "nanny":
      return calculateNannyMonthlyCost(careDetails as NannyDetails);
    default:
      return { estimatedMonthlyCost: 0, explanation: "" };
  }
}
