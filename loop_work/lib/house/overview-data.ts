// lib/house/overview-data.ts
//
// Builds everything HouseOverviewPage needs in one call: stat strip, tracked
// home, mortgage bubble (incl. the effective liability split), the follow-on
// shortlist estimate, and the five glimpse-card summaries.
//
// ADJUST: same Supabase client / auth placeholders as the mortgage engine files.

import { createClient } from '@/lib/supabase/server'; // ADJUST
import { monthlyPaymentFor, remainingTermYears } from '@/lib/mortgage/payment-math';

export interface LiabilityShare {
  person_id: string;
  person_name: string;
  percent: number;
}

export interface HouseOverviewPayload {
  stats: {
    mortgage_balance: number;
    mortgage_payment: number;
    deals_available: number;
    improvements_score: number | null;
  };
  home: {
    id: string;
    label: string;
    address: string;
    postcode: string;
    estimated_value: number | null;
    purchase_value: number | null;
    owners: string[];
    ltv_percent: number | null;
  };
  mortgage: {
    deal_id: string;
    lender_name: string;
    lender_slug: string;
    balance: number;
    monthly_payment: number;
    rate_percent: number;
    rate_type: string | null;
    initial_period_end: string | null;
    liability: {
      source: 'explicit' | 'ownership_share' | 'equal_split_assumed' | 'unknown';
      shares: LiabilityShare[];
    };
  } | null;
  followOn: {
    shortlisted_deal_id: string | null;
    shortlisted_label: string;
    monthly_payment: number;
    delta_vs_current: number;
    rate_percent: number;
    better_deals_available: number;
  } | null;
  glimpses: {
    mortgage_deals_possible: number;
    best_rate_percent: number | null;
    moving_searches: number;
    valuation_estimate: number | null;
    valuation_source_count: number;
  };
}

