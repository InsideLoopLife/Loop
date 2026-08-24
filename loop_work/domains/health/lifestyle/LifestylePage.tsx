import { Nav } from "@/components/Nav";
import { PageLandingExperience } from "@/components/landing/PageLandingExperience";
import { visibleDataOrFilter } from "@/lib/auth/household-context";
import { requireHealthPageAccess } from "@/domains/health/access";
import { LifestyleClient } from "@/components/lifestyle/LifestyleClient";
import { RouteBootSnapshotPublisher } from "@/components/performance/RouteBootSnapshotPublisher";

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
type FoodLog = { eaten_on: string; calories: number | null; protein_g: number | null; fibre_g: number | null; salt_g: number | null; caffeine_mg: number | null; drink_volume_ml: number | null; meal_slot: string | null; label: string | null; };

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
  const { supabase, householdContext } = await requireHealthPageAccess();
  const householdVisibleFilter = visibleDataOrFilter(householdContext);

  const today = new Date();
  const since = new Date(today);
  since.setDate(since.getDate() - 31);

  const [peopleResult, billsResult, supermarketsResult, mealsResult, foodLogsResult] = await Promise.all([
    supabase.from("people").select("id, name, relationship").or(householdVisibleFilter).or("account_status.is.null,account_status.neq.duplicate_merged").order("relationship").returns<Person[]>(),
    supabase.from("deal_bills").select("id, person_id, label, provider, category, monthly_cost, billing_day, contract_start, contract_end, notice_days, comparison_url, account_reference, auto_recommendation_enabled, notes").or(householdVisibleFilter).order("contract_end", { ascending: true, nullsFirst: false }).returns<DealBill[]>(),
    supabase.from("grocery_supermarkets").select("id, name, location_label, online_url, notes").or(householdVisibleFilter).order("name").returns<Supermarket[]>(),
    supabase.from("meals").select("id, person_id, label, source_url, image_url, servings, estimated_cost, supermarket_id, calories, protein_g, carbs_g, fat_g, fibre_g, sugar_g, salt_g, ingredients, notes").or(householdVisibleFilter).order("created_at", { ascending: false }).returns<Meal[]>(),
    supabase.from("food_logs").select("eaten_on, calories, protein_g, fibre_g, salt_g, caffeine_mg, drink_volume_ml, meal_slot, label").or(householdVisibleFilter).gte("eaten_on", since.toISOString().slice(0, 10)).returns<FoodLog[]>(),
  ]);

  return (
    <>
      <Nav />
      <RouteBootSnapshotPublisher
        routeKey="lifestyle"
        payload={{
          version: 1,
          eyebrow: "Lifestyle",
          title: "Your household lifestyle view",
          headline: `${(billsResult.data ?? []).length} tracked bill${(billsResult.data ?? []).length === 1 ? "" : "s"}`,
          description: "Bills, food and household lifestyle context are refreshing now.",
          tone: "blue",
          metrics: [
            {
              label: "Monthly bills",
              value: new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(
                (billsResult.data ?? []).reduce((sum, bill) => sum + Number(bill.monthly_cost || 0), 0),
              ),
            },
            { label: "Meals", value: String((mealsResult.data ?? []).length) },
            { label: "31d food logs", value: String((foodLogsResult.data ?? []).length) },
            { label: "People", value: String((peopleResult.data ?? []).length) },
          ],
        }}
      />
      {((billsResult.data ?? []).length + (mealsResult.data ?? []).length + (foodLogsResult.data ?? []).length) === 0 ? (
        <main className="mx-auto w-[95vw] max-w-[2000px] px-4 py-6 sm:px-6 lg:px-8">
          <PageLandingExperience kind="lifestyle" />
        </main>
      ) : null}
      <LifestyleClient
        people={peopleResult.data ?? []}
        bills={billsResult.data ?? []}
        supermarkets={supermarketsResult.data ?? []}
        meals={mealsResult.data ?? []}
        foodLogs={foodLogsResult.data ?? []}
      />
    </>
  );
}
