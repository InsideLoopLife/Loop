"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdContext } from "@/lib/auth/household-context";

export type RetirementPlanRecord = {
  id: string; user_id: string; person_id: string | null; household_id: string | null;
  scope: "person" | "household"; retirement_age: number; target_annual_income: number;
  target_legacy_pot: number; annual_growth_rate_percent: number; annual_inflation_percent: number;
  sustainable_withdrawal_rate_percent: number; guaranteed_annual_income: number;
  created_at?: string; updated_at?: string;
};

export type SaveRetirementPlanInput = {
  personId?: string | null; scope?: "person" | "household"; retirementAge: number; targetAnnualIncome: number;
  targetLegacyPot?: number; annualGrowthRatePercent?: number; annualInflationPercent?: number;
  sustainableWithdrawalRatePercent?: number; guaranteedAnnualIncome?: number;
};

function finiteNumber(value: unknown, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

export async function saveRetirementPlan(input: SaveRetirementPlanInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const dataOwnerUserId = householdContext.dataOwnerUserId || user.id;
  const householdId = (householdContext as { householdId?: string | null }).householdId ?? null;
  const scope = input.scope === "household" ? "household" : "person";
  const personId = scope === "household" ? null : input.personId || null;
  if (scope === "person" && !personId) throw new Error("Choose a person before saving a personal retirement plan.");

  const retirementAge = finiteNumber(input.retirementAge);
  const targetAnnualIncome = finiteNumber(input.targetAnnualIncome);
  const targetLegacyPot = finiteNumber(input.targetLegacyPot, 0);
  const annualGrowthRatePercent = finiteNumber(input.annualGrowthRatePercent, 5);
  const annualInflationPercent = finiteNumber(input.annualInflationPercent, 2.5);
  const sustainableWithdrawalRatePercent = finiteNumber(input.sustainableWithdrawalRatePercent, 3.5);
  const guaranteedAnnualIncome = finiteNumber(input.guaranteedAnnualIncome, 0);

  if (retirementAge < 18 || retirementAge > 100) throw new Error("Retirement age must be between 18 and 100.");
  if (targetAnnualIncome < 0 || targetLegacyPot < 0 || guaranteedAnnualIncome < 0) throw new Error("Retirement money values cannot be negative.");
  if (annualInflationPercent < 0 || annualInflationPercent > 50) throw new Error("Inflation assumption is outside the allowed range.");
  if (sustainableWithdrawalRatePercent <= 0 || sustainableWithdrawalRatePercent > 100) throw new Error("Withdrawal rate must be greater than 0 and no more than 100.");

  const payload = {
    user_id: dataOwnerUserId, person_id: personId, household_id: householdId, scope, retirement_age: retirementAge,
    target_annual_income: targetAnnualIncome, target_legacy_pot: targetLegacyPot,
    annual_growth_rate_percent: annualGrowthRatePercent, annual_inflation_percent: annualInflationPercent,
    sustainable_withdrawal_rate_percent: sustainableWithdrawalRatePercent, guaranteed_annual_income: guaranteedAnnualIncome,
  };

  let query = supabase.from("retirement_plans").select("id").eq("user_id", dataOwnerUserId).eq("scope", scope);
  query = scope === "household" ? query.is("person_id", null) : query.eq("person_id", personId);
  const { data: existing, error: existingError } = await query.maybeSingle();
  if (existingError) throw existingError;

  const result = existing?.id
    ? await supabase.from("retirement_plans").update(payload).eq("id", existing.id).select("*").single()
    : await supabase.from("retirement_plans").insert(payload).select("*").single();
  if (result.error) throw result.error;
  revalidatePath("/investments");
  revalidatePath("/retirement");
  return result.data as RetirementPlanRecord;
}
