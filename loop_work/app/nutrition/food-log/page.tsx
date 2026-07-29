import { NutritionPageShell } from "../NutritionPageShell";

export default async function NutritionFoodLogPage({ searchParams }: { searchParams?: Promise<{ date?: string; open?: string; meal?: string }> }) {
  return <NutritionPageShell tab="food-log" searchParams={searchParams} />;
}
