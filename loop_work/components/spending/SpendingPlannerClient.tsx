"use client";

import { useEffect, useMemo, useState, useTransition, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import Link from "next/link";
import { NurseryCostForm } from "@/components/household/NurseryCostForm";
import { ChildCostWizard } from "@/components/household/ChildCostWizard";
import { CareType, calculateNewCareTypeMonthlyCost } from "@/lib/calculations/childcareRegistry";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { formatMoney, type MoneyDisplayPrecision } from "@/lib/format/money";
import { estimateAnnualTakeHome, PensionMethod, StudentLoanPlan } from "@/lib/calculations/tax";
import { MaternityPayMode, calculateNhsMaternityMonthlyAmount } from "@/lib/calculations/maternity";
import { standardCategoryForLabel } from "@/lib/financial-flow/categories";
import {
  ActivityBillingMode,
  BillingSchedule,
  DaySession,
  FundingMode,
  calculateActivityMonthlyCost,
  calculateNurseryMonthlyCost,
} from "@/lib/calculations/childcare";
import {
  acceptRegularPaymentCandidate,
  addPlannedItem,
  addSpendingCategory,
  addSpendingEntry,
  deletePlannedItem,
  deleteSpendingCategory,
  deleteSpendingCategoriesBulk,
  deleteFinancialFlowLinesBulk,
  deleteSpendingEntry,
  dismissRegularPaymentCandidate,
  importBankCsv,
  refreshMissingBillLogos,
  updatePlannedItem,
  updateFinancialFlowLineCategories,
} from "@/app/spending/actions";
import { addChildCost, deleteChildCost, updateChildCost } from "@/app/household/actions";

export type Person = {
  id: string;
  name: string;
  relationship: "self" | "partner" | "child" | "other";
  avatar_url?: string | null;
  linked_user_id?: string | null;
};

export type SpendingCategory = {
  id: string;
  name: string;
  monthly_budget: number | null;
  type: "fixed" | "variable" | "saving" | "debt";
  category_icon?: string | null;
  standard_category_key?: string | null;
  group_id?: string | null;
};

type PaymentAccount = { id: string; name: string; provider?: string | null; account_type?: string | null; owner_person_id?: string | null; ownership_scope?: string | null };
type HouseholdPet = { id: string; name: string; species: string; breed?: string | null; avatar_url?: string | null };
type HomeProfile = { property_kind?: string | null; tenure?: string | null; heating_type?: string | null };

export type SpendingEntry = {
  id: string;
  person_id: string | null;
  label: string;
  amount: number;
  spent_at: string;
  notes: string | null;
  category_id: string | null;
  payment_account_id?: string | null;
  pet_id?: string | null;
};

export type PlannedItem = {
  id: string;
  person_id: string | null;
  category_id: string | null;
  direction: "income" | "outgoing";
  item_type: "salary_topup" | "child_benefit" | "dividend" | "bonus" | "interest" | "subscription" | "utilities" | "mobile_phone" | "insurance" | "mortgage_rent" | "childcare" | "school_activity" | "grocery" | "transport" | "healthcare" | "debt_payment" | "saving_investment" | "monthly_cost" | "bill" | "one_off" | "manual_income" | "transfer";
  label: string;
  amount: number;
  recurrence: "monthly" | "four_weekly" | "custom_interval" | "one_off";
  recurrence_interval_days?: number | null;
  start_date: string;
  end_date: string | null;
  day_of_month: number | null;
  payment_timing?: "fixed_day" | "last_workday" | null;
  payment_adjustment?: "previous_workday" | "next_workday" | "none" | null;
  brand_name?: string | null;
  brand_domain?: string | null;
  brand_logo_url?: string | null;
  brand_logo_source?: string | null;
  brand_logo_checked_at?: string | null;
  end_behavior?: "drops_off" | "renews" | "review_needed" | null;
  renewal_notice_days?: number | null;
  early_upgrade_date?: string | null;
  expected_refund_amount?: number | null;
  notes: string | null;
  payment_account_id?: string | null;
  pet_id?: string | null;
};

export type PayEvent = {
  id: string;
  person_id: string | null;
  label: string;
  pay_kind: string | null;
  gross_annual_salary: number;
  monthly_take_home_override: number | null;
  pension_percent: number;
  pension_method: PensionMethod | null;
  student_loan_plan: StudentLoanPlan;
  effective_from: string;
  effective_until: string | null;
  maternity_scheme: string | null;
  maternity_leave_start: string | null;
  maternity_leave_end: string | null;
  maternity_pay_mode: MaternityPayMode | null;
  maternity_full_pay_weeks: number | null;
  maternity_half_pay_weeks: number | null;
  maternity_smp_only_weeks: number | null;
  maternity_unpaid_weeks: number | null;
  maternity_smp_weekly_rate: number | null;
  pay_timing?: "fixed_day" | "last_workday" | null;
  pay_day_of_month?: number | null;
  pay_adjustment?: "previous_workday" | "next_workday" | "none" | null;
};

export type ChildCost = {
  id: string;
  child_id: string | null;
  bill_person_id?: string | null;
  label: string;
  cost_kind: "fixed" | "nursery" | "activity" | "nanny" | null;
  monthly_cost: number;
  billing_month: string | null;
  daily_rate: number | null;
  extra_daily_cost: number | null;
  funded_hours_per_week: number | null;
  funding_mode: FundingMode | null;
  hourly_funding_credit: number | null;
  term_weeks_per_year: number | null;
  billing_schedule: BillingSchedule | null;
  bank_holidays_are_free: boolean | null;
  tax_free_childcare_enabled?: boolean | null;
  tax_free_childcare_cap_per_quarter?: number | null;
  part_day_multiplier: number | null;
  full_day_hours: number | null;
  part_day_hours: number | null;
  monday_session: DaySession | null;
  tuesday_session: DaySession | null;
  wednesday_session: DaySession | null;
  thursday_session: DaySession | null;
  friday_session: DaySession | null;
  monday_hours: number | null;
  tuesday_hours: number | null;
  wednesday_hours: number | null;
  thursday_hours: number | null;
  friday_hours: number | null;
  activity_weekly_cost: number | null;
  activity_weekday: number | null;
  activity_billing_mode: ActivityBillingMode | null;
  activity_term_weeks_per_year: number | null;
  payment_timing?: "fixed_day" | "last_workday" | null;
  payment_day_of_month?: number | null;
  payment_adjustment?: "previous_workday" | "next_workday" | "none" | null;
  starts_on: string;
  ends_on: string | null;
  care_type?: CareType | null;
  care_details?: Record<string, any> | null;
};

export type BankImport = {
  id: string;
  person_id: string | null;
  account_name: string;
  provider_name: string | null;
  original_filename: string | null;
  imported_rows: number;
  detected_rows: number;
  status: string;
  created_at: string;
};

export type RegularPaymentCandidate = {
  id: string;
  person_id: string | null;
  account_name: string | null;
  normalized_key: string;
  direction: "income" | "outgoing";
  label_suggestion: string;
  amount_average: number;
  amount_min: number;
  amount_max: number;
  day_of_month: number | null;
  first_seen: string | null;
  last_seen: string | null;
  occurrence_count: number;
  seen_month_count: number;
  confidence: number;
  sample_descriptions: string[] | null;
  sample_dates: string[] | null;
  notes: string | null;
  status: "suggested" | "accepted" | "dismissed";
};

export type StudentLoanAccount = {
  id: string;
  person_id: string | null;
  plan: StudentLoanPlan;
  current_balance: number;
  balance_date: string;
  interest_rate: number | null;
  payroll_monthly_override: number | null;
  notes: string | null;
};

type FlowPersonDisplayMode = "name" | "image" | "both";
type FlowDateFormat = "day_month_ordinal" | "day_of_month" | "month_day" | "short_numeric" | "iso";
type BillLogoMode = "auto" | "off";

type FlowSettings = {
  personDisplayMode: FlowPersonDisplayMode;
  dateFormat: FlowDateFormat;
  billLogoMode: BillLogoMode;
  moneyDisplayPrecision: MoneyDisplayPrecision;
};

type Props = {
  people: Person[];
  categories: SpendingCategory[];
  entries: SpendingEntry[];
  plannedItems: PlannedItem[];
  payEvents: PayEvent[];
  childCosts: ChildCost[];
  bankImports: BankImport[];
  regularCandidates: RegularPaymentCandidate[];
  studentLoanAccounts?: StudentLoanAccount[];
  studentLoanEnabled?: boolean;
  flowSettings?: Partial<FlowSettings>;
  initialMonth?: string;
  initialPersonId?: string;
  initialDirectionFilter?: "all" | "income" | "outgoing";
  hasHousehold?: boolean;
  compactPage?: boolean;
  paymentAccounts?: PaymentAccount[];
  householdPets?: HouseholdPet[];
  homeProfile?: HomeProfile | null;
  categoryGroups?: { id: string; name: string; icon?: string | null }[];
  initialAddMode?: AddMode;
  initialAddTemplate?: SimpleFlowTemplate;
};

type AddMode = "monthly" | "one_off" | "child_cost" | "category" | "bank_import";
type SimpleFlowTemplate = { kind?: string; label?: string; direction?: "income" | "outgoing"; itemType?: PlannedItem["item_type"]; amount?: number; recurrence?: PlannedItem["recurrence"]; categoryKey?: string };

type ModalState =
  | null
  | { type: "add"; mode: AddMode; template?: SimpleFlowTemplate }
  | { type: "edit_planned"; item: PlannedItem }
  | { type: "edit_child_cost"; cost: ChildCost }
  | { type: "quick_category"; lineIds: string[]; title?: string };

function QuickCategoryForm({
  categories,
  categoryGroups,
  lineIds,
  onDone,
}: {
  categories: SpendingCategory[];
  categoryGroups: { id: string; name: string; icon?: string | null }[];
  lineIds: string[];
  onDone?: () => void;
}) {
  const [chosen, setChosen] = useState(categories[0]?.id || "");
  return (
    <form
      action={async (formData) => {
        await updateFinancialFlowLineCategories(formData);
        onDone?.();
      }}
      className="space-y-4"
    >
      {lineIds.map((id) => <input key={id} type="hidden" name="line_id" value={id} />)}
      <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
        <p className="text-sm font-black text-emerald-950">Apply category to {lineIds.length} line(s)</p>
        <p className="mt-1 text-xs font-bold text-emerald-700">This updates the spending plan immediately and refreshes the charts without making you open every bill one by one.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {categories.map((category) => {
          const active = chosen === category.id;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => setChosen(category.id)}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${active ? "border-emerald-300 bg-emerald-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}
            >
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-lg shadow-sm">{category.category_icon || guessCategoryIcon(category.name)}</span>
              <span>
                <span className="block text-sm font-black text-slate-950">{category.name}</span>
                <span className="block text-xs font-bold capitalize text-slate-500">{category.type}{category.group_id ? ` · ${categoryGroups.find((group) => group.id === category.group_id)?.name || "Grouped"}` : " · No group"}</span>
              </span>
            </button>
          );
        })}
      </div>
      <input type="hidden" name="category_id" value={chosen} />
      <div className="flex flex-wrap gap-3">
        <button disabled={!chosen || lineIds.length === 0} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300">Apply category</button>
        <a href="#spending-groups" className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-black text-slate-600 hover:bg-slate-100">Manage groups & categories here</a>
      </div>
    </form>
  );
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatNiceDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function ukTaxYearForMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const startYear = monthNumber >= 4 ? year : year - 1;
  return { start: new Date(Date.UTC(startYear, 3, 6)), end: new Date(Date.UTC(startYear + 1, 3, 5)), label: `${startYear}/${String(startYear + 1).slice(-2)}` };
}

function countWeekdaysInclusive(start: Date, end: Date, weekday: number) {
  const cursor = new Date(start);
  while (cursor.getUTCDay() !== weekday) cursor.setUTCDate(cursor.getUTCDate() + 1);
  let count = 0;
  while (cursor <= end) {
    count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return count;
}

function monthStart(month: string) {
  return `${month}-01`;
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).toISOString().slice(0, 10);
}

function lastDayOfMonth(month: string) {
  return Number(monthEnd(month).slice(8, 10));
}

function dateIsInMonth(date: string, month: string) {
  return date >= monthStart(month) && date <= monthEnd(month);
}

function isActiveInMonth(start: string, end: string | null, month: string) {
  return start <= monthEnd(month) && (!end || end >= monthStart(month));
}

function getYearMonths(year: number) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

function ordinalDay(day: number) {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  const last = day % 10;
  if (last === 1) return `${day}st`;
  if (last === 2) return `${day}nd`;
  if (last === 3) return `${day}rd`;
  return `${day}th`;
}

function formatFlowDate(date: string, dateFormat: FlowDateFormat) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const day = parsed.getDate();
  const month = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(parsed);
  const numeric = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);

  if (dateFormat === "day_of_month") return `${ordinalDay(day)} of ${month}`;
  if (dateFormat === "month_day") return `${month} ${ordinalDay(day)}`;
  if (dateFormat === "short_numeric") return numeric;
  if (dateFormat === "iso") return date;
  return `${ordinalDay(day)} ${month}`;
}

const englandWalesBankHolidays = new Set([
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
]);

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isWeekendOrBankHoliday(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6 || englandWalesBankHolidays.has(toDateString(date));
}

function adjustedWorkday(date: Date, adjustment: "previous_workday" | "next_workday" | "none" = "previous_workday") {
  if (adjustment === "none") return date;
  const next = new Date(date);
  const step = adjustment === "next_workday" ? 1 : -1;
  while (isWeekendOrBankHoliday(next)) next.setDate(next.getDate() + step);
  return next;
}

function dueDateForMonth(month: string, timing?: string | null, dayOfMonth?: number | null, adjustment?: string | null) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const baseDate = timing === "last_workday"
    ? new Date(year, monthNumber - 1, lastDay)
    : new Date(year, monthNumber - 1, Math.min(Math.max(Number(dayOfMonth || 1), 1), lastDay));
  return toDateString(adjustedWorkday(baseDate, (adjustment as "previous_workday" | "next_workday" | "none") || "previous_workday"));
}

function personAvatarUrl(peopleById: Map<string, Person>, personId: string | null | undefined) {
  if (!personId) return null;
  return peopleById.get(personId)?.avatar_url ?? null;
}

