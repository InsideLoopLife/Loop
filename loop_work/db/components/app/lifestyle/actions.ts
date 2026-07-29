"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";
import { applyMutableRecordFilter, getActiveHouseholdContext, householdWriteFields } from "@/lib/auth/household-context";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const householdContext = await getActiveHouseholdContext(supabase, user);
  return { supabase, user, householdContext };
}

function nullableString(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}

function nullableDate(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}

export async function addDealBill(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const { error } = await supabase.from("deal_bills").insert({
    ...householdWriteFields(householdContext, user.id),
    person_id: nullableString(formData.get("person_id")),
    label: String(formData.get("label") || "Household bill"),
    provider: String(formData.get("provider") || "Provider"),
    category: String(formData.get("category") || "utilities"),
    monthly_cost: parseNumber(formData.get("monthly_cost")) ?? 0,
    billing_day: parseNumber(formData.get("billing_day")),
    contract_start: nullableDate(formData.get("contract_start")),
    contract_end: nullableDate(formData.get("contract_end")),
    notice_days: parseNumber(formData.get("notice_days")) ?? 45,
    comparison_url: nullableString(formData.get("comparison_url")),
    account_reference: nullableString(formData.get("account_reference")),
    auto_recommendation_enabled: formData.get("auto_recommendation_enabled") === "on",
    notes: nullableString(formData.get("notes")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/lifestyle");
  revalidatePath("/dashboard");
}

export async function updateDealBill(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  const updateQuery = supabase.from("deal_bills").update({
    person_id: nullableString(formData.get("person_id")),
    label: String(formData.get("label") || "Household bill"),
    provider: String(formData.get("provider") || "Provider"),
    category: String(formData.get("category") || "utilities"),
    monthly_cost: parseNumber(formData.get("monthly_cost")) ?? 0,
    billing_day: parseNumber(formData.get("billing_day")),
    contract_start: nullableDate(formData.get("contract_start")),
    contract_end: nullableDate(formData.get("contract_end")),
    notice_days: parseNumber(formData.get("notice_days")) ?? 45,
    comparison_url: nullableString(formData.get("comparison_url")),
    account_reference: nullableString(formData.get("account_reference")),
    auto_recommendation_enabled: formData.get("auto_recommendation_enabled") === "on",
    notes: nullableString(formData.get("notes")),
    updated_at: new Date().toISOString(),
  });
  const { error } = await applyMutableRecordFilter(updateQuery, id, householdContext);
  if (error) throw new Error(error.message);
  revalidatePath("/lifestyle");
  revalidatePath("/dashboard");
}

export async function deleteDealBill(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const { error } = await applyMutableRecordFilter(supabase.from("deal_bills").delete(), String(formData.get("id") || ""), householdContext);
  if (error) throw new Error(error.message);
  revalidatePath("/lifestyle");
  revalidatePath("/dashboard");
}

export async function addSupermarket(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const { error } = await supabase.from("grocery_supermarkets").insert({
    ...householdWriteFields(householdContext, user.id),
    name: String(formData.get("name") || "Supermarket"),
    location_label: nullableString(formData.get("location_label")),
    online_url: nullableString(formData.get("online_url")),
    notes: nullableString(formData.get("notes")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/lifestyle");
}

export async function addMeal(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const { error } = await supabase.from("meals").insert({
    ...householdWriteFields(householdContext, user.id),
    person_id: nullableString(formData.get("person_id")),
    label: String(formData.get("label") || "Meal"),
    source_url: nullableString(formData.get("source_url")),
    image_url: nullableString(formData.get("image_url")),
    servings: parseNumber(formData.get("servings")) ?? 1,
    estimated_cost: parseNumber(formData.get("estimated_cost")) ?? 0,
    supermarket_id: nullableString(formData.get("supermarket_id")),
    calories: parseNumber(formData.get("calories")) ?? 0,
    protein_g: parseNumber(formData.get("protein_g")) ?? 0,
    carbs_g: parseNumber(formData.get("carbs_g")) ?? 0,
    fat_g: parseNumber(formData.get("fat_g")) ?? 0,
    fibre_g: parseNumber(formData.get("fibre_g")) ?? 0,
    sugar_g: parseNumber(formData.get("sugar_g")) ?? 0,
    salt_g: parseNumber(formData.get("salt_g")) ?? 0,
    ingredients: nullableString(formData.get("ingredients")),
    notes: nullableString(formData.get("notes")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/lifestyle");
}

export async function updateMeal(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  const updateQuery = supabase.from("meals").update({
    person_id: nullableString(formData.get("person_id")),
    label: String(formData.get("label") || "Meal"),
    source_url: nullableString(formData.get("source_url")),
    image_url: nullableString(formData.get("image_url")),
    servings: parseNumber(formData.get("servings")) ?? 1,
    estimated_cost: parseNumber(formData.get("estimated_cost")) ?? 0,
    supermarket_id: nullableString(formData.get("supermarket_id")),
    calories: parseNumber(formData.get("calories")) ?? 0,
    protein_g: parseNumber(formData.get("protein_g")) ?? 0,
    carbs_g: parseNumber(formData.get("carbs_g")) ?? 0,
    fat_g: parseNumber(formData.get("fat_g")) ?? 0,
    fibre_g: parseNumber(formData.get("fibre_g")) ?? 0,
    sugar_g: parseNumber(formData.get("sugar_g")) ?? 0,
    salt_g: parseNumber(formData.get("salt_g")) ?? 0,
    ingredients: nullableString(formData.get("ingredients")),
    notes: nullableString(formData.get("notes")),
    updated_at: new Date().toISOString(),
  });
  const { error } = await applyMutableRecordFilter(updateQuery, id, householdContext);
  if (error) throw new Error(error.message);
  revalidatePath("/lifestyle");
}

export async function deleteMeal(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const { error } = await applyMutableRecordFilter(supabase.from("meals").delete(), String(formData.get("id") || ""), householdContext);
  if (error) throw new Error(error.message);
  revalidatePath("/lifestyle");
}
