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
function parseJsonField(value: FormDataEntryValue | null, fallback: unknown) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  try { return JSON.parse(text); } catch { return fallback; }
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
    request_text: String(formData.get("request_text") || "") || null,
    scenario_kind: String(formData.get("scenario_kind") || "") || null,
    assistant_summary: String(formData.get("assistant_summary") || "") || null,
    affordability_score: String(formData.get("affordability_score") || "") || null,
    monthly_buffer: parseNumber(formData.get("monthly_buffer")),
    loan_required: parseNumber(formData.get("loan_required")),
    ltv_percent: parseNumber(formData.get("ltv_percent")),
    selected_lender: String(formData.get("selected_lender") || "") || null,
    selected_product_name: String(formData.get("selected_product_name") || "") || null,
    selected_product_fee: parseNumber(formData.get("selected_product_fee")),
    selected_monthly_payment: parseNumber(formData.get("selected_monthly_payment")),
    selected_stress_payment: parseNumber(formData.get("selected_stress_payment")),
    lender_checks_json: parseJsonField(formData.get("lender_checks_json"), []),
    mortgage_products_json: parseJsonField(formData.get("mortgage_products_json"), []),
    questions_json: parseJsonField(formData.get("questions_json"), []),
    assumptions_json: parseJsonField(formData.get("assumptions_json"), []),
    answer_log: parseJsonField(formData.get("answer_log"), {}),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/affordability");
  revalidatePath("/affordability-lab");
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
  revalidatePath("/affordability-lab");
}
