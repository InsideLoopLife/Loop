"use server";

// Household energy tariff, shared across Loop. Read a bill → confirm → save; or pick a tariff.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { changeRecord, getActiveHouseholdContext, householdMemberDataOrFilter, householdWriteFields } from "@/lib/auth/household-context";
import { enforceUserRateLimit } from "@/lib/security/rate-limit";
import { readEnergyBill, type BillReadResult } from "@/lib/energy/bill-reader";
import { effectiveEnergy, type EffectiveEnergy } from "@/lib/energy/tariff";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const household = await getActiveHouseholdContext(supabase, user);
  return { supabase, user, household, filter: householdMemberDataOrFilter(household) };
}

async function homePostcode(supabase: any, homeId: string | null | undefined) {
  if (!homeId) return null;
  const { data } = await supabase.from("homes").select("postcode").eq("id", homeId).maybeSingle();
  return (data as any)?.postcode ?? null;
}

export async function getEnergyProfile(homeId?: string | null): Promise<EffectiveEnergy> {
  const { supabase, filter } = await context();
  return effectiveEnergy(supabase, filter, await homePostcode(supabase, homeId));
}

/** Reads an uploaded bill/screenshot or pasted text. Nothing is saved. */
export async function readEnergyBillUpload(formData: FormData): Promise<BillReadResult> {
  const { supabase, user } = await context();
  const limited = await enforceUserRateLimit({ userId: user.id, bucket: "energy_bill_read", limit: 20, windowSeconds: 3600 });
  if (!limited.allowed) throw new Error("That's a lot of bills in an hour — try again shortly.");
  const file = formData.get("file");
  const text = String(formData.get("text") || "");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) throw new Error("That file is over 10MB — try a screenshot of the tariff section.");
    if (!/^(image\/(png|jpe?g|webp|heic|heif)|application\/pdf|text\/plain)$/i.test(file.type || "") && !/\.(pdf|png|jpe?g|webp|heic|txt)$/i.test(file.name)) {
      throw new Error("Use a photo, screenshot or PDF.");
    }
    return readEnergyBill({ file, text }, supabase, user.id);
  }
  return readEnergyBill({ text }, supabase, user.id);
}

export type TariffInput = {
  homeId?: string | null;
  supplier: string;
  tariffName?: string | null;
  fuel?: string | null;
  electricityUnitP?: number | string | null;
  electricityNightUnitP?: number | string | null;
  electricityStandingP?: number | string | null;
  gasUnitP?: number | string | null;
  gasStandingP?: number | string | null;
  paymentMethod?: string | null;
  fixedUntil?: string | null;
  exitFeeGbp?: number | string | null;
  monthlyPaymentGbp?: number | string | null;
  annualElectricityKwh?: number | string | null;
  annualGasKwh?: number | string | null;
  gasTariffName?: string | null;
  gasFixedUntil?: string | null;
  gasExitFeeGbp?: number | string | null;
  offPeakStart?: string | null;
  offPeakEnd?: string | null;
  region?: string | null;
  source: "bill_upload" | "octopus_api" | "price_cap" | "manual";
  sourceFilename?: string | null;
};

const n = (value: unknown, min: number, max: number) => {
  if (value === null || value === undefined || value === "") return null;
  const v = Number(String(value).replace(/[£p,\s]/gi, ""));
  return Number.isFinite(v) && v >= min && v <= max ? v : null;
};
const t = (value: unknown, max = 80) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

export async function saveEnergyTariff(input: TariffInput) {
  const { supabase, user, household, filter } = await context();
  const supplier = t(input.supplier, 60);
  if (!supplier) throw new Error("Add the supplier.");
  const electricity = n(input.electricityUnitP, 0, 200);
  const gas = n(input.gasUnitP, 0, 200);
  if (electricity == null && gas == null) throw new Error("Add at least one unit rate.");
  const row = {
    home_id: input.homeId || null,
    supplier,
    tariff_name: t(input.tariffName),
    fuel: input.fuel === "electricity" || input.fuel === "gas" ? input.fuel : electricity != null && gas == null ? "electricity" : gas != null && electricity == null ? "gas" : "dual",
    electricity_unit_p: electricity,
    electricity_night_unit_p: n(input.electricityNightUnitP, 0, 200),
    electricity_standing_p: n(input.electricityStandingP, 0, 500),
    gas_unit_p: gas,
    gas_standing_p: n(input.gasStandingP, 0, 500),
    payment_method: t(input.paymentMethod, 40),
    fixed_until: typeof input.fixedUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.fixedUntil) ? input.fixedUntil : null,
    exit_fee_gbp: n(input.exitFeeGbp, 0, 1000),
    monthly_payment_gbp: n(input.monthlyPaymentGbp, 0, 5000),
    annual_electricity_kwh: n(input.annualElectricityKwh, 0, 100000),
    annual_gas_kwh: n(input.annualGasKwh, 0, 200000),
    gas_tariff_name: t(input.gasTariffName),
    gas_fixed_until: typeof input.gasFixedUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.gasFixedUntil) ? input.gasFixedUntil : null,
    gas_exit_fee_gbp: n(input.gasExitFeeGbp, 0, 1000),
    off_peak_start: time(input.offPeakStart),
    off_peak_end: time(input.offPeakEnd),
    region: t(input.region, 4),
    source: ["bill_upload", "octopus_api", "price_cap", "manual"].includes(input.source) ? input.source : "manual",
    source_filename: t(input.sourceFilename, 120),
    is_current: true,
    confirmed_at: new Date().toISOString(),
  };
  // Save the new one first, then retire the others — so a failed save never leaves the household without its tariff.
  const { data: saved, error } = await supabase.from("household_energy_tariffs").insert({ ...householdWriteFields(household, user.id), ...row }).select("id").single();
  if (error || !saved) throw new Error(error?.message || "Couldn't save the tariff.");
  await supabase.from("household_energy_tariffs").update({ is_current: false, updated_at: new Date().toISOString() }).eq("is_current", true).neq("id", saved.id).or(filter);
  revalidateEverywhere();
  return { ok: true };
}

/** Bring back a previously saved tariff (e.g. after "Use price cap"). */
export async function restoreEnergyTariff(id: string) {
  const { supabase, household, filter } = await context();
  const { data: row } = await supabase.from("household_energy_tariffs").select("id").eq("id", id).or(filter).maybeSingle();
  if (!row) throw new Error("That tariff isn't available.");
  const { error } = await changeRecord(supabase.from("household_energy_tariffs").update({ is_current: true, updated_at: new Date().toISOString() }), id, household);
  if (error) throw new Error(error.message);
  await supabase.from("household_energy_tariffs").update({ is_current: false, updated_at: new Date().toISOString() }).eq("is_current", true).neq("id", id).or(filter);
  revalidateEverywhere();
  return { ok: true };
}

function time(value: unknown) {
  const s = String(value ?? "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null;
}

export async function clearEnergyTariff() {
  const { supabase, household, filter } = await context();
  const { data } = await supabase.from("household_energy_tariffs").select("id").eq("is_current", true).or(filter);
  for (const row of (data || []) as Array<{ id: string }>) {
    await changeRecord(supabase.from("household_energy_tariffs").update({ is_current: false, updated_at: new Date().toISOString() }), row.id, household);
  }
  revalidateEverywhere();
  return { ok: true };
}

function revalidateEverywhere() {
  revalidatePath("/mortgage");
  revalidatePath("/calendar");
  revalidatePath("/spending");
}
