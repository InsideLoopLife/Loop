import type { CardKind, MealSlot, ProductType } from "./types";

export type EstimateResult = {
  card_kind: CardKind;
  product_type: ProductType;
  display_name: string;
  meal_slot: MealSlot;
  time_eaten?: string | null;
  serving_label?: string | null;
  serving_ml?: number | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  fibre_g?: number | null;
  salt_g?: number | null;
  caffeine_mg?: number | null;
  confidence: number;
  needs_confirmation: boolean;
  notes: string[];
};

function timeFromText(text: string) {
  const match = text.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!match) return null;
  let h = Number(match[1]);
  const m = Number(match[2] || 0);
  const period = match[3].toLowerCase();
  if (period === "pm" && h < 12) h += 12;
  if (period === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function mlFromText(text: string) {
  const match = text.match(/\b(\d+(?:\.\d+)?)\s*ml\b/i);
  return match ? Number(match[1]) : null;
}

function mealSlot(text: string): MealSlot {
  if (/\bbreakfast\b/i.test(text)) return "breakfast";
  if (/\blunch\b/i.test(text)) return "lunch";
  if (/\bdinner|tea\b/i.test(text)) return "dinner";
  if (/\bsnack\b/i.test(text)) return "snack";
  if (/\b(drink|coffee|latte|espresso|red bull|coke|water|juice|gfuel|g fuel)\b/i.test(text)) return "drink";
  return "meal";
}

function cleanTitle(text: string) {
  return text
    .replace(/\b(i had|i have had|had|for breakfast|for lunch|for dinner|at \d{1,2}(?::\d{2})?\s*(?:am|pm))\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^a\s+/i, "");
}

export function heuristicEstimate(text: string): EstimateResult {
  const slot = mealSlot(text);
  const productType: ProductType = slot === "drink" ? "drink" : "food";

  let kind: CardKind = "recipe";
  if (/\b(red bull|gfuel|g fuel|coke|pepsi|trek|protein bar|bar)\b/i.test(text)) kind = "product";
  if (/\b(menu|takeaway|mcdonald|kfc|top grill|greggs)\b/i.test(text)) kind = "takeaway";

  const title = cleanTitle(text) || "Food / drink entry";
  const ml = mlFromText(text);

  return {
    card_kind: kind,
    product_type: productType,
    display_name: title,
    meal_slot: slot,
    time_eaten: timeFromText(text),
    serving_ml: ml,
    serving_label: ml ? `${ml}ml` : undefined,
    calories: null,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    fibre_g: null,
    salt_g: null,
    caffeine_mg: null,
    confidence: 45,
    needs_confirmation: true,
    notes: ["Heuristic estimate only. Use product search/source URL for accurate nutrition."],
  };
}