function PersonMarker({
  name,
  avatarUrl,
  mode,
  dependentName,
  dependentAvatarUrl,
  dependentEmoji,
}: {
  name: string;
  avatarUrl: string | null;
  mode: FlowPersonDisplayMode;
  dependentName?: string | null;
  dependentAvatarUrl?: string | null;
  dependentEmoji?: string | null;
}) {
  const isHousehold = !avatarUrl && /^(household|shared)/i.test(name.trim());

  if (mode === "name") {
    return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{dependentName ? `${dependentName} · covered by ${name}` : name}</span>;
  }

  const payerBadge = avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
  ) : isHousehold ? (
    <span className="grid h-full w-full place-items-center rounded-full bg-slate-950 text-white">🏠</span>
  ) : (
    <span className="grid h-full w-full place-items-center rounded-full bg-slate-200 text-[10px] font-black text-slate-700">{name.slice(0, 1).toUpperCase()}</span>
  );

  // "Double bubble": a dependent (child/pet) this line is really for, with the payer/coverer shown
  // as a small badge overlapping its corner — e.g. Oakley's childcare, covered by the household.
  if (dependentName) {
    const dependentAvatar = dependentAvatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={dependentAvatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
    ) : dependentEmoji ? (
      <span className="grid h-full w-full place-items-center rounded-full bg-emerald-50 text-base">{dependentEmoji}</span>
    ) : (
      <span className="grid h-full w-full place-items-center rounded-full bg-slate-200 text-xs font-black text-slate-700">{dependentName.slice(0, 1).toUpperCase()}</span>
    );
    const bubble = (
      <span className="relative inline-block h-9 w-9 shrink-0" title={`For ${dependentName} · covered by ${name}`}>
        <span className="block h-9 w-9 overflow-hidden rounded-full ring-2 ring-white">{dependentAvatar}</span>
        <span className="absolute -bottom-1 -right-1 h-4 w-4 overflow-hidden rounded-full ring-2 ring-white">{payerBadge}</span>
      </span>
    );
    if (mode === "image") return bubble;
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 py-1 pl-1 pr-3 text-xs font-black text-slate-700">
        {bubble}
        {dependentName}
      </span>
    );
  }

  const avatar = (
    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full ring-2 ring-white">{payerBadge}</span>
  );

  if (mode === "image") {
    return <span title={name} aria-label={name}>{avatar}</span>;
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 py-1 pl-1 pr-3 text-xs font-black text-slate-700">
      {avatar}
      {name}
    </span>
  );
}

function BrandLogo({ title, logoUrl, brandName }: { title: string; logoUrl?: string | null; brandName?: string | null }) {
  const label = brandName || title;
  if (logoUrl) {
    return (
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" className="h-8 w-8 object-contain" />
      </span>
    );
  }

  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-sm font-black text-slate-700">
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

function CategoryIcon({ icon, label }: { icon?: string | null; label: string }) {
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-xl shadow-sm" title={label}>
      {icon || guessCategoryIcon(label)}
    </span>
  );
}

function MiniPersonAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }

  const isHousehold = /^(household|shared)/i.test(name.trim());

  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700 shadow-sm">
      {isHousehold ? "🏠" : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

const CATEGORY_ICON_OPTIONS = [
  { icon: "🏷️", label: "General" },
  { icon: "📱", label: "Subscriptions" },
  { icon: "🏠", label: "Mortgage / rent" },
  { icon: "⚡", label: "Utilities" },
  { icon: "🚗", label: "Car / transport" },
  { icon: "👶", label: "Childcare" },
  { icon: "🛒", label: "Food / groceries" },
  { icon: "🛡️", label: "Insurance" },
  { icon: "💳", label: "Debt / loans" },
  { icon: "💰", label: "Savings" },
  { icon: "🎮", label: "Entertainment" },
  { icon: "🏥", label: "Health" },
];

function guessCategoryIcon(label: string) {
  const lower = label.toLowerCase();
  if (/subscription|netflix|spotify|apple|phone|mobile/.test(lower)) return "📱";
  if (/mortgage|rent|home|house/.test(lower)) return "🏠";
  if (/utility|gas|electric|water|energy|council/.test(lower)) return "⚡";
  if (/car|fuel|transport|vw|train|bus|parking/.test(lower)) return "🚗";
  if (/child|nursery|school|activity/.test(lower)) return "👶";
  if (/food|grocery|shop|supermarket/.test(lower)) return "🛒";
  if (/insurance|cover|policy/.test(lower)) return "🛡️";
  if (/loan|debt|credit|card/.test(lower)) return "💳";
  if (/saving|investment|isa|pension/.test(lower)) return "💰";
  if (/health|dental|doctor|medical/.test(lower)) return "🏥";
  return "🏷️";
}

function labelise(value: string | null | undefined) {
  return String(value || "General")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

const COMMON_BRAND_PREVIEWS: { match: RegExp; brandName: string; domain: string }[] = [
  { match: /spotify/i, brandName: "Spotify", domain: "spotify.com" },
  { match: /netflix/i, brandName: "Netflix", domain: "netflix.com" },
  { match: /apple|icloud/i, brandName: "Apple", domain: "apple.com" },
  { match: /barclays/i, brandName: "Barclays", domain: "barclays.co.uk" },
  { match: /ecologi/i, brandName: "Ecologi", domain: "ecologi.com" },
  { match: /omaze/i, brandName: "Omaze", domain: "omaze.co.uk" },
  { match: /postcode lottery|people.?s postcode/i, brandName: "People's Postcode Lottery", domain: "postcodelottery.co.uk" },
  { match: /volkswagen|\bvw\b/i, brandName: "Volkswagen", domain: "volkswagen.co.uk" },
  { match: /plum/i, brandName: "Plum", domain: "withplum.com" },
  { match: /cottontails/i, brandName: "Cottontails", domain: "cottontailsdaynursery.co.uk" },
];

function logoUrlForDomain(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

function guessBrandPreview(label: string) {
  const hit = COMMON_BRAND_PREVIEWS.find((entry) => entry.match.test(label));
  if (!hit) return null;
  return { ...hit, logoUrl: logoUrlForDomain(hit.domain) };
}

function personName(peopleById: Map<string, Person>, personId: string | null) {
  if (!personId) return "Shared";
  return peopleById.get(personId)?.name ?? "Household";
}

// Step size in days for the "every N days/weeks" recurrences. four_weekly is a fixed
// 28-day case of the same pattern; custom_interval uses whatever the person configured.
function plannedItemIntervalDays(item: PlannedItem) {
  if (item.recurrence === "four_weekly") return 28;
  if (item.recurrence === "custom_interval") return Math.max(1, Number(item.recurrence_interval_days || 0) || 1);
  return 28;
}

function plannedItemDueDate(item: PlannedItem, month: string) {
  if (item.recurrence === "one_off") return item.start_date;
  if (item.recurrence === "four_weekly" || item.recurrence === "custom_interval") return plannedItemDatesForMonth(item, month)[0] || item.start_date;
  return dueDateForMonth(month, item.payment_timing ?? "fixed_day", item.day_of_month ?? Number(item.start_date.slice(8, 10)), item.payment_adjustment ?? "previous_workday");
}

function plannedItemDatesForMonth(item: PlannedItem, month: string) {
  if (item.recurrence === "one_off") return dateIsInMonth(item.start_date, month) ? [item.start_date] : [];
  if (item.recurrence === "monthly") return isActiveInMonth(item.start_date, plannedItemForecastEndDate(item), month) ? [dueDateForMonth(month, item.payment_timing ?? "fixed_day", item.day_of_month ?? Number(item.start_date.slice(8, 10)), item.payment_adjustment ?? "previous_workday")] : [];
  const stepDays = plannedItemIntervalDays(item);
  const monthStartDate = new Date(`${month}-01T12:00:00Z`);
  const [year, monthNumber] = month.split("-").map(Number);
  const monthEndDate = new Date(Date.UTC(year, monthNumber, 0, 12));
  const cursor = new Date(`${item.start_date}T12:00:00Z`);
  const end = item.end_date ? new Date(`${item.end_date}T12:00:00Z`) : null;
  while (cursor < monthStartDate) cursor.setUTCDate(cursor.getUTCDate() + stepDays);
  const dates: string[] = [];
  while (cursor <= monthEndDate && (!end || cursor <= end)) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + stepDays);
  }
  return dates;
}

function plannedItemForecastEndDate(item: PlannedItem) {
  if (item.recurrence !== "monthly") return item.end_date;
  if (!item.end_date) return null;
  return (item.end_behavior ?? "drops_off") === "drops_off" ? item.end_date : null;
}

function plannedItemAppliesToMonth(item: PlannedItem, month: string) {
  return plannedItemDatesForMonth(item, month).length > 0;
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000);
}

