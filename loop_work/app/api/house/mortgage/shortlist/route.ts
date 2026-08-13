// app/api/house/mortgage/shortlist/route.ts
//
// POST { home_id, source_id }
//
// Sets a single shortlisted deal on a home: clears any existing is_shortlisted
// row for this home, then writes the new one. Uses the mortgage_deal_preferences
// table that already existed for this purpose (is_shortlisted / is_starred) —
// no new table needed.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server'; // ADJUST

export async function POST(req: NextRequest) {
  const { home_id, source_id } = await req.json();
  if (!home_id || !source_id) {
    return NextResponse.json({ error: 'home_id and source_id are required' }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser(); // ADJUST
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  await supabase
    .from('mortgage_deal_preferences')
    .update({ is_shortlisted: false })
    .eq('home_id', home_id)
    .eq('is_shortlisted', true);

  const { data: existing } = await supabase
    .from('mortgage_deal_preferences')
    .select('id')
    .eq('home_id', home_id)
    .eq('source_id', source_id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('mortgage_deal_preferences')
      .update({ is_shortlisted: true })
      .eq('id', existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase.from('mortgage_deal_preferences').insert({
      user_id: user.id,
      home_id,
      source_kind: 'mortgage_rate_deal',
      source_id,
      is_shortlisted: true,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shortlisted: true });
}
