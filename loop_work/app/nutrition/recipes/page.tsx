import { NutritionPageShell } from "../NutritionPageShell";

export default async function NutritionRecipesPage({ searchParams }: { searchParams?: Promise<{ date?: string; open?: string; meal?: string }> }) {
  return <NutritionPageShell tab="recipes" searchParams={searchParams} />;
}