function addMonthsToMonth(month: string, monthsToAdd: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + monthsToAdd, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function lifecycleLabel(item: PlannedItem) {
  const behavior = item.end_behavior ?? "drops_off";
  if (behavior === "renews") return "Renews / continues";
  if (behavior === "review_needed") return "Review before renewal";
  return "Drops off";
}

function lifecycleHint(item: PlannedItem, dateFormat: FlowDateFormat, money: (value: number | null | undefined) => string) {
  if (!item.end_date && !item.early_upgrade_date && !Number(item.expected_refund_amount ?? 0)) return null;
  const parts: string[] = [];
  if (item.end_date) parts.push(`${lifecycleLabel(item)}: ${formatFlowDate(item.end_date, dateFormat)}`);
  if (item.renewal_notice_days && item.end_date) parts.push(`Nudge ${item.renewal_notice_days} day(s) before`);
  if (item.early_upgrade_date) parts.push(`Early upgrade from ${formatFlowDate(item.early_upgrade_date, dateFormat)}`);
  if (Number(item.expected_refund_amount ?? 0) > 0) parts.push(`Possible money back ${money(Number(item.expected_refund_amount))}`);
  return parts.join(" · ");
}

function compactLifecycleLabel(item: PlannedItem, dateFormat: FlowDateFormat) {
  if (item.end_date) {
    const date = formatFlowDate(item.end_date, dateFormat);
    if ((item.end_behavior ?? "drops_off") === "renews") return `Renews ${date}`;
    if (item.end_behavior === "review_needed") return `Review ${date}`;
    return `Drops off ${date}`;
  }
  if (item.early_upgrade_date) return `Upgrade ${formatFlowDate(item.early_upgrade_date, dateFormat)}`;
  return null;
}

function getPayAmount(event: PayEvent, month: string) {
  if (event.pay_kind === "maternity") {
    return calculateNhsMaternityMonthlyAmount({
      month,
      grossAnnualSalary: Number(event.gross_annual_salary),
      leaveStart: event.maternity_leave_start ?? event.effective_from,
      leaveEnd: event.maternity_leave_end ?? event.effective_until ?? event.effective_from,
      fullPayWeeks: Number(event.maternity_full_pay_weeks ?? 8),
      halfPayWeeks: Number(event.maternity_half_pay_weeks ?? 18),
      smpOnlyWeeks: Number(event.maternity_smp_only_weeks ?? 13),
      unpaidWeeks: Number(event.maternity_unpaid_weeks ?? 13),
      smpWeeklyRate: Number(event.maternity_smp_weekly_rate ?? 194.32),
      payMode: event.maternity_pay_mode ?? "nhs_spread_occupational_actual_smp",
      pensionPercent: Number(event.pension_percent),
      pensionMethod: event.pension_method ?? "net_pay",
      studentLoanPlan: event.student_loan_plan,
    }).estimatedNetAmount;
  }

  if (event.monthly_take_home_override !== null && event.monthly_take_home_override !== undefined) {
    return Number(event.monthly_take_home_override);
  }

  return estimateAnnualTakeHome({
    grossAnnual: Number(event.gross_annual_salary),
    pensionPercent: Number(event.pension_percent),
    pensionMethod: event.pension_method ?? "net_pay",
    studentLoanPlan: event.student_loan_plan,
  }).monthlyTakeHome;
}

const NEW_CARE_TYPES: CareType[] = ["childminder", "breakfast_club", "after_school_club", "holiday_camp", "nanny"];
const careTypeLabelsForEditNotice: Partial<Record<CareType, string>> = {
  nursery: "nursery costs",
  childminder: "childminder costs",
  breakfast_club: "breakfast club costs",
  after_school_club: "after-school club costs",
  holiday_camp: "holiday camp costs",
  nanny: "nanny costs",
};

function getChildCostMonthlyAmount(cost: ChildCost, month: string) {
  if (cost.care_type && NEW_CARE_TYPES.includes(cost.care_type as CareType)) {
    return calculateNewCareTypeMonthlyCost(cost.care_type as CareType, cost.care_details ?? {}, month).estimatedMonthlyCost;
  }

  if (cost.cost_kind === "activity") {
    return calculateActivityMonthlyCost({
      billingMonth: month,
      weeklyCost: Number(cost.activity_weekly_cost ?? cost.monthly_cost ?? 0),
      activityWeekday: Number(cost.activity_weekday ?? 6),
      activityBillingMode: cost.activity_billing_mode ?? "calendar",
      activityTermWeeksPerYear: Number(cost.activity_term_weeks_per_year ?? 38),
      bankHolidaysAreFree: Boolean(cost.bank_holidays_are_free),
    }).estimatedMonthlyCost;
  }

  if (cost.cost_kind !== "nursery") return Number(cost.monthly_cost ?? 0);

  return calculateNurseryMonthlyCost({
    billingMonth: month,
    dailyRate: Number(cost.daily_rate ?? 0),
    extraDailyCost: Number(cost.extra_daily_cost ?? 0),
    fundedHoursPerWeek: Number(cost.funded_hours_per_week ?? 0),
    fundingMode: cost.funding_mode ?? "none",
    hourlyFundingCredit: Number(cost.hourly_funding_credit ?? 0),
    termWeeksPerYear: Number(cost.term_weeks_per_year ?? 38),
    billingSchedule: cost.billing_schedule ?? "all_year",
    bankHolidaysAreFree: Boolean(cost.bank_holidays_are_free),
    taxFreeChildcareEnabled: Boolean(cost.tax_free_childcare_enabled),
    taxFreeChildcareCapPerQuarter: Number(cost.tax_free_childcare_cap_per_quarter ?? 500),
    partDayMultiplier: Number(cost.part_day_multiplier ?? 0.5),
    fullDayHours: Number(cost.full_day_hours ?? 10),
    partDayHours: Number(cost.part_day_hours ?? 5),
    mondaySession: cost.monday_session ?? "off",
    tuesdaySession: cost.tuesday_session ?? "off",
    wednesdaySession: cost.wednesday_session ?? "off",
    thursdaySession: cost.thursday_session ?? "off",
    fridaySession: cost.friday_session ?? "off",
    mondayHours: Number(cost.monday_hours ?? 0),
    tuesdayHours: Number(cost.tuesday_hours ?? 0),
    wednesdayHours: Number(cost.wednesday_hours ?? 0),
    thursdayHours: Number(cost.thursday_hours ?? 0),
    fridayHours: Number(cost.friday_hours ?? 0),
  }).estimatedMonthlyCost;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <ModalFrame title={title} eyebrow="Financial Flow" onClose={onClose} maxWidth="max-w-3xl">
      {children}
    </ModalFrame>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500 transition focus:ring-2" />;
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500 transition focus:ring-2" />;
}

function Submit({ children }: { children: ReactNode }) {
  return <button type="submit" className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">{children}</button>;
}

function defaultPersonSelectValue(value: string | null | undefined) {
  return value && value !== "__household" ? value : "";
}

function confirmDelete(message = "Delete this item? This cannot be undone.") {
  return typeof window === "undefined" ? true : window.confirm(message);
}

function SimpleFlowWizard({ people, categories, paymentAccounts, householdPets, selectedMonth, selectedPersonId, hasHousehold, initialTemplate }: { people: Person[]; categories: SpendingCategory[]; paymentAccounts: PaymentAccount[]; householdPets: HouseholdPet[]; selectedMonth: string; selectedPersonId: string; hasHousehold: boolean; initialTemplate?: SimpleFlowTemplate }) {
  const [step, setStep] = useState(initialTemplate ? 2 : 1);
  const [template, setTemplate] = useState<SimpleFlowTemplate>(initialTemplate || {});
  const [label, setLabel] = useState(initialTemplate?.label || "");
  const [amount, setAmount] = useState(initialTemplate?.amount ? String(initialTemplate.amount) : "");
  const [personId, setPersonId] = useState(defaultPersonSelectValue(selectedPersonId));
  const [accountId, setAccountId] = useState("");
  const [recurrence, setRecurrence] = useState<PlannedItem["recurrence"]>(initialTemplate?.recurrence || "monthly");
  const [intervalCount, setIntervalCount] = useState("2");
  const [intervalUnit, setIntervalUnit] = useState<"day" | "week">("week");
  const intervalDays = Math.max(1, Number(intervalCount || 0) || 1) * (intervalUnit === "week" ? 7 : 1);
  const [startDate, setStartDate] = useState(monthStart(selectedMonth));
  const [endDate, setEndDate] = useState("");
  const [petId, setPetId] = useState("");
  const [categoryOverride, setCategoryOverride] = useState("");
  const direction = template.direction || "outgoing";
  const itemType = template.itemType || "bill";
  const rawSuggestion = standardCategoryForLabel(`${label} ${itemType.replaceAll("_", " ")}`);
  const suggested = { ...rawSuggestion, label: template.kind === "child_benefit" ? "Benefit income" : direction === "income" && rawSuggestion.key === "other" ? "Income" : rawSuggestion.label };
  const categoryKey = template.categoryKey || suggested.key;
  const categoryId = categoryOverride || categories.find((category) => category.standard_category_key === categoryKey || category.name.toLowerCase() === suggested.label.toLowerCase())?.id || "";

  const choose = (next: SimpleFlowTemplate) => {
    setTemplate(next);
    setLabel(next.label || "");
    setAmount(next.amount ? String(next.amount) : "");
    setRecurrence(next.recurrence || "monthly");
    setStep(2);
  };
  const previewDates = (() => {
    const dates: string[] = [];
    const cursor = new Date(`${startDate}T12:00:00Z`);
    for (let index = 0; index < 3; index += 1) {
      dates.push(cursor.toISOString().slice(0, 10));
      if (recurrence === "four_weekly") cursor.setUTCDate(cursor.getUTCDate() + 28);
      else if (recurrence === "custom_interval") cursor.setUTCDate(cursor.getUTCDate() + intervalDays);
      else if (recurrence === "monthly") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      else break;
    }
    return dates;
  })();

  if (step === 1) return <div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Step 1 of 3</p><h3 className="mt-2 text-2xl font-black text-slate-950">What are you adding?</h3><p className="mt-1 text-sm font-semibold text-slate-500">Choose the closest answer. LOOP will fill the likely setup and you can check it next.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{[
    { label: "Household bill", helper: "Energy, water, Council Tax or insurance", value: { kind: "bill", direction: "outgoing" as const, itemType: "bill" as const, recurrence: "monthly" as const } },
    { label: "Subscription", helper: "Streaming, mobile, memberships or software", value: { kind: "subscription", direction: "outgoing" as const, itemType: "subscription" as const, recurrence: "monthly" as const, categoryKey: "subscriptions" } },
    { label: "Regular spending", helper: "Food, transport, pets or another repeat cost", value: { kind: "spend", direction: "outgoing" as const, itemType: "monthly_cost" as const, recurrence: "monthly" as const } },
    { label: "Income or benefit", helper: "Benefit, dividend, allowance or regular income", value: { kind: "income", direction: "income" as const, itemType: "manual_income" as const, recurrence: "monthly" as const } },
  ].map((choice) => <button key={choice.label} type="button" onClick={() => choose(choice.value)} className="rounded-3xl border border-slate-200 bg-white p-5 text-left transition hover:border-emerald-300 hover:bg-emerald-50"><span className="block font-black text-slate-950">{choice.label}</span><span className="mt-1 block text-xs font-bold leading-5 text-slate-500">{choice.helper}</span></button>)}</div></div>;

  if (step === 2) return <div><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Step 2 of 3</p><h3 className="mt-2 text-2xl font-black text-slate-950">Check the essentials</h3><div className="mt-5 grid gap-4 sm:grid-cols-2">
    <Field label="What is it?"><TextInput name="wizard_label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Council Tax" required /></Field>
    <Field label={direction === "income" ? "Amount received each time" : "Amount paid each time"}><TextInput name="wizard_amount" type="number" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field>
    <Field label={direction === "income" ? "Who receives it?" : "Who is it for?"}><Select value={personId} onChange={(event) => setPersonId(event.target.value)}>{hasHousehold ? <option value="">Household / shared</option> : null}{people.map((person) => <option key={person.id} value={person.id}>{person.name} ({person.relationship})</option>)}</Select></Field>
    <Field label="How often?"><Select value={recurrence} onChange={(event) => setRecurrence(event.target.value as PlannedItem["recurrence"])}><option value="monthly">Monthly</option><option value="four_weekly">Every 4 weeks</option><option value="custom_interval">Custom · every X days/weeks</option><option value="one_off">One-off</option></Select></Field>
    <Field label={recurrence === "one_off" ? "Date" : "Next known date"}><TextInput type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field>
    {recurrence === "custom_interval" ? (
      <Field label="Repeat every">
        <div className="flex gap-2">
          <TextInput type="number" min={1} step={1} value={intervalCount} onChange={(event) => setIntervalCount(event.target.value)} />
          <Select value={intervalUnit} onChange={(event) => setIntervalUnit(event.target.value as "day" | "week")}>
            <option value="day">Day(s)</option>
            <option value="week">Week(s)</option>
          </Select>
        </div>
      </Field>
    ) : null}
    <Field label={direction === "income" ? "Paid into account" : "Paid from account"}><Select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">Choose later</option>{paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.provider ? `${account.provider} · ` : ""}{account.name}</option>)}</Select></Field>
  </div><div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">LOOP suggests: {direction === "income" ? "incoming" : "outgoing"} · {suggested.label} · {recurrence === "custom_interval" ? `every ${intervalCount || 1} ${intervalUnit}${Number(intervalCount) === 1 ? "" : "s"}` : recurrence.replaceAll("_", " ")}.</div><details className="mt-4 rounded-3xl border border-slate-200 bg-white"><summary className="cursor-pointer list-none px-5 py-4 text-sm font-black text-slate-700">Advanced details <span className="font-semibold text-slate-400">· optional</span></summary><div className="grid gap-4 border-t border-slate-100 p-5 sm:grid-cols-2"><Field label="Override category"><Select value={categoryOverride} onChange={(event) => setCategoryOverride(event.target.value)}><option value="">Use LOOP suggestion</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field><Field label="Ends on"><TextInput type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Field>{householdPets.length ? <Field label="Relates to pet"><Select value={petId} onChange={(event) => setPetId(event.target.value)}><option value="">No specific pet</option>{householdPets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name}</option>)}</Select></Field> : null}<p className="text-xs font-semibold leading-5 text-slate-500 sm:col-span-2">Renewal reminders, weekend handling, refunds and detailed ownership can be edited after confirmation.</p></div></details><div className="mt-5 flex justify-between"><button type="button" onClick={() => setStep(1)} className="rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">Back</button><button type="button" disabled={!label || !amount || !startDate} onClick={() => setStep(3)} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-40">Preview calendar</button></div></div>;

  return <form action={addPlannedItem}><input type="hidden" name="label" value={label} /><input type="hidden" name="amount" value={amount} /><input type="hidden" name="person_id" value={personId} /><input type="hidden" name="direction" value={direction} /><input type="hidden" name="item_type" value={itemType} /><input type="hidden" name="category_id" value={categoryId} /><input type="hidden" name="recurrence" value={recurrence} /><input type="hidden" name="recurrence_interval_days" value={recurrence === "custom_interval" ? String(intervalDays) : ""} /><input type="hidden" name="start_date" value={startDate} /><input type="hidden" name="end_date" value={endDate} /><input type="hidden" name="payment_account_id" value={accountId} /><input type="hidden" name="pet_id" value={petId} /><input type="hidden" name="payment_timing" value="fixed_day" /><input type="hidden" name="payment_adjustment" value="previous_workday" /><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Step 3 of 3</p><h3 className="mt-2 text-2xl font-black text-slate-950">This is how it will map out</h3><div className="mt-5 rounded-3xl bg-slate-950 p-5 text-white"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-white/50">{direction === "income" ? "Incoming" : "Outgoing"} · {suggested.label}</p><p className="mt-2 text-2xl font-black">{label}</p><p className="mt-1 text-sm font-bold text-white/65">{personId ? people.find((person) => person.id === personId)?.name : "Household / shared"}{accountId ? ` · ${paymentAccounts.find((account) => account.id === accountId)?.name}` : ""}</p></div><p className={`text-2xl font-black ${direction === "income" ? "text-emerald-300" : "text-orange-300"}`}>{direction === "income" ? "+" : "−"}{formatMoney(Number(amount || 0))}</p></div></div><div className="mt-4 space-y-2">{previewDates.map((date, index) => <div key={date} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"><div><p className="text-xs font-black uppercase text-slate-400">{index === 0 ? "Next date" : "Then"}</p><p className="font-black text-slate-950">{formatNiceDate(date)}</p></div><p className="font-black text-slate-700">{formatMoney(Number(amount || 0))}</p></div>)}</div><p className="mt-4 text-xs font-semibold leading-5 text-slate-500">Confirming adds these dates to Financial Flow. You can edit advanced timing, renewal and allocation logic later without rebuilding the entry.</p><div className="mt-5 flex justify-between"><button type="button" onClick={() => setStep(2)} className="rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">Change</button><Submit>Confirm and add to calendar</Submit></div></form>;
}

