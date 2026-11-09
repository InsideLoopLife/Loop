// lib/calendar/materialize.ts
//
// Turns real Loop data into calendar_events rows for a household:
//   - planned_items  -> payment_due / income_expected on each due date
//   - pay_events     -> income_expected on each pay day, with take-home pay
//   - home_mortgage_deals -> payment_due on the mortgage payment day
//   - food_logs      -> calorie_progress per person per day
// Runs daily from /api/cron/calendar-sync (called by the rates worker's
// maintenance list) and right after guided setup.
//
// Amounts and pay-date rules come from existing logic: take-home pay uses
// getPayAmount (same tax/NI/pension/student-loan/maternity maths as the
// month plan). Weekend pay days move to the previous working day; bank
// holidays are not yet applied.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveHouseholdContext } from "@/domains/identity/household";
import { getPayAmount, mortgageDealMonthlyPayment, selectActivePayEventsForMonth, type HomeMortgageDealForPlan, type PayEventForPlan } from "@/lib/planning/month-plan";
import { withPayOverrides } from "@/lib/planning/pay-overrides";
import { maternityInputFromPayEvent, pensionArrearsForMonth } from "@/lib/calculations/maternity";
import type { CalorieProgressMetadata } from "./types";

const WINDOW_DAYS = 45;
const DEFAULT_CALORIE_TARGET = 2200; // matches DAILY_TARGETS.calories in NutritionClient.tsx
const DAY_MS = 86_400_000;

type PlannedItem = {
  id: string;
  user_id: string;
  person_id: string | null;
  direction: string;
  label: string;
  amount: number;
  recurrence: string;
  recurrence_interval_days: number | null;
  start_date: string;
  end_date: string | null;
  day_of_month: number | null;
  payment_adjustment: string | null;
};

type MaterializeOptions = { db: SupabaseClient; household: ActiveHouseholdContext; today?: Date };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (dateString: string) => new Date(`${dateString}T00:00:00Z`);
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** A day-of-month in a given month, clamped (31st in February -> 28th/29th). */
function dayInMonth(y: number, m: number, day: number) {
  return new Date(Date.UTC(y, m, Math.min(Math.max(1, day), daysInMonth(y, m))));
}

/** Saturday/Sunday -> the Friday before (UK payroll/direct debit norm). */
function previousWorkday(d: Date) {
  const out = new Date(d);
  while (out.getUTCDay() === 0 || out.getUTCDay() === 6) out.setUTCDate(out.getUTCDate() - 1);
  return out;
}

function lastWorkdayOfMonth(y: number, m: number) {
  return previousWorkday(new Date(Date.UTC(y, m, daysInMonth(y, m))));
}

