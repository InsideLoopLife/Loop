// lib/house/overview-data.ts
//
// CORRECTED — the previous version queried `loop_household_properties`, a table
// that isn't what the real House page uses. This now matches domains/wealth/house/HousePage.tsx:
// `homes`, `home_owners`, `home_mortgage_deals`, `home_valuation_sources`.
// Also reuses your existing `calculateMonthlyMortgagePayment` instead of a
// duplicate implementation.

import { createClient } from "@/lib/supabase/server";
import { calculateMonthlyMortgagePayment } from "@/lib/calculations/mortgage";

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
  };
  home: {
    id: string;
    label: string;
    address: string;
    postcode: string;
    estimated_value: number | null;
    purchase_price: number | null;
    owners: string[];
    ltv_percent: number | null;
  };
  mortgage: {
    deal_id: string;
    lender_name: string;
    balance: number;
    monthly_payment: number;
    rate_percent: number;
    rate_type: string | null;
    liability: {
      source: "explicit" | "ownership_share" | "equal_split_assumed" | "unknown";
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
    valuation_estimate: number | null;
    valuation_source_count: number;
  };
}

export async function getHouseOverview(householdId: string, homeId?: string): Promise<HouseOverviewPayload | null> {
  const supabase = await createClient();

  const householdVisibleFilter = `household_id.eq.${householdId}`;

  let homeQuery = supabase
    .from("homes")
    .select(
      "id, label, address_line, postcode, property_value, estimated_value_low, estimated_value_mid, estimated_value_high, purchase_price",
    )
    .or(householdVisibleFilter)
    .order("created_at", { ascending: false });
  const { data: homes } = homeId ? await homeQuery.eq("id", homeId) : await homeQuery.limit(1);
  const home = homes?.[0];
  if (!home) return null;

  const { data: ownerRows } = await supabase
    .from("home_owners")
    .select("person_id, ownership_percent, people(id, name)")
    .eq("home_id", home.id);

  const ownerNames = (ownerRows ?? []).map((r: any) => r.people?.name).filter(Boolean);

  const { data: mortgageDeals } = await supabase
    .from("home_mortgage_deals")
    .select("*")
    .eq("home_id", home.id)
    .is("end_date", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const deal = mortgageDeals?.[0];

  let mortgage: HouseOverviewPayload["mortgage"] = null;
  let followOn: HouseOverviewPayload["followOn"] = null;

  if (deal) {
    const { data: allocRows } = await supabase
      .from("mortgage_liability_allocation_effective")
      .select("person_id, liability_percent, source, people(name)")
      .eq("home_mortgage_deal_id", deal.id);

    const shares: LiabilityShare[] = (allocRows ?? []).map((r: any) => ({
      person_id: r.person_id,
      person_name: r.people?.name ?? "Unknown",
      percent: Number(r.liability_percent),
    }));
    const source = (allocRows?.[0]?.source ?? "unknown") as
      | "explicit"
      | "ownership_share"
      | "equal_split_assumed"
      | "unknown";

    const monthlyPayment = deal.monthly_payment_override
      ? Number(deal.monthly_payment_override)
      : calculateMonthlyMortgagePayment({
          balance: Number(deal.balance),
          annualInterestRate: Number(deal.interest_rate),
          termYears: Number(deal.term_years ?? 25),
        });

    mortgage = {
      deal_id: deal.id,
      lender_name: deal.lender,
      balance: Number(deal.balance),
      monthly_payment: monthlyPayment,
      rate_percent: Number(deal.interest_rate),
      rate_type: deal.rate_type,
      liability: { source, shares },
    };

    // --- Follow-on / shortlist ---
    // NOTE: mortgage_deal_preferences.source_kind only allows 'market' | 'recommendation'
    // (real check constraint) — using 'market' for rate-deal shortlists here.
    const { data: preference } = await supabase
      .from("mortgage_deal_preferences")
      .select("source_id")
      .eq("home_id", home.id)
      .eq("source_kind", "market")
      .eq("is_shortlisted", true)
      .limit(1)
      .maybeSingle();

    let shortlistedRate = Number(deal.interest_rate);
    let shortlistedLabel = `${deal.lender} (current rate)`;
    let shortlistedDealId: string | null = null;

    if (preference?.source_id) {
      const { data: rateDeal } = await supabase
        .from("mortgage_rate_deals")
        .select("id, lender_name, rate_percent")
        .eq("id", preference.source_id)
        .maybeSingle();
      if (rateDeal) {
        shortlistedRate = Number(rateDeal.rate_percent);
        shortlistedLabel = rateDeal.lender_name;
        shortlistedDealId = rateDeal.id;
      }
    }

    const shortlistedPayment = calculateMonthlyMortgagePayment({
      balance: Number(deal.balance),
      annualInterestRate: shortlistedRate,
      termYears: Number(deal.term_years ?? 25),
    });

    const { count: betterCount } = await supabase
      .from("mortgage_rate_deals")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .lt("rate_percent", shortlistedRate);

    followOn = {
      shortlisted_deal_id: shortlistedDealId,
      shortlisted_label: shortlistedLabel,
      monthly_payment: Math.round(shortlistedPayment),
      delta_vs_current: Math.round(shortlistedPayment - monthlyPayment),
      rate_percent: shortlistedRate,
      better_deals_available: betterCount ?? 0,
    };
  }

  const estimatedValue = home.estimated_value_mid ?? home.property_value ?? null;
  const currentLtv = estimatedValue && deal ? Math.round((Number(deal.balance) / estimatedValue) * 1000) / 10 : null;

  const { count: dealsPossible } = await supabase
    .from("mortgage_rate_deals")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .lte("ltv_min", currentLtv ?? 100)
    .gte("ltv_max", currentLtv ?? 0);

  const { data: bestDeal } = await supabase
    .from("mortgage_rate_deals")
    .select("rate_percent")
    .eq("status", "active")
    .order("rate_percent", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { count: valuationSourceCount } = await supabase
    .from("home_valuation_sources")
    .select("id", { count: "exact", head: true })
    .eq("home_id", home.id);

  return {
    stats: {
      mortgage_balance: deal ? Number(deal.balance) : 0,
      mortgage_payment: mortgage?.monthly_payment ?? 0,
      deals_available: dealsPossible ?? 0,
    },
    home: {
      id: home.id,
      label: home.label ?? home.address_line,
      address: home.address_line,
      postcode: home.postcode,
      estimated_value: estimatedValue,
      purchase_price: home.purchase_price ?? null,
      owners: ownerNames,
      ltv_percent: currentLtv,
    },
    mortgage,
    followOn,
    glimpses: {
      mortgage_deals_possible: dealsPossible ?? 0,
      best_rate_percent: bestDeal ? Number(bestDeal.rate_percent) : null,
      valuation_estimate: estimatedValue,
      valuation_source_count: valuationSourceCount ?? 0,
    },
  };
}
