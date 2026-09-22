// lib/calendar/materialize.ts
//
// Turns real Loop data into calendar_events rows: planned_items (bills/
// income) and food_logs (calorie progress), for every member of a
// household. Run once daily per household from the Render worker.
//
// Verified against the live repo directly:
//   - planned_items: id, user_id, household_id, visibility_scope,
//     person_id, category_id, direction ('incoming'|'outgoing'),
//     item_type, label, amount, recurrence, recurrence_interval_days,
//     start_date, end_date, day_of_month, payment_timing,
//     payment_adjustment, end_behavior
//   - food_logs: id, user_id, person_id, meal_id, eaten_on, eaten_at,
//     calories, ...
//   - people: id, user_id, household_id, name, relationship,
//     daily_calorie_target (new column, added in the migration)
//
// One thing NOT verified: `payment_adjustment` ('fixed_day' |
// 'previous_workday' seen in app/spending/actions.ts) implies some
// planned items shift off weekends/bank holidays. This materializer
// does NOT apply that adjustment — it uses the raw day_of_month. If
// that matters for your "noticeable payment point" markers being
// exactly right, that logic needs porting in from wherever
// payment_adjustment is actually consumed (I didn't find the resolver
// — only the field being set — search app/spending and lib/affordability
// for where `payment_adjustment` is read, not just written).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActiveHouseholdContext } from '@/domains/identity/household';
import type { CalorieProgressMetadata } from './types';

const MATERIALIZE_WINDOW_DAYS = 45;
const DEFAULT_CALORIE_TARGET = 2200; // matches DAILY_TARGETS.calories in NutritionClient.tsx

type Recurrence =
  | 'weekly'
  | 'fortnightly'
  | 'four_weekly'
  | 'monthly'
  | 'quarterly'
  | 'annual'
  | 'annually'
  | 'yearly'
  | 'custom_interval'
  | 'one_off';

interface PlannedItem {
  id: string;
  user_id: string;
  person_id: string | null;
  direction: 'incoming' | 'outgoing';
  label: string;
  amount: number;
  recurrence: Recurrence;
  recurrence_interval_days: number | null;
  start_date: string;
  end_date: string | null;
  day_of_month: number | null;
}

interface MaterializeOptions {
  db: SupabaseClient;
  household: ActiveHouseholdContext;
  today?: Date;
}

/** Every occurrence date of a planned_item within [today, windowEnd]. */
function occurrencesInWindow(item: PlannedItem, today: Date, windowEnd: Date): string[] {
  const start = new Date(item.start_date + 'T00:00:00Z');
  const end = item.end_date ? new Date(item.end_date + 'T00:00:00Z') : null;
  const dates: string[] = [];

  if (item.recurrence === 'one_off') {
    if (start >= today && start <= windowEnd) dates.push(item.start_date);
    return dates;
  }

  if (item.recurrence === 'monthly' && item.day_of_month) {
    const cursor = new Date(today);
    for (let i = 0; i < 3; i++) {
      // check this month, next month, month after — enough to cover a 45-day window
      const candidate = new Date(cursor.getFullYear(), cursor.getMonth() + i, item.day_of_month);
      if (candidate >= start && (!end || candidate <= end) && candidate >= today && candidate <= windowEnd) {
        dates.push(candidate.toISOString().slice(0, 10));
      }
    }
    return dates;
  }

  const intervalDays: number | null =
    item.recurrence === 'weekly'
      ? 7
      : item.recurrence === 'fortnightly'
        ? 14
        : item.recurrence === 'four_weekly'
          ? 28
          : item.recurrence === 'custom_interval'
            ? item.recurrence_interval_days
            : null;

  if (intervalDays) {
    let cursor = new Date(Math.max(start.getTime(), today.getTime()));
    // align to the recurrence grid from start_date rather than "today"
    const daysSinceStart = Math.floor((cursor.getTime() - start.getTime()) / 86_400_000);
    const remainder = daysSinceStart % intervalDays;
    if (remainder !== 0) cursor = new Date(cursor.getTime() + (intervalDays - remainder) * 86_400_000);

    while (cursor <= windowEnd && (!end || cursor <= end)) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor = new Date(cursor.getTime() + intervalDays * 86_400_000);
    }
    return dates;
  }

  if (['quarterly', 'annual', 'annually', 'yearly'].includes(item.recurrence)) {
    const monthsStep = item.recurrence === 'quarterly' ? 3 : 12;
    const cursor = new Date(start);
    while (cursor <= windowEnd) {
      if (cursor >= today && (!end || cursor <= end)) dates.push(cursor.toISOString().slice(0, 10));
      cursor.setMonth(cursor.getMonth() + monthsStep);
    }
    return dates;
  }

  return dates;
}

