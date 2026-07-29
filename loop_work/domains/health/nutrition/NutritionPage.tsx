import { Nav } from "@/components/Nav";
import { PageLandingExperience } from "@/components/landing/PageLandingExperience";
import { NutritionClient } from "@/components/nutrition/NutritionClient";
import { requireHealthPageAccess } from "@/domains/health/access";
import { getLinkedProfileAvatarMap } from "@/domains/identity/profile";

export type NutritionPerson = { id: string; name: string; relationship: string; avatar_url: string | null; linked_user_id?: string | null; account_status?: string | null };
export type NutritionMeal = {
  id: string;
  person_id: string | null;
  label: string;
  source_url: string | null;
  image_url: string | null;
  image_prompt: string | null;
  servings: number;
  adult_serving_multiplier: number | null;
  child_serving_multiplier: number | null;
  estimated_cost: number;
  supermarket_id: string | null;
  barcode: string | null;
  gtin: string | null;
  brand_name: string | null;
  product_data_source: string | null;
  card_kind: string | null;
  product_data_confidence: number | null;
  product_image_url: string | null;
  product_source_url: string | null;
  label_front_image_url: string | null;
  label_ingredients_image_url: string | null;
  label_nutrition_image_url: string | null;
  user_verified_label: boolean | null;
  product_lookup_json: any;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  soluble_fibre_g: number | null;
  insoluble_fibre_g: number | null;
  sugar_g: number;
  added_sugar_g: number | null;
  natural_sugar_g: number | null;
  salt_g: number;
  saturated_fat_g: number | null;
  trans_fat_g: number | null;
  monounsaturated_fat_g: number | null;
  polyunsaturated_fat_g: number | null;
  sodium_mg: number | null;
  potassium_mg: number | null;
  calcium_mg: number | null;
  iron_mg: number | null;
  magnesium_mg: number | null;
  zinc_mg: number | null;
  folate_ug: number | null;
  niacin_mg: number | null;
  thiamin_mg: number | null;
  vitamin_c_mg: number | null;
  vitamin_d_ug: number | null;
  vitamin_b12_ug: number | null;
  omega_3_g: number | null;
  caffeine_mg: number | null;
  energy_density_kcal_per_g: number | null;
  glycemic_impact_score: number | null;
  ingredients: string | null;
  ingredients_json: any;
  ingredient_ratio_json: any;
  allergen_flags: string[] | null;
  dietary_flags: string[] | null;
  manufacturing_notes: string[] | null;
  confidence_reason: string | null;
  processing_level: string | null;
  notes: string | null;
  nutrition_score: number | null;
  nutrition_confidence: number | null;
  nutrition_json: any;
  created_at: string;
};
export type FoodLog = {
  id: string;
  person_id: string | null;
  meal_id: string | null;
  eaten_on: string;
  eaten_at: string | null;
  drink_volume_ml: number | null;
  meal_slot: string;
  serving_multiplier: number;
  label: string;
  image_url: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  soluble_fibre_g: number | null;
  insoluble_fibre_g: number | null;
  sugar_g: number;
  added_sugar_g: number | null;
  natural_sugar_g: number | null;
  salt_g: number;
  saturated_fat_g: number | null;
  trans_fat_g: number | null;
  monounsaturated_fat_g: number | null;
  polyunsaturated_fat_g: number | null;
  sodium_mg: number | null;
  potassium_mg: number | null;
  calcium_mg: number | null;
  iron_mg: number | null;
  magnesium_mg: number | null;
  zinc_mg: number | null;
  folate_ug: number | null;
  niacin_mg: number | null;
  thiamin_mg: number | null;
  vitamin_c_mg: number | null;
  vitamin_d_ug: number | null;
  vitamin_b12_ug: number | null;
  omega_3_g: number | null;
  caffeine_mg: number | null;
  energy_density_kcal_per_g: number | null;
  glycemic_impact_score: number | null;
  notes: string | null;
};
export type Supermarket = { id: string; name: string; location_label: string | null; online_url: string | null; notes: string | null };
export type NutritionSettings = { health_child_scaling_enabled: boolean | null; health_child_logging_enabled: boolean | null; health_apple_health_enabled: boolean | null; health_prompt_for_time_enabled?: boolean | null };

