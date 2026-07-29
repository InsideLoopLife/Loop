"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return { supabase, user };
}

export async function addAffordabilityScenario(formData: FormData) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("affordability_scenarios").insert({
    user_id: user.id,
    label: String(formData.get("label") || "House move scenario"),
    purchase_price: parseNumber(formData.get("purchase_price")) ?? 0,
    deposit_cash: parseNumber(formData.get("deposit_cash")) ?? 0,
    current_property_sale_price: parseNumber(formData.get("current_property_sale_price")) ?? 0,
    current_mortgage_balance: parseNumber(formData.get("current_mortgage_balance")) ?? 0,
    gross_household_income: parseNumber(formData.get("gross_household_income")) ?? 0,
    monthly_fixed_costs: parseNumber(formData.get("monthly_fixed_costs")) ?? 0,
    monthly_childcare: parseNumber(formData.get("monthly_childcare")) ?? 0,
    interest_rate: parseNumber(formData.get("interest_rate")) ?? 0,
    stress_rate: parseNumber(formData.get("stress_rate")) ?? 0,
    term_years: parseNumber(formData.get("term_years")) ?? 25,
    arrangement_and_moving_costs: parseNumber(formData.get("arrangement_and_moving_costs")) ?? 3500,
    is_additional_property: formData.get("is_additional_property") === "on",
    first_time_buyer: formData.get("first_time_buyer") === "on",
    target_property_url: String(formData.get("target_property_url") || "") || null,
    notes: String(formData.get("notes") || ""),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/affordability");
}

export async function deleteAffordabilityScenario(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id"));

  const { error } = await supabase
    .from("affordability_scenarios")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/affordability");
}
