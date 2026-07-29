import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enrichProperty } from "@/lib/assets/property";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loop_household_properties")
    .select("*")
    .neq("status", "deleted")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ properties: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json();
  const enrich = await enrichProperty({
    addressLine1: body.address_line1,
    postcode: body.postcode,
    latitude: body.latitude,
    longitude: body.longitude,
  });

  const { data, error } = await supabase
    .from("loop_household_properties")
    .insert({
      household_id: body.household_id || null,
      owner_user_id: user.id,
      label: body.label || "Property",
      address_line1: body.address_line1 || null,
      address_line2: body.address_line2 || null,
      town_city: body.town_city || null,
      county: body.county || null,
      postcode: body.postcode || null,
      latitude: body.latitude || null,
      longitude: body.longitude || null,
      property_type: body.property_type || null,
      bedrooms: body.bedrooms || null,
      estimated_value_pence: body.estimated_value_pence || null,
      ...enrich.patch,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ property: data });
}