export async function getHouseOverview(householdId: string, propertyId?: string): Promise<HouseOverviewPayload | null> {
  const supabase = createClient();

  // --- Tracked property: explicit propertyId, or the household's first active one ---
  let propertyQuery = supabase.from('loop_household_properties').select('*').eq('household_id', householdId).eq('status', 'active');
  propertyQuery = propertyId ? propertyQuery.eq('id', propertyId) : propertyQuery.limit(1);
  const { data: properties } = await propertyQuery;
  const property = properties?.[0];
  if (!property) return null;

  // --- Owners display list (people, not percentages — percentages come from the view) ---
  const { data: ownerRows } = await supabase
    .from('property_ownership_shares')
    .select('person_id, people(id, first_name)')
    .eq('property_id', property.id);

  let ownerNames: string[] = (ownerRows ?? []).map((r: any) => r.people?.first_name).filter(Boolean);
  if (!ownerNames.length) {
    // No explicit ownership rows — fall back to the household's adults, same assumption the view uses.
    const { data: adults } = await supabase
      .from('people')
      .select('first_name')
      .eq('household_id', householdId)
      .in('relationship', ['self', 'partner']);
    ownerNames = (adults ?? []).map((a: any) => a.first_name).filter(Boolean);
  }

  // --- Attached mortgage (most recent active one on this property) ---
  const { data: mortgageDeals } = await supabase
    .from('home_mortgage_deals')
    .select('*')
    .eq('home_id', property.id)
    .is('end_date', null)
    .order('created_at', { ascending: false })
    .limit(1);
  const deal = mortgageDeals?.[0];

  let mortgage: HouseOverviewPayload['mortgage'] = null;
  let followOn: HouseOverviewPayload['followOn'] = null;

  if (deal) {
    const { data: allocRows } = await supabase
      .from('mortgage_liability_allocation_effective')
      .select('person_id, liability_percent, source, people(first_name)')
      .eq('home_mortgage_deal_id', deal.id);

    const shares: LiabilityShare[] = (allocRows ?? []).map((r: any) => ({
      person_id: r.person_id,
      person_name: r.people?.first_name ?? 'Unknown',
      percent: Number(r.liability_percent),
    }));
    const source = (allocRows?.[0]?.source ?? 'unknown') as
      | 'explicit'
      | 'ownership_share'
      | 'equal_split_assumed'
      | 'unknown';

    mortgage = {
      deal_id: deal.id,
      lender_name: deal.lender,
      lender_slug: (deal.lender ?? '').toLowerCase().replace(/\s+/g, '_'),
      balance: Number(deal.balance),
      monthly_payment: deal.monthly_payment_override
        ? Number(deal.monthly_payment_override)
        : monthlyPaymentFor(Number(deal.balance), Number(deal.interest_rate), Number(deal.term_years ?? 25)),
      rate_percent: Number(deal.interest_rate),
      rate_type: deal.rate_type,
      initial_period_end: deal.initial_period_end,
      liability: { source, shares },
    };

    // --- Follow-on / shortlist: current preference on this home, else the current lender's SVR-ish default ---
    const { data: preference } = await supabase
      .from('mortgage_deal_preferences')
      .select('source_id, source_kind')
      .eq('home_id', property.id)
      .eq('is_shortlisted', true)
      .limit(1)
      .maybeSingle();

    const remainingTerm = remainingTermYears(deal.start_date, Number(deal.term_years ?? 25));

    let shortlistedRate = Number(deal.interest_rate);
    let shortlistedLabel = `${deal.lender} (current rate)`;
    let shortlistedDealId: string | null = null;

    if (preference?.source_id) {
      const { data: rateDeal } = await supabase
        .from('mortgage_rate_deals')
        .select('id, lender_name, rate_percent')
        .eq('id', preference.source_id)
        .maybeSingle();
      if (rateDeal) {
        shortlistedRate = Number(rateDeal.rate_percent);
        shortlistedLabel = `${rateDeal.lender_name}`;
        shortlistedDealId = rateDeal.id;
      }
    }

    const shortlistedPayment = monthlyPaymentFor(Number(deal.balance), shortlistedRate, remainingTerm);
    const currentPayment = mortgage.monthly_payment;

    const { count: betterCount } = await supabase
      .from('mortgage_rate_deals')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .lt('rate_percent', shortlistedRate);

    followOn = {
      shortlisted_deal_id: shortlistedDealId,
      shortlisted_label: shortlistedLabel,
      monthly_payment: Math.round(shortlistedPayment),
      delta_vs_current: Math.round(shortlistedPayment - currentPayment),
      rate_percent: shortlistedRate,
      better_deals_available: betterCount ?? 0,
    };
  }

  // --- Glimpse cards ---
  const currentLtv = property.estimated_value_pence && deal
    ? Math.round((Number(deal.balance) / (property.estimated_value_pence / 100)) * 1000) / 10
    : null;

  const { count: dealsPossible } = await supabase
    .from('mortgage_rate_deals')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
    .lte('ltv_min', currentLtv ?? 100)
    .gte('ltv_max', currentLtv ?? 0);

  const { data: bestDeal } = await supabase
    .from('mortgage_rate_deals')
    .select('rate_percent')
    .eq('status', 'active')
    .order('rate_percent', { ascending: true })
    .limit(1)
    .maybeSingle();

  const { count: dealsWatchReady } = await supabase
    .from('home_mortgage_deals')
    .select('id', { count: 'exact', head: true })
    .eq('home_id', property.id)
    .eq('renewal_watch_enabled', true);

  return {
    stats: {
      mortgage_balance: deal ? Number(deal.balance) : 0,
      mortgage_payment: mortgage?.monthly_payment ?? 0,
      deals_available: dealsWatchReady ?? 0,
      improvements_score: property.property_affordability_summary?.score ?? null,
    },
    home: {
      id: property.id,
      label: property.label ?? property.address_line1,
      address: property.address_line1,
      postcode: property.postcode,
      estimated_value: property.estimated_value_pence ? property.estimated_value_pence / 100 : null,
      purchase_value: null, // TODO: purchase price isn't on loop_household_properties — check where it's actually stored
      owners: ownerNames,
      ltv_percent: currentLtv,
    },
    mortgage,
    followOn,
    glimpses: {
      mortgage_deals_possible: dealsPossible ?? 0,
      best_rate_percent: bestDeal ? Number(bestDeal.rate_percent) : null,
      moving_searches: 0, // TODO: wire to your moving-home saved searches table once pointed at it
      valuation_estimate: property.estimated_value_pence ? property.estimated_value_pence / 100 : null,
      valuation_source_count: property.source_confidence_summary ? Object.keys(property.source_confidence_summary).length : 0,
    },
  };
}
