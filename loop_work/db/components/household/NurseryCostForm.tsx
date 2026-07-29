"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import {
  ActivityBillingMode,
  BillingSchedule,
  DaySession,
  FundingMode,
  activityForecast,
  calculateActivityMonthlyCost,
  calculateNurseryMonthlyCost,
  nurseryForecast,
} from "@/lib/calculations/childcare";
import { formatMoney } from "@/lib/format/money";

type ChildOption = {
  id: string;
  name: string;
};

type ChildCostValues = {
  id?: string;
  child_id?: string | null;
  label?: string | null;
  cost_kind?: "fixed" | "nursery" | "activity" | null;
  monthly_cost?: number | null;
  billing_month?: string | null;
  daily_rate?: number | null;
  extra_daily_cost?: number | null;
  funded_hours_per_week?: number | null;
  funding_mode?: FundingMode | null;
  hourly_funding_credit?: number | null;
  term_weeks_per_year?: number | null;
  billing_schedule?: BillingSchedule | null;
  bank_holidays_are_free?: boolean | null;
  tax_free_childcare_enabled?: boolean | null;
  tax_free_childcare_cap_per_quarter?: number | null;
  part_day_multiplier?: number | null;
  full_day_hours?: number | null;
  part_day_hours?: number | null;
  monday_session?: DaySession | null;
  tuesday_session?: DaySession | null;
  wednesday_session?: DaySession | null;
  thursday_session?: DaySession | null;
  friday_session?: DaySession | null;
  monday_hours?: number | null;
  tuesday_hours?: number | null;
  wednesday_hours?: number | null;
  thursday_hours?: number | null;
  friday_hours?: number | null;
  activity_weekly_cost?: number | null;
  activity_weekday?: number | null;
  activity_billing_mode?: ActivityBillingMode | null;
  activity_term_weeks_per_year?: number | null;
  starts_on?: string | null;
  ends_on?: string | null;
};

type NurseryCostFormProps = {
  childrenOptions: ChildOption[];
  action: (formData: FormData) => void | Promise<void>;
  lockedChildId?: string;
  initialValues?: ChildCostValues;
  submitLabel?: string;
};

const inputClass = "mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-medium outline-none ring-orange-500 focus:ring-2";
const dayOptions: { label: string; field: string; session: DaySession }[] = [
  { label: "Mon", field: "monday", session: "off" },
  { label: "Tue", field: "tuesday", session: "off" },
  { label: "Wed", field: "wednesday", session: "off" },
  { label: "Thu", field: "thursday", session: "off" },
  { label: "Fri", field: "friday", session: "off" },
];

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function toNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sessionValue(value: string): DaySession {
  if (value === "full" || value === "part") return value;
  return "off";
}

