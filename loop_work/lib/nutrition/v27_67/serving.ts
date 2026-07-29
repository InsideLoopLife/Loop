import type { MealSlot, NutritionCard, ProductType } from "./types";

export function displayNameWithSize(card: Pick<NutritionCard, "display_name" | "prepared_volume_ml" | "serving_ml" | "serving_g">) {
  const name = card.display_name || "Food / drink";
  const lower = name.toLowerCase();
  const ml = card.prepared_volume_ml || card.serving_ml;

  if (ml && !lower.includes("ml")) return `${name} (${ml}ml)`;
  if (!ml && card.serving_g && !lower.includes("g")) return `${name} (${card.serving_g}g)`;

  return name;
}

export function isDrink(mealSlot?: MealSlot | string | null, productType?: ProductType | string | null) {
  return String(mealSlot || "").toLowerCase() === "drink" || String(productType || "").toLowerCase() === "drink";
}

export function requiresDrinkVolume(input: {
  mealSlot?: MealSlot | string | null;
  productType?: ProductType | string | null;
  selectedServingMl?: number | null;
  enteredVolumeMl?: number | null;
}) {
  return isDrink(input.mealSlot, input.productType) && !input.selectedServingMl && !input.enteredVolumeMl;
}

export function nutritionSnapshotFromCard(card: NutritionCard, multiplier = 1) {
  const n = (value?: number | null) => Math.round(((Number(value) || 0) * multiplier) * 100) / 100;

  return {
    calories: n(card.calories),
    protein_g: n(card.protein_g),
    carbs_g: n(card.carbs_g),
    fat_g: n(card.fat_g),
    fibre_g: n(card.fibre_g),
    sugar_g: n(card.sugar_g),
    added_sugar_g: n(card.added_sugar_g),
    saturated_fat_g: n(card.saturated_fat_g),
    salt_g: n(card.salt_g),
    sodium_mg: n(card.sodium_mg),
    caffeine_mg: n(card.caffeine_mg),
    raw: card.nutrition || {},
  };
}
