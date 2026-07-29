"use client";

import { useMemo, useState, type ReactNode } from "react";
import { NurseryCostForm } from "@/components/household/NurseryCostForm";
import { PayEventWizard } from "@/components/household/PayEventWizard";
import { SectionCard } from "@/components/SectionCard";
import { formatMoneyExact } from "@/lib/format/money";
import { estimateAnnualTakeHome, PensionMethod, StudentLoanPlan } from "@/lib/calculations/tax";
import { MaternityPayMode, calculateNhsMaternityMonthlyAmount } from "@/lib/calculations/maternity";
import { ActivityBillingMode, BillingSchedule, DaySession, FundingMode, calculateActivityMonthlyCost, calculateNurseryMonthlyCost } from "@/lib/calculations/childcare";
import { addChildCost, addPayEvent, addPayEventMonthlyOverride, deleteChildCost, deletePayEvent, updateChildCost, updatePayEvent } from "@/app/household/actions";

type Person = {
  id: string;
  name: string;
  relationship: "self" | "partner" | "child" | "other";
};

type PayEvent = {
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
  pay_timing: string | null;
  pay_day_of_month: number | null;
  pay_adjustment: string | null;
  maternity_scheme: string | null;
  maternity_leave_start: string | null;
  maternity_leave_end: string | null;
  maternity_pay_mode: MaternityPayMode | null;
  maternity_full_pay_weeks: number | null;
  maternity_half_pay_weeks: number | null;
  maternity_smp_only_weeks: number | null;
  maternity_unpaid_weeks: number | null;
  maternity_smp_weekly_rate: number | null;
  overrides?: PayEventOverride[];
};

type PayEventOverride = {
  id: string;
  pay_event_id: string | null;
  person_id: string | null;
  month: string;
  statutory_pay: number | null;
  occupational_pay: number | null;
  gross_pay: number | null;
  net_pay_override: number | null;
  notes: string | null;
};

type ChildCost = {
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
  tax_free_childcare_enabled: boolean | null;
  tax_free_childcare_cap_per_quarter: number | null;
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
};


type IncomeEntry = {
  id: string;
  person_id: string | null;
  label: string;
  gross_amount: number;
  net_amount: number | null;
  frequency: "monthly" | "annual" | "weekly";
  entry_date: string;
};

type PlannedItem = {
  id: string;
  person_id: string | null;
  direction: "income" | "outgoing";
  item_type: string;
  label: string;
  amount: number;
  recurrence: "monthly" | "four_weekly" | "custom_interval" | "one_off";
  recurrence_interval_days?: number | null;
  start_date: string;
  end_date: string | null;
  day_of_month: number | null;
  payment_timing: string | null;
  payment_adjustment: string | null;
};

type Props = {
  person: Person;
  payEvents: PayEvent[];
  childCosts: ChildCost[];
  incomeEntries?: IncomeEntry[];
  plannedItems?: PlannedItem[];
};

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

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
}

function isActiveInMonth(start: string, end: string | null, month: string) {
  return start <= monthEnd(month) && (!end || end >= monthStart(month));
}

function getIncomeEntryMonthlyAmount(entry: IncomeEntry) {
  const amount = Number(entry.net_amount ?? entry.gross_amount ?? 0);
  if (entry.frequency === "annual") return amount / 12;
  if (entry.frequency === "weekly") return amount * 52 / 12;
  return amount;
}

function incomeEntryAppliesToMonth(entry: IncomeEntry, month: string) {
  return entry.entry_date <= monthEnd(month);
}

function plannedItemAppliesToMonth(item: PlannedItem, month: string) {
  if (item.recurrence === "one_off") return item.start_date >= monthStart(month) && item.start_date <= monthEnd(month);
  return item.start_date <= monthEnd(month) && (!item.end_date || item.end_date >= monthStart(month));
}

function plannedItemRecurrenceLabel(item: PlannedItem) {
  if (item.recurrence === "monthly") return "monthly";
  if (item.recurrence === "one_off") return "one-off";
  if (item.recurrence === "four_weekly") return "every 4 weeks";
  const days = Math.max(1, Number(item.recurrence_interval_days || 0) || 7);
  return days % 7 === 0 ? `every ${days / 7} week${days / 7 === 1 ? "" : "s"}` : `every ${days} day${days === 1 ? "" : "s"}`;
}