export function NurseryCostForm({ childrenOptions, action, lockedChildId, initialValues, submitLabel = "Add child cost" }: NurseryCostFormProps) {
  const monthFromInitial = initialValues?.billing_month ? initialValues.billing_month.slice(0, 7) : currentMonth();
  const [costKind, setCostKind] = useState<"fixed" | "nursery" | "activity">(initialValues?.cost_kind ?? "nursery");
  const [isAdvanced, setIsAdvanced] = useState(Boolean(initialValues?.funded_hours_per_week || initialValues?.hourly_funding_credit || initialValues?.monday_hours || initialValues?.tuesday_hours || initialValues?.wednesday_hours || initialValues?.thursday_hours || initialValues?.friday_hours));
  const [billingMonth, setBillingMonth] = useState(monthFromInitial);
  const [monthlyCost, setMonthlyCost] = useState(initialValues?.monthly_cost ? String(initialValues.monthly_cost) : "");
  const [dailyRate, setDailyRate] = useState(initialValues?.daily_rate ? String(initialValues.daily_rate) : "");
  const [extraDailyCost, setExtraDailyCost] = useState(String(initialValues?.extra_daily_cost ?? 0));
  const [fundedHoursPerWeek, setFundedHoursPerWeek] = useState(String(initialValues?.funded_hours_per_week ?? 0));
  const [fundingMode, setFundingMode] = useState<FundingMode>(initialValues?.funding_mode ?? "stretched");
  const [hourlyFundingCredit, setHourlyFundingCredit] = useState(String(initialValues?.hourly_funding_credit ?? 0));
  const [termWeeksPerYear, setTermWeeksPerYear] = useState(String(initialValues?.term_weeks_per_year ?? 38));
  const [billingSchedule, setBillingSchedule] = useState<BillingSchedule>(initialValues?.billing_schedule ?? "all_year");
  const [bankHolidaysAreFree, setBankHolidaysAreFree] = useState(initialValues?.bank_holidays_are_free ?? true);
  const [taxFreeChildcareEnabled, setTaxFreeChildcareEnabled] = useState(initialValues?.tax_free_childcare_enabled ?? true);
  const [taxFreeChildcareCapPerQuarter, setTaxFreeChildcareCapPerQuarter] = useState(String(initialValues?.tax_free_childcare_cap_per_quarter ?? 500));
  const [partDayMultiplier, setPartDayMultiplier] = useState(String(initialValues?.part_day_multiplier ?? 0.5));
  const [fullDayHours, setFullDayHours] = useState(String(initialValues?.full_day_hours ?? 10));
  const [partDayHours, setPartDayHours] = useState(String(initialValues?.part_day_hours ?? 5));
  const [mondaySession, setMondaySession] = useState<DaySession>(initialValues?.monday_session ?? "off");
  const [tuesdaySession, setTuesdaySession] = useState<DaySession>(initialValues?.tuesday_session ?? "off");
  const [wednesdaySession, setWednesdaySession] = useState<DaySession>(initialValues?.wednesday_session ?? "off");
  const [thursdaySession, setThursdaySession] = useState<DaySession>(initialValues?.thursday_session ?? "off");
  const [fridaySession, setFridaySession] = useState<DaySession>(initialValues?.friday_session ?? "off");
  const [mondayHours, setMondayHours] = useState(String(initialValues?.monday_hours ?? 0));
  const [tuesdayHours, setTuesdayHours] = useState(String(initialValues?.tuesday_hours ?? 0));
  const [wednesdayHours, setWednesdayHours] = useState(String(initialValues?.wednesday_hours ?? 0));
  const [thursdayHours, setThursdayHours] = useState(String(initialValues?.thursday_hours ?? 0));
  const [fridayHours, setFridayHours] = useState(String(initialValues?.friday_hours ?? 0));
  const [activityWeeklyCost, setActivityWeeklyCost] = useState(initialValues?.activity_weekly_cost ? String(initialValues.activity_weekly_cost) : "");
  const [activityWeekday, setActivityWeekday] = useState(String(initialValues?.activity_weekday ?? 6));
  const [activityBillingMode, setActivityBillingMode] = useState<ActivityBillingMode>(initialValues?.activity_billing_mode ?? "calendar");
  const [activityTermWeeksPerYear, setActivityTermWeeksPerYear] = useState(String(initialValues?.activity_term_weeks_per_year ?? 38));

  const nurseryInput = useMemo(() => ({
    billingMonth,
    dailyRate: toNumber(dailyRate),
    extraDailyCost: toNumber(extraDailyCost),
    fundedHoursPerWeek: toNumber(fundedHoursPerWeek),
    fundingMode,
    hourlyFundingCredit: toNumber(hourlyFundingCredit),
    termWeeksPerYear: toNumber(termWeeksPerYear),
    billingSchedule,
    bankHolidaysAreFree,
    taxFreeChildcareEnabled,
    taxFreeChildcareCapPerQuarter: toNumber(taxFreeChildcareCapPerQuarter),
    partDayMultiplier: toNumber(partDayMultiplier),
    fullDayHours: toNumber(fullDayHours),
    partDayHours: toNumber(partDayHours),
    mondaySession,
    tuesdaySession,
    wednesdaySession,
    thursdaySession,
    fridaySession,
    mondayHours: isAdvanced ? toNumber(mondayHours) : 0,
    tuesdayHours: isAdvanced ? toNumber(tuesdayHours) : 0,
    wednesdayHours: isAdvanced ? toNumber(wednesdayHours) : 0,
    thursdayHours: isAdvanced ? toNumber(thursdayHours) : 0,
    fridayHours: isAdvanced ? toNumber(fridayHours) : 0,
  }), [billingMonth, dailyRate, extraDailyCost, fundedHoursPerWeek, fundingMode, hourlyFundingCredit, termWeeksPerYear, billingSchedule, bankHolidaysAreFree, taxFreeChildcareEnabled, taxFreeChildcareCapPerQuarter, partDayMultiplier, fullDayHours, partDayHours, mondaySession, tuesdaySession, wednesdaySession, thursdaySession, fridaySession, isAdvanced, mondayHours, tuesdayHours, wednesdayHours, thursdayHours, fridayHours]);

  const activityInput = useMemo(() => ({
    billingMonth,
    weeklyCost: toNumber(activityWeeklyCost),
    activityWeekday: toNumber(activityWeekday),
    activityBillingMode,
    activityTermWeeksPerYear: toNumber(activityTermWeeksPerYear),
    bankHolidaysAreFree,
  }), [billingMonth, activityWeeklyCost, activityWeekday, activityBillingMode, activityTermWeeksPerYear, bankHolidaysAreFree]);

  const nurseryEstimate = useMemo(() => calculateNurseryMonthlyCost(nurseryInput), [nurseryInput]);
  const activityEstimate = useMemo(() => calculateActivityMonthlyCost(activityInput), [activityInput]);
  const nurseryMonths = useMemo(() => nurseryForecast(nurseryInput, 12), [nurseryInput]);
  const activityMonths = useMemo(() => activityForecast(activityInput, 12), [activityInput]);

  const effectiveMonthlyCost = costKind === "nursery"
    ? nurseryEstimate.estimatedMonthlyCost
    : costKind === "activity"
      ? activityEstimate.estimatedMonthlyCost
      : toNumber(monthlyCost);

  function renderSessionSelect(label: string, value: DaySession, setter: (value: DaySession) => void, name: string) {
    return (
      <label className="block">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <select name={name} value={value} onChange={(event) => setter(sessionValue(event.target.value))} className={inputClass}>
          <option value="off">Not attending</option>
          <option value="full">Full day</option>
          <option value="part">Part day</option>
        </select>
      </label>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {initialValues?.id ? <input type="hidden" name="id" value={initialValues.id} /> : null}
      <input type="hidden" name="monthly_cost" value={effectiveMonthlyCost.toFixed(2)} />
      <input type="hidden" name="bank_holidays_are_free" value={bankHolidaysAreFree ? "true" : "false"} />
      <input type="hidden" name="tax_free_childcare_enabled" value={taxFreeChildcareEnabled ? "true" : "false"} />
      <input type="hidden" name="tax_free_childcare_cap_per_quarter" value={taxFreeChildcareCapPerQuarter} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950">Cost setup</p>
          <p className="text-xs text-slate-500">Use simple for quick planning. Advanced exposes funded-hour and hourly assumptions.</p>
        </div>
        <button
          type="button"
          onClick={() => setIsAdvanced((value) => !value)}
          className={`rounded-full px-4 py-2 text-xs font-bold transition ${isAdvanced ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-700"}`}
        >
          {isAdvanced ? "Advanced on" : "Advanced"}
        </button>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Child</span>
        <select name="child_id" defaultValue={lockedChildId ?? ""} disabled={Boolean(lockedChildId)} className={inputClass}>
          <option value="">Unassigned</option>
          {childrenOptions.map((child) => (
            <option key={child.id} value={child.id}>{child.name}</option>
          ))}
        </select>
        {lockedChildId ? <input type="hidden" name="child_id" value={lockedChildId} /> : null}
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Cost type</span>
        <select name="cost_kind" value={costKind} onChange={(event) => setCostKind(event.target.value as "fixed" | "nursery" | "activity")} className={inputClass}>
          <option value="nursery">Nursery / childcare calculator</option>
          <option value="activity">Activity / weekly class</option>
          <option value="fixed">Fixed monthly child cost</option>
        </select>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Label</span>
        <input name="label" defaultValue={initialValues?.label ?? ""} className={inputClass} placeholder="Nursery, swimming, dancing, wraparound care" required />
      </label>

      {costKind === "fixed" ? (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Monthly cost</span>
          <input value={monthlyCost} onChange={(event) => setMonthlyCost(event.target.value)} className={inputClass} type="number" step="0.01" placeholder="e.g. 250" />
        </label>
      ) : null}

      {costKind === "activity" ? (
        <div className="space-y-4 rounded-2xl border border-purple-100 bg-purple-50/50 p-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Planning month</span>
              <input name="billing_month" value={billingMonth} onChange={(event) => setBillingMonth(event.target.value)} className={inputClass} type="month" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Weekly/session cost</span>
              <input name="activity_weekly_cost" value={activityWeeklyCost} onChange={(event) => setActivityWeeklyCost(event.target.value)} className={inputClass} type="number" step="0.01" placeholder="e.g. 8.50" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Day attended</span>
              <select name="activity_weekday" value={activityWeekday} onChange={(event) => setActivityWeekday(event.target.value)} className={inputClass}>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
                <option value="0">Sunday</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Billing style</span>
              <select name="activity_billing_mode" value={activityBillingMode} onChange={(event) => setActivityBillingMode(event.target.value as ActivityBillingMode)} className={inputClass}>
                <option value="calendar">Count sessions in each month</option>
                <option value="averaged_term">Average across term weeks</option>
              </select>
            </label>
          </div>

          {activityBillingMode === "averaged_term" ? (
            <label className="block max-w-sm">
              <span className="text-sm font-medium text-slate-700">Term weeks per year</span>
              <input name="activity_term_weeks_per_year" value={activityTermWeeksPerYear} onChange={(event) => setActivityTermWeeksPerYear(event.target.value)} className={inputClass} type="number" step="0.5" />
            </label>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={bankHolidaysAreFree} onChange={(event) => setBankHolidaysAreFree(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Do not charge sessions that fall on England/Wales bank holidays
          </label>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live estimate</p>
            <p className="mt-1 text-3xl font-bold text-slate-950">{formatMoney(activityEstimate.estimatedMonthlyCost)}</p>
            <p className="mt-1 text-xs text-slate-500">{activityEstimate.explanation}</p>
          </div>
        </div>
      ) : null}

      {costKind === "nursery" ? (
        <div className="space-y-4 rounded-2xl border border-sky-100 bg-sky-50/50 p-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Planning month</span>
              <input name="billing_month" value={billingMonth} onChange={(event) => setBillingMonth(event.target.value)} className={inputClass} type="month" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Daily rate</span>
              <input name="daily_rate" value={dailyRate} onChange={(event) => setDailyRate(event.target.value)} className={inputClass} type="number" step="0.01" placeholder="e.g. 78" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Billing schedule</span>
              <select name="billing_schedule" value={billingSchedule} onChange={(event) => setBillingSchedule(event.target.value as BillingSchedule)} className={inputClass}>
                <option value="all_year">Full-time / all year</option>
                <option value="term_time">Term-time averaged</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Part-day charge %</span>
              <input name="part_day_multiplier" value={partDayMultiplier} onChange={(event) => setPartDayMultiplier(event.target.value)} className={inputClass} type="number" step="0.05" min="0" max="1" />
            </label>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-800">Days attending</p>
            <p className="text-xs text-slate-500">Simple mode uses full day / part day. Advanced can override with exact hours.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-5">
              {renderSessionSelect("Mon", mondaySession, setMondaySession, "monday_session")}
              {renderSessionSelect("Tue", tuesdaySession, setTuesdaySession, "tuesday_session")}
              {renderSessionSelect("Wed", wednesdaySession, setWednesdaySession, "wednesday_session")}
              {renderSessionSelect("Thu", thursdaySession, setThursdaySession, "thursday_session")}
              {renderSessionSelect("Fri", fridaySession, setFridaySession, "friday_session")}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 rounded-2xl border border-white bg-white/70 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={bankHolidaysAreFree} onChange={(event) => setBankHolidaysAreFree(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Bank holidays are free / not charged
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-white bg-white/70 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={taxFreeChildcareEnabled} onChange={(event) => setTaxFreeChildcareEnabled(event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Apply Tax-Free Childcare 20% top-up offset
            </label>
          </div>

          {isAdvanced ? (
            <div className="space-y-4 rounded-2xl border border-orange-100 bg-white p-4">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Extra daily cost</span>
                  <input name="extra_daily_cost" value={extraDailyCost} onChange={(event) => setExtraDailyCost(event.target.value)} className={inputClass} type="number" step="0.01" placeholder="Meals / consumables" />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Funded hours / week</span>
                  <input name="funded_hours_per_week" value={fundedHoursPerWeek} onChange={(event) => setFundedHoursPerWeek(event.target.value)} className={inputClass} type="number" step="0.25" />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Funded hourly credit</span>
                  <input name="hourly_funding_credit" value={hourlyFundingCredit} onChange={(event) => setHourlyFundingCredit(event.target.value)} className={inputClass} type="number" step="0.01" placeholder="Nursery £/hour deduction" />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Funding mode</span>
                  <select name="funding_mode" value={fundingMode} onChange={(event) => setFundingMode(event.target.value as FundingMode)} className={inputClass}>
                    <option value="none">No funded hours</option>
                    <option value="stretched">Stretched across the year</option>
                    <option value="term_time">Term-time style estimate</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Term weeks/year</span>
                  <input name="term_weeks_per_year" value={termWeeksPerYear} onChange={(event) => setTermWeeksPerYear(event.target.value)} className={inputClass} type="number" step="0.5" />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Full/part hours</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input name="full_day_hours" value={fullDayHours} onChange={(event) => setFullDayHours(event.target.value)} className={inputClass} type="number" step="0.25" placeholder="Full" />
                    <input name="part_day_hours" value={partDayHours} onChange={(event) => setPartDayHours(event.target.value)} className={inputClass} type="number" step="0.25" placeholder="Part" />
                  </div>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Tax-Free Childcare cap / quarter</span>
                  <input name="tax_free_childcare_cap_per_quarter_visible" value={taxFreeChildcareCapPerQuarter} onChange={(event) => setTaxFreeChildcareCapPerQuarter(event.target.value)} className={inputClass} type="number" step="0.01" placeholder="500" />
                </label>
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-800">Exact hours override</p>
                <p className="text-xs text-slate-500">Only use this if the nursery funding needs precise hours. Leave as 0 to use full/part-day simple mode.</p>
                <div className="mt-3 grid gap-3 md:grid-cols-5">
                  <label className="block"><span className="text-xs font-medium text-slate-600">Mon</span><input name="monday_hours" value={mondayHours} onChange={(event) => setMondayHours(event.target.value)} className={inputClass} type="number" step="0.25" /></label>
                  <label className="block"><span className="text-xs font-medium text-slate-600">Tue</span><input name="tuesday_hours" value={tuesdayHours} onChange={(event) => setTuesdayHours(event.target.value)} className={inputClass} type="number" step="0.25" /></label>
                  <label className="block"><span className="text-xs font-medium text-slate-600">Wed</span><input name="wednesday_hours" value={wednesdayHours} onChange={(event) => setWednesdayHours(event.target.value)} className={inputClass} type="number" step="0.25" /></label>
                  <label className="block"><span className="text-xs font-medium text-slate-600">Thu</span><input name="thursday_hours" value={thursdayHours} onChange={(event) => setThursdayHours(event.target.value)} className={inputClass} type="number" step="0.25" /></label>
                  <label className="block"><span className="text-xs font-medium text-slate-600">Fri</span><input name="friday_hours" value={fridayHours} onChange={(event) => setFridayHours(event.target.value)} className={inputClass} type="number" step="0.25" /></label>
                </div>
              </div>
            </div>
          ) : (
            <>
              <input type="hidden" name="extra_daily_cost" value={extraDailyCost} />
              <input type="hidden" name="funded_hours_per_week" value={fundedHoursPerWeek} />
              <input type="hidden" name="funding_mode" value={fundingMode} />
              <input type="hidden" name="hourly_funding_credit" value={hourlyFundingCredit} />
              <input type="hidden" name="term_weeks_per_year" value={termWeeksPerYear} />
              <input type="hidden" name="full_day_hours" value={fullDayHours} />
              <input type="hidden" name="part_day_hours" value={partDayHours} />
              <input type="hidden" name="monday_hours" value="0" />
              <input type="hidden" name="tuesday_hours" value="0" />
              <input type="hidden" name="wednesday_hours" value="0" />
              <input type="hidden" name="thursday_hours" value="0" />
              <input type="hidden" name="friday_hours" value="0" />
            </>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Live estimate</p>
            <p className="mt-1 text-3xl font-bold text-slate-950">{formatMoney(nurseryEstimate.estimatedMonthlyCost)}</p>
            <p className="mt-2 text-sm text-slate-600">Gross {formatMoney(nurseryEstimate.grossCost)} minus funded-hours credit {formatMoney(nurseryEstimate.fundingCredit)} and Tax-Free Childcare top-up {formatMoney(nurseryEstimate.taxFreeChildcareTopUp)}.</p>
            <p className="mt-1 text-xs text-slate-500">{nurseryEstimate.explanation}</p>
          </div>
        </div>
      ) : null}

      {(costKind === "nursery" || costKind === "activity") ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-950">Next 12 months estimate</p>
              <p className="text-xs text-slate-500">Each month is recalculated using the actual weekdays in that calendar month.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Calendar view</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(costKind === "nursery" ? nurseryMonths : activityMonths).map((month) => (
              <div key={month.month} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{month.label}</p>
                <p className="mt-1 text-xl font-bold text-slate-950">{formatMoney(month.amount)}</p>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">{month.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Starts on</span>
          <input name="starts_on" type="date" required defaultValue={initialValues?.starts_on ?? ""} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Ends on</span>
          <input name="ends_on" type="date" defaultValue={initialValues?.ends_on ?? ""} className={inputClass} />
        </label>
      </div>

      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