function PlannedItemForm({
  people,
  categories,
  selectedPersonId,
  selectedMonth,
  item,
  mode,
  hasHousehold,
  paymentAccounts,
  householdPets,
}: {
  people: Person[];
  categories: SpendingCategory[];
  selectedPersonId: string;
  selectedMonth: string;
  item?: PlannedItem;
  mode: "monthly" | "one_off";
  hasHousehold: boolean;
  paymentAccounts: PaymentAccount[];
  householdPets: HouseholdPet[];
}) {
  const action = item ? updatePlannedItem : addPlannedItem;
  const defaultStart = item?.start_date ?? monthStart(selectedMonth);
  const defaultDirection = item?.direction ?? "outgoing";
  const defaultType = item?.item_type ?? (mode === "monthly" ? "subscription" : "one_off");
  const [labelValue, setLabelValue] = useState(item?.label ?? "");
  const [categoryValue, setCategoryValue] = useState(item?.category_id ?? "");
  const [remoteBrandPreview, setRemoteBrandPreview] = useState<{ brandName: string; domain: string; logoUrl: string; source?: string } | null>(null);
  const [isBrandChecking, setIsBrandChecking] = useState(false);
  const localBrandPreview = guessBrandPreview(labelValue);
  const localBrandKey = localBrandPreview?.domain || "";
  const brandPreview = localBrandPreview || remoteBrandPreview;
  const suggestedCategory = standardCategoryForLabel(`${labelValue} ${defaultType.replaceAll("_", " ")}`);
  const suggestedCategoryId = categories.find((category) => category.standard_category_key === suggestedCategory.key || category.name.toLowerCase() === suggestedCategory.label.toLowerCase())?.id || "";
  const [selectedPetId, setSelectedPetId] = useState(item?.pet_id ?? "");
  const [selectedPersonId2, setSelectedPersonId2] = useState(item?.person_id ?? defaultPersonSelectValue(selectedPersonId));
  const selectedPet = householdPets.find((pet) => pet.id === selectedPetId) || null;
  const selectedPersonForItem = people.find((person) => person.id === selectedPersonId2) || null;
  const isForChild = !selectedPet && selectedPersonForItem?.relationship === "child";

  useEffect(() => {
    if (!item?.category_id && suggestedCategoryId) setCategoryValue(suggestedCategoryId);
  }, [suggestedCategoryId, item?.category_id]);

  useEffect(() => {
    const label = labelValue.trim();
    setRemoteBrandPreview(null);
    if (label.length < 3 || localBrandPreview) {
      setIsBrandChecking(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsBrandChecking(true);
      try {
        const response = await fetch(`/api/spending/bill-brand-preview?label=${encodeURIComponent(label)}`, { signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!controller.signal.aborted) setRemoteBrandPreview(payload.brand || null);
      } catch {
        if (!controller.signal.aborted) setRemoteBrandPreview(null);
      } finally {
        if (!controller.signal.aborted) setIsBrandChecking(false);
      }
    }, 700);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [labelValue, localBrandKey]);

  const existingIntervalDays = item?.recurrence === "custom_interval" ? Math.max(1, item.recurrence_interval_days || 7) : null;
  const existingIsWholeWeeks = existingIntervalDays !== null && existingIntervalDays % 7 === 0;
  const [intervalCount, setIntervalCount] = useState(existingIntervalDays === null ? "2" : String(existingIsWholeWeeks ? existingIntervalDays / 7 : existingIntervalDays));
  const [intervalUnit, setIntervalUnit] = useState<"day" | "week">(existingIntervalDays === null || existingIsWholeWeeks ? "week" : "day");
  const intervalDays = Math.max(1, Number(intervalCount || 0) || 1) * (intervalUnit === "week" ? 7 : 1);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <input type="hidden" name="recurrence" value={item?.recurrence ?? mode} />
      <input type="hidden" name="recurrence_interval_days" value={(item?.recurrence ?? mode) === "custom_interval" ? String(intervalDays) : ""} />
      {(item?.recurrence ?? mode) === "custom_interval" ? (
        <Field label="Repeat every">
          <div className="flex gap-2">
            <TextInput type="number" min={1} step={1} value={intervalCount} onChange={(event) => setIntervalCount(event.target.value)} />
            <Select value={intervalUnit} onChange={(event) => setIntervalUnit(event.target.value as "day" | "week")}>
              <option value="day">Day(s)</option>
              <option value="week">Week(s)</option>
            </Select>
          </div>
        </Field>
      ) : null}

      {householdPets.length ? (
        <Field label="Who is this for?">
          <Select name="pet_id" value={selectedPetId} onChange={(event) => setSelectedPetId(event.target.value)}>
            <option value="">A person (choose below)</option>
            {householdPets.map((pet) => <option key={pet.id} value={pet.id}>🐾 {pet.name} · {pet.species}</option>)}
          </Select>
          {selectedPet ? <p className="mt-1 text-xs font-semibold text-emerald-700">This is {selectedPet.name}'s expense — next, choose who covers it below.</p> : null}
        </Field>
      ) : null}

      <Field label={selectedPet ? `Who covers this for ${selectedPet.name}?` : "Person / household"}>
        <Select name="person_id" value={selectedPersonId2} onChange={(event) => setSelectedPersonId2(event.target.value)}>
          {hasHousehold ? <option value="">Household / shared</option> : null}
          {people.map((person) => <option key={person.id} value={person.id}>{person.name} ({person.relationship})</option>)}
        </Select>
        {isForChild ? <p className="mt-1 text-xs font-semibold text-amber-700">{selectedPersonForItem?.name} is a child — since children don't pay bills themselves, double-check this is covered correctly (or choose Household / shared).</p> : null}
      </Field>

      <Field label="Direction">
        <Select name="direction" defaultValue={defaultDirection}>
          <option value="outgoing">Outgoing</option>
          <option value="income">Incoming</option>
        </Select>
      </Field>

      <Field label="Name">
        <TextInput name="label" value={labelValue} onChange={(event) => setLabelValue(event.target.value)} placeholder="Spotify, Netflix, Shopify, child benefit" required />
      </Field>

      <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Bill image preview</p>
        <div className="mt-2 flex items-center gap-3">
          <BrandLogo title={labelValue || "Bill"} logoUrl={brandPreview?.logoUrl} brandName={brandPreview?.brandName} />
          <div>
            <p className="text-sm font-black text-slate-950">{brandPreview?.brandName || labelValue || "Start typing a bill/provider"}</p>
            <p className="text-xs font-bold text-slate-500">{brandPreview ? `${brandPreview.domain} ${localBrandPreview ? "matched locally" : "found using your AI token"}` : isBrandChecking ? "Searching official brand/domain..." : "Known brands preview instantly. Unknown bills search after you pause typing and are saved with the cost."}</p>
          </div>
        </div>
      </div>

      <Field label="Amount">
        <TextInput name="amount" type="number" step="0.01" defaultValue={item?.amount ?? ""} required />
      </Field>

      <Field label="Type">
        <Select name="item_type" defaultValue={defaultType}>
          <option value="salary_topup">Salary top-up / payroll</option>
          <option value="child_benefit">Child benefit</option>
          <option value="dividend">Dividend</option>
          <option value="bonus">Bonus / commission</option>
          <option value="interest">Interest / cashback</option>
          <option value="subscription">Subscription</option>
          <option value="utilities">Utilities</option>
          <option value="mobile_phone">Mobile / phone</option>
          <option value="insurance">Insurance</option>
          <option value="mortgage_rent">Mortgage / rent</option>
          <option value="childcare">Childcare / nursery</option>
          <option value="school_activity">School / activities</option>
          <option value="grocery">Food shop / grocery</option>
          <option value="transport">Transport / fuel</option>
          <option value="healthcare">Healthcare</option>
          <option value="debt_payment">Debt payment</option>
          <option value="saving_investment">Saving / investment</option>
          <option value="bill">Bill</option>
          <option value="monthly_cost">Monthly cost</option>
          <option value="manual_income">Manual income</option>
          <option value="one_off">One-off</option>
          <option value="transfer">Transfer</option>
        </Select>
      </Field>

      <Field label="Category">
        <Select name="category_id" value={categoryValue} onChange={(event) => setCategoryValue(event.target.value)}>
          <option value="">No category / review later</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </Select>
        {!item?.category_id && suggestedCategoryId ? <p className="mt-1 text-xs font-bold text-emerald-700">Suggested from the name/type: {suggestedCategory.label}</p> : null}
      </Field>

      <Field label="Paid from account">
        <Select name="payment_account_id" defaultValue={item?.payment_account_id ?? ""}>
          <option value="">Not allocated yet</option>
          {paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.provider ? `${account.provider} · ` : ""}{account.name}</option>)}
        </Select>
      </Field>

      <Field label={mode === "monthly" ? "Starts on" : "Date"}>
        <TextInput name="start_date" type="date" defaultValue={defaultStart} required />
      </Field>

      {mode === "monthly" ? (
        <>
          <Field label="Payment timing">
            <Select name="payment_timing" defaultValue={item?.payment_timing ?? "fixed_day"}>
              <option value="fixed_day">Fixed day of month</option>
              <option value="last_workday">Last working day of month</option>
            </Select>
          </Field>
          <Field label="Payment day each month">
            <TextInput name="day_of_month" type="number" min={1} max={31} defaultValue={item?.day_of_month ?? Number(defaultStart.slice(8, 10))} />
          </Field>
          <Field label="If weekend/BH">
            <Select name="payment_adjustment" defaultValue={item?.payment_adjustment ?? "previous_workday"}>
              <option value="previous_workday">Move earlier</option>
              <option value="next_workday">Move later</option>
              <option value="none">Do not adjust</option>
            </Select>
          </Field>
          <Field label="Contract / end date">
            <TextInput name="end_date" type="date" defaultValue={item?.end_date ?? ""} />
          </Field>
          <div className="sm:col-span-2 rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
            <p className="text-sm font-black text-slate-950">When this date arrives, what should happen?</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Use this for contracts, phone upgrades, renewals and bills that should not simply disappear from forecasts.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="End behaviour">
                <Select name="end_behavior" defaultValue={item?.end_behavior ?? "drops_off"}>
                  <option value="drops_off">Drop off after this date</option>
                  <option value="renews">Likely renews / continues</option>
                  <option value="review_needed">Review before it renews</option>
                </Select>
              </Field>
              <Field label="Nudge before end date">
                <Select name="renewal_notice_days" defaultValue={item?.renewal_notice_days ?? 30}>
                  <option value="14">14 days before</option>
                  <option value="30">30 days before</option>
                  <option value="45">45 days before</option>
                  <option value="60">60 days before</option>
                  <option value="90">90 days before</option>
                </Select>
              </Field>
              <Field label="Early upgrade / review from">
                <TextInput name="early_upgrade_date" type="date" defaultValue={item?.early_upgrade_date ?? ""} />
              </Field>
              <Field label="Expected refund / money back">
                <TextInput name="expected_refund_amount" type="number" step="0.01" defaultValue={item?.expected_refund_amount ?? ""} placeholder="Optional" />
              </Field>
            </div>
          </div>
        </>
      ) : null}

      <div className="sm:col-span-2">
        <Field label="Notes">
          <TextInput name="notes" defaultValue={item?.notes ?? ""} placeholder="Optional renewal, provider or context" />
        </Field>
      </div>

      <div className="sm:col-span-2">
        <Submit>{item ? "Save changes" : mode === "monthly" ? "Add monthly item" : "Add one-off item"}</Submit>
      </div>
    </form>
  );
}

function OneOffSpendForm({ people, categories, selectedPersonId, selectedMonth, hasHousehold, paymentAccounts, householdPets }: { people: Person[]; categories: SpendingCategory[]; selectedPersonId: string; selectedMonth: string; hasHousehold: boolean; paymentAccounts: PaymentAccount[]; householdPets: HouseholdPet[] }) {
  const [label, setLabel] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const suggestion = standardCategoryForLabel(label);
  const automaticCategoryId = categories.find((category) => category.standard_category_key === suggestion.key || category.name.toLowerCase() === suggestion.label.toLowerCase())?.id || "";
  useEffect(() => { if (automaticCategoryId) setCategoryId(automaticCategoryId); }, [automaticCategoryId]);
  return (
    <form action={addSpendingEntry} className="grid gap-4 sm:grid-cols-2">
      <Field label="Person / household">
        <Select name="person_id" defaultValue={defaultPersonSelectValue(selectedPersonId)}>
          {hasHousehold ? <option value="">Household / shared</option> : null}
          {people.map((person) => <option key={person.id} value={person.id}>{person.name} ({person.relationship})</option>)}
        </Select>
      </Field>
      <Field label="Category">
        <Select name="category_id" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">No category / review later</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </Select>
      </Field>
      <Field label="Name">
        <TextInput name="label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Food shop, petrol, Amazon" required />
      </Field>
      <Field label="Amount">
        <TextInput name="amount" type="number" step="0.01" required />
      </Field>
      <Field label="Date">
        <TextInput name="spent_at" type="date" defaultValue={monthStart(selectedMonth)} required />
      </Field>
      <Field label="Paid from account"><Select name="payment_account_id" defaultValue=""><option value="">Not allocated yet</option>{paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.provider ? `${account.provider} · ` : ""}{account.name}</option>)}</Select></Field>
      {householdPets.length ? <Field label="Expense relates to pet"><Select name="pet_id" defaultValue=""><option value="">No specific pet</option>{householdPets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name} · {pet.species}</option>)}</Select></Field> : null}
      <Field label="Notes">
        <TextInput name="notes" />
      </Field>
      <div className="sm:col-span-2">
        <Submit>Log spend</Submit>
      </div>
    </form>
  );
}

function CategoryForm() {
  return (
    <form action={addSpendingCategory} className="grid gap-4 sm:grid-cols-2">
      <Field label="Category name">
        <TextInput name="name" placeholder="Mortgage, food, nursery, fuel" required />
      </Field>
      <Field label="Icon">
        <Select name="category_icon" defaultValue="🏷️">
          {CATEGORY_ICON_OPTIONS.map((option) => (
            <option key={option.icon + option.label} value={option.icon}>{option.icon} {option.label}</option>
          ))}
        </Select>
      </Field>
      <Field label="Monthly budget (optional)">
        <TextInput name="monthly_budget" type="number" step="0.01" placeholder="Leave blank if you do not want a target" />
      </Field>
      <Field label="Type">
        <Select name="type">
          <option value="fixed">Fixed bill</option>
          <option value="variable">Variable spending</option>
          <option value="saving">Saving</option>
          <option value="debt">Debt payment</option>
        </Select>
      </Field>
      <div className="self-end">
        <Submit>Add category</Submit>
      </div>
    </form>
  );
}

function BankImportForm({ people, selectedPersonId, hasHousehold }: { people: Person[]; selectedPersonId: string; hasHousehold: boolean }) {
  return (
    <form action={importBankCsv} className="grid gap-4 sm:grid-cols-2">
      <Field label="Account owner / household">
        <Select name="person_id" defaultValue={defaultPersonSelectValue(selectedPersonId)}>
          {hasHousehold ? <option value="">Household / shared</option> : null}
          {people.map((person) => <option key={person.id} value={person.id}>{person.name} ({person.relationship})</option>)}
        </Select>
      </Field>
      <Field label="Account name">
        <TextInput name="account_name" placeholder="Santander joint, Nationwide, NatWest" defaultValue="Bank account" required />
      </Field>
      <Field label="Bank/provider">
        <TextInput name="provider_name" placeholder="Santander, NatWest, Nationwide" />
      </Field>
      <Field label="CSV, PDF or image">
        <input name="csv_file" type="file" accept=".csv,text/csv,text/plain,.txt,.pdf,application/pdf,image/*" required className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-white" />
      </Field>
      <div className="sm:col-span-2 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-950">
        <p className="font-bold">What this does</p>
        <p className="mt-1">Imports CSV directly. PDF/image bills or statements use your saved OpenAI token to extract Date, Description and Amount first. The app then groups similar descriptions, spots payments that repeat across months, and suggests normal monthly items you can accept into the planner.</p>
      </div>
      <div className="sm:col-span-2">
        <Submit>Import and analyse</Submit>
      </div>
    </form>
  );
}

