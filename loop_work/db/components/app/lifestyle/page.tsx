import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { LifestyleClient } from "@/components/lifestyle/LifestyleClient";
import { getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";

type Person = { id: string; name: string; relationship: string };
type DealBill = {
  id: string;
  person_id: string | null;
  label: string;
  provider: string;
  category: string;
  monthly_cost: number;
  billing_day: number | null;
  contract_start: string | null;
  contract_end: string | null;
  notice_days: number;
  comparison_url: string | null;
  account_reference: string | null;
  auto_recommendation_enabled: boolean;
  notes: string | null;
};
type Supermarket = { id: string; name: string; location_label: string | null; online_url: string | null; notes: string | null };
type Meal = {
  id: string;
  person_id: string | null;
  label: string;
  source_url: string | null;
  image_url: string | null;
  servings: number;
  estimated_cost: number;
  supermarket_id: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  sugar_g: number;
  salt_g: number;
  ingredients: string | null;
  notes: string | null;
};

export default async function LifestylePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);

  const [peopleResult, billsResult, supermarketsResult, mealsResult] = await Promise.all([
    supabase.from("people").select("id, name, relationship").or(visibleDataOrFilter(householdContext)).or("account_status.is.null,account_status.neq.duplicate_merged").order("relationship").returns<Person[]>(),
    supabase.from("deal_bills").select("id, person_id, label, provider, category, monthly_cost, billing_day, contract_start, contract_end, notice_days, comparison_url, account_reference, auto_recommendation_enabled, notes").or(visibleDataOrFilter(householdContext)).order("contract_end", { ascending: true, nullsFirst: false }).returns<DealBill[]>(),
    supabase.from("grocery_supermarkets").select("id, name, location_label, online_url, notes").or(visibleDataOrFilter(householdContext)).order("name").returns<Supermarket[]>(),
    supabase.from("meals").select("id, person_id, label, source_url, image_url, servings, estimated_cost, supermarket_id, calories, protein_g, carbs_g, fat_g, fibre_g, sugar_g, salt_g, ingredients, notes").or(visibleDataOrFilter(householdContext)).order("created_at", { ascending: false }).returns<Meal[]>(),
  ]);

  return (
    <>
      <Nav />
      <LifestyleClient
        people={peopleResult.data ?? []}
        bills={billsResult.data ?? []}
        supermarkets={supermarketsResult.data ?? []}
        meals={mealsResult.data ?? []}
      />
    </>
  );
}
