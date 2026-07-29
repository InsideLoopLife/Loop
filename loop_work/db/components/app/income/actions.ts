"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";
import { applyMutableRecordFilter, getActiveHouseholdContext, householdWriteFields } from "@/lib/auth/household-context";

export async function addIncomeEntry(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const payload = {
    ...householdWriteFields(householdContext, user.id),
    person_id: String(formData.get("person_id") || "") || null,
    label: String(formData.get("label") || "Income"),
    gross_amount: parseNumber(formData.get("gross_amount")) ?? 0,
    net_amount: parseNumber(formData.get("net_amount")),
    frequency: String(formData.get("frequency") || "monthly"),
    entry_date: String(formData.get("entry_date") || new Date().toISOString().slice(0, 10)),
  };

  const { error } = await supabase.from("income_entries").insert(payload);
  if (error) throw new Error(error.message);

  revalidatePath("/income");
  revalidatePath("/dashboard");
}

export async function deleteIncomeEntry(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("id"));
  const { error } = await applyMutableRecordFilter(supabase.from("income_entries").delete(), id, householdContext);

  if (error) throw new Error(error.message);

  revalidatePath("/income");
  revalidatePath("/dashboard");
}
