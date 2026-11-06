"use client";

// A payslip for one pay record: everything that comes off, line by line, with
// a dropdown on each so the person can see and correct how LOOP is treating
// their pay. Changes save straight away through the same pay record, so the
// month plan, calendar, Money in & out and forecasts all follow.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Plus } from "lucide-react";
import { deleteIncomeDeduction, updatePaySettings } from "@/app/income/actions";
import { addPayEventMonthlyOverride } from "@/app/household/actions";
import { estimateAnnualTakeHome } from "@/lib/calculations/tax";
import { deductionsForMonth } from "@/lib/planning/month-plan";
import { formatMoney } from "@/lib/format/money";

type PayEventLike = {
  id: string;
  person_id: string | null;
  label: string;
  pay_kind?: string | null;
  gross_annual_salary: number;
  monthly_take_home_override?: number | null;
  pension_percent: number;
  pension_method?: string | null;
  student_loan_plan?: string | null;
  tax_region?: string | null;
  deductions?: any[];
};

export type PensionAccountLike = { id: string; person_id: string | null; label?: string | null; provider?: string | null; contribution_method?: string | null; employee_contribution_percent?: number | null };

const PENSION_METHODS = [
  { value: "salary_sacrifice", label: "Salary sacrifice", detail: "Before tax and NI" },
  { value: "net_pay", label: "Taken before tax", detail: "Before tax, not NI" },
  { value: "relief_at_source", label: "Relief at source", detail: "After tax, provider claims 20% back" },
  { value: "nhs_pension", label: "NHS Pension", detail: "Rate set by pay band" },
  { value: "none", label: "No pension", detail: "" },
];
const LOAN_PLANS = [
  { value: "none", label: "No student loan" },
  { value: "plan_1", label: "Plan 1" },
  { value: "plan_2", label: "Plan 2" },
  { value: "plan_4", label: "Plan 4 (Scotland)" },
  { value: "plan_5", label: "Plan 5" },
  { value: "postgraduate", label: "Postgraduate" },
];
const DEDUCTION_LABELS: Record<string, string> = {
  car_salary_sacrifice: "Car scheme",
  cycle_to_work: "Cycle to work",
  additional_pension: "Extra pension",
  other: "Other",
};

const selectClass = "rounded-[10px] border border-[var(--line)] bg-white px-2.5 py-1.5 text-sm text-[var(--ink)]";

