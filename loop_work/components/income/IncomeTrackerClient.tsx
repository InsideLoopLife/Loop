"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SectionCard } from "@/components/SectionCard";
import { PayEventWizard } from "@/components/household/PayEventWizard";
import { formatMoney } from "@/lib/format/money";
import {
  estimateAnnualTakeHome,
  PensionMethod,
  StudentLoanPlan,
} from "@/lib/calculations/tax";
import {
  MaternityPayMode,
  calculateNhsMaternityMonthlyAmount,
} from "@/lib/calculations/maternity";
import {
  addIncomeDeduction,
  addIncomeEntry,
  addRecurringPayEvent,
  deleteIncomeDeduction,
  deleteIncomeEntry,
  deleteIncomePayEvent,
  deleteStudentLoanAccount,
  updateIncomeEntry,
  updateRecurringPayEvent,
  upsertStudentLoanAccount,
} from "@/app/income/actions";

type Person = {
  id: string;
  user_id?: string | null;
  linked_user_id?: string | null;
  name: string;
  relationship: string;
  avatar_url?: string | null;
};
type IncomeEntry = {
  id: string;
  user_id?: string | null;
  owner_user_id?: string | null;
  person_id: string | null;
  label: string;
  gross_amount: number;
  net_amount: number | null;
  frequency: "monthly" | "annual" | "weekly";
  entry_date: string;
};
type StudentLoanAccount = {
  id: string;
  user_id?: string | null;
  owner_user_id?: string | null;
  person_id: string | null;
  plan: StudentLoanPlan;
  current_balance: number;
  balance_date: string;
  interest_rate: number | null;
  payroll_monthly_override: number | null;
  notes: string | null;
};
type StudentLoanBalanceEvent = {
  id: string;
  student_loan_account_id: string;
  event_type: string;
  amount: number | null;
  balance_after: number;
  effective_at: string;
  note: string | null;
};
type PayEvent = {
  id: string;
  user_id?: string | null;
  owner_user_id?: string | null;
  person_id: string | null;
  label: string;
  pay_kind: string | null;
  gross_annual_salary: number;
  monthly_take_home_override: number | null;
  pension_percent: number;
  pension_method: PensionMethod | null;
  employer_pension_percent?: number | null;
  employer_pension_monthly_amount?: number | null;
  employer_ni_topup_enabled?: boolean | null;
  employer_ni_rate_percent?: number | null;
  employer_ni_topup_share_percent?: number | null;
  student_loan_plan: StudentLoanPlan;
  effective_from: string;
  effective_until: string | null;
  pay_timing?: string | null;
  pay_day_of_month?: number | string | null;
  pay_adjustment?: string | null;
  maternity_scheme?: string | null;
  maternity_leave_start: string | null;
  maternity_leave_end: string | null;
  maternity_pay_mode: MaternityPayMode | null;
  maternity_full_pay_weeks: number | null;
  maternity_half_pay_weeks: number | null;
  maternity_smp_only_weeks: number | null;
  maternity_unpaid_weeks: number | null;
  maternity_smp_weekly_rate: number | null;
};

type IncomeDeduction = {
  id: string;
  person_id: string | null;
  deduction_type: "car_salary_sacrifice" | "cycle_to_work" | "additional_pension" | "other";
  label: string;
  monthly_amount: number;
  notes: string | null;
  effective_from: string;
  effective_until: string | null;
};

type Props = {
  entries: IncomeEntry[];
  people: Person[];
  payEvents: PayEvent[];
  studentLoanAccounts?: StudentLoanAccount[];
  studentLoanBalanceEvents?: StudentLoanBalanceEvent[];
  incomeDeductions?: IncomeDeduction[];
  hasHousehold?: boolean;
  signedInPersonId?: string | null;
  canViewHouseholdIncome?: boolean;
  schemaWarning?: string | null;
};

type IncomeLine = {
  id: string;
  source: "manual" | "pay_event";
  person_id: string | null;
  label: string;
  monthlyGross: number;
  monthlyNet: number;
  monthlyPension: number;
  monthlyTax: number;
  monthlyNi: number;
  monthlyStudentLoan: number;
  keptPercent: number;
  frequencyLabel: string;
  dateLabel: string;
  kind: string;
  manageHref?: string;
  payEvent?: PayEvent;
  incomeEntry?: IncomeEntry;
};

const inputClass =
  "w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 focus:border-orange-400 focus:ring-2";
const selectClass = inputClass;

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthStart(month: string) {
  return `${month}-01`;
}

function monthEnd(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(year, monthIndex, 0).toISOString().slice(0, 10);
}

function isActiveInMonth(start: string, end: string | null, month: string) {
  return start <= monthEnd(month) && (!end || end >= monthStart(month));
}

function monthlyEquivalent(
  entry: IncomeEntry,
  amountKey: "gross_amount" | "net_amount",
) {
  const amount = Number(entry[amountKey] ?? 0);
  if (entry.frequency === "annual") return amount / 12;
  if (entry.frequency === "weekly") return (amount * 52) / 12;
  return amount;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthNumber - 1, 1));
}

