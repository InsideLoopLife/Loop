"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { poundsToPence } from "@/lib/money/dealMath";

export async function saveMoneyProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) throw new Error("Not authenticated.");

  const existingId = String(formData.get("profile_id") || "");
  const payload = {
    user_id: user.id,
    profile_name: String(formData.get("profile_name") || "My money plan"),
    monthly_available_savings_pence: poundsToPence(String(formData.get("monthly_available_savings") || "0")),
    current_cash_savings_pence: poundsToPence(String(formData.get("current_cash_savings") || "0")),
    emergency_fund_target_pence: poundsToPence(String(formData.get("emergency_fund_target") || "0")),
    existing_average_cash_rate_aer: Number(formData.get("existing_average_cash_rate_aer") || 0),
    expected_investment_return_aer: Number(formData.get("expected_investment_return_aer") || 0),
    risk_preference: String(formData.get("risk_preference") || "cash_first"),
    liquidity_preference: String(formData.get("liquidity_preference") || "easy_access_first"),
    notes: String(formData.get("notes") || ""),
    status: "active",
  };

  if (existingId) {
    const { error } = await supabase.from("loop_money_profiles").update(payload).eq("id", existingId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("loop_money_profiles").insert(payload);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/account/money-strategy");
}

export async function generateMoneyOpportunities(formData: FormData) {
  const supabase = await createClient();
  const profileId = String(formData.get("profile_id") || "");

  const { error } = await supabase.rpc("loop_money_generate_opportunities", {
    p_profile_id: profileId,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/account/money-strategy");
}
