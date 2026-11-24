"use server";

import { revalidatePath } from "next/cache";
import { runFriendly } from "@/lib/actions/friendly";
import { createClient } from "@/lib/supabase/server";
import { changeRecord, getActiveHouseholdContext, householdMemberDataOrFilter, householdWriteFields } from "@/lib/auth/household-context";
import type { FuelType } from "@/lib/vehicles/running-costs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FUELS: FuelType[] = ["petrol", "diesel", "hybrid", "plug_in_hybrid", "electric"];
const OWNERSHIP = ["lease", "pcp", "hp", "loan", "owned"];

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
}

const str = (value: unknown, max: number) => {
  const t = String(value ?? "").trim();
  return t ? t.slice(0, max) : null;
};
const num = (value: unknown, min: number, max: number, label: string) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Check ${label}.`);
  return Math.round(n * 100) / 100;
};
const int = (value: unknown, min: number, max: number, label: string) => {
  const n = num(value, min, max, label);
  return n === null ? null : Math.round(n);
};
const day = (value: unknown, label: string) => {
  const t = String(value ?? "").trim();
  if (!t) return null;
  if (!DATE.test(t)) throw new Error(`Check the ${label} date.`);
  return t;
};

async function saveCar__save(payload: string) {
  const { supabase, user, household, filter } = await context();
  const raw = JSON.parse(String(payload || "{}"));
  const name = str(raw.name, 80);
  if (!name) throw new Error("Give the car a name, like \"VW Tiguan\".");
  const registration = raw.registration ? String(raw.registration).replace(/\s+/g, "").toUpperCase() : null;
  if (registration && !/^[A-Z0-9]{2,8}$/.test(registration)) throw new Error("Check the registration.");
  const fuel = FUELS.includes(raw.fuel_type) ? raw.fuel_type : "petrol";
  const ownership = OWNERSHIP.includes(raw.ownership) ? raw.ownership : "owned";
  const plannedItemId = String(raw.planned_item_id || "").trim();
  if (plannedItemId && !UUID.test(plannedItemId)) throw new Error("That bill isn't available.");
  const personId = String(raw.person_id || "").trim();

  if (plannedItemId) {
    const { data } = await supabase.from("planned_items").select("id").eq("id", plannedItemId).or(filter).maybeSingle();
    if (!data) throw new Error("That bill isn't available.");
  }
  const start = day(raw.agreement_start, "agreement start");
  const end = day(raw.agreement_end, "agreement end");
  if (start && end && end < start) throw new Error("The agreement ends before it starts.");

  const readings = (Array.isArray(raw.mot_mileage) ? raw.mot_mileage : [])
    .map((r: any) => ({ date: String(r?.date || ""), miles: Math.round(Number(r?.miles || 0)) }))
    .filter((r: { date: string; miles: number }) => DATE.test(r.date) && r.miles > 0 && r.miles < 1_000_000)
    .slice(0, 12);
  const lookup = raw.lookup && typeof raw.lookup === "object"
    ? {
        sources: (Array.isArray(raw.lookup.sources) ? raw.lookup.sources : []).map(String).filter((s: string) => /^https:\/\//.test(s)).slice(0, 4),
        lookedUpAt: DATE.test(String(raw.lookup.lookedUpAt || "")) ? raw.lookup.lookedUpAt : null,
        insuranceGroup: num(raw.lookup.insuranceGroup, 1, 50, "the insurance group"),
        insuranceAnnualLow: num(raw.lookup.insuranceAnnualLow, 0, 20_000, "insurance"),
        insuranceAnnualHigh: num(raw.lookup.insuranceAnnualHigh, 0, 20_000, "insurance"),
      }
    : null;

  const row = {
    name,
    registration,
    person_id: UUID.test(personId) ? personId : null,
    make: str(raw.make, 40),
    model: str(raw.model, 60),
    variant: str(raw.variant, 80),
    colour: str(raw.colour, 30),
    year: int(raw.year, 1950, 2100, "the year"),
    fuel_type: fuel,
    engine_cc: int(raw.engine_cc, 0, 10_000, "the engine size"),
    co2_g_km: int(raw.co2_g_km, 0, 600, "CO2"),
    list_price: num(raw.list_price, 0, 1_000_000, "the list price"),
    ownership,
    planned_item_id: plannedItemId || null,
    agreement_start: ownership === "owned" ? null : start,
    agreement_end: ownership === "owned" ? null : end,
    mileage_allowance_annual: ["lease", "pcp"].includes(ownership) ? int(raw.mileage_allowance_annual, 0, 200_000, "the mileage allowance") : null,
    excess_pence_per_mile: ["lease", "pcp"].includes(ownership) ? num(raw.excess_pence_per_mile, 0, 500, "the excess mileage charge") : null,
    final_payment: ownership === "pcp" ? num(raw.final_payment, 0, 1_000_000, "the final payment") : null,
    odometer_miles: int(raw.odometer_miles, 0, 999_999, "the mileage"),
    odometer_date: day(raw.odometer_date, "mileage reading"),
    mot_due: day(raw.mot_due, "MOT"),
    tax_due: day(raw.tax_due, "road tax"),
    tax_included: Boolean(raw.tax_included),
    insurer: str(raw.insurer, 60),
    insurance_renewal: day(raw.insurance_renewal, "insurance renewal"),
    insurance_annual: num(raw.insurance_annual, 0, 20_000, "the insurance cost"),
    insurance_group: int(raw.insurance_group, 1, 50, "the insurance group"),
    maintenance_included: Boolean(raw.maintenance_included),
    maintenance_annual: num(raw.maintenance_annual, 0, 20_000, "the maintenance cost"),
    annual_miles: int(raw.annual_miles, 0, 200_000, "miles a year"),
    mpg: num(raw.mpg, 5, 400, "mpg"),
    miles_per_kwh: num(raw.miles_per_kwh, 0.5, 10, "miles per kWh"),
    electric_share: num(raw.electric_share, 0, 1, "the electric share"),
    mot_mileage: readings,
    lookup,
    notes: str(raw.notes, 500),
    updated_at: new Date().toISOString(),
  };

  const id = String(raw.id || "").trim();
  if (id) {
    if (!UUID.test(id)) throw new Error("That car isn't available.");
    const { data: existing } = await supabase.from("household_cars").select("id").eq("id", id).or(filter).maybeSingle();
    if (!existing) throw new Error("That car isn't available.");
    const { error } = await changeRecord(supabase.from("household_cars").update(row), id, household);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("household_cars").insert({ ...householdWriteFields(household, user.id), visibility_scope: household?.householdId ? "household" : "private", ...row });
    if (error) throw new Error(error.message);
  }
  revalidate();
}

async function removeCar__save(id: string) {
  const { supabase, household, filter } = await context();
  if (!UUID.test(id)) throw new Error("That car isn't available.");
  const { data: existing } = await supabase.from("household_cars").select("id").eq("id", id).or(filter).maybeSingle();
  if (!existing) throw new Error("That car isn't available.");
  const { error } = await changeRecord(supabase.from("household_cars").delete(), id, household);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function saveCar(payload: string) { return runFriendly(() => saveCar__save(payload)); }
export async function removeCar(id: string) { return runFriendly(() => removeCar__save(id)); }
