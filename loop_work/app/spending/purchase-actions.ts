"use server";

import { revalidatePath } from "next/cache";
import { runFriendly } from "@/lib/actions/friendly";
import { createClient } from "@/lib/supabase/server";
import { changeRecord, getActiveHouseholdContext, householdMemberDataOrFilter, householdWriteFields, visibleDataOrFilter } from "@/lib/auth/household-context";
import { addDays, carCostsFor, PURCHASE_TAG, purchaseItems, type CarDetails, type OneOffCost, type Purchase, type ReplacedLine } from "@/lib/planning/purchase-plan";
import { loadHouseholdForecast } from "@/lib/planning/household-forecast";
import { effectiveEnergy } from "@/lib/energy/tariff";
import type { FuelType } from "@/lib/vehicles/running-costs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FUELS: FuelType[] = ["petrol", "diesel", "hybrid", "plug_in_hybrid", "electric"];
const COLUMNS = "id, kind, name, status, start_date, monthly_cost, term_months, upfront_cost, one_off_costs, replaces_planned_item_id, replaced_previous_end_date, replaced_was_changed, car, category_id, person_id, notes, updated_at";

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const household = await getActiveHouseholdContext(supabase, user);
  return { supabase, user, household, filter: householdMemberDataOrFilter(household) };
}

function revalidate() {
  revalidatePath("/spending");
  revalidatePath("/calendar");
  revalidatePath("/financial-flow");
  revalidatePath("/dashboard");
}

const money = (value: unknown, max = 10_000_000) => {
  const n = Math.round(Number(value || 0) * 100) / 100;
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error("Check the amounts — they need to be £0 or more.");
  return n;
};
const optional = (value: unknown, min: number, max: number) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : null;
};