function Row({ label, control, amount, minus = true, strong = false }: { label: string; control?: React.ReactNode; amount: number; minus?: boolean; strong?: boolean }) {
  return (
    <div className={`grid grid-cols-[1fr_auto] items-center gap-3 py-2.5 ${strong ? "border-t border-[var(--ink)] pt-3" : "border-t border-[var(--line)]"}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className={strong ? "font-semibold text-[var(--ink)]" : "text-[var(--ink)]"}>{label}</span>
        {control}
      </div>
      <span className={`tabular-nums ${strong ? "text-lg font-semibold text-[var(--ink)]" : "text-[var(--ink)]"}`}>
        {minus && amount > 0 ? "−" : ""}{formatMoney(amount)}
      </span>
    </div>
  );
}

export function PayslipPanel({
  event,
  month,
  pensionAccounts,
  onAddDeduction,
}: {
  event: PayEventLike;
  month: string;
  pensionAccounts: PensionAccountLike[];
  onAddDeduction: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [actual, setActual] = useState("");
  const [percent, setPercent] = useState(String(event.pension_percent ?? 0));

  const deductions = deductionsForMonth(event, month);
  const breakdown = useMemo(() => estimateAnnualTakeHome({
    grossAnnual: Number(event.gross_annual_salary || 0),
    pensionPercent: Number(event.pension_percent || 0),
    pensionMethod: (event.pension_method || "net_pay") as any,
    studentLoanPlan: (event.student_loan_plan || "none") as any,
    taxRegion: event.tax_region,
    deductions,
  }), [event, deductions]);
  const m = (annual: number) => annual / 12;
  const takeHome = event.monthly_take_home_override != null ? Number(event.monthly_take_home_override) : m(breakdown.annualTakeHome);
  const pensionLabel = event.pension_method === "relief_at_source" ? "Pension (after tax relief)" : "Pension";

  // Does this pay agree with the pension account for the same person?
  const account = pensionAccounts.find((a) => a.person_id === event.person_id && a.contribution_method && a.contribution_method !== "none");
  const methodMismatch = account && account.contribution_method !== event.pension_method;
  const percentMismatch = account && account.employee_contribution_percent != null && Number(account.employee_contribution_percent) > 0 && Math.abs(Number(account.employee_contribution_percent) - Number(event.pension_percent)) > 0.01;

  const actualNumber = Number(actual.replace(/[£,\s]/g, "")) || 0;
  const diff = actualNumber ? actualNumber - takeHome : 0;

  function save(fields: Record<string, string>) {
    const fd = new FormData();
    fd.set("id", event.id);
    if (event.person_id) fd.set("person_id", event.person_id);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    startTransition(async () => {
      await updatePaySettings(fd);
      router.refresh();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    });
  }

  function useActualForMonth() {
    const fd = new FormData();
    fd.set("pay_event_id", event.id);
    if (event.person_id) fd.set("person_id", event.person_id);
    fd.set("month", month);
    fd.set("net_pay_override", String(actualNumber));
    fd.set("source", "payslip");
    fd.set("notes", "Take-home from payslip");
    startTransition(async () => {
      await addPayEventMonthlyOverride(fd);
      router.refresh();
      setActual("");
    });
  }

  function removeDeduction(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => { await deleteIncomeDeduction(fd); router.refresh(); });
  }

  return (
    <div className="rounded-[14px] bg-[var(--paper)] p-4 sm:p-5">
      {(methodMismatch || percentMismatch) && account ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[12px] border border-[#ead9b5] bg-[#fbf5e8] px-4 py-3 text-sm text-[var(--ink)]">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--amber)]" />
          <span className="min-w-0 flex-1">
            Your pension account ({account.label || account.provider || "workplace pension"}) says
            {methodMismatch ? ` ${PENSION_METHODS.find((p) => p.value === account.contribution_method)?.label.toLowerCase() || account.contribution_method}` : ""}
            {percentMismatch ? ` at ${Number(account.employee_contribution_percent)}%` : ""}. This pay doesn&apos;t match, so take-home may be off.
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => save({
              ...(methodMismatch ? { pension_method: String(account.contribution_method) } : {}),
              ...(percentMismatch ? { pension_percent: String(account.employee_contribution_percent) } : {}),
            })}
            className="rounded-full bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-white"
          >
            Match pension account
          </button>
        </div>
      ) : null}

      <div className="text-[15px]">
        <Row label="Gross pay" amount={m(Number(event.gross_annual_salary || 0))} minus={false} />

        <Row
          label={pensionLabel}
          amount={m(breakdown.pensionNetDeduction)}
          control={
            <span className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-[10px] border border-[var(--line)] bg-white pr-2">
                <input
                  value={percent}
                  inputMode="decimal"
                  onChange={(e) => setPercent(e.target.value)}
                  onBlur={() => { if (Number(percent) !== Number(event.pension_percent)) save({ pension_percent: percent }); }}
                  className="w-14 !border-0 bg-transparent px-2 py-1.5 text-sm"
                  aria-label="Pension percent"
                  disabled={event.pension_method === "nhs_pension"}
                />
                <span className="text-sm text-[var(--muted)]">%</span>
              </span>
              <select value={event.pension_method || "net_pay"} onChange={(e) => save({ pension_method: e.target.value })} className={selectClass} aria-label="How your pension is taken">
                {PENSION_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}{p.detail ? ` — ${p.detail}` : ""}</option>)}
              </select>
            </span>
          }
        />

        {deductions.filter((d) => d.beforeTax).map((d, i) => (
          <Row key={`b${i}`} label={`${d.label} · before tax`} amount={d.monthlyAmount} />
        ))}

        <Row
          label="Income tax"
          amount={m(breakdown.incomeTax)}
          control={
            <select value={event.tax_region === "scotland" ? "scotland" : "rUK"} onChange={(e) => save({ tax_region: e.target.value })} className={selectClass} aria-label="Where you pay income tax">
              <option value="rUK">England, Wales or NI rates</option>
              <option value="scotland">Scottish rates</option>
            </select>
          }
        />
        <Row label="National Insurance" amount={m(breakdown.nationalInsurance)} />
        <Row
          label="Student loan"
          amount={m(breakdown.studentLoan)}
          control={
            <select value={event.student_loan_plan || "none"} onChange={(e) => save({ student_loan_plan: e.target.value })} className={selectClass} aria-label="Student loan plan">
              {LOAN_PLANS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          }
        />

        {deductions.filter((d) => !d.beforeTax).map((d, i) => (
          <Row key={`a${i}`} label={d.label} amount={d.monthlyAmount} />
        ))}

        <Row label="Take-home" amount={takeHome} minus={false} strong />
      </div>

      {(event.deductions || []).length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {(event.deductions || []).map((d: any) => (
            <span key={d.id} className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs text-[var(--muted)]">
              {DEDUCTION_LABELS[d.deduction_type] || "Deduction"}: {d.label} {formatMoney(d.monthly_amount)}/mo
              <button type="button" onClick={() => removeDeduction(d.id)} className="text-[var(--brick)]" aria-label={`Remove ${d.label}`}>×</button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onAddDeduction} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-sm text-[var(--ink)] hover:bg-[var(--paper)]">
          <Plus className="h-4 w-4" /> Add something else that comes off
        </button>
        <span className="text-xs text-[var(--muted)]" aria-live="polite">{pending ? "Saving…" : saved ? <span className="inline-flex items-center gap-1 text-[var(--pine)]"><Check className="h-3.5 w-3.5" /> Saved</span> : null}</span>
      </div>

      <div className="mt-4 border-t border-[var(--line)] pt-4">
        <label className="flex flex-wrap items-center gap-3 text-sm text-[var(--ink)]">
          <span>Check against your payslip. Take-home was</span>
          <span className="inline-flex items-center rounded-[10px] border border-[var(--line)] bg-white pl-2">
            <span className="text-[var(--muted)]">£</span>
            <input value={actual} onChange={(e) => setActual(e.target.value)} inputMode="decimal" placeholder={takeHome.toFixed(2)} className="w-28 !border-0 bg-transparent px-2 py-1.5 text-sm" />
          </span>
        </label>
        {actualNumber ? (
          Math.abs(diff) < 5 ? (
            <p className="mt-2 text-sm text-[var(--pine)]">That matches LOOP to within £5.</p>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--ink)]">
              <span>
                LOOP is {formatMoney(Math.abs(diff))} {diff > 0 ? "under" : "over"}.{" "}
                {diff > 0
                  ? "Check the pension method, or whether a deduction above has ended."
                  : "Is there a deduction missing, like a car scheme or union fees?"}
              </span>
              <button type="button" disabled={pending} onClick={useActualForMonth} className="rounded-full bg-[var(--ink)] px-3 py-1.5 text-xs font-medium text-white">Use my payslip figure for this month</button>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
