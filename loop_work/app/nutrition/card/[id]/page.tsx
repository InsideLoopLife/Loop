import { redirect } from "next/navigation";

export default async function LegacyNutritionCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/nutrition/cards/${id}`);
}
