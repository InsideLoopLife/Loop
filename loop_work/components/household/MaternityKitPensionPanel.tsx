"use client";

import { useMemo, useState } from "react";
import { formatMoneyExact } from "@/lib/format/money";
import {
  DEFAULT_KIT_ALLOWANCE,
  DEFAULT_SPLIT_ALLOWANCE,
  calculateMaternityPensionArrears,
  kitDayBreakdown,
  kitSummary,
  type KitPayMethod,
  type MaternityExtras,
  type NhsMaternityInput,
  type PensionArrearsBasis,
} from "@/lib/calculations/maternity";

const inputClass = "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 focus:border-orange-400 focus:ring-2";

const PHASE_LABEL: Record<string, string> = {
  full_pay: "Full pay",
  half_pay_smp: "Half pay + SMP",
  smp_only: "SMP only",
  unpaid: "Unpaid",
  outside: "Outside leave",
};

/**
 * KIT/SPLIT days + NHS pension buy-back for a maternity pay event.
 * The parent owns `extras` state and serialises it into a hidden `maternity_extras` input.
 */
export function MaternityKitPensionPanel({
  maternityInput,
  extras,
  onChange,
  compact = false,
}: {
  maternityInput: NhsMaternityInput;
  extras: MaternityExtras;
  onChange: (next: MaternityExtras) => void;
  compact?: boolean;
}) {
  const [newKitDate, setNewKitDate] = useState("");
  const [newKitHours, setNewKitHours] = useState("");

  const input = useMemo(() => ({ ...maternityInput, extras }), [maternityInput, extras]);
  const breakdown = useMemo(() => kitDayBreakdown(input), [input]);
  const summary = useMemo(() => kitSummary(input), [input]);
  const arrears = useMemo(() => calculateMaternityPensionArrears(input), [input]);

  const set = (patch: Partial<MaternityExtras>) => onChange({ ...extras, ...patch });

  function addKitDay() {
    if (!newKitDate || extras.kitDays.some((d) => d.date === newKitDate)) return;
    const hours = Number(newKitHours);
    set({
      kitDays: [...extras.kitDays, { date: newKitDate, hours: Number.isFinite(hours) && hours > 0 ? hours : null }]
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
    setNewKitDate("");
    setNewKitHours("");
  }

  function removeKitDay(date: string) {
    set({ kitDays: extras.kitDays.filter((d) => d.date !== date) });
  }

  return (
    <div className="space-y-4">
      {/* ------------------------------ KIT days ------------------------------ */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-950">Keeping in touch days</p>
            <p className="text-xs text-slate-500">Work days during leave. Any work on a day uses one full day of the allowance, even an hour.</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${summary.overAllowance > 0 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
            {summary.used}/{summary.allowance} used
          </span>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Leave type</span>
            <select value={String(extras.kitAllowance)} onChange={(e) => set({ kitAllowance: Number(e.target.value) })} className={inputClass}>
              <option value={DEFAULT_KIT_ALLOWANCE}>Maternity / adoption (10 KIT)</option>
              <option value={DEFAULT_SPLIT_ALLOWANCE}>Shared parental (20 SPLIT)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">How KIT days are paid</span>
            <select value={extras.kitPayMethod} onChange={(e) => set({ kitPayMethod: e.target.value as KitPayMethod })} className={inputClass}>
              <option value="afc_top_up">NHS AfC: basic pay less maternity pay</option>
              <option value="full_in_addition">Full basic pay on top</option>
              <option value="time_in_lieu">Time in lieu (no extra pay)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Contracted hours / week</span>
            <input defaultValue={extras.contractedWeeklyHours} onBlur={(e) => set({ contractedWeeklyHours: Number(e.target.value) > 0 ? Number(e.target.value) : 37.5 })} className={inputClass} type="number" step="0.5" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Default KIT day hours</span>
            <input defaultValue={extras.kitDayHours} onBlur={(e) => set({ kitDayHours: Number(e.target.value) > 0 ? Number(e.target.value) : 7.5 })} className={inputClass} type="number" step="0.25" />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">KIT date</span>
            <input value={newKitDate} onChange={(e) => setNewKitDate(e.target.value)} min={maternityInput.leaveStart} max={maternityInput.leaveEnd} className={inputClass} type="date" />
          </label>
          <label className="block w-28">
            <span className="text-sm font-medium text-slate-700">Hours</span>
            <input value={newKitHours} onChange={(e) => setNewKitHours(e.target.value)} placeholder={String(extras.kitDayHours)} className={inputClass} type="number" step="0.25" />
          </label>
          <button type="button" onClick={addKitDay} disabled={!newKitDate} className="rounded-full bg-orange-500 px-5 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40">
            Add KIT day
          </button>
        </div>

        {breakdown.length > 0 ? (
          <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-100">
            {breakdown.map((day) => (
              <div key={day.date} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {new Date(`${day.date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                    <span className="ml-2 text-xs font-medium text-slate-500">{day.hours}h · {PHASE_LABEL[day.phase]}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {day.phase === "outside"
                      ? "Outside the leave dates, so not counted."
                      : day.overAllowance
                        ? "Over the allowance. Working this day would normally end the leave, so check with payroll."
                        : extras.kitPayMethod === "time_in_lieu"
                          ? "Time in lieu on return."
                          : `Basic ${formatMoneyExact(day.basicPay)}${extras.kitPayMethod === "afc_top_up" ? ` − maternity pay ${formatMoneyExact(day.maternityPayForDay)}` : ""}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-bold text-slate-950">{formatMoneyExact(day.kitPay)}</span>
                  <button type="button" onClick={() => removeKitDay(day.date)} className="text-xs font-bold text-slate-400 hover:text-rose-600" aria-label={`Remove KIT day ${day.date}`}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">No KIT days planned yet. Add them to see the extra pay land in the right month.</p>
        )}

        {summary.totalKitPay > 0 ? (
          <p className="mt-3 text-sm text-slate-700">
            Extra gross KIT pay across the leave: <span className="font-bold">{formatMoneyExact(summary.totalKitPay)}</span>. Taxed and pensionable as normal, and included in the month forecast.
          </p>
        ) : null}
      </div>

      {/* --------------------------- Pension arrears -------------------------- */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
        <p className="font-semibold text-slate-950">Paying back the pension (unpaid leave)</p>
        <p className="text-xs text-slate-500">
          Unpaid weeks only count towards the NHS pension if the missed member contributions are paid. Payroll takes them from pay after the return, usually over the same length of time as the unpaid leave. Arrange it with payroll before the unpaid leave starts.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className="flex items-center gap-3 md:col-span-4">
            <input type="checkbox" checked={extras.pensionArrearsOptIn} onChange={(e) => set({ pensionArrearsOptIn: e.target.checked })} className="h-5 w-5 rounded border-slate-300" />
            <span className="text-sm font-medium text-slate-800">Buy back the unpaid weeks</span>
          </label>
          {extras.pensionArrearsOptIn ? (
            <>
              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-slate-700">Contributions based on</span>
                <select value={extras.pensionArrearsBasis} onChange={(e) => set({ pensionArrearsBasis: e.target.value as PensionArrearsBasis })} className={inputClass}>
                  <option value="full_salary">Full salary (prudent)</option>
                  <option value="pay_before_unpaid">Pay just before unpaid leave (SMP)</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Repay over (months)</span>
                <input value={extras.pensionArrearsMonths ?? ""} onChange={(e) => set({ pensionArrearsMonths: e.target.value ? Math.max(1, Math.round(Number(e.target.value))) : null })} placeholder={arrears.unpaidDays ? String(Math.max(1, Math.ceil(arrears.unpaidDays / 30.44))) : "auto"} className={inputClass} type="number" min={1} step={1} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">First deduction month</span>
                <input value={extras.pensionArrearsStartMonth ?? ""} onChange={(e) => set({ pensionArrearsStartMonth: e.target.value || null })} className={inputClass} type="month" />
              </label>
            </>
          ) : null}
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          {arrears.unpaidDays > 0 ? (
            <p className="text-xs text-slate-500">
              Unpaid leave {arrears.unpaidStart} → {arrears.unpaidEnd} ({(arrears.unpaidDays / 7).toFixed(1)} weeks) at {arrears.memberRatePercent}% member rate.
            </p>
          ) : null}
          {arrears.optedIn && arrears.schedule.length > 0 ? (
            <>
              <p className="mt-1 text-2xl font-bold text-slate-950">
                {formatMoneyExact(arrears.monthlyNetCost)}<span className="text-sm font-medium text-slate-500"> / month after tax relief</span>
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {formatMoneyExact(arrears.totalArrears)} gross ({formatMoneyExact(arrears.monthlyInstalment)}/month) over {arrears.months} month{arrears.months === 1 ? "" : "s"}: {arrears.schedule[0].label}
                {arrears.months > 1 ? ` – ${arrears.schedule[arrears.schedule.length - 1].label}` : ""}. Shows as an outgoing in those months.
              </p>
              {!compact ? <p className="mt-1 text-[11px] text-slate-500">{arrears.explanation}</p> : null}
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-700">{arrears.explanation}</p>
          )}
        </div>
      </div>
    </div>
  );
}
