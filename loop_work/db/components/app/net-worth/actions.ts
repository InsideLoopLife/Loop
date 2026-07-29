"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";
import { applyMutableRecordFilter, getActiveHouseholdContext, householdWriteFields } from "@/lib/auth/household-context";

export async function addAsset(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const { error } = await supabase.from("assets").insert({
    ...householdWriteFields(householdContext, user.id),
    person_id: String(formData.get("person_id") || "") || null,
    name: String(formData.get("name") || "Asset"),
    value: parseNumber(formData.get("value")) ?? 0,
    type: String(formData.get("type") || "cash"),
  });

  if (error) throw new Error(error.message);

  revalidatePath("/net-worth");
}

export async function addLiability(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const { error } = await supabase.from("liabilities").insert({
    ...householdWriteFields(householdContext, user.id),
    person_id: String(formData.get("person_id") || "") || null,
    name: String(formData.get("name") || "Liability"),
    balance: parseNumber(formData.get("balance")) ?? 0,
    type: String(formData.get("type") || "mortgage"),
  });

  if (error) throw new Error(error.message);

  revalidatePath("/net-worth");
}

export async function deleteAsset(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const id = String(formData.get("id"));
  const { error } = await applyMutableRecordFilter(supabase.from("assets").delete(), id, householdContext);
  if (error) throw new Error(error.message);

  revalidatePath("/net-worth");
}

export async function deleteLiability(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const id = String(formData.get("id"));
  const { error } = await applyMutableRecordFilter(supabase.from("liabilities").delete(), id, householdContext);
  if (error) throw new Error(error.message);

  revalidatePath("/net-worth");
}
