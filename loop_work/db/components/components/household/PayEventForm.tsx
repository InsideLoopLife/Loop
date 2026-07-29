"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { formatMoney } from "@/lib/format/money";
import { PensionMethod, StudentLoanPlan, estimateAnnualTakeHome, normalisePensionMethod } from "@/lib/calculations/tax";
import {
  MaternityPayMode,
  calculateNhsMaternityGrossPot,
  maternityDefaults,
  maternityForecast,
} from "@/lib/calculations/maternity";

type PersonOption = {
  id: string;
  name: string;
};

type PayKind = "salary" | "maternity" | "return_to_work" | "other";

export type PayEventFormInitialValues = {
  id?: string;
  person_id?: string | null;
  label?: string | null;
  pay_kind?: string | null;
  gross_annual_salary?: number | string | null;
  monthly_take_home_override?: number | string | null;
  pension_percent?: number | string | null;
  pension_method?: PensionMethod | string | null;
  student_loan_plan?: StudentLoanPlan | string | null;
  effective_from?: string | null;
  effective_until?: string | null;
  maternity_scheme?: string | null;
  maternity_leave_start?: string | null;
  maternity_leave_end?: string | null;
  maternity_pay_mode?: MaternityPayMode | string | null;
  maternity_full_pay_weeks?: number | string | null;
  maternity_half_pay_weeks?: number | string | null;
  maternity_smp_only_weeks?: number | string | null;
  maternity_unpaid_weeks?: number | string | null;
  maternity_smp_weekly_rate?: number | string | null;
};

type PayEventFormProps = {
  peopleOptions: PersonOption[];
  action: (formData: FormData) => void | Promise<void>;
  lockedPersonId?: string;
  defaultStudentLoanPlan?: StudentLoanPlan;
  defaultPensionPercent?: number;
  initialValues?: PayEventFormInitialValues;
  submitLabel?: string;
  compact?: boolean;
};

