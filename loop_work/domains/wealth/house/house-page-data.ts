import type { Home, HomeMortgageDeal, HomeValuationSource, PropertyMoveQuery } from "@/components/mortgage/MortgagePlannerClient";
import { requireWealthPageAccess } from "@/domains/wealth/access";
import { householdMemberDataOrFilter } from "@/lib/auth/household-context";

export async function loadHouseCore() {
  const { supabase, user, householdContext } = await requireWealthPageAccess({ feature: "mortgage", deniedRedirect: "/account?tab=wealth&feature=mortgage" });
  const visible = householdMemberDataOrFilter(householdContext);
  const ownerId = householdContext.dataOwnerUserId || user.id;
  const [{data:homes},{data:deals},{data:valuations},{data:moveQueries}] = await Promise.all([
    supabase.from("homes").select("id, label, house_number, address_line, postcode, full_address, city, region, country, latitude, longitude, map_url, lookup_source, uprn, property_type, purchase_source_url, last_lookup_at, ownership_status, property_value, estimated_value_low, estimated_value_mid, estimated_value_high, estimated_value_date, purchase_price, purchase_date, target_purchase_price, target_extra_cash, target_interest_rate, target_term_years, notes").or(visible).order("created_at",{ascending:false}).returns<Home[]>(),
    supabase.from("home_mortgage_deals").select("id, home_id, lender, product_name, balance, balance_as_of_date, interest_rate, rate_type, repayment_type, initial_period_end, term_years, monthly_payment_override, start_date, end_date, notes").or(visible).order("created_at",{ascending:false}).returns<HomeMortgageDeal[]>(),
    supabase.from("home_valuation_sources").select("id, home_id, source_name, source_type, valuation_low, valuation_mid, valuation_high, valuation_amount, confidence, valuation_date, source_url, notes").or(visible).order("valuation_date",{ascending:false}).returns<HomeValuationSource[]>(),
    supabase.from("property_move_queries").select("id, home_id, title, property_url, asking_price, postcode, address_hint, bedrooms, council_tax_band, council_tax_estimate_annual, council_tax_confidence, council_tax_authority, council_tax_source_url, epc_rating, epc_energy_cost_estimate_annual, expected_heating_cost_monthly, stamp_duty_estimate, moving_cost_estimate, target_deposit, expected_mortgage_balance, expected_rate, expected_term_years, expected_payment, affordability_score, status, source_status, source_confidence, image_url, property_use, map_latitude, map_longitude, map_embed_url, service_charge_monthly, maintenance_allowance_monthly, running_cost_breakdown, archived_at, delete_after, notes, payload, created_at, updated_at").eq("user_id",ownerId).in("status",["watching","saved"]).order("created_at",{ascending:false}).returns<PropertyMoveQuery[]>(),
  ]);
  return { supabase, user, householdContext, homes:homes??[], deals:deals??[], valuations:valuations??[], moveQueries:moveQueries??[] };
}

export function houseValue(home: Home | undefined, valuations: HomeValuationSource[]) {
  if (!home) return 0;
  if (Number(home.estimated_value_mid || 0)>0) return Number(home.estimated_value_mid);
  const vals=valuations.filter(v=>v.home_id===home.id).map(v=>Number(v.valuation_mid??v.valuation_amount??0)).filter(Boolean);
  return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:Number(home.property_value||0);
}