function CandidateAcceptForm({ candidate, people, categories, selectedPersonId, hasHousehold }: { candidate: RegularPaymentCandidate; people: Person[]; categories: SpendingCategory[]; selectedPersonId: string; hasHousehold: boolean }) {
  const defaultPerson = candidate.person_id ?? defaultPersonSelectValue(selectedPersonId);
  const defaultStart = candidate.first_seen ?? new Date().toISOString().slice(0, 10);
  const defaultDay = candidate.day_of_month ?? Number(defaultStart.slice(8, 10));
  return (
    <form action={acceptRegularPaymentCandidate} className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
      <input type="hidden" name="candidate_id" value={candidate.id} />
      <input type="hidden" name="direction" value={candidate.direction} />
      <Field label="Label">
        <TextInput name="label" defaultValue={candidate.label_suggestion} />
      </Field>
      <Field label="Person / household">
        <Select name="person_id" defaultValue={defaultPerson}>
          {hasHousehold ? <option value="">Household / shared</option> : null}
          {people.map((person) => <option key={person.id} value={person.id}>{person.name} ({person.relationship})</option>)}
        </Select>
      </Field>
      <Field label="Amount">
        <TextInput name="amount" type="number" step="0.01" defaultValue={Number(candidate.amount_average).toFixed(2)} />
      </Field>
      <Field label="Payment day">
        <TextInput name="day_of_month" type="number" min={1} max={31} defaultValue={defaultDay} />
      </Field>
      <Field label="Category">
        <Select name="category_id" defaultValue="">
          <option value="">No category</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </Select>
      </Field>
      <Field label="Starts on">
        <TextInput name="start_date" type="date" defaultValue={defaultStart} />
      </Field>
      <div className="sm:col-span-2 flex flex-col gap-3 rounded-2xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <input name="no_end_date" type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300" />
          No end date — keep this rolling monthly
        </label>
        <label className="text-sm text-slate-600">
          End date if known
          <input name="end_date" type="date" className="ml-2 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
        </label>
      </div>
      <div className="sm:col-span-2">
        <Submit>Add to spending planner</Submit>
      </div>
    </form>
  );
}

function isSavingsFlowLine(item: any) {
  const type = String(item?.item?.item_type || item?.categoryLabel || item?.helper || "").toLowerCase();
  const title = String(item?.title || "").toLowerCase();
  return type.includes("saving") || type.includes("investment") || type.includes("isa") || /savings transfer|isa top|regular saver|investment transfer/.test(title);
}
function amountPillClass(item: any) {
  if (item.direction === "income") return "bg-emerald-100 text-emerald-800";
  if (isSavingsFlowLine(item)) return "bg-blue-100 text-blue-800 ring-1 ring-blue-200";
  return "bg-red-100 text-red-700";
}
function amountPrefix(item: any) {
  if (item.direction === "income") return "+";
  if (isSavingsFlowLine(item)) return "↗ ";
  return "-";
}