export async function materializePaymentsAndIncome({ db, household, today = new Date() }: MaterializeOptions) {
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + MATERIALIZE_WINDOW_DAYS);

  const memberIds = household.memberUserIds;
  const { data: items, error } = await db
    .from('planned_items')
    .select('id, user_id, person_id, direction, label, amount, recurrence, recurrence_interval_days, start_date, end_date, day_of_month')
    .in('user_id', memberIds);

  if (error) {
    console.error(`[materialize] planned_items fetch failed for household ${household.householdId}:`, error.message);
    return;
  }
  if (!items?.length) return;

  const rows = (items as PlannedItem[]).flatMap((item) => {
    const dates = occurrencesInWindow(item, today, windowEnd);
    return dates.map((date) => ({
      user_id: item.user_id,
      household_id: household.householdId,
      visibility_scope: 'household' as const,
      person_id: item.person_id,
      source: item.direction === 'incoming' ? ('loop_income' as const) : ('loop_payment' as const),
      external_id: `planned_item:${item.id}:${date}`,
      event_type: item.direction === 'incoming' ? ('income_expected' as const) : ('payment_due' as const),
      title: item.label,
      event_date: date,
      amount: item.amount,
      metadata: {},
    }));
  });

  if (!rows.length) return;

  const { error: upsertError } = await db
    .from('calendar_events')
    .upsert(rows, { onConflict: 'user_id,source,event_type,event_date,external_id' });

  if (upsertError) {
    console.error(`[materialize] payment/income upsert failed for household ${household.householdId}:`, upsertError.message);
  }
}

export async function materializeCalorieProgress({ db, household, today = new Date() }: MaterializeOptions) {
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 7);

  const memberIds = household.memberUserIds;

  const { data: people, error: peopleError } = await db
    .from('people')
    .select('id, user_id, daily_calorie_target')
    .in('user_id', memberIds);

  if (peopleError) {
    console.error(`[materialize] people fetch failed for household ${household.householdId}:`, peopleError.message);
    return;
  }

  const targetByPersonId = new Map<string, number>();
  for (const person of people ?? []) {
    targetByPersonId.set(person.id, person.daily_calorie_target ?? DEFAULT_CALORIE_TARGET);
  }

  const { data: logs, error: logsError } = await db
    .from('food_logs')
    .select('user_id, person_id, eaten_on, calories')
    .in('user_id', memberIds)
    .gte('eaten_on', windowStart.toISOString().slice(0, 10));

  if (logsError) {
    console.error(`[materialize] food_logs fetch failed for household ${household.householdId}:`, logsError.message);
    return;
  }
  if (!logs?.length) return;

  // aggregate calories by (person_id ?? user_id, day) — food_logs.person_id
  // can be null for entries logged before a person profile existed
  const byKey = new Map<string, { userId: string; personId: string | null; day: string; consumed: number }>();
  for (const log of logs) {
    const scopeId = log.person_id ?? log.user_id;
    const key = `${scopeId}:${log.eaten_on}`;
    const existing = byKey.get(key);
    if (existing) existing.consumed += log.calories ?? 0;
    else byKey.set(key, { userId: log.user_id, personId: log.person_id, day: log.eaten_on, consumed: log.calories ?? 0 });
  }

  const rows = Array.from(byKey.values()).map(({ userId, personId, day, consumed }) => {
    const target = personId ? (targetByPersonId.get(personId) ?? DEFAULT_CALORIE_TARGET) : DEFAULT_CALORIE_TARGET;
    const pct = Math.round((consumed / target) * 100);
    const metadata: CalorieProgressMetadata = {
      consumed,
      target,
      pct,
      isDefaultTarget: !personId || !targetByPersonId.has(personId) || targetByPersonId.get(personId) === undefined,
    };
    return {
      user_id: userId,
      household_id: household.householdId,
      visibility_scope: 'household' as const,
      person_id: personId,
      source: 'loop_calorie' as const,
      external_id: `calorie:${personId ?? userId}:${day}`,
      event_type: 'calorie_progress' as const,
      title: `${consumed} / ${target} kcal`,
      event_date: day,
      amount: null,
      metadata,
    };
  });

  const { error: upsertError } = await db
    .from('calendar_events')
    .upsert(rows, { onConflict: 'user_id,source,event_type,event_date,external_id' });

  if (upsertError) {
    console.error(`[materialize] calorie upsert failed for household ${household.householdId}:`, upsertError.message);
  }
}

export async function materializeAllForHousehold(opts: MaterializeOptions) {
  await materializePaymentsAndIncome(opts);
  await materializeCalorieProgress(opts);
}
