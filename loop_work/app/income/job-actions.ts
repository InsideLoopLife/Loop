"use server";

import { revalidatePath } from "next/cache";
import { runFriendly } from "@/lib/actions/friendly";
import { createClient } from "@/lib/supabase/server";
import { changeRecord, getActiveHouseholdContext, householdMemberDataOrFilter, householdWriteFields } from "@/lib/auth/household-context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = ["employed", "self_employed", "director", "contractor"];

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const household = await getActiveHouseholdContext(supabase, user);
  return { supabase, user, household, filter: householdMemberDataOrFilter(household) };
}

function revalidate() {
  revalidatePath("/income");
  revalidatePath("/account");
}

function optionalNumber(value: FormDataEntryValue | null, min: number, max: number, label: string) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`Check ${label}.`);
  return Math.round(number * 100) / 100;
}

async function saveSafetyNetJob__save(formData: FormData) {
  const { supabase, user, household, filter } = await context();
  const id = String(formData.get("id") || "").trim();
  const personId = String(formData.get("person_id") || "").trim();
  const employer = String(formData.get("employer_name") || "").trim().slice(0, 120);
  const startDate = String(formData.get("start_date") || "").trim();
  const region = String(formData.get("work_region") || "gb") === "ni" ? "ni" : "gb";
  const employmentType = String(formData.get("employment_type") || "employed");
  const payEventId = String(formData.get("pay_event_id") || "").trim();
  const mode = String(formData.get("enhanced_redundancy_mode") || "none");

  if (!UUID.test(personId)) throw new Error("Choose whose job this is.");
  if (!employer) throw new Error("Add the employer's name.");
  const today = new Date().toISOString().slice(0, 10);
  if (!DATE.test(startDate) || startDate > today) throw new Error("Add the date your continuous service started — it can't be in the future.");
  if (!TYPES.includes(employmentType)) throw new Error("Choose how you're employed.");
  if (!["none", "weeks_per_year", "fixed"].includes(mode)) throw new Error("Choose your employer's redundancy scheme.");
  if (payEventId && !UUID.test(payEventId)) throw new Error("That pay record isn't available.");

  const weeksPerYear = mode === "weeks_per_year" ? optionalNumber(formData.get("enhanced_weeks_per_year"), 0.01, 12, "the weeks per year") : null;
  const maxWeeks = mode === "weeks_per_year" ? optionalNumber(formData.get("enhanced_max_weeks"), 1, 260, "the most weeks it pays") : null;
  const fixedAmount = mode === "fixed" ? optionalNumber(formData.get("enhanced_fixed_amount"), 0, 10_000_000, "the amount") : null;
  if (mode === "weeks_per_year" && !weeksPerYear) throw new Error("Add how many weeks' pay per year the scheme gives.");
  if (mode === "fixed" && fixedAmount === null) throw new Error("Add the amount the scheme pays.");
  const noticeWeeks = optionalNumber(formData.get("notice_weeks_override"), 0, 52, "the notice period");

  const [{ data: person }, payEvent] = await Promise.all([
    supabase.from("people").select("id").eq("id", personId).maybeSingle(),
    payEventId
      ? supabase.from("pay_events").select("id, person_id").eq("id", payEventId).or(filter).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!person) throw new Error("That person isn't in your household.");
  if (payEventId && !payEvent.data) throw new Error("That pay record isn't available.");

  const row = {
    person_id: personId,
    employer_name: employer,
    employment_type: employmentType,
    start_date: startDate,
    work_region: region,
    pay_event_id: payEventId || null,
    enhanced_redundancy_mode: mode,
    enhanced_weeks_per_year: weeksPerYear,
    enhanced_max_weeks: maxWeeks,
    enhanced_fixed_amount: fixedAmount,
    notice_weeks_override: noticeWeeks,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    if (!UUID.test(id)) throw new Error("That job isn't available.");
    const { data: existing } = await supabase.from("employment_jobs").select("id").eq("id", id).or(filter).maybeSingle();
    if (!existing) throw new Error("That job isn't available.");
    const { error } = await changeRecord(supabase.from("employment_jobs").update(row), id, household);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("employment_jobs").insert({
      ...householdWriteFields(household, user.id),
      visibility_scope: household?.householdId ? "household" : "private",
      salary_link_mode: "separate_income_record",
      document_storage_preference: "digest_only",
      ...row,
    });
    if (error) throw new Error(error.message);
  }
  revalidate();
}

async function removeSafetyNetJob__save(formData: FormData) {
  const { supabase, household, filter } = await context();
  const id = String(formData.get("id") || "").trim();
  if (!UUID.test(id)) throw new Error("That job isn't available.");
  const { data: existing } = await supabase.from("employment_jobs").select("id").eq("id", id).or(filter).maybeSingle();
  if (!existing) throw new Error("That job isn't available.");
  const { error } = await changeRecord(supabase.from("employment_jobs").delete(), id, household);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function saveSafetyNetJob(...args: Parameters<typeof saveSafetyNetJob__save>) { return runFriendly(() => saveSafetyNetJob__save(...args)); }
export async function removeSafetyNetJob(...args: Parameters<typeof removeSafetyNetJob__save>) { return runFriendly(() => removeSafetyNetJob__save(...args)); }

async function loadJobLossContext__read() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const household = await getActiveHouseholdContext(supabase, user);
  const { loadHouseholdForecast } = await import("@/lib/planning/household-forecast");
  const { visibleDataOrFilter } = await import("@/lib/auth/household-context");
  const result = await loadHouseholdForecast(supabase, { userId: user.id, filter: visibleDataOrFilter(household), count: 36 });
  return { forecast: result.forecast, savingsNow: result.savingsNow };
}

export async function loadJobLossContext() { return runFriendly(() => loadJobLossContext__read()); }