function formatNiceDate(value: string | null | undefined) {
  if (!value) return "ongoing";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateRange(start: string, end: string | null) {
  return `${formatNiceDate(start)} → ${end ? formatNiceDate(end) : "ongoing"}`;
}

function confirmDelete(message = "Delete this item? This cannot be undone.") {
  return typeof window === "undefined" ? true : window.confirm(message);
}

function personName(peopleById: Map<string, Person>, personId: string | null) {
  return personId ? (peopleById.get(personId)?.name ?? "Unknown") : "Household";
}

function MiniAvatar({
  person,
  size = "h-12 w-12",
}: {
  person?: Person | null;
  size?: string;
}) {
  if (person?.avatar_url) {
    return (
      <img
        src={person.avatar_url}
        alt=""
        className={`${size} rounded-2xl object-cover ring-2 ring-white`}
      />
    );
  }
  const label = person?.name || "Household";
  return (
    <span
      className={`grid ${size} place-items-center rounded-2xl bg-slate-200 text-sm font-black text-slate-700`}
    >
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

function getPayEventBreakdown(event: PayEvent, month: string) {
  const annualBreakdown = estimateAnnualTakeHome({
    grossAnnual: Number(event.gross_annual_salary),
    pensionPercent: Number(event.pension_percent),
    pensionMethod: event.pension_method ?? "net_pay",
    studentLoanPlan: event.student_loan_plan,
  });

  if (event.pay_kind === "maternity") {
    const maternity = calculateNhsMaternityMonthlyAmount({
      month,
      grossAnnualSalary: Number(event.gross_annual_salary),
      leaveStart: event.maternity_leave_start ?? event.effective_from,
      leaveEnd:
        event.maternity_leave_end ??
        event.effective_until ??
        event.effective_from,
      fullPayWeeks: Number(event.maternity_full_pay_weeks ?? 8),
      halfPayWeeks: Number(event.maternity_half_pay_weeks ?? 18),
      smpOnlyWeeks: Number(event.maternity_smp_only_weeks ?? 13),
      unpaidWeeks: Number(event.maternity_unpaid_weeks ?? 13),
      smpWeeklyRate: Number(event.maternity_smp_weekly_rate ?? 194.32),
      payMode: event.maternity_pay_mode ?? "nhs_spread_occupational_actual_smp",
      pensionPercent: Number(event.pension_percent),
      pensionMethod: event.pension_method ?? "net_pay",
      studentLoanPlan: event.student_loan_plan,
    });
    const monthlyGross = Number(event.gross_annual_salary || 0) / 12;
    return {
      monthlyGross,
      monthlyNet: maternity.estimatedNetAmount,
      monthlyPension: annualBreakdown.pension / 12,
      monthlyTax: annualBreakdown.incomeTax / 12,
      monthlyNi: annualBreakdown.nationalInsurance / 12,
      monthlyStudentLoan: annualBreakdown.studentLoan / 12,
      keptPercent:
        monthlyGross > 0
          ? (maternity.estimatedNetAmount / monthlyGross) * 100
          : 0,
    };
  }

  const monthlyGross = Number(event.gross_annual_salary || 0) / 12;
  const monthlyNet =
    event.monthly_take_home_override !== null &&
    event.monthly_take_home_override !== undefined
      ? Number(event.monthly_take_home_override)
      : annualBreakdown.monthlyTakeHome;

  return {
    monthlyGross,
    monthlyNet,
    monthlyPension: annualBreakdown.pension / 12,
    monthlyTax: annualBreakdown.incomeTax / 12,
    monthlyNi: annualBreakdown.nationalInsurance / 12,
    monthlyStudentLoan: annualBreakdown.studentLoan / 12,
    keptPercent: monthlyGross > 0 ? (monthlyNet / monthlyGross) * 100 : 0,
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-[2rem] border border-white/70 bg-white/95 p-6 shadow-2xl backdrop-blur-xl sm:rounded-[2rem]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">
              Income
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PersonSelect({
  people,
  defaultValue = "",
  allowHousehold = true,
  required = false,
}: {
  people: Person[];
  defaultValue?: string;
  allowHousehold?: boolean;
  required?: boolean;
}) {
  const adults = people.filter((person) => person.relationship !== "child");
  return (
    <select
      name="person_id"
      defaultValue={defaultValue}
      required={required}
      className={selectClass}
    >
      {allowHousehold ? (
        <option value="">Household / shared</option>
      ) : (
        <option value="">Choose person</option>
      )}
      {adults.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name} ({person.relationship})
        </option>
      ))}
    </select>
  );
}

function peopleOptions(people: Person[]) {
  return people
    .filter((person) => person.relationship !== "child")
    .map((person) => ({
      id: person.id,
      name: `${person.name} (${person.relationship})`,
    }));
}

function RecurringIncomeForm({
  people,
  selectedPersonId,
  month,
  defaultPersonId,
}: {
  people: Person[];
  selectedPersonId: string;
  month: string;
  defaultPersonId: string;
}) {
  return (
    <PayEventWizard
      action={addRecurringPayEvent}
      peopleOptions={peopleOptions(people)}
      initialValues={{
        person_id:
          selectedPersonId === "all" ? defaultPersonId : selectedPersonId,
        pay_kind: "salary",
        effective_from: monthStart(month),
        pay_timing: "fixed_day",
        pay_day_of_month: 28,
        pay_adjustment: "previous_workday",
      }}
      submitLabel="Add recurring income"
      compact
      requirePerson
    />
  );
}

function ManualIncomeForm({
  people,
  selectedPersonId,
  action = addIncomeEntry,
  initialValues,
  submitLabel = "Add manual income",
  defaultPersonId,
}: {
  people: Person[];
  selectedPersonId: string;
  action?: (formData: FormData) => void | Promise<void>;
  initialValues?: IncomeEntry;
  submitLabel?: string;
  defaultPersonId: string;
}) {
  const selected =
    selectedPersonId === "all" ? defaultPersonId : selectedPersonId;
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2">
      {initialValues?.id ? (
        <input type="hidden" name="id" value={initialValues.id} />
      ) : null}
      <Field label="Person">
        <PersonSelect
          people={people}
          defaultValue={initialValues?.person_id || selected}
          allowHousehold={false}
          required
        />
      </Field>
      <Field label="Label">
        <input
          name="label"
          className={inputClass}
          defaultValue={initialValues?.label || ""}
          placeholder="Dividends, bonus, side income"
          required
        />
      </Field>
      <Field label="Gross amount">
        <input
          name="gross_amount"
          type="number"
          step="0.01"
          className={inputClass}
          defaultValue={initialValues?.gross_amount ?? ""}
          required
        />
      </Field>
      <Field label="Net amount">
        <input
          name="net_amount"
          type="number"
          step="0.01"
          className={inputClass}
          defaultValue={initialValues?.net_amount ?? ""}
        />
      </Field>
      <Field label="Frequency">
        <select
          name="frequency"
          defaultValue={initialValues?.frequency || "monthly"}
          className={selectClass}
        >
          <option value="monthly">Monthly</option>
          <option value="annual">Annual</option>
          <option value="weekly">Weekly</option>
        </select>
      </Field>
      <Field label="Date">
        <input
          name="entry_date"
          type="date"
          defaultValue={
            initialValues?.entry_date || new Date().toISOString().slice(0, 10)
          }
          className={inputClass}
        />
      </Field>
      <div className="md:col-span-2">
        <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function StudentLoanForm({
  people,
  selectedPersonId,
  initialValues,
  defaultPersonId,
}: {
  people: Person[];
  selectedPersonId: string;
  initialValues?: StudentLoanAccount;
  defaultPersonId: string;
}) {
  const selected =
    selectedPersonId === "all" ? defaultPersonId : selectedPersonId;
  return (
    <form
      action={upsertStudentLoanAccount}
      className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:grid-cols-2"
    >
      {initialValues?.id ? (
        <input type="hidden" name="id" value={initialValues.id} />
      ) : null}
      <Field label="Person">
        <PersonSelect
          people={people}
          defaultValue={initialValues?.person_id || selected}
          allowHousehold={false}
          required
        />
      </Field>
      <Field label="Plan">
        <select
          name="plan"
          defaultValue={initialValues?.plan || "plan_1"}
          className={selectClass}
        >
          <option value="plan_1">Plan 1</option>
          <option value="plan_2">Plan 2</option>
          <option value="plan_4">Plan 4</option>
          <option value="plan_5">Plan 5</option>
          <option value="postgraduate">Postgraduate</option>
        </select>
      </Field>
      <Field label="Outstanding balance">
        <input
          name="current_balance"
          type="number"
          step="0.01"
          defaultValue={initialValues?.current_balance ?? ""}
          placeholder="Copy from SLC"
          className={inputClass}
          required
        />
      </Field>
      <Field label="Balance checked on">
        <input
          name="balance_date"
          type="date"
          defaultValue={
            initialValues?.balance_date || new Date().toISOString().slice(0, 10)
          }
          className={inputClass}
          required
        />
      </Field>
      <Field label="Interest rate %">
        <input
          name="interest_rate"
          type="number"
          step="0.01"
          defaultValue={initialValues?.interest_rate ?? ""}
          placeholder="Optional"
          className={inputClass}
        />
      </Field>
      <Field label="Payroll repayment override">
        <input
          name="payroll_monthly_override"
          type="number"
          step="0.01"
          defaultValue={initialValues?.payroll_monthly_override ?? ""}
          placeholder="Use payslip if known"
          className={inputClass}
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Notes">
          <input
            name="notes"
            className={inputClass}
            defaultValue={initialValues?.notes || ""}
            placeholder="SLC login checked, payslip deduction etc"
          />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">
          {initialValues ? "Save student loan" : "Add student loan"}
        </button>
      </div>
    </form>
  );
}

function DeductionPicker({
  onPickStudentLoan,
  onPickType,
}: {
  onPickStudentLoan: () => void;
  onPickType: (option: { type: "car_salary_sacrifice" | "cycle_to_work" | "additional_pension" | "other"; label: string; helper: string }) => void;
}) {
  const [search, setSearch] = useState("");
  const allOptions = [
    { type: "student_loan" as const, label: "Student loan", helper: "Repayment plan, feeds the tax/take-home calculation." },
    ...([
      { type: "car_salary_sacrifice" as const, label: "Car / salary sacrifice", helper: "Company car scheme, EV salary sacrifice etc." },
      { type: "cycle_to_work" as const, label: "Cycle to work", helper: "Bike scheme deducted from gross pay." },
      { type: "additional_pension" as const, label: "Additional pension contribution", helper: "On top of the workplace default %." },
      { type: "other" as const, label: "Other deduction", helper: "Anything else that comes off pay before it lands." },
    ]),
  ];
  const query = search.trim().toLowerCase();
  const filtered = query ? allOptions.filter((option) => option.label.toLowerCase().includes(query) || option.helper.toLowerCase().includes(query)) : allOptions;

  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search deduction types…"
        autoFocus
        className={inputClass}
      />
      <div className="space-y-2">
        {filtered.map((option) => (
          <button
            key={option.type}
            type="button"
            onClick={() => (option.type === "student_loan" ? onPickStudentLoan() : onPickType(option))}
            className="flex w-full flex-col items-start gap-0.5 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-950 hover:bg-slate-50"
          >
            <span className="font-black text-slate-950">{option.label}</span>
            <span className="text-xs font-semibold text-slate-500">{option.helper}</span>
          </button>
        ))}
        {filtered.length === 0 ? <p className="text-sm font-semibold text-slate-500">No match. Try "Other deduction" — you can rename it to anything.</p> : null}
      </div>
    </div>
  );
}

function AddDeductionForm({
  people,
  selectedPersonId,
  defaultPersonId,
  deductionType,
  deductionLabel,
  onDone,
}: {
  people: Person[];
  selectedPersonId: string;
  defaultPersonId: string;
  deductionType: "car_salary_sacrifice" | "cycle_to_work" | "additional_pension" | "other";
  deductionLabel: string;
  onDone: () => void;
}) {
  const selected = selectedPersonId === "all" ? defaultPersonId : selectedPersonId;
  return (
    <form
      action={async (formData: FormData) => {
        await addIncomeDeduction(formData);
        onDone();
      }}
      className="grid gap-3 sm:grid-cols-2"
    >
      <input type="hidden" name="deduction_type" value={deductionType} />
      <Field label="Person">
        <PersonSelect people={people} defaultValue={selected} allowHousehold={false} required />
      </Field>
      <Field label="Label">
        <input name="label" className={inputClass} defaultValue={deductionLabel} required />
      </Field>
      <Field label="Amount per month">
        <input name="monthly_amount" type="number" step="0.01" className={inputClass} required />
      </Field>
      <Field label="Starts">
        <input name="effective_from" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Notes (optional)">
          <input name="notes" className={inputClass} placeholder="Scheme name, provider, anything useful" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Add deduction</button>
      </div>
    </form>
  );
}

function incomeStatus(event: PayEvent, month: string) {
  if (event.effective_from > monthEnd(month)) return "future";
  if (event.effective_until && event.effective_until < monthStart(month))
    return "archived";
  return "active";
}

type IncomeModalState =
  | null
  | "recurring"
  | "manual"
  | "deductionPicker"
  | { type: "editPay"; event: PayEvent }
  | { type: "editManual"; entry: IncomeEntry }
  | { type: "editLoan"; account: StudentLoanAccount }
  | { type: "addDeduction"; deductionType: IncomeDeduction["deduction_type"]; deductionLabel: string }
  | { type: "viewLine"; line: IncomeLine };

const DEDUCTION_TYPE_OPTIONS: { type: IncomeDeduction["deduction_type"]; label: string; helper: string }[] = [
  { type: "car_salary_sacrifice", label: "Car / salary sacrifice", helper: "Company car scheme, EV salary sacrifice etc." },
  { type: "cycle_to_work", label: "Cycle to work", helper: "Bike scheme deducted from gross pay." },
  { type: "additional_pension", label: "Additional pension contribution", helper: "On top of the workplace default %." },
  { type: "other", label: "Other deduction", helper: "Anything else that comes off pay before it lands." },
];

export function IncomeTrackerClient({
  entries,
  people,
  payEvents,
  studentLoanAccounts = [],
  studentLoanBalanceEvents = [],
  incomeDeductions = [],
  hasHousehold = false,
  signedInPersonId = null,
  canViewHouseholdIncome = true,
  schemaWarning = null,
}: Props) {
  const [modal, setModal] = useState<IncomeModalState>(null);
  const missingOwnProfileFilter = "__own_profile_missing__";
  const [personFilter, setPersonFilter] = useState(
    () => signedInPersonId || (hasHousehold ? missingOwnProfileFilter : "all"),
  );
  const [month, setMonth] = useState(currentMonth());
  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );
  const adultPeople = useMemo(
    () => people.filter((person) => person.relationship !== "child"),
    [people],
  );
  const defaultPersonId =
    signedInPersonId &&
    adultPeople.some((person) => person.id === signedInPersonId)
      ? signedInPersonId
      : "";
  const needsOwnProfileLink = hasHousehold && !signedInPersonId;
  const resolveRecordPersonId = (record: {
    person_id?: string | null;
    user_id?: string | null;
    owner_user_id?: string | null;
  }) => {
    if (record.person_id && peopleById.has(record.person_id))
      return record.person_id;
    const ownerId = record.owner_user_id || record.user_id || null;
    if (ownerId) {
      const match = adultPeople.find(
        (person) =>
          person.linked_user_id === ownerId || person.user_id === ownerId,
      );
      if (match) return match.id;
    }
    return record.person_id || null;
  };

  const lines = useMemo<IncomeLine[]>(() => {
    const manualLines: IncomeLine[] = entries.map((entry) => {
      const monthlyGross = monthlyEquivalent(entry, "gross_amount");
      const monthlyNet =
        entry.net_amount === null || entry.net_amount === undefined
          ? monthlyGross
          : monthlyEquivalent(entry, "net_amount");
      return {
        id: entry.id,
        source: "manual",
        person_id: resolveRecordPersonId(entry),
        label: entry.label,
        monthlyGross,
        monthlyNet,
        monthlyPension: 0,
        monthlyTax: Math.max(0, monthlyGross - monthlyNet),
        monthlyNi: 0,
        monthlyStudentLoan: 0,
        keptPercent: monthlyGross > 0 ? (monthlyNet / monthlyGross) * 100 : 0,
        frequencyLabel: entry.frequency,
        dateLabel: formatNiceDate(entry.entry_date),
        kind: "manual",
        incomeEntry: { ...entry, person_id: resolveRecordPersonId(entry) },
      };
    });

    const payLines: IncomeLine[] = payEvents
      .filter((event) =>
        isActiveInMonth(event.effective_from, event.effective_until, month),
      )
      .map((event) => {
        const breakdown = getPayEventBreakdown(event, month);
        return {
          id: event.id,
          source: "pay_event",
          person_id: resolveRecordPersonId(event),
          label: event.label,
          ...breakdown,
          frequencyLabel: event.pay_kind ?? "salary",
          dateLabel: formatDateRange(
            event.effective_from,
            event.effective_until,
          ),
          kind: event.pay_kind ?? "salary",
          manageHref: resolveRecordPersonId(event)
            ? `/household/${resolveRecordPersonId(event)}`
            : undefined,
          payEvent: { ...event, person_id: resolveRecordPersonId(event) },
        };
      });

    return [...payLines, ...manualLines];
  }, [entries, payEvents, month, peopleById, adultPeople, defaultPersonId]);

  const peopleWithIncome = useMemo(() => {
    const ids = new Set(
      lines.map((line) => line.person_id).filter(Boolean) as string[],
    );
    const visiblePeople = canViewHouseholdIncome
      ? people
      : people.filter((person) => person.id === signedInPersonId);
    return visiblePeople.filter((person) => ids.has(person.id));
  }, [lines, people, canViewHouseholdIncome, signedInPersonId]);

  const resolvedStudentLoanAccounts = useMemo(
    () =>
      studentLoanAccounts.map((account) => ({
        ...account,
        person_id: resolveRecordPersonId(account),
      })),
    [studentLoanAccounts, peopleById, adultPeople, defaultPersonId],
  );

  const effectivePersonFilter =
    personFilter === "all" && !canViewHouseholdIncome
      ? signedInPersonId || missingOwnProfileFilter
      : personFilter;
  const filtered =
    effectivePersonFilter === "all"
      ? lines
      : lines.filter((line) => line.person_id === effectivePersonFilter);
  const filteredLoans =
    effectivePersonFilter === "all"
      ? resolvedStudentLoanAccounts
      : resolvedStudentLoanAccounts.filter(
          (account) => account.person_id === effectivePersonFilter,
        );
  const filteredDeductions =
    effectivePersonFilter === "all"
      ? incomeDeductions
      : incomeDeductions.filter((deduction) => deduction.person_id === effectivePersonFilter);
  const monthlyGross = filtered.reduce(
    (sum, line) => sum + line.monthlyGross,
    0,
  );
  const monthlyNet = filtered.reduce((sum, line) => sum + line.monthlyNet, 0);
  const keptPercent = monthlyGross > 0 ? (monthlyNet / monthlyGross) * 100 : 0;
  const currentPerson =
    effectivePersonFilter === "all"
      ? null
      : peopleById.get(effectivePersonFilter) || null;
  const unassignedLines = lines.filter((line) => !line.person_id);

  const personSummary = (personId: string | null) =>
    lines
      .filter((line) => line.person_id === personId)
      .reduce((sum, line) => sum + line.monthlyNet, 0);

  const upcomingChanges = payEvents
    .filter(
      (event) =>
        event.effective_from >= monthStart(month) ||
        (event.effective_until && event.effective_until >= monthStart(month)),
    )
    .sort((a, b) =>
      (a.effective_from || "").localeCompare(b.effective_from || ""),
    )
    .slice(0, 8);

  return (
    <main className="mx-auto w-[95vw] max-w-[2000px] space-y-7 px-4 py-6 sm:px-6 lg:px-8">
      <section className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
        <div className="absolute -right-24 -top-20 h-72 w-72 rounded-full bg-orange-500/30 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-200">
                Income Flow
              </p>
              <a href="/financial-flow?tab=income" className="inline-flex items-center gap-1.5 rounded-[7px] bg-white px-3 py-1.5 text-xs font-black text-slate-950 hover:bg-slate-100">← Back to Flow</a>
            </div>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">
              {formatMoney(monthlyNet)}
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-300">
              Estimated take-home for{" "}
              {currentPerson
                ? currentPerson.name
                : hasHousehold
                  ? "the household"
                  : "this account"}{" "}
              in {monthLabel(month)}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setModal("recurring")}
              className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950"
            >
              + Add recurring income
            </button>
            <button
              onClick={() => setModal("manual")}
              className="rounded-full bg-white/10 px-5 py-3 text-sm font-black text-white ring-1 ring-white/20"
            >
              + Add manual income
            </button>
          </div>
        </div>
      </section>

      {schemaWarning ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950"><p className="font-black">Income loaded using compatibility mode</p><p className="mt-1">Some optional pay fields are missing from the database, but core income rows remain available to view and edit. Run the latest income compatibility migration when convenient.</p></section> : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex flex-col gap-1 rounded-3xl border border-slate-200 bg-white p-4 text-left">
            <span className="text-xs font-black uppercase tracking-wide text-slate-500">Month</span>
            <input
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              type="month"
              className="mt-1 border-none bg-transparent p-0 text-2xl font-black text-slate-950 outline-none"
            />
          </label>
          {hasHousehold && canViewHouseholdIncome ? (
            <button
              onClick={() => setPersonFilter("all")}
              className={`rounded-3xl border p-4 text-left transition ${personFilter === "all" ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950 hover:-translate-y-0.5 hover:shadow"}`}
            >
              <p className="text-xs font-black uppercase tracking-wide opacity-70">
                Household view
              </p>
              <p className="mt-1 text-2xl font-black">
                {formatMoney(
                  lines.reduce((sum, line) => sum + line.monthlyNet, 0),
                )}
              </p>
            </button>
          ) : null}
          {peopleWithIncome.map((person) => (
            <button
              key={person.id}
              onClick={() => setPersonFilter(person.id)}
              className={`flex min-w-64 items-center gap-3 rounded-3xl border p-4 text-left transition ${personFilter === person.id ? "border-orange-300 bg-orange-50 shadow" : "border-slate-200 bg-white hover:-translate-y-0.5 hover:shadow"}`}
            >
              <MiniAvatar person={person} />
              <span>
                <span className="block text-xs font-black uppercase tracking-wide text-slate-500">
                  {person.relationship}
                </span>
                <span className="block text-lg font-black text-slate-950">
                  {person.name}
                </span>
                <span className="block text-sm font-black text-emerald-700">
                  {formatMoney(personSummary(person.id))}/mo ·{" "}
                  {lines.filter((line) => line.person_id === person.id).length}{" "}
                  active line(s)
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {needsOwnProfileLink ? (
        <section className="rounded-[1.75rem] border border-red-200 bg-red-50 p-5 text-red-950">
          <p className="text-xs font-black uppercase tracking-[0.18em]">
            Your income profile is not linked
          </p>
          <h2 className="mt-1 text-xl font-black">
            LOOP has deliberately hidden household income from the default view
          </h2>
          <p className="mt-2 max-w-4xl text-sm font-bold">
            Your signed-in account is not safely linked to one household person.
            Link your account in Household settings before LOOP uses any income
            for your personal affordability, pension or tax calculations. No
            income rows have been deleted.
          </p>
          <Link
            href="/account?section=household"
            className="mt-4 inline-flex rounded-full bg-red-950 px-4 py-2 text-xs font-black text-white"
          >
            Review household identity
          </Link>
        </section>
      ) : null}

      {unassignedLines.length > 0 ? (
        <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <p className="text-xs font-black uppercase tracking-[0.18em]">
            Income records need an owner
          </p>
          <h2 className="mt-1 text-xl font-black">
            {unassignedLines.length} line(s) are not safely attached to a
            household person
          </h2>
          <p className="mt-2 text-sm font-bold">
            LOOP no longer guesses that an unassigned record belongs to the
            signed-in person. Open the record and select the correct owner
            before it is used in personal affordability or pension calculations.
          </p>
        </section>
      ) : null}

      <SectionCard
        title="Current income"
        description="The selected person controls this page. Your own income is selected automatically on sign-in; household income is an explicit view rather than the default."
      >
        <div className="mb-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-3xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase text-slate-400">
              Gross / month
            </p>
            <p className="mt-1 text-xl font-black text-slate-950">
              {formatMoney(monthlyGross)}
            </p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase text-slate-400">
              Net / month
            </p>
            <p className="mt-1 text-xl font-black text-slate-950">
              {formatMoney(monthlyNet)}
            </p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase text-slate-400">Kept</p>
            <p className="mt-1 text-xl font-black text-slate-950">
              {keptPercent.toFixed(0)}%
            </p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase text-slate-400">
              Pension
            </p>
            <p className="mt-1 text-xl font-black text-slate-950">
              {formatMoney(
                filtered.reduce((sum, line) => sum + line.monthlyPension, 0),
              )}
            </p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase text-slate-400">
              Tax paid
            </p>
            <p className="mt-1 text-xl font-black text-slate-950">
              {formatMoney(
                filtered.reduce((sum, line) => sum + line.monthlyTax, 0),
              )}
            </p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase text-slate-400">
              NI paid
            </p>
            <p className="mt-1 text-xl font-black text-slate-950">
              {formatMoney(
                filtered.reduce((sum, line) => sum + line.monthlyNi, 0),
              )}
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          {filtered.map((line) => (
            <div
              key={`${line.source}-${line.id}`}
              className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
            >
              <div
                className={`h-1.5 ${line.kind === "maternity" ? "bg-gradient-to-r from-pink-500 to-orange-400" : line.source === "pay_event" ? "bg-gradient-to-r from-emerald-500 to-teal-400" : "bg-gradient-to-r from-slate-950 to-slate-600"}`}
              />
              <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_520px_auto] xl:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
                      {personName(peopleById, line.person_id)}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-black ${line.source === "pay_event" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}
                    >
                      {line.source === "pay_event" ? "Recurring" : "Manual"}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-black text-slate-950">
                    {line.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {line.frequencyLabel.replaceAll("_", " ")} ·{" "}
                    {line.dateLabel}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase text-slate-400">
                      Gross
                    </p>
                    <p className="font-black text-slate-950">
                      {formatMoney(line.monthlyGross)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase text-slate-400">
                      Net
                    </p>
                    <p className="font-black text-slate-950">
                      {formatMoney(line.monthlyNet)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase text-slate-400">
                      Pension
                    </p>
                    <p className="font-black text-slate-950">
                      {formatMoney(line.monthlyPension)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase text-slate-400">
                      Tax / NI
                    </p>
                    <p className="font-black text-slate-950">
                      {formatMoney(line.monthlyTax + line.monthlyNi)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase text-slate-400">
                      Kept
                    </p>
                    <p className="font-black text-slate-950">
                      {line.keptPercent.toFixed(0)}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3">
                  <button type="button" onClick={() => setModal({ type: "viewLine", line })} className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800">View split</button>
                  {line.source === "manual" && line.incomeEntry ? (
                    <button
                      type="button"
                      onClick={() =>
                        setModal({
                          type: "editManual",
                          entry: line.incomeEntry!,
                        })
                      }
                      className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"
                    >
                      Edit
                    </button>
                  ) : null}
                  {line.source === "pay_event" && line.payEvent ? (
                    <button
                      type="button"
                      onClick={() =>
                        setModal({ type: "editPay", event: line.payEvent! })
                      }
                      className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"
                    >
                      Edit
                    </button>
                  ) : null}
                  {line.manageHref ? (
                    <Link
                      href={line.manageHref}
                      className="rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white"
                    >
                      Profile
                    </Link>
                  ) : null}
                  {line.source === "manual" ? (
                    <form
                      action={deleteIncomeEntry}
                      onSubmit={(event) => {
                        if (!confirmDelete(`Delete ${line.label}?`))
                          event.preventDefault();
                      }}
                    >
                      <input type="hidden" name="id" value={line.id} />
                      <button className="text-sm font-bold text-red-600">
                        Delete
                      </button>
                    </form>
                  ) : (
                    <form
                      action={deleteIncomePayEvent}
                      onSubmit={(event) => {
                        if (!confirmDelete(`Delete ${line.label}?`))
                          event.preventDefault();
                      }}
                    >
                      <input type="hidden" name="id" value={line.id} />
                      <button className="text-sm font-bold text-red-600">
                        Delete
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 ? (
            <p className="rounded-3xl border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-500">
              No income for this person/month yet. Use “Add recurring income”
              for salary or maternity, or manual income for dividends, bonuses
              and side income.
            </p>
          ) : null}
        </div>
      </SectionCard>

      <section className="grid gap-6 lg:grid-cols-[1fr_.9fr]">
        <SectionCard
          id="deductibles"
          title="Deductibles"
          description="Anything that comes off pay before it lands — student loans, car salary sacrifice, cycle to work, extra pension. Student loan repayments feed the tax calculation; other deduction types are tracked here as a line for reference."
          headerAction={
            <button type="button" onClick={() => setModal("deductionPicker")} className="grid h-10 w-10 place-items-center rounded-full bg-slate-950 text-lg font-black text-white hover:bg-slate-800">+</button>
          }
        >
          <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <StudentLoanForm
              people={people}
              selectedPersonId={personFilter}
              defaultPersonId={defaultPersonId}
            />
            <div className="space-y-3">
              {filteredLoans.map((account) => (
                <div
                  key={account.id}
                  className="rounded-3xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                        {personName(peopleById, account.person_id)} ·{" "}
                        {account.plan.replaceAll("_", " ")}
                      </p>
                      <p className="mt-1 text-2xl font-black text-slate-950">
                        {formatMoney(Number(account.current_balance))}
                      </p>
                      <p className="text-sm font-semibold text-slate-500">
                        Checked {formatNiceDate(account.balance_date)}
                        {account.payroll_monthly_override
                          ? ` · payslip ${formatMoney(account.payroll_monthly_override)}/mo`
                          : ""}
                      </p>
                      <div className="mt-4 border-l-2 border-indigo-100 pl-4">
                        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Balance thread</p>
                        <div className="space-y-2">
                          {studentLoanBalanceEvents
                            .filter((event) => event.student_loan_account_id === account.id)
                            .slice(0, 6)
                            .map((event) => (
                              <div key={event.id} className="flex items-start justify-between gap-4 text-xs">
                                <div>
                                  <p className="font-black capitalize text-slate-700">{event.event_type.replaceAll("_", " ")}</p>
                                  <p className="font-semibold text-slate-400">{formatNiceDate(event.effective_at)}{event.note ? ` · ${event.note}` : ""}</p>
                                </div>
                                <div className="text-right">
                                  {event.amount != null && event.amount !== 0 ? <p className={`font-black ${event.amount < 0 ? "text-emerald-700" : "text-orange-700"}`}>{event.amount > 0 ? "+" : ""}{formatMoney(event.amount)}</p> : null}
                                  <p className="font-black text-slate-950">{formatMoney(event.balance_after)}</p>
                                </div>
                              </div>
                            ))}
                          {studentLoanBalanceEvents.filter((event) => event.student_loan_account_id === account.id).length === 0 ? <p className="text-xs font-semibold text-slate-400">The next saved balance will start this thread.</p> : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setModal({ type: "editLoan", account })}
                        className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"
                      >
                        Edit
                      </button>
                      <form
                        action={deleteStudentLoanAccount}
                        onSubmit={(event) => {
                          if (
                            !confirmDelete("Delete this student loan balance?")
                          )
                            event.preventDefault();
                        }}
                      >
                        <input type="hidden" name="id" value={account.id} />
                        <button className="text-sm font-bold text-red-600">
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
              {filteredLoans.length === 0 ? (
                <p className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                  No student loan balance saved for this filter yet.
                </p>
              ) : null}

              {filteredDeductions.map((deduction) => (
                <div key={deduction.id} className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                        {personName(peopleById, deduction.person_id)} · {DEDUCTION_TYPE_OPTIONS.find((option) => option.type === deduction.deduction_type)?.label || "Deduction"}
                      </p>
                      <p className="mt-1 text-2xl font-black text-slate-950">{formatMoney(deduction.monthly_amount)}/mo</p>
                      <p className="text-sm font-semibold text-slate-500">{deduction.label}{deduction.notes ? ` · ${deduction.notes}` : ""}</p>
                    </div>
                    <form
                      action={deleteIncomeDeduction}
                      onSubmit={(event) => { if (!confirmDelete("Delete this deduction?")) event.preventDefault(); }}
                    >
                      <input type="hidden" name="id" value={deduction.id} />
                      <button className="text-sm font-bold text-red-600">Delete</button>
                    </form>
                  </div>
                </div>
              ))}

              {filteredLoans.length === 0 && filteredDeductions.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <svg viewBox="0 0 64 64" className="h-16 w-16 text-slate-300" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="10" y="18" width="44" height="32" rx="6" />
                    <path d="M10 26h44" />
                    <path d="M20 36h10" />
                    <path d="M20 42h18" />
                    <circle cx="46" cy="14" r="8" className="fill-slate-100" />
                    <path d="M46 11v4" />
                    <path d="M46 17.5v.01" />
                  </svg>
                  <p className="text-sm font-bold text-slate-500">Nothing set up yet — only appears if it applies to your household.</p>
                  <button type="button" onClick={() => setModal("deductionPicker")} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">+ Add a deduction</button>
                </div>
              ) : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Income changes"
          description="Future, current and archived salary/maternity rows stay visible so you can see what changed and when."
        >
          <div className="space-y-3">
            {upcomingChanges
              .filter(
                (event) =>
                  personFilter === "all" ||
                  resolveRecordPersonId(event) === personFilter,
              )
              .map((event) => {
                const status = incomeStatus(event, month);
                const resolvedPersonId = resolveRecordPersonId(event);
                const editableEvent = { ...event, person_id: resolvedPersonId };
                return (
                  <div
                    key={event.id}
                    className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                          {personName(peopleById, resolvedPersonId)} ·{" "}
                          {event.pay_kind?.replaceAll("_", " ") || "salary"}
                        </p>
                        <p className="mt-1 font-black text-slate-950">
                          {event.label}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          {formatDateRange(
                            event.effective_from,
                            event.effective_until,
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${status === "active" ? "bg-emerald-100 text-emerald-800" : status === "future" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`}
                        >
                          {status}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setModal({ type: "editPay", event: editableEvent })
                          }
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            {upcomingChanges.filter(
              (event) =>
                personFilter === "all" ||
                resolveRecordPersonId(event) === personFilter,
            ).length === 0 ? (
              <p className="text-sm text-slate-500">
                No income changes found for this filter.
              </p>
            ) : null}
          </div>
        </SectionCard>
      </section>

      <SectionCard
        title="Income archive by person"
        description="Full salary, maternity and return-to-work history. Current income remains above; this is the audit trail."
      >
        <div className="grid gap-3 md:grid-cols-2">
          {payEvents
            .filter(
              (event) =>
                personFilter === "all" ||
                resolveRecordPersonId(event) === personFilter,
            )
            .sort((a, b) =>
              (b.effective_from || "").localeCompare(a.effective_from || ""),
            )
            .map((event) => {
              const status = incomeStatus(event, month);
              const breakdown = getPayEventBreakdown(event, month);
              const resolvedPersonId = resolveRecordPersonId(event);
              const editableEvent = { ...event, person_id: resolvedPersonId };
              return (
                <div
                  key={event.id}
                  className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                        {personName(peopleById, resolvedPersonId)} ·{" "}
                        {event.pay_kind?.replaceAll("_", " ") || "salary"}
                      </p>
                      <p className="mt-1 text-lg font-black text-slate-950">
                        {event.label}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {formatDateRange(
                          event.effective_from,
                          event.effective_until,
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${status === "active" ? "bg-emerald-100 text-emerald-800" : status === "future" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`}
                      >
                        {status}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setModal({ type: "editPay", event: editableEvent })
                        }
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-bold uppercase text-slate-400">
                        Gross / mo
                      </p>
                      <p className="font-black text-slate-950">
                        {formatMoney(breakdown.monthlyGross)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-bold uppercase text-slate-400">
                        Net / mo
                      </p>
                      <p className="font-black text-slate-950">
                        {formatMoney(breakdown.monthlyNet)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-bold uppercase text-slate-400">
                        Pension
                      </p>
                      <p className="font-black text-slate-950">
                        {formatMoney(breakdown.monthlyPension)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-bold uppercase text-slate-400">
                        Kept
                      </p>
                      <p className="font-black text-slate-950">
                        {breakdown.keptPercent.toFixed(0)}%
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          {payEvents.filter(
            (event) =>
              personFilter === "all" ||
              resolveRecordPersonId(event) === personFilter,
          ).length === 0 ? (
            <p className="text-sm font-semibold text-slate-500">
              No recurring pay records yet.
            </p>
          ) : null}
        </div>
      </SectionCard>

      {modal === "recurring" ? (
        <Modal
          title="Add recurring income"
          description="Use this for salary, maternity pay and return-to-work changes."
          onClose={() => setModal(null)}
        >
          <RecurringIncomeForm
            people={people}
            selectedPersonId={personFilter}
            month={month}
            defaultPersonId={defaultPersonId}
          />
        </Modal>
      ) : null}

      {modal === "manual" ? (
        <Modal
          title="Add manual income"
          description="Use this for dividends, bonuses, side income or irregular income."
          onClose={() => setModal(null)}
        >
          <ManualIncomeForm
            people={people}
            selectedPersonId={personFilter}
            defaultPersonId={defaultPersonId}
          />
        </Modal>
      ) : null}

      {modal === "deductionPicker" ? (
        <Modal
          title="Add a deduction"
          description="Pick the closest match. Student loan repayments feed the tax calculation; the others are tracked as a monthly line for reference."
          onClose={() => setModal(null)}
        >
          <DeductionPicker
            onPickStudentLoan={() => {
              setModal(null);
              if (typeof document !== "undefined") {
                document.getElementById("deductibles")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
            onPickType={(option) => setModal({ type: "addDeduction", deductionType: option.type, deductionLabel: option.label })}
          />
        </Modal>
      ) : null}

      {modal && typeof modal === "object" && modal.type === "addDeduction" ? (
        <Modal
          title={`Add ${modal.deductionLabel.toLowerCase()}`}
          description="This is tracked as a monthly line under Deductibles. It doesn't yet adjust the tax/take-home calculation above — only student loans do that."
          onClose={() => setModal(null)}
        >
          <AddDeductionForm
            people={people}
            selectedPersonId={personFilter}
            defaultPersonId={defaultPersonId}
            deductionType={modal.deductionType}
            deductionLabel={modal.deductionLabel}
            onDone={() => setModal(null)}
          />
        </Modal>
      ) : null}

      {modal && typeof modal === "object" && modal.type === "editPay" ? (
        <Modal
          title={`Edit ${modal.event.label}`}
          description="Change the person, dates, salary, pension or student loan logic without losing the income history."
          onClose={() => setModal(null)}
        >
          <PayEventWizard
            action={updateRecurringPayEvent}
            peopleOptions={peopleOptions(people)}
            initialValues={modal.event}
            submitLabel="Save income changes"
            compact
            requirePerson
          />
        </Modal>
      ) : null}

      {modal && typeof modal === "object" && modal.type === "editManual" ? (
        <Modal
          title={`Edit ${modal.entry.label}`}
          description="Manual income should also be allocated to a person, not left as Household unless it is genuinely shared income."
          onClose={() => setModal(null)}
        >
          <ManualIncomeForm
            people={people}
            selectedPersonId={personFilter}
            action={updateIncomeEntry}
            initialValues={modal.entry}
            submitLabel="Save manual income"
            defaultPersonId={defaultPersonId}
          />
        </Modal>
      ) : null}

      {modal && typeof modal === "object" && modal.type === "editLoan" ? (
        <Modal
          title="Edit student loan"
          description="Keep the balance and payroll repayment attached to the right person."
          onClose={() => setModal(null)}
        >
          <StudentLoanForm
            people={people}
            selectedPersonId={personFilter}
            initialValues={modal.account}
            defaultPersonId={defaultPersonId}
          />
        </Modal>
      ) : null}

      {modal && typeof modal === "object" && modal.type === "viewLine" ? (
        <Modal title={modal.line.label} description={`${personName(peopleById, modal.line.person_id)} · ${modal.line.frequencyLabel.replaceAll("_", " ")} · ${modal.line.dateLabel}`} onClose={() => setModal(null)}>
          <div className="flex items-start justify-between gap-4 rounded-3xl bg-slate-950 p-5 text-white">
            <div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15 text-xl font-black">{modal.line.label.slice(0, 2).toUpperCase()}</span><div><p className="text-xs font-black uppercase tracking-wide text-white/55">Income source</p><p className="mt-1 text-2xl font-black">{formatMoney(modal.line.monthlyNet)} net / month</p></div></div>
            <MiniAvatar person={modal.line.person_id ? peopleById.get(modal.line.person_id) : null} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Gross pay", modal.line.monthlyGross],
              ["Income tax", -modal.line.monthlyTax],
              ["National Insurance", -modal.line.monthlyNi],
              ["Pension", -modal.line.monthlyPension],
              ["Student loan", -modal.line.monthlyStudentLoan],
              ["Net received", modal.line.monthlyNet],
            ].map(([label, amount]) => <div key={String(label)} className="rounded-3xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-2 text-xl font-black ${Number(amount) < 0 ? "text-orange-700" : "text-slate-950"}`}>{Number(amount) < 0 ? "−" : ""}{formatMoney(Math.abs(Number(amount)))}</p></div>)}
          </div>
          <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">You keep {modal.line.keptPercent.toFixed(1)}% of gross pay. This split follows the tax, pension and student-loan assumptions attached to this income record.</p>
        </Modal>
      ) : null}
    </main>
  );
}
