import "server-only";
// One view of a month, day by day: money in and out (same plan as Summary), big dates,
// each person's food score, and your own / Google events.

import { loadMonthPlans, monthTotals } from "@/lib/planning/load-month-plans";
import { capRenewedLines, englandWalesBankHolidays, plannedItemDatesForMonth, plannedItemAppliesToMonth } from "@/lib/planning/summary-plan";
import { UK_HOLIDAY_PERIODS } from "@/lib/calculations/childcareCalendar";
import { addNutritionTotals, NUTRITION_TOTAL_KEYS, scoreNutritionDay, type NutritionTotals } from "@/lib/nutrition/scoring";
import { ageInYears, scoringTargets, targetsForPerson } from "@/lib/nutrition/targets";

export type CalendarMoneyItem = { id: string; label: string; amount: number; direction: "in" | "out"; personId: string | null; personName: string | null; kind: string; href: string };
export type CalendarDateItem = { id: string; kind: "birthday" | "school_holiday" | "bank_holiday" | "price_change" | "ending" | "deal_end" | "childcare"; label: string; detail?: string; personId?: string | null; href?: string };
export type CalendarFoodItem = { personId: string | null; personName: string; score: number; label: string; kcal: number; entries: number; flags: string[] };
export type CalendarEventItem = { id: string; title: string; source: string; personId: string | null; mine: boolean };

export type CalendarDay = {
  date: string;
  money: CalendarMoneyItem[];
  moneyIn: number;
  moneyOut: number;
  /** Money in minus money out from the 1st up to and including this day (dated items only). */
  runningNet: number;
  /** Projected current-account balance at the end of this day, from the last confirmed balance. Null before that point or when no balance is known. */
  projectedBalance: number | null;
  /** Money leaves this day and the projected balance is below zero. */
  short: boolean;
  dates: CalendarDateItem[];
  food: CalendarFoodItem[];
  events: CalendarEventItem[];
};

export type CalendarPerson = { id: string; name: string; relationship: string; avatarUrl: string | null; isChild: boolean };

export type CalendarMonth = {
  month: string;
  label: string;
  today: string;
  days: CalendarDay[];
  people: CalendarPerson[];
  totals: { income: number; spending: number; saved: number; leftOver: number; budgets: number; datedIn: number; datedOut: number };
  budgets: Array<{ label: string; amount: number }>;
  hasChildren: boolean;
  balance: { amount: number; asOf: string; accounts: number; firstShortDay: string | null } | null;
};

const NUTRIENT_COLUMNS = "person_id, eaten_on, calories, protein_g, carbs_g, fat_g, fibre_g, soluble_fibre_g, insoluble_fibre_g, sugar_g, added_sugar_g, natural_sugar_g, salt_g, saturated_fat_g, trans_fat_g, monounsaturated_fat_g, polyunsaturated_fat_g, sodium_mg, potassium_mg, calcium_mg, iron_mg, magnesium_mg, zinc_mg, folate_ug, niacin_mg, thiamin_mg, vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug, omega_3_g, caffeine_mg";

function nutritionFromRecord(record: Record<string, unknown>) {
  return Object.fromEntries(NUTRITION_TOTAL_KEYS.map((key) => [key, Number(record[key] || 0)])) as Partial<NutritionTotals>;
}