function normaliseDuplicateLabel(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/direct debit|card payment|standing order|faster payment|apple pay|google pay|contactless/g, " ")
    .replace(/\b(ref|reference|payment|purchase|transaction)\b/g, " ")
    .replace(/\b\d{3,}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function calendarDayDistance(left: string, right: string) {
  const leftTime = new Date(`${left}T00:00:00`).getTime();
  const rightTime = new Date(`${right}T00:00:00`).getTime();
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return Number.POSITIVE_INFINITY;
  return Math.abs(leftTime - rightTime) / 86_400_000;
}

function duplicateLabelsMatch(left: string, right: string) {
  const a = normaliseDuplicateLabel(left);
  const b = normaliseDuplicateLabel(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 6) return false;
  return a.includes(b) || b.includes(a);
}


type SpendingQuickCapturePreview = {
  label: string;
  amount: number | null;
  mode: AddMode;
  recurrence: PlannedItem["recurrence"];
  itemType: PlannedItem["item_type"];
  categoryId: string | null;
  categoryKey: string | null;
  categoryLabel: string;
  groupId: string | null;
  groupLabel: string;
  reason: string;
};

function quickCaptureAmount(value: string) {
  const match = value.replace(/,/g, "").match(/(?:£\s*)?(\d+(?:\.\d{1,2})?)/);
  return match ? Number(match[1]) : null;
}

function quickCaptureLabel(value: string) {
  return value
    .replace(/£\s*\d[\d,]*(?:\.\d{1,2})?/g, "")
    .replace(/\b\d+(?:\.\d{1,2})?\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferSpendingQuickCapture(
  value: string,
  categories: SpendingCategory[],
  categoryGroups: { id: string; name: string; icon?: string | null }[],
): SpendingQuickCapturePreview {
  const text = value.toLowerCase();
  const label = quickCaptureLabel(value) || "New spending";
  const amount = quickCaptureAmount(value);

  const child = /(nursery|childcare|school club|after school|breakfast club|child cost|kids? club)/.test(text);
  const recurring = /(monthly|every month|subscription|netflix|spotify|mortgage|rent|council tax|broadband|phone|insurance|energy|electric|gas|water)/.test(text);
  const mode: AddMode = child ? "child_cost" : recurring ? "monthly" : "one_off";
  const recurrence: PlannedItem["recurrence"] = recurring ? "monthly" : "one_off";

  const standard = standardCategoryForLabel(label);
  const category =
    categories.find((row) => row.standard_category_key === standard.key) ||
    categories.find((row) => row.name.toLowerCase() === standard.label.toLowerCase()) ||
    null;
  const group = category?.group_id
    ? categoryGroups.find((row) => row.id === category.group_id) || null
    : null;

  let itemType: PlannedItem["item_type"] = recurring ? "bill" : "one_off";
  if (/(netflix|spotify|subscription|prime|disney)/.test(text)) itemType = "subscription";
  else if (/(mortgage|rent)/.test(text)) itemType = "mortgage_rent";
  else if (/(energy|electric|gas|water|council tax|utility)/.test(text)) itemType = "utilities";
  else if (/(nursery|childcare)/.test(text)) itemType = "childcare";
  else if (/(tesco|aldi|sainsbury|asda|morrisons|food|grocery)/.test(text)) itemType = "grocery";

  const categoryLabel = category?.name || standard.label || "Uncategorised";
  const groupLabel = group?.name || "No group yet";
  const reason = child
    ? `LOOP recognised this as a child/family cost from “${label}”.`
    : recurring
      ? `LOOP recognised a recurring bill/subscription pattern from “${label}”.`
      : `No recurring wording was detected, so LOOP is treating “${label}” as a one-off spend.`;

  return {
    label,
    amount,
    mode,
    recurrence,
    itemType,
    categoryId: category?.id || null,
    categoryKey: category?.standard_category_key || standard.key || null,
    categoryLabel,
    groupId: group?.id || null,
    groupLabel,
    reason,
  };
}

export function SpendingPlannerClient({ people, categories, entries, plannedItems, payEvents, childCosts, bankImports, regularCandidates, studentLoanAccounts = [], studentLoanEnabled = false, flowSettings, initialMonth, initialPersonId, initialDirectionFilter = "all", hasHousehold = false, compactPage = false, paymentAccounts = [], householdPets = [], homeProfile = null, categoryGroups = [], initialAddMode, initialAddTemplate }: Props) {
  const initialMonthValue = initialMonth && /^\d{4}-\d{2}$/.test(initialMonth) ? initialMonth : currentMonth();
  const [selectedPersonId, setSelectedPersonId] = useState(initialPersonId || "");
  const [directionFilter, setDirectionFilter] = useState<"all" | "income" | "outgoing">(initialDirectionFilter);
  const [year, setYear] = useState(Number(initialMonthValue.slice(0, 4)));
  const [selectedMonth, setSelectedMonth] = useState(initialMonthValue);
  const [optimisticDeletedLineIds, setOptimisticDeletedLineIds] = useState<string[]>([]);
  const [optimisticDeletedCategoryIds, setOptimisticDeletedCategoryIds] = useState<string[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [deletePending, startDeleteTransition] = useTransition();
  const [quickCapture, setQuickCapture] = useState("");
  const [quickModeOverride, setQuickModeOverride] = useState<AddMode | null>(null);
  const [modal, setModal] = useState<ModalState>(initialAddMode ? { type: "add", mode: initialAddMode, template: initialAddTemplate } : null);
  const [editingEnabled, setEditingEnabled] = useState(false);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const personDisplayMode = flowSettings?.personDisplayMode ?? "both";
  const flowDateFormat = flowSettings?.dateFormat ?? "day_month_ordinal";
  const billLogoMode = flowSettings?.billLogoMode ?? "auto";
  const moneyDisplayPrecision = flowSettings?.moneyDisplayPrecision ?? "exact";
  const money = (value: number | null | undefined) => formatMoney(value, { precision: moneyDisplayPrecision });

  useEffect(() => {
    if (categories.length === 0) setModal({ type: "add", mode: "category" });
  }, [categories.length]);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const paymentAccountsById = useMemo(() => new Map(paymentAccounts.map((account) => [account.id, account])), [paymentAccounts]);
  const petsById = useMemo(() => new Map(householdPets.map((pet) => [pet.id, pet])), [householdPets]);
  const childOptions = useMemo(() => people.filter((person) => person.relationship === "child").map((person) => ({ id: person.id, name: person.name })), [people]);
  const months = useMemo(() => getYearMonths(year), [year]);

  const isHouseholdOnlyFilter = selectedPersonId === "__household";
  const matchesSelectedPerson = (personId: string | null | undefined) => {
    if (!selectedPersonId) return true;
    if (isHouseholdOnlyFilter) return !personId;
    return personId === selectedPersonId;
  };

  const filteredPlannedItems = plannedItems.filter((item) => matchesSelectedPerson(item.person_id));
  const filteredEntries = entries.filter((entry) => matchesSelectedPerson(entry.person_id));
  const filteredPayEvents = payEvents.filter((event) => matchesSelectedPerson(event.person_id));
  const filteredChildCosts = childCosts.filter((cost) => matchesSelectedPerson(cost.bill_person_id));

  const monthSummaries = months.map((month) => {
    const plannedForMonth = filteredPlannedItems.filter((item) => plannedItemAppliesToMonth(item, month));
    const entriesForMonth = filteredEntries.filter((entry) => dateIsInMonth(entry.spent_at, month));
    const payForMonth = filteredPayEvents.filter((event) => isActiveInMonth(event.effective_from, event.effective_until, month));
    const childForMonth = filteredChildCosts.filter((cost) => isActiveInMonth(cost.starts_on, cost.ends_on, month));

    const income = plannedForMonth.filter((item) => item.direction === "income").reduce((sum, item) => sum + Number(item.amount) * plannedItemDatesForMonth(item, month).length, 0)
      + payForMonth.reduce((sum, event) => sum + getPayAmount(event, month), 0);
    const outgoings = plannedForMonth.filter((item) => item.direction === "outgoing").reduce((sum, item) => sum + Number(item.amount) * plannedItemDatesForMonth(item, month).length, 0)
      + entriesForMonth.reduce((sum, entry) => sum + Number(entry.amount), 0)
      + childForMonth.reduce((sum, cost) => sum + getChildCostMonthlyAmount(cost, month), 0);

    return { month, income, outgoings, net: income - outgoings, plannedForMonth, entriesForMonth, payForMonth, childForMonth };
  });

  const selectedSummary = monthSummaries.find((summary) => summary.month === selectedMonth) ?? monthSummaries[0];
  const selectedPerson = selectedPersonId && selectedPersonId !== "__household" ? peopleById.get(selectedPersonId) : null;
  const currentPersonLabel = selectedPersonId === "__household" ? "Household / shared" : selectedPerson ? (selectedPerson.relationship === "child" ? "Child profile" : "Adult profile") : "Spending";
  const maxAmount = Math.max(1, ...monthSummaries.map((summary) => Math.max(summary.income, summary.outgoings)));

  const timelineItems = [
    ...selectedSummary.payForMonth.map((event) => ({
      id: `pay-${event.id}`,
      date: dueDateForMonth(selectedSummary.month, event.pay_timing ?? "last_workday", event.pay_day_of_month, event.pay_adjustment ?? "previous_workday"),
      title: event.label,
      person: personName(peopleById, event.person_id),
      personId: event.person_id,
      direction: "income" as const,
      amount: getPayAmount(event, selectedSummary.month),
      categoryLabel: event.pay_kind === "maternity" ? "Maternity pay" : "Salary",
      categoryIcon: event.pay_kind === "maternity" ? "👶" : "💼",
      lifecycleShort: null as string | null,
      helper: event.pay_kind === "maternity" ? "Maternity pay" : "Salary",
      href: event.person_id ? `/household/${event.person_id}` : "/household",
    })),
    ...selectedSummary.plannedForMonth.flatMap((item) => {
      const suggested = standardCategoryForLabel(`${item.label} ${item.item_type.replaceAll("_", " ")}`);
      const category = item.category_id ? categoriesById.get(item.category_id) : categories.find((row) => row.standard_category_key === suggested.key || row.name.toLowerCase() === suggested.label.toLowerCase());
      const categoryLabel = category?.name || labelise(item.item_type);
      return plannedItemDatesForMonth(item, selectedSummary.month).map((paymentDate, occurrenceIndex) => ({
        id: `planned-${item.id}-${occurrenceIndex}`,
        selectableId: `planned:${item.id}`,
        date: paymentDate,
        title: item.label,
        person: personName(peopleById, item.person_id),
        personId: item.person_id,
        direction: item.direction,
        amount: Number(item.amount),
        brandName: item.brand_name,
        brandLogoUrl: item.brand_logo_url,
        categoryLabel: `${categoryLabel}${!item.category_id && category ? " · suggested" : ""}`,
        categoryIcon: category?.category_icon || guessCategoryIcon(categoryLabel),
        lifecycleHint: lifecycleHint(item, flowDateFormat, money),
        lifecycleShort: compactLifecycleLabel(item, flowDateFormat),
        helper: categoryLabel,
        item,
        paymentAccount: item.payment_account_id ? paymentAccountsById.get(item.payment_account_id) : null,
        pet: item.pet_id ? petsById.get(item.pet_id) : null,
      }));
    }),
    ...selectedSummary.entriesForMonth.map((entry) => {
      const suggested = standardCategoryForLabel(entry.label);
      const category = entry.category_id ? categoriesById.get(entry.category_id) : categories.find((row) => row.standard_category_key === suggested.key || row.name.toLowerCase() === suggested.label.toLowerCase());
      const categoryLabel = category?.name || entry.notes || "One-off spend";
      return {
        id: `entry-${entry.id}`,
        selectableId: `entry:${entry.id}`,
        date: entry.spent_at,
        title: entry.label,
        person: personName(peopleById, entry.person_id),
        personId: entry.person_id,
        direction: "outgoing" as const,
        amount: Number(entry.amount),
        categoryLabel,
        categoryIcon: category?.category_icon || guessCategoryIcon(categoryLabel),
        lifecycleShort: null as string | null,
        helper: categoryLabel,
        entry,
        paymentAccount: entry.payment_account_id ? paymentAccountsById.get(entry.payment_account_id) : null,
        pet: entry.pet_id ? petsById.get(entry.pet_id) : null,
      };
    }),
    ...selectedSummary.childForMonth.map((cost) => {
      const careTypeLabels: Partial<Record<string, string>> = {
        nursery: "Nursery",
        childminder: "Childminder",
        breakfast_club: "Breakfast club",
        after_school_club: "After-school club",
        holiday_camp: "Holiday camp",
        nanny: "Nanny",
      };
      const categoryLabel = (cost.care_type && careTypeLabels[cost.care_type]) || (cost.cost_kind === "nursery" ? "Childcare" : cost.cost_kind === "activity" ? "Activities" : cost.cost_kind === "nanny" ? "Nanny" : "Child cost");
      return {
        id: `child-${cost.id}`,
        date: dueDateForMonth(selectedSummary.month, cost.payment_timing ?? "fixed_day", cost.payment_day_of_month ?? 1, cost.payment_adjustment ?? "previous_workday"),
        title: cost.label,
        person: personName(peopleById, cost.bill_person_id ?? null),
        personId: cost.bill_person_id ?? null,
        childPerson: personName(peopleById, cost.child_id),
        childPersonId: cost.child_id ?? null,
        childAvatarUrl: cost.child_id ? personAvatarUrl(peopleById, cost.child_id) : null,
        direction: "outgoing" as const,
        amount: getChildCostMonthlyAmount(cost, selectedSummary.month),
        categoryLabel,
        categoryIcon: "👶",
        lifecycleShort: cost.ends_on ? `Ends ${formatFlowDate(cost.ends_on, flowDateFormat)}` : null,
        helper: `${categoryLabel}${cost.child_id ? ` · ${personName(peopleById, cost.child_id)}` : ""}`,
        childCost: cost,
      };
    }),
  ].filter((item) => directionFilter === "all" || item.direction === directionFilter).sort((a, b) => a.date.localeCompare(b.date));

  const duplicateCandidates: Array<{
    key: string;
    first: (typeof timelineItems)[number];
    second: (typeof timelineItems)[number];
    amount: number;
    reason: string;
  }> = [];
  const duplicateSourceLines = timelineItems.filter((item) => item.direction === "outgoing" && !isSavingsFlowLine(item));
  for (let leftIndex = 0; leftIndex < duplicateSourceLines.length; leftIndex += 1) {
    const first = duplicateSourceLines[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < duplicateSourceLines.length; rightIndex += 1) {
      const second = duplicateSourceLines[rightIndex];
      const sameOwner = (first.personId || null) === (second.personId || null);
      if (!sameOwner) continue;
      const amountDifference = Math.abs(Number(first.amount) - Number(second.amount));
      const tolerance = Math.max(0.5, Math.min(Number(first.amount), Number(second.amount)) * 0.01);
      if (amountDifference > tolerance) continue;
      if (!duplicateLabelsMatch(first.title, second.title)) continue;
      const dayGap = calendarDayDistance(first.date, second.date);
      if (dayGap > 7) continue;
      duplicateCandidates.push({
        key: `${first.id}:${second.id}`,
        first,
        second,
        amount: Math.min(Number(first.amount), Number(second.amount)),
        reason: dayGap === 0 ? "Same person, description and amount on the same day" : `Same person, similar description and amount within ${Math.round(dayGap)} day${Math.round(dayGap) === 1 ? "" : "s"}`,
      });
    }
  }
  const duplicateLineIds = new Set(duplicateCandidates.flatMap((candidate) => [candidate.first.id, candidate.second.id]));
  const possibleDuplicateAmount = duplicateCandidates.reduce((sum, candidate) => sum + candidate.amount, 0);

  const renewalWatchItems = plannedItems
    .filter((item) => item.recurrence === "monthly" && item.end_date && matchesSelectedPerson(item.person_id))
    .map((item) => ({
      item,
      person: personName(peopleById, item.person_id),
      days: daysBetween(new Date().toISOString().slice(0, 10), item.end_date || new Date().toISOString().slice(0, 10)),
      hint: lifecycleHint(item, flowDateFormat, money),
    }))
    .filter((row) => row.days <= 180)
    .sort((a, b) => a.days - b.days);


  function deleteLinesOptimistically(lineIds: string[]) {
    const ids = Array.from(new Set(lineIds.filter(Boolean)));
    if (!ids.length || !confirmDelete(`Delete ${ids.length} selected item${ids.length === 1 ? "" : "s"}?`)) return;
    setOptimisticDeletedLineIds((current) => Array.from(new Set([...current, ...ids])));
    setSelectedLineIds((current) => current.filter((id) => !ids.includes(id)));
    startDeleteTransition(async () => {
      try { await deleteFinancialFlowLinesBulk(ids); }
      catch (error) { setOptimisticDeletedLineIds((current) => current.filter((id) => !ids.includes(id))); console.error(error); }
    });
  }
  function deleteCategoriesOptimistically(ids: string[]) {
    const clean = Array.from(new Set(ids.filter(Boolean)));
    if (!clean.length || !confirmDelete(`Delete ${clean.length} categor${clean.length === 1 ? "y" : "ies"}?`)) return;
    setOptimisticDeletedCategoryIds((current) => Array.from(new Set([...current, ...clean])));
    setSelectedCategoryIds((current) => current.filter((id) => !clean.includes(id)));
    startDeleteTransition(async () => {
      try { await deleteSpendingCategoriesBulk(clean); }
      catch (error) { setOptimisticDeletedCategoryIds((current) => current.filter((id) => !clean.includes(id))); console.error(error); }
    });
  }

  function openAdd(mode: AddMode, template?: SimpleFlowTemplate) {
    setModal({ type: "add", mode, template });
  }

  function toggleLineSelection(lineId: string) {
    setSelectedLineIds((current) => current.includes(lineId) ? current.filter((id) => id !== lineId) : [...current, lineId]);
  }

  const hasChildren = childOptions.length > 0;
  const hasChildCostData = childCosts.length > 0;
  const shouldShowChildCosts = hasChildren || hasChildCostData;
  const shouldShowStudentLoan = studentLoanEnabled;

  const accountHolder = people.find((person) => person.relationship === "self") || people.find((person) => person.relationship !== "child") || null;
  const reportingMonthLabel = formatMonthLabel(selectedMonth);
  const quickPreview = inferSpendingQuickCapture(quickCapture, categories, categoryGroups);
  const effectiveQuickMode = quickModeOverride || quickPreview.mode;
  const quickGroupCounts = categoryGroups.map((group) => ({
    ...group,
    count: categories.filter((category) => category.group_id === group.id).length,
  }));
  const adults = people.filter((person) => person.relationship !== "child");
  const suggestedCategoryId = (label: string, itemType?: string | null) => {
    const suggestion = standardCategoryForLabel(`${label} ${String(itemType || "").replaceAll("_", " ")}`);
    return categories.find((category) => category.standard_category_key === suggestion.key || category.name.toLowerCase() === suggestion.label.toLowerCase())?.id || null;
  };

  function categoryCumulativeSpend(category: SpendingCategory, personId?: string | null) {
    const matchesOwner = (rowPersonId: string | null | undefined) => personId === undefined ? true : (rowPersonId || null) === (personId || null);
    let total = 0;

    plannedItems.forEach((item) => {
      const effectiveCategoryId = item.category_id || suggestedCategoryId(item.label, item.item_type);
      if (item.direction !== "outgoing" || effectiveCategoryId !== category.id || !matchesOwner(item.person_id)) return;
      if (plannedItemAppliesToMonth(item, selectedMonth)) total += Number(item.amount || 0) * plannedItemDatesForMonth(item, selectedMonth).length;
    });

    entries.forEach((entry) => {
      const effectiveCategoryId = entry.category_id || suggestedCategoryId(entry.label, "one_off");
      if (effectiveCategoryId !== category.id || !matchesOwner(entry.person_id)) return;
      if (String(entry.spent_at).slice(0, 7) === selectedMonth) total += Number(entry.amount || 0);
    });

    if (/child|nursery|wraparound/i.test(category.name)) {
      childCosts.forEach((cost) => {
        if (!matchesOwner(cost.bill_person_id)) return;
        if (isActiveInMonth(cost.starts_on, cost.ends_on, selectedMonth)) total += getChildCostMonthlyAmount(cost, selectedMonth);
      });
    }

    return total;
  }

  const categoryCumulativeTotals = new Map(categories.map((category) => [category.id, {
    accountHolder: accountHolder ? categoryCumulativeSpend(category, accountHolder.id) : 0,
    shared: categoryCumulativeSpend(category, null),
    byPerson: adults.map((person) => ({ person, amount: categoryCumulativeSpend(category, person.id) })),
    household: categoryCumulativeSpend(category, undefined),
  }]));

  const allOutgoingText = plannedItems.filter((item) => item.direction === "outgoing").map((item) => `${item.label} ${item.item_type}`).join(" ").toLowerCase();
  const likelyHomeCosts = homeProfile ? [
    { label: "Council Tax", found: /council tax/.test(allOutgoingText) },
    { label: "Water", found: /water/.test(allOutgoingText) },
    { label: homeProfile.heating_type === "electric" ? "Electricity" : "Gas", found: homeProfile.heating_type === "electric" ? /electric/.test(allOutgoingText) : /gas/.test(allOutgoingText) },
    { label: "Electricity", found: /electric/.test(allOutgoingText) },
    { label: homeProfile.tenure === "rent" ? "Contents insurance" : "Home insurance", found: /home insurance|contents insurance|buildings insurance/.test(allOutgoingText) },
  ].filter((row, index, rows) => !row.found && rows.findIndex((candidate) => candidate.label === row.label) === index) : [];

  const childCount = childOptions.length;
  const weeklyChildBenefit = childCount > 0 ? 27.05 + Math.max(0, childCount - 1) * 17.9 : 0;
  const childBenefitTaxYear = ukTaxYearForMonth(selectedMonth);
  const childBenefitEntitlementWeeks = countWeekdaysInclusive(childBenefitTaxYear.start, childBenefitTaxYear.end, 1);
  const annualChildBenefit = weeklyChildBenefit * childBenefitEntitlementWeeks;
  const activeAnnualIncomes = payEvents.filter((event) => isActiveInMonth(event.effective_from, event.effective_until, selectedMonth)).map((event) => {
    const gross = Number(event.gross_annual_salary || 0);
    const pensionReduction = gross * Math.max(0, Number(event.pension_percent || 0)) / 100;
    return { personId: event.person_id, adjustedNetIncome: Math.max(0, gross - pensionReduction) };
  });
  const highestIncome = activeAnnualIncomes.sort((a, b) => b.adjustedNetIncome - a.adjustedNetIncome)[0];
  const chargePercent = highestIncome ? Math.max(0, Math.min(100, Math.floor((highestIncome.adjustedNetIncome - 60_000) / 200))) : 0;
  const annualChildBenefitCharge = annualChildBenefit * chargePercent / 100;
  const netAnnualChildBenefit = annualChildBenefit - annualChildBenefitCharge;
  const childBenefitLogged = plannedItems.some((item) => item.direction === "income" && (item.item_type === "child_benefit" || /child benefit/i.test(item.label)));

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Spending Flow</h1>
          <p className="max-w-3xl text-slate-600">Filter by person, plan recurring costs, log spending and see income/outgoings in a cleaner calendar flow.</p>
        </div>
        <a href="/financial-flow?tab=spending" className="inline-flex shrink-0 items-center gap-1.5 rounded-[7px] bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800">← Back to Flow</a>
      </div>

      <section className="rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Quick add</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">Add spending in one line</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Try “Netflix £18”, “Tesco £95” or “Nursery £336”. LOOP pre-fills the existing form; nothing saves until you confirm it.
            </p>
          </div>
          <a href="#spending-groups" className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-200">
            Groups & categories
          </a>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={quickCapture}
            onChange={(event) => {
              setQuickCapture(event.target.value);
              setQuickModeOverride(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || !quickCapture.trim()) return;
              event.preventDefault();
              openAdd(effectiveQuickMode, {
                label: quickPreview.label,
                amount: quickPreview.amount ?? undefined,
                direction: "outgoing",
                itemType: quickPreview.itemType,
                recurrence: effectiveQuickMode === "monthly" ? "monthly" : "one_off",
                categoryKey: quickPreview.categoryKey || undefined,
              });
            }}
            placeholder='e.g. "Netflix £18"'
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-950 outline-none focus:border-emerald-300 focus:bg-white"
          />
          <button
            type="button"
            disabled={!quickCapture.trim()}
            onClick={() => openAdd(effectiveQuickMode, {
              label: quickPreview.label,
              amount: quickPreview.amount ?? undefined,
              direction: "outgoing",
              itemType: quickPreview.itemType,
              recurrence: effectiveQuickMode === "monthly" ? "monthly" : "one_off",
              categoryKey: quickPreview.categoryKey || undefined,
            })}
            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300"
          >
            Add
          </button>
        </div>

        {quickCapture.trim() ? (
          <div className="mt-3">
            <div className="flex flex-wrap gap-2">
              {quickPreview.amount != null ? (
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
                  £{quickPreview.amount.toLocaleString("en-GB", { maximumFractionDigits: 2 })}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setQuickModeOverride(effectiveQuickMode === "monthly" ? "one_off" : "monthly")}
                className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-800"
                title="Click to switch between regular and one-off"
              >
                {effectiveQuickMode === "monthly" ? "Monthly" : effectiveQuickMode === "child_cost" ? "Child cost" : "One-off"}
              </button>
              <a href="#spending-groups" className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-800">
                {quickPreview.categoryLabel}
              </a>
              <a href="#spending-groups" className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-800">
                {quickPreview.groupLabel}
              </a>
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-500">
              <span className="font-black text-slate-700">Why?</span> {quickPreview.reason} Category suggestion: {quickPreview.categoryLabel}{quickPreview.groupLabel !== "No group yet" ? ` in ${quickPreview.groupLabel}` : ""}.
            </p>
          </div>
        ) : null}

        {quickGroupCounts.length ? (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">Jump to a group</p>
            <div className="flex flex-wrap gap-2">
              {quickGroupCounts.map((group) => (
                <a
                  key={group.id}
                  href={`#spending-group-${group.id}`}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 hover:border-slate-300"
                >
                  {group.icon ? `${group.icon} ` : ""}{group.name} · {group.count}
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard title={`${formatMonthLabel(selectedSummary.month)} income`} value={money(selectedSummary.income)} helper={currentPersonLabel} />
        <StatCard title={`${formatMonthLabel(selectedSummary.month)} outgoings`} value={money(selectedSummary.outgoings)} helper={currentPersonLabel} />
        <StatCard title="Expected net" value={money(selectedSummary.net)} helper="Income minus outgoings" />
        <StatCard title="Timeline lines" value={String(timelineItems.length)} helper="Visible for selected month" />
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[1.35rem] border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Add or manage</p>
          <p className="mt-1 text-sm font-bold text-slate-600">
            {plannedItems.filter((item) => item.recurrence === "monthly").length} regular · {selectedSummary.entriesForMonth.length} one-off · {childCosts.length} child cost
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">+ Add</summary>
            <div className="absolute right-0 z-40 mt-2 grid min-w-56 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              <button type="button" onClick={() => openAdd("monthly")} className="rounded-xl px-3 py-2 text-left text-xs font-black text-slate-700 hover:bg-slate-50">Regular payment</button>
              <button type="button" onClick={() => openAdd("one_off")} className="rounded-xl px-3 py-2 text-left text-xs font-black text-slate-700 hover:bg-slate-50">One-off spend</button>
              {shouldShowChildCosts ? <button type="button" onClick={() => openAdd("child_cost")} className="rounded-xl px-3 py-2 text-left text-xs font-black text-slate-700 hover:bg-slate-50">Child cost</button> : null}
              <button type="button" onClick={() => openAdd("bank_import")} className="rounded-xl px-3 py-2 text-left text-xs font-black text-slate-700 hover:bg-slate-50">Import bank CSV</button>
            </div>
          </details>
          <a href="/spending/categories" className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700">Categories</a>
        </div>
      </section>


      <SectionCard title="Filter by person" description="Use this to see only one child/adult's income and costs. Shared household items stay under Household.">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedPersonId("")}
            className={`rounded-full px-4 py-2 text-sm font-bold ${!selectedPersonId ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            Financial Flow
          </button>
          {hasHousehold ? (
            <button
              type="button"
              onClick={() => setSelectedPersonId("__household")}
              className={`rounded-full px-4 py-2 text-sm font-bold ${selectedPersonId === "__household" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              Household / shared
            </button>
          ) : null}
          {people.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => setSelectedPersonId(person.id)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${selectedPersonId === person.id ? "bg-slate-950 text-white" : person.relationship === "child" ? "bg-sky-100/60 text-sky-900 hover:bg-sky-100" : "bg-orange-100 text-orange-900 hover:bg-orange-200"}`}
            >
              {person.name}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
          <span className="text-xs font-black uppercase tracking-wide text-slate-500">Show</span>
          {[
            { value: "all" as const, label: "All lines" },
            { value: "income" as const, label: "Income only" },
            { value: "outgoing" as const, label: "Outgoings only" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setDirectionFilter(option.value)}
              className={`rounded-full px-4 py-2 text-sm font-bold ${directionFilter === option.value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </SectionCard>

      <div id="month-lines" className="scroll-mt-28" />
      <SectionCard title={!selectedPersonId ? `${formatMonthLabel(selectedSummary.month)} Financial Flow` : `${formatMonthLabel(selectedSummary.month)} lines for ${currentPersonLabel}`} description="Incoming and outgoing lines are shown together by date. Edit/delete controls are locked until you switch editing on.">
        <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black text-slate-950">{editingEnabled ? "Editing is on" : "Viewing mode"}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">Amounts stay visible in green/red. Use Account settings to change person labels, bill logos and date format.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {billLogoMode !== "off" ? (
              <form action={refreshMissingBillLogos}>
                <button className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Find bill images</button>
              </form>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (selectedLineIds.length) setModal({ type: "quick_category", lineIds: selectedLineIds, title: `${selectedLineIds.length} selected line(s)` });
                else setEditingEnabled(true);
              }}
              className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-100"
            >
              Quick categorise
            </button>
            <button type="button" onClick={() => setEditingEnabled((value) => !value)} className={`rounded-full px-4 py-2 text-xs font-black ${editingEnabled ? "bg-orange-500 text-white" : "bg-slate-950 text-white"}`}>
              {editingEnabled ? "Stop editing" : "Edit lines"}
            </button>
          </div>
        </div>
        {editingEnabled ? (
          <form action={updateFinancialFlowLineCategories} className="mb-4 rounded-3xl border border-dashed border-slate-300 bg-white/80 p-4">
            {selectedLineIds.map((id) => <input key={id} type="hidden" name="line_id" value={id} />)}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-black text-slate-950">Batch category update</p>
                <p className="mt-1 text-xs font-bold text-slate-500">Select multiple bills/spends below, choose a category once, and apply it to all selected lines.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Category
                  <select name="category_id" className="mt-1 block min-w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">
                    <option value="">No category</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.category_icon || guessCategoryIcon(category.name)} {category.name}</option>)}
                  </select>
                </label>
                <button type="submit" disabled={selectedLineIds.length === 0} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                  Apply to {selectedLineIds.length || 0}
                </button>
                <button type="button" disabled={!selectedLineIds.length || deletePending} onClick={() => deleteLinesOptimistically(selectedLineIds)} className="rounded-full bg-red-50 px-4 py-2 text-xs font-black text-red-700 disabled:opacity-40">Delete selected</button>
                <button type="button" onClick={() => setSelectedLineIds([])} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-200">Clear</button>
              </div>
            </div>
          </form>
        ) : null}
        <div className="space-y-3">
          {timelineItems.map((item) => {
            const selectableId = "selectableId" in item ? item.selectableId : null;
            const isSelected = selectableId ? selectedLineIds.includes(selectableId) : false;
            const avatarUrl = personAvatarUrl(peopleById, item.personId);
            return (
              <div key={item.id} title={("lifecycleHint" in item && item.lifecycleHint) ? item.lifecycleHint : undefined} className={`${selectableId && optimisticDeletedLineIds.includes(selectableId) ? "hidden" : ""} group/line relative min-h-[6.25rem] rounded-2xl border border-slate-200 bg-white p-4`}>
                <div className="flex min-h-[4.25rem] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    {editingEnabled && selectableId ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleLineSelection(selectableId)}
                        className="h-5 w-5 shrink-0 rounded border-slate-300 text-slate-950"
                        aria-label={`Select ${item.title}`}
                      />
                    ) : null}
                    <div className="w-24 shrink-0">
                      <p className="text-sm font-black uppercase tracking-wide text-slate-600">{formatFlowDate(item.date, flowDateFormat)}</p>
                      {item.lifecycleShort ? <p className="mt-1 text-[11px] font-black leading-4 text-orange-700">{item.lifecycleShort}</p> : null}
                    </div>
                    {"item" in item && item.brandLogoUrl && billLogoMode !== "off" ? (
                      <BrandLogo title={item.title} logoUrl={item.brandLogoUrl} brandName={item.brandName} />
                    ) : item.categoryLabel ? (
                      <CategoryIcon icon={item.categoryIcon} label={item.categoryLabel} />
                    ) : (
                      <MiniPersonAvatar name={item.person} avatarUrl={avatarUrl} />
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-black text-slate-950">{item.title}</p>
                        {duplicateLineIds.has(item.id) ? <span className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-orange-800">Possible duplicate</span> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => selectableId ? setModal({ type: "quick_category", lineIds: [selectableId], title: item.title }) : undefined}
                        className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-600 hover:bg-emerald-50 hover:text-emerald-700"
                        title="Quick change category"
                      >
                        <span>{item.categoryIcon || guessCategoryIcon(item.helper)}</span>
                        {item.helper}
                      </button>
                      {("paymentAccount" in item && item.paymentAccount) || ("pet" in item && item.pet) ? <p className="mt-1 text-[11px] font-bold text-slate-400">{"paymentAccount" in item && item.paymentAccount ? `Paid from ${item.paymentAccount.provider ? `${item.paymentAccount.provider} · ` : ""}${item.paymentAccount.name}` : ""}{"paymentAccount" in item && item.paymentAccount && "pet" in item && item.pet ? " · " : ""}{"pet" in item && item.pet ? `For ${item.pet.name}` : ""}</p> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <span className={`rounded-full px-3 py-1 text-sm font-black ${amountPillClass(item)}`}>
                      {amountPrefix(item)}{money(item.amount)}
                    </span>
                    <PersonMarker
                      name={item.person}
                      avatarUrl={avatarUrl}
                      mode={personDisplayMode}
                      dependentName={("childPersonId" in item && item.childPersonId ? item.childPerson : null) || ("pet" in item && item.pet ? item.pet.name : null)}
                      dependentAvatarUrl={"childAvatarUrl" in item ? item.childAvatarUrl : "pet" in item && item.pet ? item.pet.avatar_url ?? null : null}
                      dependentEmoji={"pet" in item && item.pet ? "🐾" : null}
                    />
                    {editingEnabled && "href" in item && item.href ? <Link href={item.href} className="text-sm font-bold text-slate-500 hover:text-slate-950">Open</Link> : null}
                    {editingEnabled && "item" in item && item.item ? (
                      <>
                        <button type="button" onClick={() => setModal({ type: "edit_planned", item: item.item })} className="text-sm font-bold text-slate-700 hover:text-slate-950">Edit</button>
                        <button type="button" disabled={deletePending} onClick={() => deleteLinesOptimistically([`planned:${item.item.id}`])} className="text-sm font-medium text-red-600 disabled:opacity-40">Delete</button>
                      </>
                    ) : null}
                    {editingEnabled && "entry" in item && item.entry ? (
                      <button type="button" disabled={deletePending} onClick={() => deleteLinesOptimistically([`entry:${item.entry.id}`])} className="text-sm font-medium text-red-600 disabled:opacity-40">Delete</button>
                    ) : null}
                    {editingEnabled && "childCost" in item && item.childCost ? (
                      <>
                        <button type="button" onClick={() => setModal({ type: "edit_child_cost", cost: item.childCost })} className="text-sm font-bold text-slate-700 hover:text-slate-950">Edit</button>
                        <form action={deleteChildCost} onSubmit={(event) => { if (!confirmDelete(`Delete ${item.title}?`)) event.preventDefault(); }}>
                          <input type="hidden" name="id" value={item.childCost.id} />
                          <button className="text-sm font-medium text-red-600">Delete</button>
                        </form>
                      </>
                    ) : null}
                  </div>
                </div>
                {("lifecycleHint" in item && item.lifecycleHint) ? (
                  <div className="pointer-events-none absolute right-4 top-3 z-10 hidden max-w-xs rounded-2xl border border-slate-200 bg-slate-950 px-3 py-2 text-xs font-bold text-white shadow-xl group-hover/line:block">
                    {item.lifecycleHint}
                  </div>
                ) : null}
              </div>
            );
          })}
          {timelineItems.length === 0 ? <p className="text-sm text-slate-500">Nothing planned or logged for this month/filter yet. Use one of the add cards above to add something.</p> : null}
        </div>
      </SectionCard>

      <SectionCard collapsible defaultOpen={false} title="Optional spending trackers" description="Only show specialist trackers when the household data makes them relevant. Add or remove the underlying records from here.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="font-black text-slate-950">Childcare costs</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">{hasChildren ? `${childOptions.length} child profile(s) found.` : "No child profiles found yet."}</p>
            <button type="button" onClick={() => openAdd("child_cost")} className="mt-3 rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">{hasChildren ? "Add childcare" : "Open setup"}</button>
          </div>
          {shouldShowStudentLoan ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="font-black text-slate-950">Student loan tracker</p>
              <p className="mt-1 text-sm font-semibold text-slate-500">Enabled from Account → Wealth.</p>
              <a href="/account?tab=wealth#student-loan-details" className="mt-3 inline-flex rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700">Manage in Account → Wealth</a>
            </div>
          ) : null}
        </div>
      </SectionCard>


      <SectionCard collapsible defaultOpen={false} title="Bank import suggestions" description="CSV imports are analysed for repeat payments. Accept the ones you recognise and they become normal monthly planner items.">
        <div className="grid gap-4 lg:grid-cols-[1fr_0.7fr]">
          <div className="space-y-4">
            {regularCandidates.length > 0 ? regularCandidates.map((candidate) => (
              <div key={candidate.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-950">{candidate.label_suggestion}</p>
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${candidate.direction === "income" ? "bg-emerald-100 text-emerald-800" : "bg-slate-900 text-white"}`}>{candidate.direction === "income" ? "Income" : "Outgoing"}</span>
                      <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-800">{Math.round(Number(candidate.confidence) * 100)}% confidence</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{candidate.account_name || "Bank account"} · {candidate.occurrence_count} payments across {candidate.seen_month_count} months · usually around day {candidate.day_of_month ?? "?"}</p>
                    <p className="mt-1 text-sm text-slate-500">Range {money(Number(candidate.amount_min))}–{money(Number(candidate.amount_max))} · average {money(Number(candidate.amount_average))}</p>
                    {candidate.sample_descriptions?.length ? <p className="mt-2 text-xs text-slate-500">Examples: {candidate.sample_descriptions.slice(0, 3).join(" · ")}</p> : null}
                  </div>
                  <form action={dismissRegularPaymentCandidate}>
                    <input type="hidden" name="candidate_id" value={candidate.id} />
                    <button className="text-sm font-bold text-slate-400 hover:text-red-600">Dismiss</button>
                  </form>
                </div>
                <CandidateAcceptForm candidate={candidate} people={people} categories={categories} selectedPersonId={selectedPersonId} hasHousehold={hasHousehold} />
              </div>
            )) : <p className="text-sm text-slate-500">No suggested regular payments yet. Use the Bank import card above to add a file.</p>}
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-4">
            <p className="font-bold text-slate-950">Recent imports</p>
            <div className="mt-3 space-y-3">
              {bankImports.map((bankImport) => (
                <div key={bankImport.id} className="rounded-2xl bg-slate-50 p-3 text-sm">
                  <p className="font-bold text-slate-950">{bankImport.account_name}</p>
                  <p className="text-slate-500">{bankImport.detected_rows} transactions detected from {bankImport.original_filename || "CSV"}</p>
                  <p className="text-xs text-slate-400">{new Date(bankImport.created_at).toLocaleString("en-GB")}</p>
                </div>
              ))}
              {bankImports.length === 0 ? <p className="text-sm text-slate-500">No imports yet.</p> : null}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard collapsible defaultOpen={false} title="Renewal & drop-off watch" description="Monthly items with a contract/end date appear here. If an item renews, it stays in future forecasts but still shows as something to review.">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {renewalWatchItems.map(({ item, person, days, hint }) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">{person}</p>
                  <p className="mt-1 font-black text-slate-950">{item.label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{hint}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${days <= 30 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-800"}`}>{days < 0 ? "due now" : `${days}d`}</span>
              </div>
            </div>
          ))}
          {renewalWatchItems.length === 0 ? <p className="text-sm text-slate-500">No contract end, renewal or upgrade dates are due in the next 180 days for this filter.</p> : null}
        </div>
      </SectionCard>


      <SectionCard collapsible defaultOpen={false} title={`${year} calendar`} description="Click a month to see the income and outgoing lines behind the number.">
        <div className="mb-4 flex items-center gap-2">
          <button type="button" onClick={() => setYear((value) => value - 1)} className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50">←</button>
          <p className="text-lg font-bold text-slate-950">{year}</p>
          <button type="button" onClick={() => setYear((value) => value + 1)} className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50">→</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {monthSummaries.map((summary) => {
            const selected = summary.month === selectedMonth;
            return (
              <button
                key={summary.month}
                type="button"
                onClick={() => setSelectedMonth(summary.month)}
                className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${selected ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{formatMonthLabel(summary.month)}</p>
                    <p className="mt-1 text-xs text-slate-500">In {money(summary.income)} · Out {money(summary.outgoings)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${summary.net >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{money(summary.net)}</span>
                </div>
                <div className="mt-3 grid gap-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-700" style={{ width: `${Math.min(100, Math.round((summary.income / maxAmount) * 100))}%` }} /></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.min(100, Math.round((summary.outgoings / maxAmount) * 100))}%` }} /></div>
                </div>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        collapsible
        defaultOpen={false}
        title="Duplicate expenditure check"
        description="LOOP compares outgoing lines for the selected month using owner, amount, description and payment date. Nothing is deleted automatically."
      >
        {duplicateCandidates.length > 0 ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-3xl border border-orange-200 bg-orange-50/80 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-orange-950">{duplicateCandidates.length} possible duplicate pair{duplicateCandidates.length === 1 ? "" : "s"}</p>
                <p className="mt-1 text-xs font-bold leading-5 text-orange-800">Up to {money(possibleDuplicateAmount)} may be represented twice. Review the lines before changing anything.</p>
              </div>
              <a href="#month-lines" className="rounded-full bg-orange-500 px-4 py-2 text-center text-xs font-black text-white">Review month lines</a>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {duplicateCandidates.slice(0, 6).map((candidate) => (
                <div key={candidate.key} className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-950">{candidate.first.title}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{formatFlowDate(candidate.first.date, flowDateFormat)} and {formatFlowDate(candidate.second.date, flowDateFormat)} · {candidate.first.person}</p>
                    </div>
                    <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-800">{money(candidate.amount)}</span>
                  </div>
                  <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">{candidate.reason}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5">
            <p className="font-black text-emerald-950">No likely duplicates found for {formatMonthLabel(selectedSummary.month)}</p>
            <p className="mt-1 text-sm font-semibold text-emerald-800">LOOP checked similar descriptions and amounts paid by the same person within seven days.</p>
          </div>
        )}
      </SectionCard>


      <SectionCard id="spending-groups" collapsible defaultOpen={false} title="Groups & categories" description={`Where spending lives in ${reportingMonthLabel}. Use the group chips above to jump here; routine re-categorising can be done directly from the spending line.`}>
        {(() => {
          const groupsById = new Map(categoryGroups.map((group) => [group.id, group]));
          const byGroup = new Map<string, SpendingCategory[]>();
          for (const category of categories) {
            const key = category.group_id || "__ungrouped";
            if (!byGroup.has(key)) byGroup.set(key, []);
            byGroup.get(key)!.push(category);
          }
          const orderedKeys = [...categoryGroups.map((group) => group.id), "__ungrouped"].filter((key) => byGroup.has(key));
          const renderCategoryCard = (category: SpendingCategory) => {
            const totals = categoryCumulativeTotals.get(category.id) || { accountHolder: 0, shared: 0, byPerson: [], household: 0 };
            return (
              <div key={category.id} className={`${optimisticDeletedCategoryIds.includes(category.id) ? "hidden" : ""} rounded-3xl border border-slate-200 bg-white p-4 shadow-sm`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <CategoryIcon icon={category.category_icon} label={category.name} />
                    <div className="min-w-0">
                      <p className="truncate font-black text-slate-950">{category.name}</p>
                      <p className="text-xs font-bold capitalize text-slate-500">{category.type}</p>
                    </div>
                  </div>
                  {editingEnabled ? (
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={selectedCategoryIds.includes(category.id)} onChange={() => setSelectedCategoryIds((current) => current.includes(category.id) ? current.filter((id) => id !== category.id) : [...current, category.id])} aria-label={`Select ${category.name}`} className="h-4 w-4 rounded border-slate-300" />
                      <button type="button" disabled={deletePending} onClick={() => deleteCategoriesOptimistically([category.id])} className="text-xs font-black text-red-600 disabled:opacity-40">Delete</button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {totals.byPerson.map(({ person, amount }: any) => <div key={person.id} className="rounded-2xl bg-indigo-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-indigo-500">{person.name}</p><p className="mt-1 text-lg font-black text-indigo-950">{money(amount)}</p></div>)}
                  <div className="rounded-2xl bg-slate-100 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Shared</p><p className="mt-1 text-lg font-black text-slate-950">{money(totals.shared)}</p></div>
                  <div className="rounded-2xl bg-emerald-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wide text-emerald-600">Household</p>
                    <p className="mt-1 text-lg font-black text-emerald-950">{money(totals.household)}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs font-bold text-slate-500">
                  <span>Monthly budget</span>
                  <span className="text-slate-900">{Number(category.monthly_budget ?? 0) > 0 ? money(Number(category.monthly_budget)) : "Not set"}</span>
                </div>
              </div>
            );
          };
          return (
            <div className="space-y-6">
              {editingEnabled ? <div className="sticky top-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur"><p className="text-xs font-black text-slate-600">{selectedCategoryIds.length} categories selected</p><div className="flex gap-2"><button type="button" disabled={!selectedCategoryIds.length || deletePending} onClick={() => deleteCategoriesOptimistically(selectedCategoryIds)} className="rounded-full bg-red-50 px-4 py-2 text-xs font-black text-red-700 disabled:opacity-40">Delete selected</button><button type="button" onClick={() => setSelectedCategoryIds([])} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-600">Clear</button></div></div> : null}
              {orderedKeys.map((key) => {
                const group = key === "__ungrouped" ? null : groupsById.get(key);
                const groupCategories = byGroup.get(key) || [];
                return (
                  <div key={key} id={group ? `spending-group-${group.id}` : "spending-group-ungrouped"} className="scroll-mt-28">
                    <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">{group ? `${group.icon ? `${group.icon} ` : ""}${group.name}` : "Ungrouped"}</p>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {groupCategories.map(renderCategoryCard)}
                    </div>
                  </div>
                );
              })}
              {categories.length === 0 ? <p className="text-sm text-slate-500">No categories yet.</p> : null}
            </div>
          );
        })()}
      </SectionCard>

      {(likelyHomeCosts.length > 0 || childCount > 0) ? <SectionCard collapsible defaultOpen={false} title="Household guidance to review" description="Context-aware prompts only. Nothing is added to the household flow until you confirm it, and tax figures remain estimates.">
        <div className="grid gap-4 lg:grid-cols-2">
          {likelyHomeCosts.length > 0 ? <div className="rounded-3xl border border-orange-200 bg-orange-50 p-5"><p className="text-sm font-black text-orange-950">Likely home costs not found</p><p className="mt-1 text-xs font-bold text-orange-900/70">Your {homeProfile?.property_kind || "home"} profile suggests checking these rather than assuming £0.</p><div className="mt-3 flex flex-wrap gap-2">{likelyHomeCosts.map((cost) => <span key={cost.label} className="rounded-full bg-white px-3 py-2 text-xs font-black text-orange-800">{cost.label}</span>)}</div><button type="button" onClick={() => openAdd("monthly")} className="mt-4 rounded-full bg-orange-700 px-4 py-2 text-xs font-black text-white">Review or add a home cost</button></div> : null}
          {childCount > 0 ? <div className="rounded-3xl border border-sky-200 bg-sky-50 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-sky-950">Child Benefit check · {childCount} children</p><p className="mt-1 text-xs font-bold text-sky-900/70">Current {childBenefitTaxYear.label} rates model {money(weeklyChildBenefit)}/week across {childBenefitEntitlementWeeks} entitlement weeks.</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${childBenefitLogged ? "bg-emerald-100 text-emerald-800" : "bg-white text-sky-800"}`}>{childBenefitLogged ? "Logged" : "Not confirmed"}</span></div><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-2xl bg-white p-3"><p className="text-[10px] font-black uppercase text-slate-400">Gross benefit</p><p className="mt-1 font-black">{money(annualChildBenefit)}/yr</p></div><div className="rounded-2xl bg-white p-3"><p className="text-[10px] font-black uppercase text-slate-400">Est. HICBC</p><p className="mt-1 font-black text-orange-700">{money(annualChildBenefitCharge)}/yr</p></div><div className="rounded-2xl bg-white p-3"><p className="text-[10px] font-black uppercase text-slate-400">Est. retained</p><p className="mt-1 font-black text-emerald-700">{money(netAnnualChildBenefit)}/yr</p></div></div><p className="mt-3 text-xs font-bold text-sky-900/70">Modelled at {chargePercent}% using the highest estimated adjusted net income of {money(highestIncome?.adjustedNetIncome || 0)}. Confirm pension treatment, benefits-in-kind, Gift Aid, claim dates and the actual claimant before relying on it.</p>{!childBenefitLogged ? <button type="button" onClick={() => openAdd("monthly", { kind: "child_benefit", label: "HMRC Child Benefit", direction: "income", itemType: "child_benefit", amount: weeklyChildBenefit * 4, recurrence: "four_weekly" })} className="mt-4 rounded-full bg-sky-700 px-4 py-2 text-xs font-black text-white">Do you claim it? Add or confirm</button> : null}</div> : null}
        </div>
      </SectionCard> : null}

      {modal?.type === "add" && modal.mode === "monthly" ? (
        <Modal title="Add to Financial Flow" onClose={() => setModal(null)}>
          <SimpleFlowWizard people={people} categories={categories} selectedPersonId={selectedPersonId} selectedMonth={selectedMonth} hasHousehold={hasHousehold} paymentAccounts={paymentAccounts} householdPets={householdPets} initialTemplate={modal.template} />
        </Modal>
      ) : null}

      {modal?.type === "add" && modal.mode === "bank_import" ? (
        <Modal title="Import bank CSV/PDF" onClose={() => setModal(null)}>
          <BankImportForm people={people} selectedPersonId={selectedPersonId} hasHousehold={hasHousehold} />
        </Modal>
      ) : null}

      {modal?.type === "add" && modal.mode === "one_off" ? (
        <Modal title="Add one-off spend" onClose={() => setModal(null)}>
          <SimpleFlowWizard people={people} categories={categories} selectedPersonId={selectedPersonId} selectedMonth={selectedMonth} hasHousehold={hasHousehold} paymentAccounts={paymentAccounts} householdPets={householdPets} initialTemplate={{ kind: "spend", direction: "outgoing", itemType: "one_off", recurrence: "one_off" }} />
        </Modal>
      ) : null}

      {modal?.type === "add" && modal.mode === "child_cost" ? (
        <Modal title="Add child cost" onClose={() => setModal(null)}>
          {childOptions.length > 0 ? <ChildCostWizard action={addChildCost} childrenOptions={childOptions} billPersonOptions={people.map((person) => ({ id: person.id, name: `${person.name} (${person.relationship})` }))} hasHousehold={hasHousehold} /> : <p className="text-sm text-slate-500">Add children on the Household page first.</p>}
        </Modal>
      ) : null}

      {modal?.type === "add" && modal.mode === "category" ? (
        <Modal title="Add budget category" onClose={() => setModal(null)}>
          <CategoryForm />
        </Modal>
      ) : null}


      {modal?.type === "quick_category" ? (
        <Modal title={`Quick categorise${modal.title ? ` · ${modal.title}` : ""}`} onClose={() => setModal(null)}>
          <QuickCategoryForm categories={categories} categoryGroups={categoryGroups} lineIds={modal.lineIds} onDone={() => { setSelectedLineIds([]); setModal(null); }} />
        </Modal>
      ) : null}

      {modal?.type === "edit_planned" ? (
        <Modal title={`Edit ${modal.item.label}`} onClose={() => setModal(null)}>
          <PlannedItemForm people={people} categories={categories} selectedPersonId={selectedPersonId} selectedMonth={selectedMonth} item={modal.item} mode={modal.item.recurrence === "one_off" ? "one_off" : "monthly"} hasHousehold={hasHousehold} paymentAccounts={paymentAccounts} householdPets={householdPets} />
        </Modal>
      ) : null}

      {modal?.type === "edit_child_cost" ? (
        <Modal title={`Edit ${modal.cost.label}`} onClose={() => setModal(null)}>
          {modal.cost.care_type && NEW_CARE_TYPES.includes(modal.cost.care_type as CareType) ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Editing {careTypeLabelsForEditNotice[modal.cost.care_type as CareType] ?? "this cost"} isn't wired up yet — delete this entry and re-add it with the corrected details for now.
              </p>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          ) : (
            <NurseryCostForm
              action={updateChildCost}
              childrenOptions={childOptions}
              billPersonOptions={people.map((person) => ({ id: person.id, name: `${person.name} (${person.relationship})` }))}
              hasHousehold={hasHousehold}
              initialValues={modal.cost}
              submitLabel="Save child cost"
            />
          )}
        </Modal>
      ) : null}
    </>
  );
}
