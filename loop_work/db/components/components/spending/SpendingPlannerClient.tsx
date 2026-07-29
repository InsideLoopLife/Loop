"use client";

import { useMemo, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import Link from "next/link";
import { NurseryCostForm } from "@/components/household/NurseryCostForm";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { formatMoney } from "@/lib/format/money";
import { estimateAnnualTakeHome, PensionMethod, StudentLoanPlan } from "@/lib/calculations/tax";
import { MaternityPayMode, calculateNhsMaternityMonthlyAmount } from "@/lib/calculations/maternity";
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
  deleteSpendingEntry,
  dismissRegularPaymentCandidate,
  importBankCsv,
  updatePlannedItem,
} from "@/app/spending/actions";
import { addChildCost, deleteChildCost } from "@/app/household/actions";

export type Person = {
  id: string;
  name: string;
  relationship: "self" | "partner" | "child" | "other";
};

export type SpendingCategory = {
  id: string;
  name: string;
  monthly_budget: number;
  type: "fixed" | "variable" | "saving" | "debt";
};

export type SpendingEntry = {
  id: string;
  person_id: string | null;
  label: string;
  amount: number;
  spent_at: string;
  notes: string | null;
  category_id: string | null;
};

export type PlannedItem = {
  id: string;
  person_id: string | null;
  category_id: string | null;
  direction: "income" | "outgoing";
  item_type: "monthly_cost" | "subscription" | "bill" | "one_off" | "manual_income" | "transfer";
  label: string;
  amount: number;
  recurrence: "monthly" | "one_off";
  start_date: string;
  end_date: string | null;
  day_of_month: number | null;
  payment_timing?: "fixed_day" | "last_workday" | null;
  payment_adjustment?: "previous_workday" | "next_workday" | "none" | null;
  notes: string | null;
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
};