function cleanPurchase(raw: any): Omit<Purchase, "id" | "status"> & { notes: string | null } {
  const name = String(raw?.name || "").trim().slice(0, 140);
  if (!name) throw new Error("Say what you're planning to buy.");
  const kind = raw?.kind === "car" ? "car" : "other";
  const start = String(raw?.start_date || "").trim();
  if (start && !DATE.test(start)) throw new Error("Check the date.");
  const term = raw?.term_months === null || raw?.term_months === "" || raw?.term_months === undefined ? null : Math.round(Number(raw.term_months));
  if (term !== null && !(term >= 1 && term <= 120)) throw new Error("The number of monthly payments needs to be between 1 and 120.");
  const replaces = String(raw?.replaces_planned_item_id || "").trim();
  if (replaces && !UUID.test(replaces)) throw new Error("That bill isn't available.");
  const oneOffs: OneOffCost[] = (Array.isArray(raw?.one_off_costs) ? raw.one_off_costs : [])
    .slice(0, 12)
    .map((cost: any) => ({ label: String(cost?.label || "").trim().slice(0, 80), amount: money(cost?.amount), date: DATE.test(String(cost?.date || "")) ? String(cost.date) : null }))
    .filter((cost: OneOffCost) => cost.amount > 0);
  const car = raw?.car || {};
  const lookup = car.lookup && typeof car.lookup === "object" ? car.lookup : null;
  return {
    kind,
    name,
    start_date: start || null,
    monthly_cost: money(raw?.monthly_cost),
    term_months: term,
    upfront_cost: money(raw?.upfront_cost),
    one_off_costs: oneOffs,
    replaces_planned_item_id: replaces || null,
    category_id: UUID.test(String(raw?.category_id || "")) ? String(raw.category_id) : null,
    person_id: UUID.test(String(raw?.person_id || "")) ? String(raw.person_id) : null,
    notes: String(raw?.notes || "").trim().slice(0, 500) || null,
    car: kind === "car"
      ? {
          fuelType: FUELS.includes(car.fuelType) ? car.fuelType : "petrol",
          annualMiles: optional(car.annualMiles, 0, 100_000),
          mpg: optional(car.mpg, 5, 400),
          milesPerKwh: optional(car.milesPerKwh, 0.5, 10),
          electricShare: optional(car.electricShare, 0, 1),
          insuranceMonthly: optional(car.insuranceMonthly, 0, 2_000),
          listPrice: optional(car.listPrice, 0, 1_000_000),
          taxIncluded: Boolean(car.taxIncluded),
          serviceIncluded: Boolean(car.serviceIncluded),
          currentRunningMonthly: optional(car.currentRunningMonthly, 0, 5_000),
          lookup: lookup
            ? {
                matched: String(lookup.matched || "").slice(0, 140),
                insuranceGroup: optional(lookup.insuranceGroup, 1, 50),
                insuranceAnnualLow: optional(lookup.insuranceAnnualLow, 0, 20_000),
                insuranceAnnualHigh: optional(lookup.insuranceAnnualHigh, 0, 20_000),
                wltpMpg: optional(lookup.wltpMpg, 5, 400),
                realWorldMpg: optional(lookup.realWorldMpg, 5, 400),
                sources: (Array.isArray(lookup.sources) ? lookup.sources : []).map(String).filter((s: string) => /^https:\/\//.test(s)).slice(0, 4),
                lookedUpAt: DATE.test(String(lookup.lookedUpAt || "")) ? String(lookup.lookedUpAt) : null,
              }
            : null,
        } as CarDetails
      : {},
  };
}

async function electricityPence(supabase: any, household: any) {
  try {
    const energy = await effectiveEnergy(supabase, householdMemberDataOrFilter(household), null);
    return { pence: energy.electricityNight || energy.electricity, label: energy.electricityNight ? `${energy.label} (night rate)` : energy.label };
  } catch {
    return { pence: 26.32, label: "Ofgem price cap (GB average)" };
  }
}

async function carCategoryId(supabase: any, filter: string) {
  const { data } = await supabase.from("spending_categories").select("id, name").or(filter);
  const rows = (data || []) as { id: string; name: string }[];
  return rows.find((row) => /^car(s)?$/i.test(row.name.trim()))?.id || rows.find((row) => /\b(car|motoring|vehicle|transport)\b/i.test(row.name))?.id || null;
}

async function syncIntoPlan(supabase: any, user: any, household: any, filter: string, row: any) {
  const tag = PURCHASE_TAG(row.id);
  // Take out whatever this purchase put in before, then put the current version in.
  const { error: removeError } = await supabase.from("planned_items").delete().like("notes", `%${tag}%`).or(filter);
  if (removeError) throw new Error(removeError.message);

  const purchase = row as Purchase & { id: string };
  const energy = await electricityPence(supabase, household);
  const categoryId = purchase.category_id || (purchase.kind === "car" ? await carCategoryId(supabase, filter) : null);
  const items = purchaseItems(purchase, { carCosts: carCostsFor(purchase, energy.pence), categoryId });
  if (items.length) {
    const { error } = await supabase.from("planned_items").insert(items.map((item) => ({
      ...householdWriteFields(household, user.id),
      visibility_scope: household?.householdId ? "household" : "private",
      ...item,
    })));
    if (error) throw new Error(error.message);
  }

  // The line it replaces stops the day before the new one starts.
  let replacedPatch: Record<string, unknown> = {};
  if (purchase.replaces_planned_item_id && purchase.start_date) {
    const { data: line } = await supabase.from("planned_items").select("id, end_date").eq("id", purchase.replaces_planned_item_id).or(filter).maybeSingle();
    if (line) {
      const newEnd = addDays(purchase.start_date, -1);
      const original = row.replaced_was_changed ? row.replaced_previous_end_date : line.end_date;
      if (!original || original > newEnd) {
        const { error } = await changeRecord(supabase.from("planned_items").update({ end_date: newEnd, updated_at: new Date().toISOString() }), line.id, household);
        if (error) throw new Error(error.message);
        replacedPatch = { replaced_previous_end_date: original, replaced_was_changed: true };
      }
    }
  }
  return replacedPatch;
}

async function restoreReplaced(supabase: any, household: any, filter: string, row: any) {
  if (!row.replaced_was_changed || !row.replaces_planned_item_id) return;
  const { data: line } = await supabase.from("planned_items").select("id").eq("id", row.replaces_planned_item_id).or(filter).maybeSingle();
  if (!line) return;
  const { error } = await changeRecord(supabase.from("planned_items").update({ end_date: row.replaced_previous_end_date || null, updated_at: new Date().toISOString() }), line.id, household);
  if (error) throw new Error(error.message);
}

async function savePurchase__save(payload: string, opts: { addToPlan?: boolean } = {}) {
  const { supabase, user, household, filter } = await context();
  const raw = JSON.parse(String(payload || "{}"));
  const clean = cleanPurchase(raw);
  const id = String(raw?.id || "").trim();

  if (clean.replaces_planned_item_id) {
    const { data: line } = await supabase.from("planned_items").select("id").eq("id", clean.replaces_planned_item_id).or(filter).maybeSingle();
    if (!line) throw new Error("That bill isn't available.");
  }

  let row: any;
  if (id) {
    if (!UUID.test(id)) throw new Error("That plan isn't available.");
    const { data: existing } = await supabase.from("planned_purchases").select(COLUMNS).eq("id", id).or(filter).maybeSingle();
    if (!existing) throw new Error("That plan isn't available.");
    // Switching which bill it replaces: give the old one its end date back first.
    if (existing.status === "planned" && existing.replaces_planned_item_id !== clean.replaces_planned_item_id) {
      await restoreReplaced(supabase, household, filter, existing);
      Object.assign(clean, { replaced_previous_end_date: null, replaced_was_changed: false });
      existing.replaced_was_changed = false;
    }
    const { error } = await changeRecord(supabase.from("planned_purchases").update({ ...clean, updated_at: new Date().toISOString() }), id, household);
    if (error) throw new Error(error.message);
    row = { ...existing, ...clean, id };
  } else {
    const { data, error } = await supabase
      .from("planned_purchases")
      .insert({ ...householdWriteFields(household, user.id), visibility_scope: household?.householdId ? "household" : "private", ...clean, status: "draft" })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    row = data;
  }

  const shouldBeInPlan = opts.addToPlan || row.status === "planned";
  if (shouldBeInPlan) {
    if (!row.start_date) throw new Error("Pick a date to add it to your plan.");
    const patch = await syncIntoPlan(supabase, user, household, filter, row);
    const { error } = await changeRecord(supabase.from("planned_purchases").update({ status: "planned", ...patch }), row.id, household);
    if (error) throw new Error(error.message);
  }
  revalidate();
  return { id: row.id as string };
}

async function removeFromPlan__save(id: string) {
  const { supabase, household, filter } = await context();
  if (!UUID.test(id)) throw new Error("That plan isn't available.");
  const { data: row } = await supabase.from("planned_purchases").select(COLUMNS).eq("id", id).or(filter).maybeSingle();
  if (!row) throw new Error("That plan isn't available.");
  const { error: removeError } = await supabase.from("planned_items").delete().like("notes", `%${PURCHASE_TAG(id)}%`).or(filter);
  if (removeError) throw new Error(removeError.message);
  await restoreReplaced(supabase, household, filter, row);
  const { error } = await changeRecord(supabase.from("planned_purchases").update({ status: "draft", replaced_was_changed: false, replaced_previous_end_date: null }), id, household);
  if (error) throw new Error(error.message);
  revalidate();
}

async function deletePurchase__save(id: string) {
  const { supabase, household, filter } = await context();
  if (!UUID.test(id)) throw new Error("That plan isn't available.");
  const { data: row } = await supabase.from("planned_purchases").select(COLUMNS).eq("id", id).or(filter).maybeSingle();
  if (!row) throw new Error("That plan isn't available.");
  if (row.status === "planned") await removeFromPlan__save(id);
  const { error } = await changeRecord(supabase.from("planned_purchases").delete(), id, household);
  if (error) throw new Error(error.message);
  revalidate();
}

/** Forecast for checking one purchase: without its own lines and without the line it replaces. */
async function loadPurchaseContext__read(purchaseId: string | null, replacesId: string | null) {
  const { supabase, user, household, filter } = await context();
  const exclude: string[] = [];
  let replaced: ReplacedLine | null = null;
  let previousEnd: string | null | undefined;
  if (purchaseId && UUID.test(purchaseId)) {
    const { data: own } = await supabase.from("planned_items").select("id").like("notes", `%${PURCHASE_TAG(purchaseId)}%`).or(filter);
    exclude.push(...((own || []) as { id: string }[]).map((item) => item.id));
    const { data: row } = await supabase.from("planned_purchases").select("replaces_planned_item_id, replaced_previous_end_date, replaced_was_changed").eq("id", purchaseId).or(filter).maybeSingle();
    if (row?.replaced_was_changed && row.replaces_planned_item_id === replacesId) previousEnd = row.replaced_previous_end_date;
  }
  if (replacesId && UUID.test(replacesId)) {
    const { data: line } = await supabase.from("planned_items").select("id, label, amount, start_date, end_date, recurrence").eq("id", replacesId).or(filter).maybeSingle();
    if (line) {
      exclude.push(line.id);
      replaced = { id: line.id, label: line.label, amount: Number(line.amount || 0), start_date: line.start_date, end_date: previousEnd !== undefined ? previousEnd : line.end_date };
    }
  }
  const [forecast, energy] = await Promise.all([
    loadHouseholdForecast(supabase, { userId: user.id, filter: visibleDataOrFilter(household), count: 36, excludePlannedItemIds: exclude }),
    electricityPence(supabase, household),
  ]);
  return {
    forecast: forecast.forecast.map((row) => ({ month: row.month, leftOver: row.leftOver })),
    savingsNow: forecast.savingsNow,
    buffer: forecast.buffer,
    bufferBasis: forecast.bufferBasis,
    replaced,
    electricityPence: energy.pence,
    electricityLabel: energy.label,
  };
}

export async function savePurchase(payload: string) { return runFriendly(() => savePurchase__save(payload)); }
export async function savePurchaseToPlan(payload: string) { return runFriendly(() => savePurchase__save(payload, { addToPlan: true })); }
export async function removePurchaseFromPlan(id: string) { return runFriendly(() => removeFromPlan__save(id)); }
export async function deletePurchase(id: string) { return runFriendly(() => deletePurchase__save(id)); }
export async function loadPurchaseContext(purchaseId: string | null, replacesId: string | null) { return runFriendly(() => loadPurchaseContext__read(purchaseId, replacesId)); }
