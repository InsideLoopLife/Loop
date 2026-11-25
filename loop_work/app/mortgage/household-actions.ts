"use server";

import { runFriendly } from "@/lib/actions/friendly";
import { createClient } from "@/lib/supabase/server";
import { changeRecord, getActiveHouseholdContext, householdWriteFields, visibleDataOrFilter } from "@/lib/auth/household-context";

/** Money in easy-access and fixed savings (not pensions or investments) — what an emergency fund draws on. */
async function loadHouseholdSavings__read() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const household = await getActiveHouseholdContext(supabase, user);
  const filter = visibleDataOrFilter(household);
  const [{ data }, { data: pets }, { data: items }, { data: categories }, { data: childCosts }, costGroups] = await Promise.all([
    supabase.from("financial_accounts").select("account_type, current_balance, is_liability").or(filter),
    household?.householdId
      ? supabase.from("household_pets").select("name").eq("household_id", household.householdId).eq("status", "active")
      : supabase.from("household_pets").select("name").eq("user_id", user.id).eq("status", "active"),
    supabase.from("planned_items").select("label, amount, recurrence, start_date, end_date, category_id, item_type, person_id, notes").eq("direction", "outgoing").or(filter),
    supabase.from("spending_categories").select("id, name").or(filter),
    supabase.from("child_costs").select("*").or(filter),
    readCostGroups(supabase, filter),
  ]);
  // Each bill's spending category, by its name, so household costs can group the same way Spending does.
  const names = new Map(((categories || []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const categoryByLabel: Record<string, string> = {};
  // Monthly bills starting in the next two months (e.g. a new energy deal) — an emergency fund should cover them too.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 61 * 86_400_000).toISOString().slice(0, 10);
  const startingSoon = ((items || []) as any[])
    .filter((item) => item.recurrence === "monthly" && item.start_date > today && item.start_date <= soon && (!item.end_date || item.end_date > item.start_date))
    .map((item) => ({ label: String(item.label), value: Number(item.amount || 0), startDate: String(item.start_date), categoryLabel: item.category_id ? names.get(item.category_id) || null : null }));
  for (const item of (items || []) as { label: string; category_id: string | null; item_type: string | null }[]) {
    const name = item.category_id ? names.get(item.category_id) : null;
    const key = String(item.label || "").trim().toLowerCase();
    if (key && (name || item.item_type === "saving_investment")) categoryByLabel[key] = name || "Savings";
  }
  const savings = ((data || []) as { account_type: string; current_balance: number | null; is_liability: boolean | null }[])
    .filter((a) => !a.is_liability && ["savings", "cash_isa", "fixed_saver", "regular_saver"].includes(String(a.account_type)))
    .reduce((sum, a) => sum + Math.abs(Number(a.current_balance || 0)), 0);
  // Childcare changes month to month (holidays, term-time only, funded hours) — average it over the
  // coming year so the household figure isn't this month's high or low.
  const { getChildCostMonthlyAmount, isActiveInMonth } = await import("@/lib/planning/month-plan");
  const [y, m] = today.split("-").map(Number);
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 + i, 1)); return d.toISOString().slice(0, 7); });
  const childAverages: Record<string, { thisMonth: number; average: number; low: number; high: number; activeMonths: number; schedule: string | null }> = {};
  for (const cost of (childCosts || []) as any[]) {
    const active = months.filter((month) => isActiveInMonth(cost.starts_on, cost.ends_on, month));
    if (!active.length) continue;
    const amounts = active.map((month) => Number(getChildCostMonthlyAmount(cost, month) || 0));
    const key = String(cost.label || "").trim().toLowerCase();
    const schedule = String(cost.billing_schedule || cost.care_details?.billing_schedule || "");
    const prev = childAverages[key];
    const entry = {
      thisMonth: Math.round(amounts[0] * 100) / 100,
      average: Math.round((amounts.reduce((a, b) => a + b, 0) / active.length) * 100) / 100,
      low: Math.round(Math.min(...amounts)),
      high: Math.round(Math.max(...amounts)),
      activeMonths: active.length,
      schedule: schedule === "term_time" ? "term time only" : schedule === "term_time_spread" ? "term time, spread over the year" : /club|school/i.test(String(cost.care_type || "")) ? "term time" : null,
    };
    childAverages[key] = prev ? { ...entry, thisMonth: prev.thisMonth + entry.thisMonth, average: prev.average + entry.average, low: prev.low + entry.low, high: prev.high + entry.high } : entry;
  }
  // Council Tax: most councils collect it over 10 months (April to January) unless you've asked for 12.
  const councilTax: Record<string, { payments: number }> = {};
  for (const item of (items || []) as any[]) {
    if (!/council tax/i.test(String(item.label || ""))) continue;
    const twelve = /12 (monthly )?(payments|instalments|months)|twelve/i.test(String(item.notes || ""));
    councilTax[String(item.label).trim().toLowerCase()] = { payments: twelve ? 12 : 10 };
  }
  return { savings: Math.round(savings * 100) / 100, categoryByLabel, startingSoon, childAverages, councilTax, costGroups, petNames: ((pets || []) as { name: string | null }[]).map((p) => String(p.name || "")).filter(Boolean) };
}