export type ChildCost = {
  id: string;
  child_id: string | null;
  label: string;
  cost_kind: "fixed" | "nursery" | "activity" | null;
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
  starts_on: string;
  ends_on: string | null;
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

type Props = {
  people: Person[];
  categories: SpendingCategory[];
  entries: SpendingEntry[];
  plannedItems: PlannedItem[];
  payEvents: PayEvent[];
  childCosts: ChildCost[];
  bankImports: BankImport[];
  regularCandidates: RegularPaymentCandidate[];
};

type AddMode = "monthly" | "one_off" | "child_cost" | "category" | "bank_import";

type ModalState =
  | null
  | { type: "add"; mode: AddMode }
  | { type: "edit_planned"; item: PlannedItem };

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
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

function personName(peopleById: Map<string, Person>, personId: string | null) {
  if (!personId) return "Household";
  return peopleById.get(personId)?.name ?? "Household";
}

function plannedItemDueDate(item: PlannedItem, month: string) {
  if (item.recurrence === "one_off") return item.start_date;
  const day = Math.min(Number(item.day_of_month ?? item.start_date.slice(8, 10) ?? 1), lastDayOfMonth(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}

function plannedItemAppliesToMonth(item: PlannedItem, month: string) {
  if (item.recurrence === "one_off") return dateIsInMonth(item.start_date, month);
  return isActiveInMonth(item.start_date, item.end_date, month);
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
      payMode: event.maternity_pay_mode ?? "spread_equal",
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

function getChildCostMonthlyAmount(cost: ChildCost, month: string) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:max-w-3xl sm:rounded-3xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Planner modal</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">Close</button>
        </div>
        {children}
      </div>
    </div>
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

function PlannedItemForm({
  people,
  categories,
  selectedPersonId,
  selectedMonth,
  item,
  mode,
}: {
  people: Person[];
  categories: SpendingCategory[];
  selectedPersonId: string;
  selectedMonth: string;
  item?: PlannedItem;
  mode: "monthly" | "one_off";
}) {
  const action = item ? updatePlannedItem : addPlannedItem;
  const defaultStart = item?.start_date ?? monthStart(selectedMonth);
  const defaultDirection = item?.direction ?? "outgoing";
  const defaultType = item?.item_type ?? (mode === "monthly" ? "subscription" : "one_off");

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <input type="hidden" name="recurrence" value={item?.recurrence ?? mode} />

      <Field label="Person / household">
        <Select name="person_id" defaultValue={item?.person_id ?? selectedPersonId}>
          <option value="">Household / shared</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name} ({person.relationship})</option>)}
        </Select>
      </Field>

      <Field label="Direction">
        <Select name="direction" defaultValue={defaultDirection}>
          <option value="outgoing">Outgoing</option>
          <option value="income">Incoming</option>
        </Select>
      </Field>

      <Field label="Name">
        <TextInput name="label" defaultValue={item?.label ?? ""} placeholder="Spotify, Netflix, Shopify, child benefit" required />
      </Field>

      <Field label="Amount">
        <TextInput name="amount" type="number" step="0.01" defaultValue={item?.amount ?? ""} required />
      </Field>

      <Field label="Type">
        <Select name="item_type" defaultValue={defaultType}>
          <option value="subscription">Subscription</option>
          <option value="bill">Bill</option>
          <option value="monthly_cost">Monthly cost</option>
          <option value="manual_income">Manual income</option>
          <option value="one_off">One-off</option>
          <option value="transfer">Transfer</option>
        </Select>
      </Field>

      <Field label="Category">
        <Select name="category_id" defaultValue={item?.category_id ?? ""}>
          <option value="">No category</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
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
          <Field label="Ends on">
            <TextInput name="end_date" type="date" defaultValue={item?.end_date ?? ""} />
          </Field>
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

function OneOffSpendForm({ people, categories, selectedPersonId, selectedMonth }: { people: Person[]; categories: SpendingCategory[]; selectedPersonId: string; selectedMonth: string }) {
  return (
    <form action={addSpendingEntry} className="grid gap-4 sm:grid-cols-2">
      <Field label="Person / household">
        <Select name="person_id" defaultValue={selectedPersonId}>
          <option value="">Household / shared</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name} ({person.relationship})</option>)}
        </Select>
      </Field>
      <Field label="Category">
        <Select name="category_id">
          <option value="">No category</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </Select>
      </Field>
      <Field label="Name">
        <TextInput name="label" placeholder="Food shop, petrol, Amazon" required />
      </Field>
      <Field label="Amount">
        <TextInput name="amount" type="number" step="0.01" required />
      </Field>
      <Field label="Date">
        <TextInput name="spent_at" type="date" defaultValue={monthStart(selectedMonth)} required />
      </Field>
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
      <Field label="Monthly budget">
        <TextInput name="monthly_budget" type="number" step="0.01" required />
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

function BankImportForm({ people, selectedPersonId }: { people: Person[]; selectedPersonId: string }) {
  return (
    <form action={importBankCsv} className="grid gap-4 sm:grid-cols-2">
      <Field label="Account owner / household">
        <Select name="person_id" defaultValue={selectedPersonId}>
          <option value="">Household / shared</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name} ({person.relationship})</option>)}
        </Select>
      </Field>
      <Field label="Account name">
        <TextInput name="account_name" placeholder="Santander joint, Nationwide, NatWest" defaultValue="Bank account" required />
      </Field>
      <Field label="Bank/provider">
        <TextInput name="provider_name" placeholder="Santander, NatWest, Nationwide" />
      </Field>
      <Field label="CSV file">
        <input name="csv_file" type="file" accept=".csv,text/csv" required className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-white" />
      </Field>
      <div className="sm:col-span-2 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-950">
        <p className="font-bold">What this does</p>
        <p className="mt-1">Imports the transactions, groups similar descriptions, spots payments that repeat across months, then suggests normal monthly items you can accept into the planner. It does not automatically count every bank transaction as a planned outgoing, so you avoid double counting.</p>
      </div>
      <div className="sm:col-span-2">
        <Submit>Import and analyse CSV</Submit>
      </div>
    </form>
  );
}