export default async function NutritionPage({ searchParams }: { searchParams?: Promise<{ date?: string; open?: string; meal?: string }> }) {
  const { supabase, user } = await requireHealthPageAccess();

  const params = await searchParams;
  const selectedDate = params?.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : new Date().toISOString().slice(0, 10);
  const selected = new Date(`${selectedDate}T00:00:00`);
  const day = selected.getDay() || 7;
  const fromDate = new Date(selected);
  fromDate.setDate(selected.getDate() - day + 1);
  const toDate = new Date(fromDate);
  toDate.setDate(fromDate.getDate() + 6);
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);

  const [peopleResult, mealsResult, logsResult, supermarketsResult, profileResult] = await Promise.all([
    supabase.from("people").select("id, name, relationship, avatar_url, linked_user_id, account_status").eq("user_id", user.id).order("relationship").returns<NutritionPerson[]>(),
    supabase.from("meals").select("id, person_id, label, source_url, image_url, image_prompt, servings, adult_serving_multiplier, child_serving_multiplier, estimated_cost, supermarket_id, barcode, gtin, brand_name, product_data_source, card_kind, product_data_confidence, product_image_url, product_source_url, label_front_image_url, label_ingredients_image_url, label_nutrition_image_url, user_verified_label, product_lookup_json, calories, protein_g, carbs_g, fat_g, fibre_g, soluble_fibre_g, insoluble_fibre_g, sugar_g, added_sugar_g, natural_sugar_g, salt_g, saturated_fat_g, trans_fat_g, monounsaturated_fat_g, polyunsaturated_fat_g, sodium_mg, potassium_mg, calcium_mg, iron_mg, magnesium_mg, zinc_mg, folate_ug, niacin_mg, thiamin_mg, vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug, omega_3_g, caffeine_mg, energy_density_kcal_per_g, glycemic_impact_score, ingredients, ingredients_json, ingredient_ratio_json, allergen_flags, dietary_flags, manufacturing_notes, confidence_reason, processing_level, notes, nutrition_score, nutrition_confidence, nutrition_json, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).returns<NutritionMeal[]>(),
    supabase.from("food_logs").select("id, person_id, meal_id, eaten_on, eaten_at, drink_volume_ml, meal_slot, serving_multiplier, label, image_url, calories, protein_g, carbs_g, fat_g, fibre_g, soluble_fibre_g, insoluble_fibre_g, sugar_g, added_sugar_g, natural_sugar_g, salt_g, saturated_fat_g, trans_fat_g, monounsaturated_fat_g, polyunsaturated_fat_g, sodium_mg, potassium_mg, calcium_mg, iron_mg, magnesium_mg, zinc_mg, folate_ug, niacin_mg, thiamin_mg, vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug, omega_3_g, caffeine_mg, energy_density_kcal_per_g, glycemic_impact_score, notes").eq("user_id", user.id).gte("eaten_on", from).lte("eaten_on", to).order("eaten_on", { ascending: false }).order("eaten_at", { ascending: true, nullsFirst: false }).returns<FoodLog[]>(),
    supabase.from("grocery_supermarkets").select("id, name, location_label, online_url, notes").eq("user_id", user.id).order("name").returns<Supermarket[]>(),
    supabase.from("app_user_profiles").select("health_child_scaling_enabled, health_child_logging_enabled, health_apple_health_enabled, health_prompt_for_time_enabled").eq("user_id", user.id).maybeSingle<NutritionSettings>(),
  ]);

  const basePeople = (peopleResult.data ?? []) as NutritionPerson[];
  const linkedUserIds = Array.from(new Set(basePeople.map((person) => person.linked_user_id).filter(Boolean))) as string[];
  let people = basePeople;
  if (linkedUserIds.length > 0) {
    const avatarByUserId = await getLinkedProfileAvatarMap(
      supabase,
      linkedUserIds,
    );
    people = basePeople.map((person) => ({
      ...person,
      avatar_url:
        person.avatar_url ||
        (person.linked_user_id
          ? avatarByUserId.get(person.linked_user_id) || null
          : null),
    }));
  }

  return (
    <>
      <Nav />
      {((mealsResult.data ?? []).length + (logsResult.data ?? []).length) === 0 ? (
        <main className="mx-auto w-[95vw] max-w-[2000px] px-4 py-6 sm:px-6 lg:px-8">
          <PageLandingExperience kind="nutrition" />
        </main>
      ) : null}
      <NutritionClient
        people={people}
        meals={mealsResult.data ?? []}
        logs={logsResult.data ?? []}
        supermarkets={supermarketsResult.data ?? []}
        selectedDate={selectedDate}
        settings={profileResult.data ?? { health_child_scaling_enabled: true, health_child_logging_enabled: true, health_apple_health_enabled: false, health_prompt_for_time_enabled: true }}
        initialOpen={params?.open === "recipe" || params?.open === "log" || params?.open === "edit-recipe" ? params.open as "recipe" | "log" | "edit-recipe" : null}
        initialMealId={params?.meal || null}
      />
    </>
  );
}