export async function loadHouseholdSavings() { return runFriendly(() => loadHouseholdSavings__read()); }

/** Upcoming household cost changes and renewals for the next 12 months. */
async function loadUpcomingChanges__read(mortgage: { dealEnd: string | null; lender: string | null } | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const household = await getActiveHouseholdContext(supabase, user);
  const filter = visibleDataOrFilter(household);
  const { billChanges, sortUpcoming } = await import("@/lib/household/upcoming");
  const { carDates, rollForward } = await import("@/lib/vehicles/car-profile");
  const { planHomeItem } = await import("@/lib/home/items");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 366 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: items }, { data: cars }, { data: homeItems }, { data: tariffs }] = await Promise.all([
    supabase.from("planned_items").select("id, label, amount, recurrence, start_date, end_date, end_behavior, renewal_notice_days, notes").eq("direction", "outgoing").or(filter),
    supabase.from("household_cars").select("*").eq("status", "active").or(filter),
    supabase.from("home_items").select("id, kind, label, purchased_on, price, warranty_months, extended_warranty_ends_on, warranty_provider, expected_life_years, replacement_cost, status").neq("status", "gone").or(filter),
    supabase.from("household_energy_tariffs").select("supplier, tariff_name, fuel, fixed_until, gas_tariff_name, gas_fixed_until, exit_fee_gbp").eq("is_current", true).or(filter),
  ]);

  const list = billChanges(((items || []) as any[]).filter((i) => !String(i.notes || "").includes("[planned_purchase:")), today, horizon);

  if (mortgage?.dealEnd && mortgage.dealEnd >= today && mortgage.dealEnd <= horizon) {
    list.push({ id: "mortgage-deal", date: mortgage.dealEnd, kind: "renewal", title: `${mortgage.lender ? `${mortgage.lender} ` : ""}mortgage deal ends`, detail: "You can lock in a new deal up to 6 months before", monthlyChange: null, area: "mortgage", action: { label: "See deals", href: "/mortgage?tab=rates" } });
  }
  for (const tariff of (tariffs || []) as any[]) {
    for (const [date, name] of [[tariff.fixed_until, tariff.tariff_name], [tariff.gas_fixed_until, tariff.gas_tariff_name]] as [string | null, string | null][]) {
      if (date && date >= today && date <= horizon) list.push({ id: `energy-${date}-${name}`, date, kind: "renewal", title: `${tariff.supplier} ${name ? `${name} ` : ""}fix ends`, detail: "You can usually switch without a fee in the last 49 days", monthlyChange: null, area: "energy", action: { label: "Compare tariffs", href: "/mortgage?tab=things" } });
    }
  }
  for (const car of (cars || []) as any[]) {
    const rolled = { ...car, mot_due: rollForward(car.mot_due, today), tax_due: rollForward(car.tax_due, today), insurance_renewal: rollForward(car.insurance_renewal, today) };
    for (const d of carDates(rolled, today)) {
      if (d.date > horizon) continue;
      list.push({ id: `car-${car.id}-${d.key}`, date: d.date, kind: "renewal", title: `${car.name}: ${d.label.charAt(0).toLowerCase()}${d.label.slice(1)}`, detail: d.key === "insurance" ? "Compare quotes 3–4 weeks before — usually cheapest then" : d.key === "agreement" ? "Plan the next car before this" : "", monthlyChange: null, area: "cars", action: d.key === "agreement" ? { label: "Plan a car", href: "/spending?plan=new#planned-purchases" } : null });
    }
  }
  for (const item of (homeItems || []) as any[]) {
    const plan = planHomeItem(item, today);
    if (plan.warrantyEnds && plan.warrantyEnds >= today && plan.warrantyEnds <= horizon) {
      list.push({ id: `warranty-${item.id}`, date: plan.warrantyEnds, kind: "warranty", title: `${item.label} warranty ends`, detail: item.warranty_provider ? `With ${item.warranty_provider}` : "Report any faults before then", monthlyChange: null, area: "appliances", action: { label: "Appliances", href: "/mortgage?tab=things" } });
    }
  }
  return { today, changes: sortUpcoming(list) };
}