/** Months (y, m) overlapping [from, to]. */
function monthsBetween(from: Date, to: Date) {
  const out: Array<[number, number]> = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  while (y < to.getUTCFullYear() || (y === to.getUTCFullYear() && m <= to.getUTCMonth())) {
    out.push([y, m]);
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

export function plannedItemDates(item: PlannedItem, from: Date, to: Date): string[] {
  if (!item.start_date) return [];
  const start = utc(item.start_date);
  const end = item.end_date ? utc(item.end_date) : null;
  const within = (d: Date) => d >= from && d <= to && d >= start && (!end || d <= end);
  const recurrence = String(item.recurrence || "monthly");

  if (recurrence === "one_off") return within(start) ? [item.start_date] : [];

  if (recurrence === "monthly" || recurrence === "quarterly" || ["annual", "annually", "yearly"].includes(recurrence)) {
    const step = recurrence === "monthly" ? 1 : recurrence === "quarterly" ? 3 : 12;
    const day = item.day_of_month || start.getUTCDate();
    return monthsBetween(from, to)
      .filter(([y, m]) => ((y - start.getUTCFullYear()) * 12 + (m - start.getUTCMonth())) % step === 0)
      .map(([y, m]) => {
        const due = dayInMonth(y, m, day);
        return item.payment_adjustment === "previous_workday" ? previousWorkday(due) : due;
      })
      .filter(within)
      .map(iso);
  }

  const interval =
    recurrence === "weekly" ? 7 :
    recurrence === "fortnightly" ? 14 :
    recurrence === "four_weekly" ? 28 :
    recurrence === "custom_interval" ? Number(item.recurrence_interval_days || 0) : 0;
  if (!interval) return [];

  // Step along the item's own grid from its start date.
  const firstIndex = Math.max(0, Math.ceil((from.getTime() - start.getTime()) / (interval * DAY_MS)));
  const dates: string[] = [];
  for (let i = firstIndex; ; i++) {
    const d = new Date(start.getTime() + i * interval * DAY_MS);
    if (d > to || (end && d > end)) break;
    if (within(d)) dates.push(iso(d));
  }
  return dates;
}

function payDate(event: any, y: number, m: number) {
  const timing = String(event.pay_timing || event.payment_timing || "last_workday");
  if (timing === "fixed_day") {
    const due = dayInMonth(y, m, Number(event.pay_day_of_month || event.payment_day_of_month || 28));
    return String(event.pay_adjustment || "previous_workday") === "previous_workday" ? previousWorkday(due) : due;
  }
  return lastWorkdayOfMonth(y, m);
}

export async function materializePaymentsAndIncome({ db, household, today = new Date() }: MaterializeOptions) {
  const from = utc(iso(today));
  const to = new Date(from.getTime() + WINDOW_DAYS * DAY_MS);
  const memberIds = household.memberUserIds;

  const [{ data: items, error: itemsError }, { data: payEvents, error: payError }, { data: deals, error: dealsError }] = await Promise.all([
    db.from("planned_items")
      .select("id, user_id, person_id, direction, label, amount, recurrence, recurrence_interval_days, start_date, end_date, day_of_month, payment_adjustment")
      .in("user_id", memberIds),
    db.from("pay_events").select("*").in("user_id", memberIds),
    db.from("home_mortgage_deals").select("*").in("user_id", memberIds),
  ]);
  if (itemsError) throw new Error(`planned_items: ${itemsError.message}`);
  if (payError) throw new Error(`pay_events: ${payError.message}`);
  if (dealsError) throw new Error(`home_mortgage_deals: ${dealsError.message}`);
  const payWithOverrides = await withPayOverrides(db, payEvents || []);

  const rows: any[] = [];
  const base = { household_id: household.householdId, visibility_scope: "household" as const, metadata: {} };

  for (const item of (items || []) as PlannedItem[]) {
    const incoming = item.direction === "income" || item.direction === "incoming";
    for (const date of plannedItemDates(item, from, to)) {
      rows.push({
        ...base,
        user_id: item.user_id,
        person_id: item.person_id,
        source: incoming ? "loop_income" : "loop_payment",
        event_type: incoming ? "income_expected" : "payment_due",
        external_id: `planned_item:${item.id}:${date}`,
        title: item.label,
        event_date: date,
        amount: item.amount,
      });
    }
  }

  // Pay: one entry per person per month (latest active pay event, as the month plan does).
  for (const [y, m] of monthsBetween(from, to)) {
    const month = `${y}-${String(m + 1).padStart(2, "0")}`;
    for (const event of selectActivePayEventsForMonth(payWithOverrides as PayEventForPlan[], month) as any[]) {
      const date = payDate(event, y, m);
      if (date < from || date > to) continue;
      const amount = Math.round(getPayAmount(event, month) * 100) / 100;
      if (!(amount > 0)) continue;
      rows.push({
        ...base,
        user_id: event.user_id,
        person_id: event.person_id,
        source: "loop_income",
        event_type: "income_expected",
        external_id: `pay_event:${event.id}:${iso(date)}`,
        title: event.label || "Pay day",
        event_date: iso(date),
        amount,
      });
    }
  }

  // Mortgage: same monthly amount the month plan uses (override, else repayment maths).
  for (const deal of (deals || []) as Array<HomeMortgageDealForPlan & { user_id: string; payment_day_of_month: number | null }>) {
    const amount = Math.round(mortgageDealMonthlyPayment(deal) * 100) / 100;
    if (!(amount > 0)) continue;
    const startDate = deal.start_date || iso(from);
    const day = deal.payment_day_of_month || utc(startDate).getUTCDate();
    const dates = plannedItemDates({
      id: deal.id, user_id: deal.user_id, person_id: null, direction: "outgoing", label: "Mortgage", amount,
      recurrence: "monthly", recurrence_interval_days: null, start_date: startDate, end_date: deal.end_date,
      day_of_month: day, payment_adjustment: null,
    }, from, to);
    for (const date of dates) {
      rows.push({
        ...base,
        user_id: deal.user_id,
        person_id: null,
        source: "loop_payment",
        event_type: "payment_due",
        external_id: `mortgage_deal:${deal.id}:${date}`,
        title: deal.lender ? `Mortgage · ${deal.lender}` : "Mortgage",
        event_date: date,
        amount,
      });
    }
  }

  // NHS pension buy-back instalments for unpaid maternity leave (net of tax relief).
  for (const event of payWithOverrides.filter((row: any) => row.pay_kind === "maternity") as any[]) {
    for (const [y, m] of monthsBetween(from, to)) {
      const month = `${y}-${String(m + 1).padStart(2, "0")}`;
      const arrears = pensionArrearsForMonth(maternityInputFromPayEvent(event), month);
      if (!(arrears.netCost > 0)) continue;
      const date = payDate(event, y, m);
      if (date < from || date > to) continue;
      rows.push({
        ...base,
        user_id: event.user_id,
        person_id: event.person_id,
        source: "loop_payment",
        event_type: "payment_due",
        external_id: `pension_arrears:${event.id}:${iso(date)}`,
        title: "NHS pension buy-back",
        event_date: iso(date),
        amount: Math.round(arrears.netCost * 100) / 100,
      });
    }
  }

  // Rebuild the forward window so deleted or edited items don't leave ghosts.
  const { error: clearError } = await db
    .from("calendar_events")
    .delete()
    .in("user_id", memberIds)
    .in("source", ["loop_payment", "loop_income"])
    .gte("event_date", iso(from));
  if (clearError) throw new Error(`clear: ${clearError.message}`);

  if (!rows.length) return 0;
  const { error } = await db.from("calendar_events").upsert(rows, { onConflict: "user_id,source,event_type,event_date,external_id" });
  if (error) throw new Error(`upsert: ${error.message}`);
  return rows.length;
}

export async function materializeCalorieProgress({ db, household, today = new Date() }: MaterializeOptions) {
  const windowStart = new Date(today.getTime() - 7 * DAY_MS);
  const memberIds = household.memberUserIds;

  const { data: people, error: peopleError } = await db.from("people").select("id, user_id, daily_calorie_target").in("user_id", memberIds);
  if (peopleError) throw new Error(`people: ${peopleError.message}`);
  const targetByPersonId = new Map<string, number | null>((people || []).map((p: any) => [p.id, p.daily_calorie_target]));

  const { data: logs, error: logsError } = await db
    .from("food_logs")
    .select("user_id, person_id, eaten_on, calories")
    .in("user_id", memberIds)
    .gte("eaten_on", iso(windowStart));
  if (logsError) throw new Error(`food_logs: ${logsError.message}`);
  if (!logs?.length) return 0;

  const byKey = new Map<string, { userId: string; personId: string | null; day: string; consumed: number }>();
  for (const log of logs as any[]) {
    const key = `${log.person_id ?? log.user_id}:${log.eaten_on}`;
    const existing = byKey.get(key);
    if (existing) existing.consumed += Number(log.calories || 0);
    else byKey.set(key, { userId: log.user_id, personId: log.person_id, day: log.eaten_on, consumed: Number(log.calories || 0) });
  }

  const rows = Array.from(byKey.values()).map(({ userId, personId, day, consumed }) => {
    const ownTarget = personId ? targetByPersonId.get(personId) : null;
    const target = ownTarget || DEFAULT_CALORIE_TARGET;
    const metadata: CalorieProgressMetadata = { consumed: Math.round(consumed), target, pct: Math.round((consumed / target) * 100), isDefaultTarget: !ownTarget };
    return {
      user_id: userId,
      household_id: household.householdId,
      visibility_scope: "household" as const,
      person_id: personId,
      source: "loop_calorie" as const,
      external_id: `calorie:${personId ?? userId}:${day}`,
      event_type: "calorie_progress" as const,
      title: `${Math.round(consumed)} / ${target} kcal`,
      event_date: day,
      amount: null,
      metadata,
    };
  });

  const { error } = await db.from("calendar_events").upsert(rows, { onConflict: "user_id,source,event_type,event_date,external_id" });
  if (error) throw new Error(`calorie upsert: ${error.message}`);
  return rows.length;
}

export async function materializeAllForHousehold(opts: MaterializeOptions) {
  const payments = await materializePaymentsAndIncome(opts);
  const calories = await materializeCalorieProgress(opts);
  return { payments, calories };
}
