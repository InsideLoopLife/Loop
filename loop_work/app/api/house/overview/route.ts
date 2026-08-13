// app/api/house/overview/route.ts
//
// GET /api/house/overview?household_id=...&property_id=... (property_id optional)
//
// Single call for the whole House overview screen — stat strip, tracked home,
// mortgage bubble + liability split, follow-on shortlist, glimpse cards.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server'; // ADJUST
import { getHouseOverview } from '@/lib/house/overview-data';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id');
  const propertyId = searchParams.get('property_id') ?? undefined;

  if (!householdId) {
    return NextResponse.json({ error: 'household_id is required' }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser(); // ADJUST
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const payload = await getHouseOverview(householdId, propertyId);
  if (!payload) {
    return NextResponse.json({ error: 'No active property found for this household' }, { status: 404 });
  }

  return NextResponse.json(payload);
}
