import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveHouseholdContext,
  householdMemberDataOrFilter,
} from "@/lib/auth/household-context";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const dataOwnerUserId = householdContext.dataOwnerUserId || user.id;
  const visibleFilter = householdMemberDataOrFilter(householdContext);

  const [bankImports, regularCandidates, studentLoans, paymentAccounts, pets, homeProfile, categoryGroups] = await Promise.all([
    supabase.from("bank_imports")
      .select("id, person_id, account_name, provider_name, original_filename, imported_rows, detected_rows, status, created_at")
      .or(visibleFilter).order("created_at", { ascending: false }).limit(8),
    supabase.from("bank_regular_payment_candidates")
      .select("id, person_id, account_name, normalized_key, direction, label_suggestion, amount_average, amount_min, amount_max, day_of_month, first_seen, last_seen, occurrence_count, seen_month_count, confidence, sample_descriptions, sample_dates, notes, status")
      .or(visibleFilter).eq("status", "suggested").order("confidence", { ascending: false }).limit(30),
    supabase.from("student_loan_accounts")
      .select("id, person_id, plan, current_balance, balance_date, interest_rate, payroll_monthly_override, notes")
      .eq("user_id", dataOwnerUserId).order("balance_date", { ascending: false }),
    supabase.from("financial_accounts")
      .select("id, name, provider, account_type, owner_person_id, ownership_scope")
      .or(visibleFilter).eq("is_liability", false).order("provider"),
    supabase.from("household_pets")
      .select("id, name, species, breed, avatar_url")
      .or(householdContext.householdId ? `user_id.eq.${user.id},household_id.eq.${householdContext.householdId}` : `user_id.eq.${user.id}`)
      .eq("status", "active").order("name"),
    householdContext.householdId
      ? supabase.from("household_living_profiles")
          .select("property_kind, tenure, heating_type")
          .eq("household_id", householdContext.householdId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("spending_category_groups")
      .select("id, name, icon")
      .or(visibleFilter).order("sort_order").order("name"),
  ]);

  return NextResponse.json({
    bankImports: bankImports.data || [],
    regularCandidates: regularCandidates.data || [],
    studentLoanAccounts: studentLoans.data || [],
    paymentAccounts: paymentAccounts.data || [],
    householdPets: pets.data || [],
    homeProfile: homeProfile.data || null,
    categoryGroups: categoryGroups.data || [],
  }, {
    headers: { "Cache-Control": "private, max-age=90, stale-while-revalidate=600" },
  });
}
