"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";

export async function saveFinancialProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const payload = {
    user_id: user.id,
    name: String(formData.get("name") || "My plan"),
    annual_salary: parseNumber(formData.get("annual_salary")),
    monthly_take_home: parseNumber(formData.get("monthly_take_home")),
    monthly_dividends: parseNumber(formData.get("monthly_dividends")) ?? 0,
    pension_percent: parseNumber(formData.get("pension_percent")),
    student_loan_plan: String(formData.get("student_loan_plan") || ""),
    monthly_mortgage: parseNumber(formData.get("monthly_mortgage")) ?? 0,
    monthly_savings_target: parseNumber(formData.get("monthly_savings_target")) ?? 0,
  };

  const { error } = await supabase
    .from("financial_profiles")
    .upsert(payload, { onConflict: "user_id" });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/income");
  revalidatePath("/spending");
}
