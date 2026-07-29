import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estimateVehicleRunningCosts } from "@/lib/assets/vehicle";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loop_household_vehicles")
    .select("*")
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ vehicles: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json();

  const costs = estimateVehicleRunningCosts({
    annualMileage: body.annual_mileage,
    averageMpg: body.average_mpg,
    electricityKwhPerMile: body.electricity_kwh_per_mile,
    fuelPricePencePerLitre: body.fuel_price_pence_per_litre,
    electricityPricePencePerKwh: body.electricity_price_pence_per_kwh,
    monthlyFinancePence: body.monthly_finance_pence,
    insuranceAnnualPence: body.insurance_estimate_annual_pence,
    taxAnnualPence: body.tax_annual_pence,
    motAnnualPence: body.mot_annual_pence,
    maintenanceAnnualPence: body.maintenance_annual_pence,
  });

  const { data, error } = await supabase
    .from("loop_household_vehicles")
    .insert({
      household_id: body.household_id || null,
      owner_user_id: user.id,
      label: body.label || "Car",
      registration: body.registration || null,
      make: body.make || null,
      model: body.model || null,
      variant: body.variant || null,
      fuel_type: body.fuel_type || null,
      year: body.year || null,
      annual_mileage: body.annual_mileage || null,
      average_mpg: body.average_mpg || null,
      electricity_kwh_per_mile: body.electricity_kwh_per_mile || null,
      fuel_price_pence_per_litre: body.fuel_price_pence_per_litre || null,
      electricity_price_pence_per_kwh: body.electricity_price_pence_per_kwh || null,
      monthly_finance_pence: body.monthly_finance_pence || null,
      insurance_estimate_annual_pence: body.insurance_estimate_annual_pence || null,
      tax_annual_pence: body.tax_annual_pence || null,
      mot_annual_pence: body.mot_annual_pence || null,
      maintenance_annual_pence: body.maintenance_annual_pence || null,
      running_cost_estimate_annual_pence: costs.runningCostAnnualPence,
      running_cost_estimate_per_mile_pence: costs.runningCostPerMilePence,
      enrichment_status: "enriched",
      last_enriched_at: new Date().toISOString(),
      source_status: { costs },
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ vehicle: data });
}