function getPayMonthlyNet(event: PayEvent, month: string) {
  const override = event.overrides?.find((item) => item.month === month);
  if (override) {
    if (override.net_pay_override !== null && override.net_pay_override !== undefined) return Number(override.net_pay_override);
    if (override.gross_pay !== null && override.gross_pay !== undefined) return Number(override.gross_pay);
    return Number(override.statutory_pay ?? 0) + Number(override.occupational_pay ?? 0);
  }

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

function getChildCostMonthlyAmount(cost: ChildCost, billingMonth: string) {
  if (cost.cost_kind === "activity") {
    return calculateActivityMonthlyCost({
      billingMonth,
      weeklyCost: Number(cost.activity_weekly_cost ?? cost.monthly_cost ?? 0),
      activityWeekday: Number(cost.activity_weekday ?? 6),
      activityBillingMode: cost.activity_billing_mode ?? "calendar",
      activityTermWeeksPerYear: Number(cost.activity_term_weeks_per_year ?? 38),
      bankHolidaysAreFree: Boolean(cost.bank_holidays_are_free),
    }).estimatedMonthlyCost;
  }

  if (cost.cost_kind !== "nursery") return Number(cost.monthly_cost ?? 0);

  return calculateNurseryMonthlyCost({
    billingMonth,
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

function getYearMonths(year: number) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-5xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Edit in place</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PersonCalendarPlanner({ person, payEvents, childCosts, incomeEntries = [], plannedItems = [] }: Props) {
  const isChild = person.relationship === "child";
  const [year, setYear] = useState(Number(currentMonth().slice(0, 4)));
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [modal, setModal] = useState<null | { type: "add" } | { type: "editPay"; event: PayEvent } | { type: "editChildCost"; cost: ChildCost }>(null);

  const months = useMemo(() => getYearMonths(year), [year]);

  const monthSummaries = useMemo(() => months.map((month) => {
    const activePayEvents = payEvents.filter((event) => isActiveInMonth(event.effective_from, event.effective_until, month));
    const activeChildCosts = childCosts.filter((cost) => isActiveInMonth(cost.starts_on, cost.ends_on, month));
    const activeManualIncome = incomeEntries.filter((entry) => incomeEntryAppliesToMonth(entry, month));
    const activePlanned = plannedItems.filter((item) => plannedItemAppliesToMonth(item, month));
    const plannedIncome = activePlanned.filter((item) => item.direction === "income");
    const plannedOutgoings = activePlanned.filter((item) => item.direction === "outgoing");
    const income = activePayEvents.reduce((sum, event) => sum + getPayMonthlyNet(event, month), 0)
      + activeManualIncome.reduce((sum, entry) => sum + getIncomeEntryMonthlyAmount(entry), 0)
      + plannedIncome.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    const costs = activeChildCosts.reduce((sum, cost) => sum + getChildCostMonthlyAmount(cost, month), 0)
      + plannedOutgoings.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    return { month, income, costs, net: income - costs, payEvents: activePayEvents, childCosts: activeChildCosts, incomeEntries: activeManualIncome, plannedIncome, plannedOutgoings };
  }), [months, payEvents, childCosts, incomeEntries, plannedItems]);

  const selectedSummary = monthSummaries.find((summary) => summary.month === selectedMonth) ?? monthSummaries[0];
  const maxAmount = Math.max(1, ...monthSummaries.map((summary) => Math.max(summary.income, summary.costs)));

  return (
    <>
      <SectionCard
        title={`${person.name}'s yearly calendar`}
        description={isChild ? "Click a month to see active costs and add a cost from the plus button." : "Click a month to see active income and add a salary/maternity/return-to-work event from the plus button."}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setYear((value) => value - 1)} className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50">←</button>
            <p className="text-lg font-bold text-slate-950">{year}</p>
            <button type="button" onClick={() => setYear((value) => value + 1)} className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-50">→</button>
          </div>
          <button
            type="button"
            onClick={() => setModal({ type: "add" })}
            className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
          >
            + Add for {formatMonthLabel(selectedMonth)}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          {monthSummaries.map((summary) => {
            const primary = isChild ? summary.costs : summary.income;
            const selected = summary.month === selectedMonth;
            return (
              <button
                type="button"
                key={summary.month}
                onClick={() => setSelectedMonth(summary.month)}
                className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${selected ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{formatMonthLabel(summary.month)}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{formatMoneyExact(primary)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${selected ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"}`}>
                    {selected ? "Open" : "View"}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.min(100, Math.round((primary / maxAmount) * 100))}%` }} />
                </div>
                <p className="mt-2 text-xs text-slate-500">{isChild ? `${summary.childCosts.length} cost line(s)` : `${summary.payEvents.length} pay event(s)`}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Selected month</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-950">{formatMonthLabel(selectedSummary.month)}</h3>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              {!isChild ? <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-800">Income {formatMoneyExact(selectedSummary.income)}</span> : null}
              {isChild ? <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-800">Costs {formatMoneyExact(selectedSummary.costs)}</span> : null}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {!isChild ? (
              (selectedSummary.payEvents.length + selectedSummary.incomeEntries.length + selectedSummary.plannedIncome.length) > 0 ? (<>
                {selectedSummary.payEvents.map((event) => (
                <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-950">{event.label}</p>
                      <p className="text-sm text-slate-500">{event.pay_kind ?? "salary"} · {event.effective_from} → {event.effective_until ?? "ongoing"}</p>
                      <p className="mt-2 text-sm text-slate-700">{formatMoneyExact(event.gross_annual_salary)} gross · {formatMoneyExact(getPayMonthlyNet(event, selectedSummary.month))} {event.overrides?.some((item) => item.month === selectedSummary.month) ? "exact override this month" : "estimated net this month"}</p>
                      {event.pay_kind === "maternity" ? (
                        <details className="mt-3 rounded-2xl border border-rose-100 bg-rose-50/50 p-3">
                          <summary className="cursor-pointer text-xs font-black uppercase tracking-wide text-rose-700">Add/update exact maternity pay for {formatMonthLabel(selectedSummary.month)}</summary>
                          <form action={addPayEventMonthlyOverride} className="mt-3 grid gap-3 md:grid-cols-4">
                            <input type="hidden" name="pay_event_id" value={event.id} />
                            <input type="hidden" name="person_id" value={person.id} />
                            <input type="hidden" name="month" value={selectedSummary.month} />
                            <label><span className="text-xs font-black text-slate-600">Statutory pay</span><input name="statutory_pay" type="number" step="0.01" defaultValue={event.overrides?.find((item) => item.month === selectedSummary.month)?.statutory_pay ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                            <label><span className="text-xs font-black text-slate-600">Occupational pay</span><input name="occupational_pay" type="number" step="0.01" defaultValue={event.overrides?.find((item) => item.month === selectedSummary.month)?.occupational_pay ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                            <label><span className="text-xs font-black text-slate-600">Net override optional</span><input name="net_pay_override" type="number" step="0.01" defaultValue={event.overrides?.find((item) => item.month === selectedSummary.month)?.net_pay_override ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                            <label><span className="text-xs font-black text-slate-600">Notes</span><input name="notes" defaultValue={event.overrides?.find((item) => item.month === selectedSummary.month)?.notes ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                            <div className="md:col-span-4 flex gap-2">
                              <button className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">Save exact month</button>
                              {event.overrides?.find((item) => item.month === selectedSummary.month) ? <span className="rounded-full bg-white px-3 py-2 text-xs font-black text-rose-700">Existing override will be replaced</span> : null}
                            </div>
                          </form>
                        </details>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-3">
                      <button type="button" onClick={() => setModal({ type: "editPay", event })} className="text-sm font-bold text-slate-700 hover:text-slate-950">Edit</button>
                      <form action={deletePayEvent}>
                        <input type="hidden" name="id" value={event.id} />
                        <button className="text-sm font-medium text-red-600">Delete</button>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
                {selectedSummary.incomeEntries.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <p className="font-semibold text-slate-950">{entry.label}</p>
                    <p className="text-sm text-slate-500">Manual {entry.frequency} income · from {entry.entry_date}</p>
                    <p className="mt-2 text-sm text-slate-700">{formatMoneyExact(getIncomeEntryMonthlyAmount(entry))} estimated monthly</p>
                  </div>
                ))}
                {selectedSummary.plannedIncome.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                    <p className="font-semibold text-slate-950">{item.label}</p>
                    <p className="text-sm text-slate-500">Planned {plannedItemRecurrenceLabel(item)} income · from {item.start_date}</p>
                    <p className="mt-2 text-sm text-slate-700">{formatMoneyExact(Number(item.amount ?? 0))}</p>
                  </div>
                ))}
              </>) : <p className="text-sm text-slate-500">No income is active in this month yet. Use the plus button to add one or manage income in Income Tracker.</p>
            ) : (
              (selectedSummary.childCosts.length + selectedSummary.plannedOutgoings.length) > 0 ? (<>
                {selectedSummary.childCosts.map((cost) => (
                <div key={cost.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-950">{cost.label}</p>
                      <p className="text-sm text-slate-500">{cost.cost_kind ?? "fixed"} · {cost.starts_on} → {cost.ends_on ?? "ongoing"}</p>
                      <p className="mt-2 text-sm text-slate-700">{formatMoneyExact(getChildCostMonthlyAmount(cost, selectedSummary.month))} estimated cost this month</p>
                    </div>
                    <div className="flex shrink-0 gap-3">
                      <button type="button" onClick={() => setModal({ type: "editChildCost", cost })} className="text-sm font-bold text-slate-700 hover:text-slate-950">Edit</button>
                      <form action={deleteChildCost}>
                        <input type="hidden" name="id" value={cost.id} />
                        <button className="text-sm font-medium text-red-600">Delete</button>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
                {selectedSummary.plannedOutgoings.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="font-semibold text-slate-950">{item.label}</p>
                    <p className="text-sm text-slate-500">Planned {plannedItemRecurrenceLabel(item)} outgoing · from {item.start_date}</p>
                    <p className="mt-2 text-sm text-slate-700">{formatMoneyExact(Number(item.amount ?? 0))}</p>
                  </div>
                ))}
              </>) : <p className="text-sm text-slate-500">No child cost is active in this month yet. Use the plus button to add one.</p>
            )}
          </div>
        </div>
      </SectionCard>

      {modal?.type === "add" ? (
        <Modal title={isChild ? `Add cost for ${formatMonthLabel(selectedMonth)}` : `Add pay event for ${formatMonthLabel(selectedMonth)}`} onClose={() => setModal(null)}>
          {isChild ? (
            <NurseryCostForm action={addChildCost} lockedChildId={person.id} childrenOptions={[{ id: person.id, name: person.name }]} initialValues={{ starts_on: monthStart(selectedMonth), billing_month: selectedMonth }} />
          ) : (
            <PayEventWizard
              action={addPayEvent}
              lockedPersonId={person.id}
              peopleOptions={[{ id: person.id, name: person.name }]}
              initialValues={{ effective_from: monthStart(selectedMonth), student_loan_plan: payEvents[0]?.student_loan_plan ?? "none", pension_percent: payEvents[0]?.pension_percent ?? 0, pension_method: payEvents[0]?.pension_method ?? "net_pay" }}
              defaultStudentLoanPlan={(payEvents[0]?.student_loan_plan ?? "none") as StudentLoanPlan}
              defaultPensionPercent={Number(payEvents[0]?.pension_percent ?? 0)}
              compact
            />
          )}
        </Modal>
      ) : null}

      {modal?.type === "editPay" ? (
        <Modal title={`Edit ${modal.event.label}`} onClose={() => setModal(null)}>
          <PayEventWizard
            action={updatePayEvent}
            lockedPersonId={person.id}
            peopleOptions={[{ id: person.id, name: person.name }]}
            initialValues={modal.event}
            defaultStudentLoanPlan={modal.event.student_loan_plan}
            defaultPensionPercent={Number(modal.event.pension_percent ?? 0)}
            submitLabel="Save changes"
            compact
          />
        </Modal>
      ) : null}

      {modal?.type === "editChildCost" ? (
        <Modal title={`Edit ${modal.cost.label}`} onClose={() => setModal(null)}>
          <NurseryCostForm
            action={updateChildCost}
            lockedChildId={person.id}
            childrenOptions={[{ id: person.id, name: person.name }]}
            initialValues={modal.cost}
            submitLabel="Save changes"
          />
        </Modal>
      ) : null}
    </>
  );
}
