"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { changeRecord, getActiveHouseholdContext, householdMemberDataOrFilter, householdWriteFields } from "@/lib/auth/household-context";
import { KIND_BY_KEY, PRICE_CAP_RATES, ROOM_LABELS, type EnergyRates, type HomeItem, type HomeRoom } from "@/lib/home/items";
import { enforceUserRateLimit } from "@/lib/security/rate-limit";
import { lookupProductPage, type ProductPreview } from "@/lib/home/product-preview";
import { searchTariffs, type TariffSearch } from "@/lib/home/tariffs";
import { sanitisePlan, type FloorPlan } from "@/lib/home/floor-plan";

const COLUMNS = "id, user_id, home_id, space_id, room, kind, label, brand, model, purchased_on, price, retailer, warranty_months, extended_warranty_ends_on, warranty_provider, expected_life_years, replacement_cost, notes, product_url, image_url, fuel, energy_per_use_kwh, uses_per_week, power_watts, hours_per_day, annual_kwh, status";

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const household = await getActiveHouseholdContext(supabase, user);
  return { supabase, user, household };
}

export async function listHomeItems(homeId?: string | null): Promise<{ items: HomeItem[]; userId: string; floorPlan: FloorPlan | null; rates: EnergyRates & { own: boolean; tariff: SavedTariff | null } }> {
  const { supabase, user, household } = await context();
  const [{ data, error }, planResult] = await Promise.all([
    supabase
      .from("home_items")
      .select(COLUMNS)
      .or(householdMemberDataOrFilter(household))
      .order("created_at", { ascending: true })
      .limit(500),
    homeId ? supabase.from("homes").select("floor_plan, electricity_rate_pence, gas_rate_pence, energy_tariff").eq("id", homeId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (error) throw new Error(error.message);
  const home = (planResult as any)?.data;
  const raw = home?.floor_plan;
  const electricity = home?.electricity_rate_pence != null ? Number(home.electricity_rate_pence) : null;
  const gas = home?.gas_rate_pence != null ? Number(home.gas_rate_pence) : null;
  return {
    items: (data || []) as HomeItem[],
    userId: user.id,
    floorPlan: raw ? sanitisePlan(raw) : null,
    rates: { electricity: electricity ?? PRICE_CAP_RATES.electricity, gas: gas ?? PRICE_CAP_RATES.gas, own: electricity != null || gas != null, tariff: (home?.energy_tariff as SavedTariff | null) ?? null },
  };
}

export type SavedTariff = { supplier: string; name: string; code?: string | null; region?: string | null; regionName?: string | null; fixed?: boolean; source: "octopus_api" | "price_cap" | "bill"; savedAt: string };

export async function findTariffs(homeId: string | null, supplier: string): Promise<TariffSearch> {
  const { supabase, user } = await context();
  if (!supplier.trim()) throw new Error("Pick your supplier.");
  const limited = await enforceUserRateLimit({ userId: user.id, bucket: "tariff_search", limit: 40, windowSeconds: 3600 });
  if (!limited.allowed) throw new Error("That's a lot of lookups — try again in a bit.");
  const { data: home } = homeId ? await supabase.from("homes").select("postcode").eq("id", homeId).maybeSingle() : { data: null };
  return searchTariffs(supplier.slice(0, 60), (home as any)?.postcode ?? null);
}

export async function saveEnergyRates(homeId: string, electricity: number | string | null, gas: number | string | null, tariff?: Omit<SavedTariff, "savedAt"> | null) {
  const { supabase } = await context();
  if (!homeId) throw new Error("Add your home first.");
  const clean = (value: number | string | null) => { const n = value === null || value === "" ? null : Number(value); return n != null && Number.isFinite(n) && n > 0 && n < 200 ? Math.round(n * 100) / 100 : null; };
  const label = (value: unknown, max = 80) => String(value ?? "").trim().slice(0, max);
  const savedTariff: SavedTariff | null = tariff && label(tariff.supplier) ? {
    supplier: label(tariff.supplier),
    name: label(tariff.name) || "My tariff",
    code: tariff.code ? label(tariff.code, 60) : null,
    region: tariff.region ? label(tariff.region, 4) : null,
    regionName: tariff.regionName ? label(tariff.regionName, 40) : null,
    fixed: Boolean(tariff.fixed),
    source: tariff.source === "octopus_api" || tariff.source === "price_cap" ? tariff.source : "bill",
    savedAt: new Date().toISOString(),
  } : null;
  const { data, error } = await supabase.from("homes").update({ electricity_rate_pence: clean(electricity), gas_rate_pence: clean(gas), energy_tariff: savedTariff }).eq("id", homeId).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only the person who added this home can change its energy prices.");
  revalidatePath("/mortgage");
  return { ok: true };
}

/** Name, picture and price from a shop link. Many big shops block this; then it returns what it could get. */
export async function previewProductLink(url: string): Promise<ProductPreview> {
  const { user } = await context();
  const limited = await enforceUserRateLimit({ userId: user.id, bucket: "home_item_preview", limit: 30, windowSeconds: 3600 });
  if (!limited.allowed) throw new Error("That's a lot of lookups — try again in a bit.");
  return lookupProductPage(url);
}

export async function saveFloorPlan(homeId: string, plan: unknown): Promise<{ ok: true }> {
  const { supabase } = await context();
  if (!homeId) throw new Error("Add your home first.");
  const { data, error } = await supabase.from("homes").update({ floor_plan: sanitisePlan(plan) }).eq("id", homeId).select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only the person who added this home can change its floor plan.");
  revalidatePath("/mortgage");
  return { ok: true };
}

const text = (value: unknown, max = 120) => {
  const clean = String(value ?? "").trim().slice(0, max);
  return clean || null;
};
const amount = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[£,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null;
};
const bounded = (value: unknown, min: number, max: number) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const isoDate = (value: unknown) => {
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export type HomeItemInput = {
  id?: string | null;
  homeId?: string | null;
  spaceId?: string | null;
  productUrl?: string | null;
  imageUrl?: string | null;
  fuel?: string | null;
  energyPerUseKwh?: number | string | null;
  usesPerWeek?: number | string | null;
  powerWatts?: number | string | null;
  hoursPerDay?: number | string | null;
  annualKwh?: number | string | null;
  room: string;
  kind: string;
  label: string;
  brand?: string | null;
  model?: string | null;
  purchasedOn?: string | null;
  price?: string | number | null;
  retailer?: string | null;
  warrantyMonths?: number | string | null;
  extendedWarrantyEndsOn?: string | null;
  warrantyProvider?: string | null;
  expectedLifeYears?: number | string | null;
  replacementCost?: string | number | null;
  notes?: string | null;
};

export async function saveHomeItem(input: HomeItemInput): Promise<{ ok: true; id: string }> {
  const { supabase, user, household } = await context();
  const kind = KIND_BY_KEY.has(input.kind) ? input.kind : "other";
  const room = (input.room in ROOM_LABELS ? input.room : KIND_BY_KEY.get(kind)?.room || "other") as HomeRoom;
  const label = text(input.label) || KIND_BY_KEY.get(kind)?.label || "Item";
  const warranty = input.warrantyMonths === null || input.warrantyMonths === undefined || input.warrantyMonths === "" ? null : Math.max(0, Math.min(600, Math.round(Number(input.warrantyMonths))));
  const life = input.expectedLifeYears === null || input.expectedLifeYears === undefined || input.expectedLifeYears === "" ? null : Math.max(0.5, Math.min(100, Number(input.expectedLifeYears)));
  const fields = {
    home_id: input.homeId || null,
    space_id: input.spaceId ? String(input.spaceId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || null : null,
    room,
    kind,
    label,
    brand: text(input.brand, 60),
    model: text(input.model, 80),
    purchased_on: isoDate(input.purchasedOn),
    price: amount(input.price),
    retailer: text(input.retailer, 80),
    warranty_months: Number.isFinite(warranty as number) ? warranty : null,
    extended_warranty_ends_on: isoDate(input.extendedWarrantyEndsOn),
    warranty_provider: text(input.warrantyProvider, 80),
    expected_life_years: Number.isFinite(life as number) ? life : null,
    replacement_cost: amount(input.replacementCost),
    notes: text(input.notes, 500),
    product_url: (() => { const raw = String(input.productUrl ?? "").trim(); return /^https?:\/\/\S+$/i.test(raw) && raw.length <= 500 ? raw : null; })(),
    image_url: (() => { const raw = String(input.imageUrl ?? "").trim(); return /^https:\/\/\S+$/i.test(raw) && raw.length <= 1000 ? raw : null; })(),
    fuel: input.fuel === "electric" || input.fuel === "gas" || input.fuel === "none" ? input.fuel : null,
    energy_per_use_kwh: bounded(input.energyPerUseKwh, 0, 500),
    uses_per_week: bounded(input.usesPerWeek, 0, 500),
    power_watts: bounded(input.powerWatts, 0, 50000),
    hours_per_day: bounded(input.hoursPerDay, 0, 24),
    annual_kwh: bounded(input.annualKwh, 0, 100000),
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { error } = await changeRecord(supabase.from("home_items").update(fields), input.id, household);
    if (error) throw new Error(error.message);
    revalidate();
    return { ok: true, id: input.id };
  }
  const { data, error } = await supabase.from("home_items").insert({ ...householdWriteFields(household, user.id), ...fields }).select("id").single();
  if (error) throw new Error(error.message);
  revalidate();
  return { ok: true, id: data.id };
}

export async function setHomeItemStatus(id: string, status: "active" | "replaced" | "gone") {
  const { supabase, household } = await context();
  if (!["active", "replaced", "gone"].includes(status)) throw new Error("Unknown status.");
  const { error } = await changeRecord(supabase.from("home_items").update({ status, updated_at: new Date().toISOString() }), id, household);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteHomeItem(id: string) {
  const { supabase, household } = await context();
  const { error } = await changeRecord(supabase.from("home_items").delete(), id, household);
  if (error) throw new Error(error.message);
  revalidate();
}

function revalidate() {
  revalidatePath("/mortgage");
  revalidatePath("/calendar");
}