function shiftMonth(month: string, delta: number) {
  const [yy, mm] = month.split("-").map(Number);
  return new Date(Date.UTC(yy, mm - 1 + delta, 1)).toISOString().slice(0, 7);
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function londonToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function loadCalendarMonth(supabase: any, opts: { userId: string; dataOwnerUserId: string; householdId: string | null; filter: string; peopleFilter: string; month: string }): Promise<CalendarMonth> {
  const { month, filter } = opts;
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const dayList: string[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) dayList.push(d);

  const [planResult, peopleResult, itemsResult, childCostsResult, dealsResult, logsResult, eventsResult, accountsResult] = await Promise.all([
    // Previous and next months too: a payment due on Sunday the 1st really leaves on Friday the 30th.
    loadMonthPlans(supabase, { userId: opts.dataOwnerUserId, filter, months: [shiftMonth(month, -1), month, shiftMonth(month, 1)] }).catch(() => null),
    supabase.from("people").select("id, name, relationship, avatar_url, birth_date, nutrition_reference_sex, weight_kg, caffeine_limit_mg, daily_calorie_target, height_cm, activity_level, nutrition_goal, diet_type, food_allergies, account_status").or(opts.peopleFilter).or("account_status.is.null,account_status.neq.duplicate_merged"),
    supabase.from("planned_items").select("id, user_id, person_id, category_id, direction, item_type, label, amount, recurrence, recurrence_interval_days, start_date, end_date, day_of_month, payment_timing, payment_adjustment, end_behavior, early_upgrade_date").or(filter),
    supabase.from("child_costs").select("id, child_id, label, starts_on, ends_on").or(filter),
    supabase.from("home_mortgage_deals").select("id, lender, product_name, initial_period_end, end_date").or(filter),
    supabase.from("food_logs").select(NUTRIENT_COLUMNS).eq("user_id", opts.userId).gte("eaten_on", first).lte("eaten_on", last).limit(3000),
    supabase.from("calendar_events").select("id, user_id, person_id, source, event_type, title, event_date").in("source", ["loop_manual", "google"]).gte("event_date", first).lte("event_date", last).limit(500),
    supabase.from("financial_accounts").select("id, current_balance, balance_last_confirmed_at, updated_at, is_liability, account_status").eq("account_type", "current_account").or(filter),
  ]);

  const people: Array<any> = (peopleResult.data || []).filter((person: any, index: number, all: any[]) => all.findIndex((other) => other.id === person.id) === index);
  const personName = new Map(people.map((person) => [person.id, person.name as string]));
  const calendarPeople: CalendarPerson[] = people.map((person) => {
    const targets = targetsForPerson(person, first);
    return { id: person.id, name: person.name, relationship: person.relationship, avatarUrl: person.avatar_url, isChild: targets.isChild };
  });
  const hasChildren = calendarPeople.some((person) => person.isChild);

  const days = new Map<string, CalendarDay>(dayList.map((date) => [date, { date, money: [], moneyIn: 0, moneyOut: 0, runningNet: 0, projectedBalance: null, short: false, dates: [], food: [], events: [] }]));
  const dayFor = (date: string | undefined | null) => (date ? days.get(date.slice(0, 10)) : undefined);

  /* ---------------- Money ---------------- */
  const plans = planResult?.plans || [];
  const plan = plans[1] || null;
  const budgets: Array<{ label: string; amount: number }> = [];
  plans.forEach((monthPlan, planIndex) => {
    // Pay, income entries, mortgage, childcare and pension come straight from the month plan.
    monthPlan.incomeItems.filter((item) => item.href !== "/spending").forEach((item, index) => {
      dayFor(item.dueDate)?.money.push({ id: `in-${planIndex}-${index}`, label: String(item.label || "").replace(/\s+/g, " ").trim(), amount: item.value, direction: "in", personId: item.personId ?? null, personName: item.personId ? personName.get(item.personId) || null : null, kind: item.helper, href: item.href });
    });
    monthPlan.outgoingItems.forEach((item, index) => {
      if (item.href === "/spending" && /spending category$/.test(item.helper)) {
        if (planIndex === 1) budgets.push({ label: item.label, amount: item.value });
        return;
      }
      if (item.href === "/spending") return; // planned items are expanded per date below
      dayFor(item.dueDate)?.money.push({ id: `out-${planIndex}-${index}`, label: String(item.label || "").replace(/\s+/g, " ").trim(), amount: item.value, direction: "out", personId: item.personId ?? null, personName: item.personId ? personName.get(item.personId) || null : null, kind: item.categoryLabel || item.helper, href: item.href });
    });
  });
  // Planned bills and income: one entry on each real due date (weekly items appear every week).
  const items = capRenewedLines((itemsResult.data || []) as any[]);
  const seen = new Set<string>();
  for (const item of items) {
    const dates = [shiftMonth(month, -1), month, shiftMonth(month, 1)].flatMap((m) => (plannedItemAppliesToMonth(item, m) ? plannedItemDatesForMonth(item, m) : []));
    for (const date of dates) {
      if (seen.has(`${item.id}|${date}`)) continue;
      seen.add(`${item.id}|${date}`);
      dayFor(date)?.money.push({
        id: `pi-${item.id}-${date}`,
        label: String(item.label || "").trim(),
        amount: Number(item.amount || 0),
        direction: item.direction === "income" ? "in" : "out",
        personId: item.person_id,
        personName: item.person_id ? personName.get(item.person_id) || null : null,
        kind: item.item_type || "bill",
        href: `/spending?month=${month}`,
      });
    }
  }
  let running = 0;
  let datedIn = 0;
  let datedOut = 0;
  for (const date of dayList) {
    const day = days.get(date)!;
    day.money.sort((a, b) => (a.direction === b.direction ? b.amount - a.amount : a.direction === "in" ? -1 : 1));
    day.moneyIn = Math.round(day.money.filter((item) => item.direction === "in").reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
    day.moneyOut = Math.round(day.money.filter((item) => item.direction === "out").reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
    running += day.moneyIn - day.moneyOut;
    datedIn += day.moneyIn;
    datedOut += day.moneyOut;
    day.runningNet = Math.round(running * 100) / 100;
  }

  // Projected balance: start from the current account balance on the day it was last confirmed,
  // then apply each later day's money in and out. Only when that confirmation falls in this month,
  // so nothing between it and the 1st is missed.
  const accounts = ((accountsResult?.data || []) as any[]).filter((account) => !account.is_liability && !/closed|archived/i.test(String(account.account_status || "")) && account.current_balance != null);
  let balance: CalendarMonth["balance"] = null;
  if (accounts.length) {
    const asOf = accounts
      .map((account) => String(account.balance_last_confirmed_at || account.updated_at || "").slice(0, 10))
      .filter(Boolean)
      .sort()[0];
    if (asOf && asOf >= first && asOf <= last) {
      const amount = Math.round(accounts.reduce((sum, account) => sum + Number(account.current_balance || 0), 0) * 100) / 100;
      let projected = amount;
      let firstShortDay: string | null = null;
      for (const date of dayList) {
        if (date <= asOf) continue;
        const day = days.get(date)!;
        projected += day.moneyIn - day.moneyOut;
        day.projectedBalance = Math.round(projected * 100) / 100;
        day.short = day.moneyOut > 0 && day.projectedBalance < 0;
        if (day.short && !firstShortDay) firstShortDay = date;
      }
      balance = { amount, asOf, accounts: accounts.length, firstShortDay };
    }
  }
  const headline = plan && planResult ? monthTotals(plan, planResult.savingNames) : { income: datedIn, spending: datedOut, saved: 0, leftOver: datedIn - datedOut, savingsRate: 0 };

  /* ---------------- Big dates ---------------- */
  for (const person of people) {
    if (!person.birth_date) continue;
    const date = `${y}-${String(person.birth_date).slice(5, 10)}`;
    const age = ageInYears(person.birth_date, date);
    dayFor(date)?.dates.push({ id: `bday-${person.id}`, kind: "birthday", label: `${person.name}'s ${age != null ? `${ordinal(age)} ` : ""}birthday`, personId: person.id, href: `/household/${person.id}` });
  }
  for (const date of dayList) if (englandWalesBankHolidays.has(date)) dayFor(date)?.dates.push({ id: `bh-${date}`, kind: "bank_holiday", label: "Bank holiday" });
  if (hasChildren) {
    for (const period of UK_HOLIDAY_PERIODS) {
      if (period.end < first || period.start > last) continue;
      for (const date of dayList) {
        if (date < period.start || date > period.end) continue;
        const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
        dayFor(date)?.dates.push({ id: `sh-${period.key}-${date}`, kind: "school_holiday", label: period.label, detail: date === period.start ? "First day off school" : date === period.end ? "Last day before school" : undefined });
      }
    }
  }
  // Price changes (a bill's next price line starts) and endings (no line continues).
  const byLabel = new Map<string, any[]>();
  const lineKey = (item: any) => `${item.user_id}|${item.person_id || ""}|${item.direction}|${String(item.label || "").trim().toLowerCase()}`;
  for (const item of items) byLabel.set(lineKey(item), [...(byLabel.get(lineKey(item)) || []), item]);
  for (const item of items) {
    const siblings = byLabel.get(lineKey(item)) || [];
    if (item.start_date >= first && item.start_date <= last) {
      // The line this one replaces: same bill, ended in the 45 days before this one starts.
      const previous = siblings
        .filter((other) => other.id !== item.id && other.end_date && other.end_date < item.start_date && addDays(other.end_date, 45) >= item.start_date)
        .sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)))[0];
      if (previous && Number(previous.amount) !== Number(item.amount)) {
        const rise = Number(item.amount) > Number(previous.amount);
        dayFor(item.start_date)?.dates.push({ id: `pc-${item.id}`, kind: "price_change", label: `${String(item.label).trim()} ${rise ? "goes up" : "goes down"}`, detail: `£${Number(previous.amount).toFixed(2)} → £${Number(item.amount).toFixed(2)}`, personId: item.person_id, href: `/spending?month=${month}` });
      }
    }
    if (item.end_date && item.end_date >= first && item.end_date <= last) {
      const continues = siblings.some((other) => other.id !== item.id && other.start_date && other.start_date > item.end_date && other.start_date <= addDays(item.end_date, 45));
      if (!continues) dayFor(item.end_date)?.dates.push({ id: `end-${item.id}`, kind: "ending", label: `${String(item.label).trim()} ends`, detail: item.end_behavior === "upgrade" ? "Upgrade due" : "Last payment around now", personId: item.person_id, href: `/spending?month=${month}` });
    }
    if (item.early_upgrade_date && item.early_upgrade_date >= first && item.early_upgrade_date <= last) {
      dayFor(item.early_upgrade_date)?.dates.push({ id: `up-${item.id}`, kind: "ending", label: `${String(item.label).trim()}: early upgrade possible`, personId: item.person_id, href: `/spending?month=${month}` });
    }
  }
  for (const deal of (dealsResult.data || []) as any[]) {
    const end = deal.initial_period_end || null;
    if (end && end >= first && end <= last) dayFor(end)?.dates.push({ id: `deal-${deal.id}`, kind: "deal_end", label: `Mortgage deal ends${deal.lender ? ` · ${deal.lender}` : ""}`, detail: "Moves to the lender's standard rate unless you remortgage", href: "/mortgage" });
  }
  for (const cost of (childCostsResult.data || []) as any[]) {
    if (cost.starts_on && cost.starts_on >= first && cost.starts_on <= last) dayFor(cost.starts_on)?.dates.push({ id: `cc-start-${cost.id}`, kind: "childcare", label: `${String(cost.label).trim()} starts`, personId: cost.child_id, href: cost.child_id ? `/household/${cost.child_id}` : "/household" });
    if (cost.ends_on && cost.ends_on >= first && cost.ends_on <= last) dayFor(cost.ends_on)?.dates.push({ id: `cc-end-${cost.id}`, kind: "childcare", label: `${String(cost.label).trim()} ends`, personId: cost.child_id, href: cost.child_id ? `/household/${cost.child_id}` : "/household" });
  }

  /* ---------------- Food ---------------- */
  const logs = (logsResult.data || []) as any[];
  const groups = new Map<string, any[]>();
  for (const log of logs) {
    const key = `${log.eaten_on}|${log.person_id || "__household__"}`;
    groups.set(key, [...(groups.get(key) || []), log]);
  }
  const profileById = new Map(people.map((person) => [person.id, person]));
  for (const [key, entries] of groups) {
    const [date, personId] = key.split("|");
    const person = personId === "__household__" ? null : profileById.get(personId) || null;
    const targets = targetsForPerson(person, date);
    const totals: NutritionTotals = addNutritionTotals(entries.map((entry) => nutritionFromRecord(entry)));
    const score = scoreNutritionDay(totals, 0, { targets: scoringTargets(targets) });
    const flags: string[] = [];
    if (targets.caffeine_mg != null ? totals.caffeine_mg > targets.caffeine_mg : totals.caffeine_mg >= 10) flags.push("Caffeine");
    if (totals.added_sugar_g > (targets.added_sugar_g ?? 5)) flags.push("Sugar");
    if (totals.salt_g > targets.salt_g) flags.push("Salt");
    dayFor(date)?.food.push({ personId: person ? person.id : null, personName: person ? person.name : "Household", score: score.score, label: score.label, kcal: Math.round(totals.calories), entries: entries.length, flags });
  }

  /* ---------------- Events ---------------- */
  for (const event of (eventsResult.data || []) as any[]) {
    dayFor(event.event_date)?.events.push({ id: event.id, title: event.title, source: event.source, personId: event.person_id, mine: event.user_id === opts.userId });
  }

  return {
    month,
    label: new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
    today: londonToday(),
    days: dayList.map((date) => days.get(date)!),
    people: calendarPeople,
    totals: {
      income: Math.round(headline.income * 100) / 100,
      spending: Math.round(headline.spending * 100) / 100,
      saved: Math.round(headline.saved * 100) / 100,
      leftOver: Math.round(headline.leftOver * 100) / 100,
      budgets: Math.round(budgets.reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
      datedIn: Math.round(datedIn * 100) / 100,
      datedOut: Math.round(datedOut * 100) / 100,
    },
    budgets,
    hasChildren,
    balance,
  };
}
