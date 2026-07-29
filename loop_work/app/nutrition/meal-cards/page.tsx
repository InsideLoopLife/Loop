import { NutritionPageShell } from "../NutritionPageShell";

export default async function NutritionMealCardsPage({ searchParams }: { searchParams?: Promise<{ date?: string; open?: string; meal?: string }> }) {
  return <NutritionPageShell tab="meal-cards" searchParams={searchParams} />;
}
