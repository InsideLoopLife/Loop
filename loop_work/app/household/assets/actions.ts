"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { enrichProperty } from "@/lib/assets/property";
import { estimateVehicleRunningCosts, poundsToPence } from "@/lib/assets/vehicle";

export async function addProperty(formData: FormData) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not authenticated.");

  const enrich = await enrichProperty({
    addressLine1: String(formData.get("address_line1") || ""),
    postcode: String(formData.get("postcode") || ""),
  });

  const { error } = await supabase.from("loop_household_properties").insert({
    owner_user_id: user.id,
    household_id: String(formData.get("household_id") || "") || null,
    label: String(formData.get("label") || "Property"),
    address_line1: String(formData.get("address_line1") || ""),
    town_city: String(formData.get("town_city") || ""),
    postcode: String(formData.get("postcode") || ""),
    bedrooms: formData.get("bedrooms") ? Number(formData.get("bedrooms")) : null,
    estimated_value_pence: formData.get("estimated_value") ? poundsToPence(String(formData.get("estimated_value"))) : null,
    ...enrich.patch,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/household/assets");
}

export async function addVehicle(formData: FormData) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Not authenticated.");

  const annualMileage = Number(formData.get("annual_mileage") || 0);
  const averageMpg = Number(formData.get("average_mpg") || 0);
  const monthlyFinancePence = poundsToPence(String(formData.get("monthly_finance") || "0"));
  const insurancePence = poundsToPence(String(formData.get("insurance_annual") || "0"));
  const taxPence = poundsToPence(String(formData.get("tax_annual") || "0"));
  const maintenancePence = poundsToPence(String(formData.get("maintenance_annual") || "0"));

  const costs = estimateVehicleRunningCosts({
    annualMileage,
    averageMpg,
    monthlyFinancePence,
    insuranceAnnualPence: insurancePence,
    taxAnnualPence: taxPence,
    maintenanceAnnualPence: maintenancePence,
  });

  const { error } = await supabase.from("loop_household_vehicles").insert({
    owner_user_id: user.id,
    household_id: String(formData.get("household_id") || "") || null,
    label: String(formData.get("label") || "Car"),
    registration: String(formData.get("registration") || ""),
    make: String(formData.get("make") || ""),
    model: String(formData.get("model") || ""),
    fuel_type: String(formData.get("fuel_type") || ""),
    annual_mileage: annualMileage,
    average_mpg: averageMpg || null,
    monthly_finance_pence: monthlyFinancePence,
    insurance_estimate_annual_pence: insurancePence,
    tax_annual_pence: taxPence,
    maintenance_annual_pence: maintenancePence,
    running_cost_estimate_annual_pence: costs.runningCostAnnualPence,
    running_cost_estimate_per_mile_pence: costs.runningCostPerMilePence,
    enrichment_status: "enriched",
    source_status: { costs },
  });

  if (error) throw new Error(error.message);
  revalidatePath("/household/assets");
}
