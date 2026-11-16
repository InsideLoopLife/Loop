"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { changeRecord, getActiveHouseholdContext, householdMemberDataOrFilter, householdWriteFields } from "@/lib/auth/household-context";
import { KIND_BY_KEY, ROOM_LABELS, type HomeItem, type HomeRoom } from "@/lib/home/items";

const COLUMNS = "id, user_id, home_id, room, kind, label, brand, model, purchased_on, price, retailer, warranty_months, extended_warranty_ends_on, warranty_provider, expected_life_years, replacement_cost, notes, status";

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const household = await getActiveHouseholdContext(supabase, user);
  return { supabase, user, household };
}

export async function listHomeItems(): Promise<{ items: HomeItem[]; userId: string }> {
  const { supabase, user, household } = await context();
  const { data, error } = await supabase
    .from("home_items")
    .select(COLUMNS)
    .or(householdMemberDataOrFilter(household))
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  return { items: (data || []) as HomeItem[], userId: user.id };
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
const isoDate = (value: unknown) => {
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export type HomeItemInput = {
  id?: string | null;
  homeId?: string | null;
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
