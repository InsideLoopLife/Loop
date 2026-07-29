import NutritionClient from "@/components/nutrition/NutritionClient";
import { createClient } from "@/lib/supabase/server";

/**
 * Example page wiring.
 * Your current page can keep its existing data fetches for people/household.
 * The important change is that NutritionClient is now self-contained and will
 * fetch/search cards using the new v27.67 API routes.
 */
export default async function NutritionPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  const { data: cards } = await supabase
    .from("loop_nutrition_cards")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(24);

  // Replace this with your existing household people query.
  const people = [
    {
      id: userData.user?.id || "self",
      name: userData.user?.email?.split("@")[0] || "You",
      is_self: true,
      relationship: "self",
    },
  ];

  return (
    <NutritionClient
      householdId={null}
      currentUserPersonId={people[0]?.id}
      people={people}
      cards={cards || []}
      logs={[]}
      selectedDate={new Date().toISOString().slice(0, 10)}
    />
  );
}