const inputClass = "mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-medium outline-none ring-orange-500 focus:ring-2";
const defaults = maternityDefaults();

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(dateString: string, months: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setMonth(date.getMonth() + months);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function valueToString(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asPayKind(value: unknown): PayKind {
  if (value === "maternity" || value === "return_to_work" || value === "other") return value;
  return "salary";
}

function asStudentLoanPlan(value: unknown, fallback: StudentLoanPlan): StudentLoanPlan {
  if (value === "plan_1" || value === "plan_2" || value === "plan_4" || value === "plan_5" || value === "postgraduate" || value === "none") return value;
  return fallback;
}

function asMaternityPayMode(value: unknown): MaternityPayMode {
  if (value === "actual_by_week") return "actual_by_week";
  return "spread_equal";
}

export function PayEventForm({
  peopleOptions,
  action,
  lockedPersonId,
  defaultStudentLoanPlan = "none",
  defaultPensionPercent = 0,
  initialValues,
  submitLabel = "Add pay event",
  compact = false,
}: PayEventFormProps) {
  const startingKind = asPayKind(initialValues?.pay_kind);
  const startingEffectiveFrom = valueToString(initialValues?.effective_from, currentDate());
  const startingEffectiveUntil = valueToString(initialValues?.effective_until);
  const startingMaternityStart = valueToString(initialValues?.maternity_leave_start, startingEffectiveFrom);
  const startingMaternityEnd = valueToString(initialValues?.maternity_leave_end, startingEffectiveUntil || addMonths(startingMaternityStart, 12));

  const [isAdvanced, setIsAdvanced] = useState(Boolean(initialValues?.id && startingKind === "maternity"));
  const [payKind, setPayKind] = useState<PayKind>(startingKind);
  const [label, setLabel] = useState(valueToString(initialValues?.label));
  const [grossAnnualSalary, setGrossAnnualSalary] = useState(valueToString(initialValues?.gross_annual_salary));
  const [monthlyTakeHomeOverride, setMonthlyTakeHomeOverride] = useState(valueToString(initialValues?.monthly_take_home_override));
  const [pensionPercent, setPensionPercent] = useState(valueToString(initialValues?.pension_percent, String(defaultPensionPercent)));
  const [pensionMethod, setPensionMethod] = useState<PensionMethod>(normalisePensionMethod(initialValues?.pension_method ?? "net_pay"));
  const [studentLoanPlan, setStudentLoanPlan] = useState<StudentLoanPlan>(asStudentLoanPlan(initialValues?.student_loan_plan, defaultStudentLoanPlan));
  const [effectiveFrom, setEffectiveFrom] = useState(startingEffectiveFrom);
  const [effectiveUntil, setEffectiveUntil] = useState(startingEffectiveUntil);
  const [maternityLeaveStart, setMaternityLeaveStart] = useState(startingMaternityStart);
  const [maternityLeaveEnd, setMaternityLeaveEnd] = useState(startingMaternityEnd);
  const [maternityPayMode, setMaternityPayMode] = useState<MaternityPayMode>(asMaternityPayMode(initialValues?.maternity_pay_mode));
  const [fullPayWeeks, setFullPayWeeks] = useState(valueToString(initialValues?.maternity_full_pay_weeks, String(defaults.fullPayWeeks)));
  const [halfPayWeeks, setHalfPayWeeks] = useState(valueToString(initialValues?.maternity_half_pay_weeks, String(defaults.halfPayWeeks)));
  const [smpOnlyWeeks, setSmpOnlyWeeks] = useState(valueToString(initialValues?.maternity_smp_only_weeks, String(defaults.smpOnlyWeeks)));
  const [unpaidWeeks, setUnpaidWeeks] = useState(valueToString(initialValues?.maternity_unpaid_weeks, String(defaults.unpaidWeeks)));
  const [smpWeeklyRate, setSmpWeeklyRate] = useState(valueToString(initialValues?.maternity_smp_weekly_rate, String(defaults.smpWeeklyRate)));

  const grossAnnual = toNumber(grossAnnualSalary);
  const normalEstimate = useMemo(() => estimateAnnualTakeHome({
    grossAnnual,
    pensionPercent: toNumber(pensionPercent),
    pensionMethod,
    studentLoanPlan,
  }), [grossAnnual, pensionPercent, pensionMethod, studentLoanPlan]);

  const maternityInput = useMemo(() => ({
    grossAnnualSalary: grossAnnual,
    leaveStart: maternityLeaveStart,
    leaveEnd: maternityLeaveEnd,
    fullPayWeeks: toNumber(fullPayWeeks),
    halfPayWeeks: toNumber(halfPayWeeks),
    smpOnlyWeeks: toNumber(smpOnlyWeeks),
    unpaidWeeks: toNumber(unpaidWeeks),
    smpWeeklyRate: toNumber(smpWeeklyRate),
    payMode: maternityPayMode,
    pensionPercent: toNumber(pensionPercent),
    pensionMethod,
    studentLoanPlan,
  }), [grossAnnual, maternityLeaveStart, maternityLeaveEnd, fullPayWeeks, halfPayWeeks, smpOnlyWeeks, unpaidWeeks, smpWeeklyRate, maternityPayMode, pensionPercent, pensionMethod, studentLoanPlan]);

  const maternityPot = useMemo(() => calculateNhsMaternityGrossPot(maternityInput), [maternityInput]);
  const maternityMonths = useMemo(() => maternityForecast(maternityInput, compact ? 6 : 12), [maternityInput, compact]);
  const firstMaternityMonth = maternityMonths[0];

  const generatedLabel = payKind === "maternity" && !label
    ? "NHS maternity pay"
    : label;

  const effectiveMonthlyNet = payKind === "maternity"
    ? firstMaternityMonth?.estimatedNetAmount ?? 0
    : monthlyTakeHomeOverride
      ? toNumber(monthlyTakeHomeOverride)
      : normalEstimate.monthlyTakeHome;

  return (
    <form action={action} className="space-y-4">
      {initialValues?.id ? <input type="hidden" name="id" value={initialValues.id} /> : null}
      <input type="hidden" name="pay_kind" value={payKind} />
      <input type="hidden" name="monthly_take_home_override" value={payKind === "maternity" ? "" : monthlyTakeHomeOverride} />
      <input type="hidden" name="maternity_scheme" value={payKind === "maternity" ? "nhs" : ""} />
      <input type="hidden" name="maternity_leave_start" value={payKind === "maternity" ? maternityLeaveStart : ""} />
      <input type="hidden" name="maternity_leave_end" value={payKind === "maternity" ? maternityLeaveEnd : ""} />
      <input type="hidden" name="maternity_pay_mode" value={payKind === "maternity" ? maternityPayMode : ""} />
      <input type="hidden" name="maternity_full_pay_weeks" value={payKind === "maternity" ? fullPayWeeks : ""} />
      <input type="hidden" name="maternity_half_pay_weeks" value={payKind === "maternity" ? halfPayWeeks : ""} />
      <input type="hidden" name="maternity_smp_only_weeks" value={payKind === "maternity" ? smpOnlyWeeks : ""} />
      <input type="hidden" name="maternity_unpaid_weeks" value={payKind === "maternity" ? unpaidWeeks : ""} />
      <input type="hidden" name="maternity_smp_weekly_rate" value={payKind === "maternity" ? smpWeeklyRate : ""} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Pay setup</p>
          <p className="text-xs text-slate-500">Simple handles normal salary and NHS maternity spread. Advanced exposes the maternity week assumptions.</p>
        </div>
        <button
          type="button"
          onClick={() => setIsAdvanced((value) => !value)}
          className={`rounded-full px-4 py-2 text-xs font-bold transition ${isAdvanced ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-700"}`}
        >
          {isAdvanced ? "Advanced on" : "Advanced"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Person</span>
          <select name="person_id" defaultValue={lockedPersonId ?? initialValues?.person_id ?? ""} disabled={Boolean(lockedPersonId)} className={inputClass}>
            <option value="">Unassigned</option>
            {peopleOptions.map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
          {lockedPersonId ? <input type="hidden" name="person_id" value={lockedPersonId} /> : null}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Pay type</span>
          <select value={payKind} onChange={(event) => setPayKind(event.target.value as PayKind)} className={inputClass}>
            <option value="salary">Salary</option>
            <option value="maternity">NHS maternity pay</option>
            <option value="return_to_work">Return to work / salary change</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Label</span>
          <input name="label" value={generatedLabel} onChange={(event) => setLabel(event.target.value)} className={inputClass} placeholder="Band 7, NHS maternity, return to work" required />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Gross annual salary</span>
          <input name="gross_annual_salary" value={grossAnnualSalary} onChange={(event) => setGrossAnnualSalary(event.target.value)} className={inputClass} type="number" step="0.01" placeholder="e.g. 39561" required />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Pension %</span>
          <input name="pension_percent" value={pensionPercent} onChange={(event) => setPensionPercent(event.target.value)} className={inputClass} type="number" step="0.01" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Pension method</span>
          <select name="pension_method" value={pensionMethod} onChange={(event) => setPensionMethod(event.target.value as PensionMethod)} className={inputClass}>
            <option value="net_pay">Net pay pension</option>
            <option value="nhs_pension">NHS pension</option>
            <option value="salary_sacrifice">Salary sacrifice</option>
            <option value="relief_at_source">Relief at source</option>
            <option value="none">No pension deduction</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Student loan plan</span>
          <select name="student_loan_plan" value={studentLoanPlan} onChange={(event) => setStudentLoanPlan(event.target.value as StudentLoanPlan)} className={inputClass}>
            <option value="none">None</option>
            <option value="plan_1">Plan 1</option>
            <option value="plan_2">Plan 2</option>
            <option value="plan_4">Plan 4</option>
            <option value="plan_5">Plan 5</option>
            <option value="postgraduate">Postgraduate</option>
          </select>
        </label>
      </div>

      {payKind === "maternity" ? (
        <div className="space-y-4 rounded-2xl border border-rose-100 bg-rose-50/50 p-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Maternity starts</span>
              <input name="effective_from" value={maternityLeaveStart} onChange={(event) => { setMaternityLeaveStart(event.target.value); setEffectiveFrom(event.target.value); }} className={inputClass} type="date" required />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Maternity ends / return date</span>
              <input name="effective_until" value={maternityLeaveEnd} onChange={(event) => { setMaternityLeaveEnd(event.target.value); setEffectiveUntil(event.target.value); }} className={inputClass} type="date" required />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Pay spread</span>
              <select value={maternityPayMode} onChange={(event) => setMaternityPayMode(event.target.value as MaternityPayMode)} className={inputClass}>
                <option value="spread_equal">Split equally over leave</option>
                <option value="actual_by_week">Actual week-by-week drop</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">SMP weekly rate</span>
              <input value={smpWeeklyRate} onChange={(event) => setSmpWeeklyRate(event.target.value)} className={inputClass} type="number" step="0.01" />
            </label>
          </div>

          {isAdvanced ? (
            <div className="grid gap-4 rounded-2xl border border-orange-100 bg-white p-4 md:grid-cols-4">
              <label className="block"><span className="text-sm font-medium text-slate-700">Full pay weeks</span><input value={fullPayWeeks} onChange={(event) => setFullPayWeeks(event.target.value)} className={inputClass} type="number" step="0.5" /></label>
              <label className="block"><span className="text-sm font-medium text-slate-700">Half pay + SMP weeks</span><input value={halfPayWeeks} onChange={(event) => setHalfPayWeeks(event.target.value)} className={inputClass} type="number" step="0.5" /></label>
              <label className="block"><span className="text-sm font-medium text-slate-700">SMP-only weeks</span><input value={smpOnlyWeeks} onChange={(event) => setSmpOnlyWeeks(event.target.value)} className={inputClass} type="number" step="0.5" /></label>
              <label className="block"><span className="text-sm font-medium text-slate-700">Unpaid weeks</span><input value={unpaidWeeks} onChange={(event) => setUnpaidWeeks(event.target.value)} className={inputClass} type="number" step="0.5" /></label>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live maternity estimate</p>
            <p className="mt-1 text-3xl font-bold text-slate-950">{formatMoney(firstMaternityMonth?.estimatedNetAmount ?? 0)}</p>
            <p className="mt-2 text-sm text-slate-600">Estimated first maternity month take-home. Gross maternity pot: {formatMoney(maternityPot.totalGross)}.</p>
            <p className="mt-1 text-xs text-slate-500">Defaults use 8 weeks full pay, 18 weeks half pay + SMP, 13 weeks SMP-only and 13 weeks unpaid. Adjust in Advanced if your Trust/payroll differs.</p>
          </div>

          {!compact ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">Maternity month forecast</p>
                  <p className="text-xs text-slate-500">Used by the dashboard month-by-month instead of one flat salary.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">NHS simple</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {maternityMonths.map((month) => (
                  <div key={month.month} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{month.label}</p>
                    <p className="mt-1 text-xl font-bold text-slate-950">{formatMoney(month.estimatedNetAmount)}</p>
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">Gross {formatMoney(month.grossAmount)}. {month.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Monthly take-home override</span>
              <input value={monthlyTakeHomeOverride} onChange={(event) => setMonthlyTakeHomeOverride(event.target.value)} className={inputClass} type="number" step="0.01" placeholder="Optional if payslip known" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Effective from</span>
              <input name="effective_from" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className={inputClass} type="date" required />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Effective until</span>
              <input name="effective_until" value={effectiveUntil} onChange={(event) => setEffectiveUntil(event.target.value)} className={inputClass} type="date" />
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live pay estimate</p>
            <p className="mt-1 text-3xl font-bold text-slate-950">{formatMoney(effectiveMonthlyNet)}</p>
            <p className="mt-2 text-sm text-slate-600">Estimated monthly take-home from salary, pension and student loan settings.</p>
          </div>
        </>
      )}

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