function CandidateAcceptForm({ candidate, people, categories, selectedPersonId }: { candidate: RegularPaymentCandidate; people: Person[]; categories: SpendingCategory[]; selectedPersonId: string }) {
  const defaultPerson = candidate.person_id ?? selectedPersonId;
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
          <option value="">Household / shared</option>
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

export function SpendingPlannerClient({ people, categories, entries, plannedItems, payEvents, childCosts, bankImports, regularCandidates }: Props) {
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [year, setYear] = useState(Number(currentMonth().slice(0, 4)));
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [plusOpen, setPlusOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const childOptions = useMemo(() => people.filter((person) => person.relationship === "child").map((person) => ({ id: person.id, name: person.name })), [people]);
  const months = useMemo(() => getYearMonths(year), [year]);

  const filteredPlannedItems = plannedItems.filter((item) => !selectedPersonId || item.person_id === selectedPersonId);
  const filteredEntries = entries.filter((entry) => !selectedPersonId || entry.person_id === selectedPersonId);
  const filteredPayEvents = payEvents.filter((event) => !selectedPersonId || event.person_id === selectedPersonId);
  const filteredChildCosts = childCosts.filter((cost) => !selectedPersonId || cost.child_id === selectedPersonId);

  const monthSummaries = months.map((month) => {
    const plannedForMonth = filteredPlannedItems.filter((item) => plannedItemAppliesToMonth(item, month));
    const entriesForMonth = filteredEntries.filter((entry) => dateIsInMonth(entry.spent_at, month));
    const payForMonth = filteredPayEvents.filter((event) => isActiveInMonth(event.effective_from, event.effective_until, month));
    const childForMonth = filteredChildCosts.filter((cost) => isActiveInMonth(cost.starts_on, cost.ends_on, month));

    const income = plannedForMonth.filter((item) => item.direction === "income").reduce((sum, item) => sum + Number(item.amount), 0)
      + payForMonth.reduce((sum, event) => sum + getPayAmount(event, month), 0);
    const outgoings = plannedForMonth.filter((item) => item.direction === "outgoing").reduce((sum, item) => sum + Number(item.amount), 0)
      + entriesForMonth.reduce((sum, entry) => sum + Number(entry.amount), 0)
      + childForMonth.reduce((sum, cost) => sum + getChildCostMonthlyAmount(cost, month), 0);

    return { month, income, outgoings, net: income - outgoings, plannedForMonth, entriesForMonth, payForMonth, childForMonth };
  });

  const selectedSummary = monthSummaries.find((summary) => summary.month === selectedMonth) ?? monthSummaries[0];
  const selectedPerson = selectedPersonId ? peopleById.get(selectedPersonId) : null;
  const currentPersonLabel = selectedPerson ? selectedPerson.name : "Whole household";
  const maxAmount = Math.max(1, ...monthSummaries.map((summary) => Math.max(summary.income, summary.outgoings)));

  const timelineItems = [
    ...selectedSummary.payForMonth.map((event) => ({
      id: `pay-${event.id}`,
      date: event.effective_from,
      title: event.label,
      person: personName(peopleById, event.person_id),
      direction: "income" as const,
      amount: getPayAmount(event, selectedSummary.month),
      helper: event.pay_kind === "maternity" ? "Maternity / irregular pay event" : "Pay event",
      href: event.person_id ? `/household/${event.person_id}` : "/household",
    })),
    ...selectedSummary.plannedForMonth.map((item) => ({
      id: `planned-${item.id}`,
      date: plannedItemDueDate(item, selectedSummary.month),
      title: item.label,
      person: personName(peopleById, item.person_id),
      direction: item.direction,
      amount: Number(item.amount),
      helper: `${item.recurrence === "monthly" ? "Monthly" : "One-off"} · ${item.item_type.replaceAll("_", " ")}`,
      item,
    })),
    ...selectedSummary.entriesForMonth.map((entry) => ({
      id: `entry-${entry.id}`,
      date: entry.spent_at,
      title: entry.label,
      person: personName(peopleById, entry.person_id),
      direction: "outgoing" as const,
      amount: Number(entry.amount),
      helper: entry.notes || "Logged spend",
      entry,
    })),
    ...selectedSummary.childForMonth.map((cost) => ({
      id: `child-${cost.id}`,
      date: cost.starts_on,
      title: cost.label,
      person: personName(peopleById, cost.child_id),
      direction: "outgoing" as const,
      amount: getChildCostMonthlyAmount(cost, selectedSummary.month),
      helper: cost.cost_kind === "nursery" ? "Childcare / nursery estimate" : cost.cost_kind === "activity" ? "Activity / class" : "Child cost",
      childCost: cost,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  function openAdd(mode: AddMode) {
    setPlusOpen(false);
    setModal({ type: "add", mode });
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Spending planner</h1>
          <p className="mt-1 text-slate-600">Filter by person, plan recurring costs, log spending and see income/outgoings in a calendar flow.</p>
        </div>

        <div className="relative self-start">
          <button
            type="button"
            onClick={() => setPlusOpen((value) => !value)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-2xl font-bold leading-none text-white shadow-sm hover:bg-slate-800"
            aria-label="Add item"
          >
            +
          </button>
          {plusOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              <button type="button" onClick={() => openAdd("monthly")} className="block w-full rounded-xl px-3 py-3 text-left text-sm hover:bg-slate-50">
                <span className="font-bold text-slate-950">Monthly cost / income</span>
                <span className="mt-1 block text-xs text-slate-500">Same date each month: Spotify, Netflix, Shopify, child benefit.</span>
              </button>
              <button type="button" onClick={() => openAdd("bank_import")} className="block w-full rounded-xl px-3 py-3 text-left text-sm hover:bg-slate-50">
                <span className="font-bold text-slate-950">Import bank CSV</span>
                <span className="mt-1 block text-xs text-slate-500">Upload transactions and find repeat payments to approve.</span>
              </button>
              <button type="button" onClick={() => openAdd("one_off")} className="block w-full rounded-xl px-3 py-3 text-left text-sm hover:bg-slate-50">
                <span className="font-bold text-slate-950">One-off spend</span>
                <span className="mt-1 block text-xs text-slate-500">A single outgoing for a specific date.</span>
              </button>
              <button type="button" onClick={() => openAdd("child_cost")} className="block w-full rounded-xl px-3 py-3 text-left text-sm hover:bg-slate-50">
                <span className="font-bold text-slate-950">Child cost</span>
                <span className="mt-1 block text-xs text-slate-500">Nursery, wraparound or activities.</span>
              </button>
              <button type="button" onClick={() => openAdd("category")} className="block w-full rounded-xl px-3 py-3 text-left text-sm hover:bg-slate-50">
                <span className="font-bold text-slate-950">Budget category</span>
                <span className="mt-1 block text-xs text-slate-500">For broad spending buckets and reporting.</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard title={`${formatMonthLabel(selectedSummary.month)} income`} value={formatMoney(selectedSummary.income)} helper={currentPersonLabel} />
        <StatCard title={`${formatMonthLabel(selectedSummary.month)} outgoings`} value={formatMoney(selectedSummary.outgoings)} helper={currentPersonLabel} />
        <StatCard title="Expected net" value={formatMoney(selectedSummary.net)} helper="Income minus outgoings" />
        <StatCard title="Timeline lines" value={String(timelineItems.length)} helper="Visible for selected month" />
      </section>

      <SectionCard title="Filter by person" description="Use this to see only one child/adult's income and costs. Shared household items stay under Household.">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedPersonId("")}
            className={`rounded-full px-4 py-2 text-sm font-bold ${!selectedPersonId ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
          >
            All household
          </button>
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
      </SectionCard>


      <SectionCard title="Bank import suggestions" description="CSV imports are analysed for repeat payments. Accept the ones you recognise and they become normal monthly planner items.">
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
                    <p className="mt-1 text-sm text-slate-500">Range {formatMoney(Number(candidate.amount_min))}–{formatMoney(Number(candidate.amount_max))} · average {formatMoney(Number(candidate.amount_average))}</p>
                    {candidate.sample_descriptions?.length ? <p className="mt-2 text-xs text-slate-500">Examples: {candidate.sample_descriptions.slice(0, 3).join(" · ")}</p> : null}
                  </div>
                  <form action={dismissRegularPaymentCandidate}>
                    <input type="hidden" name="candidate_id" value={candidate.id} />
                    <button className="text-sm font-bold text-slate-400 hover:text-red-600">Dismiss</button>
                  </form>
                </div>
                <CandidateAcceptForm candidate={candidate} people={people} categories={categories} selectedPersonId={selectedPersonId} />
              </div>
            )) : <p className="text-sm text-slate-500">No suggested regular payments yet. Use the black + button and choose Import bank CSV.</p>}
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

      <SectionCard title={`${year} calendar`} description="Click a month to see the income and outgoing lines behind the number.">
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
                    <p className="mt-1 text-xs text-slate-500">In {formatMoney(summary.income)} · Out {formatMoney(summary.outgoings)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${summary.net >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{formatMoney(summary.net)}</span>
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

      <SectionCard title={`${formatMonthLabel(selectedSummary.month)} lines for ${currentPersonLabel}`} description="Incoming and outgoing lines are shown together by date. Edit planned monthly items directly from here.">
        <div className="space-y-3">
          {timelineItems.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.date} · {item.person}</p>
                  <p className="mt-1 font-semibold text-slate-950">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{item.helper}</p>
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${item.direction === "income" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-800"}`}>
                    {item.direction === "income" ? "+" : "-"}{formatMoney(item.amount)}
                  </span>
                  {"href" in item && item.href ? <Link href={item.href} className="text-sm font-bold text-slate-500 hover:text-slate-950">Open</Link> : null}
                  {"item" in item && item.item ? (
                    <>
                      <button type="button" onClick={() => setModal({ type: "edit_planned", item: item.item })} className="text-sm font-bold text-slate-700 hover:text-slate-950">Edit</button>
                      <form action={deletePlannedItem}>
                        <input type="hidden" name="id" value={item.item.id} />
                        <button className="text-sm font-medium text-red-600">Delete</button>
                      </form>
                    </>
                  ) : null}
                  {"entry" in item && item.entry ? (
                    <form action={deleteSpendingEntry}>
                      <input type="hidden" name="id" value={item.entry.id} />
                      <button className="text-sm font-medium text-red-600">Delete</button>
                    </form>
                  ) : null}
                  {"childCost" in item && item.childCost ? (
                    <form action={deleteChildCost}>
                      <input type="hidden" name="id" value={item.childCost.id} />
                      <button className="text-sm font-medium text-red-600">Delete</button>
                    </form>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          {timelineItems.length === 0 ? <p className="text-sm text-slate-500">Nothing planned or logged for this month/filter yet. Use the black plus button to add something.</p> : null}
        </div>
      </SectionCard>

      <SectionCard title="Budget categories" description="These are broad reporting buckets. Month-specific items now live in the calendar above.">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {categories.map((category) => (
            <div key={category.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-950">{category.name}</p>
                  <p className="text-sm capitalize text-slate-500">{category.type}</p>
                  <p className="mt-2 text-xl font-bold">{formatMoney(category.monthly_budget)}</p>
                </div>
                <form action={deleteSpendingCategory}>
                  <input type="hidden" name="id" value={category.id} />
                  <button className="text-sm font-medium text-red-600">Delete</button>
                </form>
              </div>
            </div>
          ))}
          {categories.length === 0 ? <p className="text-sm text-slate-500">No categories yet.</p> : null}
        </div>
      </SectionCard>

      {modal?.type === "add" && modal.mode === "monthly" ? (
        <Modal title="Add monthly cost or income" onClose={() => setModal(null)}>
          <PlannedItemForm people={people} categories={categories} selectedPersonId={selectedPersonId} selectedMonth={selectedMonth} mode="monthly" />
        </Modal>
      ) : null}

      {modal?.type === "add" && modal.mode === "bank_import" ? (
        <Modal title="Import bank CSV" onClose={() => setModal(null)}>
          <BankImportForm people={people} selectedPersonId={selectedPersonId} />
        </Modal>
      ) : null}

      {modal?.type === "add" && modal.mode === "one_off" ? (
        <Modal title="Add one-off spend" onClose={() => setModal(null)}>
          <OneOffSpendForm people={people} categories={categories} selectedPersonId={selectedPersonId} selectedMonth={selectedMonth} />
        </Modal>
      ) : null}

      {modal?.type === "add" && modal.mode === "child_cost" ? (
        <Modal title="Add child cost" onClose={() => setModal(null)}>
          {childOptions.length > 0 ? <NurseryCostForm action={addChildCost} childrenOptions={childOptions} /> : <p className="text-sm text-slate-500">Add children on the Household page first.</p>}
        </Modal>
      ) : null}

      {modal?.type === "add" && modal.mode === "category" ? (
        <Modal title="Add budget category" onClose={() => setModal(null)}>
          <CategoryForm />
        </Modal>
      ) : null}

      {modal?.type === "edit_planned" ? (
        <Modal title={`Edit ${modal.item.label}`} onClose={() => setModal(null)}>
          <PlannedItemForm people={people} categories={categories} selectedPersonId={selectedPersonId} selectedMonth={selectedMonth} item={modal.item} mode={modal.item.recurrence === "monthly" ? "monthly" : "one_off"} />
        </Modal>
      ) : null}
    </>
  );
}