export async function loadUpcomingChanges(mortgage: { dealEnd: string | null; lender: string | null } | null) { return runFriendly(() => loadUpcomingChanges__read(mortgage)); }

/** Your own household groups for lines, keyed by the line's name. */
async function readCostGroups(supabase: Awaited<ReturnType<typeof createClient>>, filter: string) {
  const { data } = await supabase.from("household_cost_groups").select("label_key, group_key").or(filter);
  const out: Record<string, string> = {};
  for (const row of (data || []) as { label_key: string; group_key: string }[]) out[row.label_key] = row.group_key;
  return out;
}

async function loadCostGroups__read() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const household = await getActiveHouseholdContext(supabase, user);
  const filter = visibleDataOrFilter(household);
  const [groups, { data: pets }] = await Promise.all([
    readCostGroups(supabase, filter),
    household?.householdId
      ? supabase.from("household_pets").select("name").eq("household_id", household.householdId).eq("status", "active")
      : supabase.from("household_pets").select("name").eq("user_id", user.id).eq("status", "active"),
  ]);
  return { groups, petNames: ((pets || []) as { name: string | null }[]).map((p) => String(p.name || "")).filter(Boolean) };
}
export async function loadCostGroups() { return runFriendly(() => loadCostGroups__read()); }

const GROUP_KEYS = ["home", "cars", "children", "food", "protection", "pets", "other", "personal", "none"];

/** Put a line in a household group by hand ("auto" goes back to Loop's guess). Changes Household costs and the emergency fund. */
async function saveCostGroup__write(label: string, group: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const { choiceKey } = await import("@/lib/household/essential-costs");
  const key = choiceKey(String(label || ""));
  if (!key) throw new Error("That line has no name.");
  if (group !== "auto" && !GROUP_KEYS.includes(group)) throw new Error("Pick one of the groups.");
  const household = await getActiveHouseholdContext(supabase, user);
  const filter = visibleDataOrFilter(household);
  const { data: existing } = await supabase.from("household_cost_groups").select("id").eq("label_key", key).or(filter).limit(1).maybeSingle();
  if (group === "auto") {
    if (existing) {
      const { error } = await changeRecord(supabase.from("household_cost_groups").delete(), existing.id, household);
      if (error) throw new Error("That didn't save. Try again.");
    }
    return { label_key: key, group: null };
  }
  if (existing) {
    const { error } = await changeRecord(supabase.from("household_cost_groups").update({ group_key: group, updated_at: new Date().toISOString() }), existing.id, household);
    if (error) throw new Error("That didn't save. Try again.");
  } else {
    const { error } = await supabase.from("household_cost_groups").insert({ ...householdWriteFields(household, user.id), visibility_scope: household?.householdId ? "household" : "private", label_key: key, group_key: group });
    if (error) throw new Error("That didn't save. Try again.");
  }
  return { label_key: key, group };
}
export async function saveCostGroup(label: string, group: string) { return runFriendly(() => saveCostGroup__write(label, group)); }
