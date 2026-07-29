import { NextRequest, NextResponse } from "next/server";
import { estimatePropertyAffordability } from "@/lib/property/estimate";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.postcode) return NextResponse.json({ error: "Postcode is required." }, { status: 400 });

    const estimate = await estimatePropertyAffordability({
      postcode: body.postcode,
      addressLine1: body.address_line1 || null,
      estimatedValue: body.estimated_value || null,
      estimatedValuePence: body.estimated_value_pence || null,
      bedrooms: body.bedrooms ? Number(body.bedrooms) : null,
      propertyType: body.property_type || null,
      householdId: body.household_id || null,
      propertyId: body.property_id || null,
      saveToProperty: Boolean(body.save_to_property),
    });

    return NextResponse.json(estimate);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Property estimate failed." }, { status: 500 });
  }
}
