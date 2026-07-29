import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const registration = String(request.nextUrl.searchParams.get("registration") || "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(registration)) return NextResponse.json({ error: "Enter a valid UK registration." }, { status: 400 });

  const apiKey = process.env.DVLA_API_KEY;
  if (!apiKey) return NextResponse.json({ registration, unavailable: true, message: "DVLA lookup is not configured. Check the vehicle manually below." });

  const response = await fetch("https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ registrationNumber: registration }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ registration, unavailable: true, message: body?.message || "No vehicle was returned. Check the registration and enter details manually." });

  return NextResponse.json({
    registration,
    vehicle: {
      make: body.make || "",
      model: body.model || "",
      fuel_type: String(body.fuelType || "").toLowerCase(),
      year: body.yearOfManufacture || null,
      engine_capacity: body.engineCapacity || null,
      co2_g_km: body.co2Emissions || null,
      colour: body.colour || null,
      tax_due_date: body.taxDueDate || null,
      mot_status: body.motStatus || null,
    },
    manual_check_required: true,
    message: "Vehicle details found. Confirm model, fuel type, mileage and real-world MPG before saving.",
  });
}
