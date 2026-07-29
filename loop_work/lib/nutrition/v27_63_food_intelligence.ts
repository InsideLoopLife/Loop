export type FoodEntryKind = "product" | "drink_product" | "recipe" | "ingredient" | "takeaway" | "unknown";

export type FoodIntelligenceResult = {
  kind: FoodEntryKind;
  displayName: string;
  canonicalName?: string;
  brandName?: string;
  variantName?: string;
  mealSlot?: "breakfast" | "lunch" | "dinner" | "snack" | "drink" | "meal";
  timeText?: string;
  servingText?: string;
  servingMl?: number;
  servingG?: number;
  confidence: number;
  needsUserConfirmation: boolean;
  reasons: string[];
};

export const FOOD_INTELLIGENCE_RULES = {
  knownProductBeforeEstimate: true,
  labelBeatsGenericNutrition: true,
  productSizeCreatesSeparateServing: true,
  appendSizeToSearchResult: true,
  drinkVolumeRequiredWhenUnknown: true,
  allergensRequireExplicitEvidence: true,
  recipesAreHouseholdPrivate: true,
  takeawayMenusArePrivateToHousehold: true,
} as const;

export function displayNameWithSize(name: string, options: { ml?: number | null; g?: number | null }) {
  const clean = name.trim();
  const lower = clean.toLowerCase();

  if (options.ml && !lower.includes("ml")) {
    return `${clean} (${options.ml}ml)`;
  }

  if (options.g && !lower.includes("g")) {
    return `${clean} (${options.g}g)`;
  }

  return clean;
}

export function shouldRequireDrinkVolume(input: {
  mealSlot?: string | null;
  cardKind?: string | null;
  selectedServingMl?: number | null;
  enteredVolumeMl?: number | null;
}) {
  const isDrink =
    String(input.mealSlot || "").toLowerCase() === "drink" ||
    String(input.cardKind || "").toLowerCase().includes("drink") ||
    String(input.cardKind || "").toLowerCase().includes("beverage");

  return isDrink && !input.selectedServingMl && !input.enteredVolumeMl;
}

export const FOOD_AI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "kind",
    "displayName",
    "mealSlot",
    "confidence",
    "needsUserConfirmation",
    "reasons",
  ],
  properties: {
    kind: {
      type: "string",
      enum: ["product", "drink_product", "recipe", "ingredient", "takeaway", "unknown"],
    },
    displayName: { type: "string" },
    canonicalName: { type: "string" },
    brandName: { type: "string" },
    variantName: { type: "string" },
    mealSlot: {
      type: "string",
      enum: ["breakfast", "lunch", "dinner", "snack", "drink", "meal"],
    },
    timeText: { type: "string" },
    servingText: { type: "string" },
    servingMl: { type: "number" },
    servingG: { type: "number" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    needsUserConfirmation: { type: "boolean" },
    reasons: { type: "array", items: { type: "string" } },
  },
} as const;

export const FOOD_AI_SYSTEM_PROMPT = `
You are LOOP's food logging resolver.
Classify the user entry as product, drink_product, recipe, ingredient, takeaway, or unknown.
For known packaged products, prefer the product database and serving-size options.
For drinks, extract ml if stated. If no ml is stated, mark needsUserConfirmation true.
For recipes, produce a clean recipe title rather than repeating the full user prompt.
For products, produce a clean product title and keep serving quantity separate.
Never infer allergens unless explicitly present on a label/source or from a clear allergen ingredient.
If ml/g differs from a known product, represent it as a distinct serving option, e.g. Red Bull Sugarfree (250ml).
Return only JSON matching the provided schema.
`.trim();
