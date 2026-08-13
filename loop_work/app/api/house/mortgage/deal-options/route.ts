// app/api/house/mortgage/deal-options/route.ts
//
// GET ?home_id=...&balance=...&term_years=...
//
// Candidate deals for the shortlist picker: active rate deals whose LTV band
// covers the property's current LTV, each with a computed monthly payment at
// the property's actual remaining balance/term so the picker shows real
// comparable figures, not just the lender's headline rate.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server'; // ADJUST
import { monthlyPaymentFor } from '@/lib/mortgage/payment-math';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const homeId = searchParams.get('home_id');
  const currentLtv = searchParams.get('current_ltv');
  const balance = Number(searchParams.get('balance') ?? 0);
  const termYears = Number(searchParams.get('term_years') ?? 25);

  if (!homeId || !balance) {
    return NextResponse.json({ error: 'home_id and balance are required' }, { status: 400 });
  }

  const supabase = createClient();

  let query = supabase
    .from('mortgage_rate_deals')
    .select('id, lender_name, product_name, rate_percent, rate_type, initial_term_months, ltv_min, ltv_max')
    .eq('status', 'active')
    .order('rate_percent', { ascending: true })
    .limit(12);

  if (currentLtv) {
    query = query.lte('ltv_min', Number(currentLtv)).gte('ltv_max', Number(currentLtv));
  }

  const { data: deals, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const options = (deals ?? []).map((d: any) => ({
    id: d.id,
    lender_name: d.lender_name,
    product_name: d.product_name,
    rate_percent: Number(d.rate_percent),
    rate_type: d.rate_type,
    term_label: d.initial_term_months ? `${Math.round(d.initial_term_months / 12)}Y` : null,
    monthly_payment: Math.round(monthlyPaymentFor(balance, Number(d.rate_percent), termYears)),
  }));

  return NextResponse.json({ options });
}
