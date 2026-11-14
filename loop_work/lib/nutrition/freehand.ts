import "server-only";
// Turns a freehand description ("2 slices of farmhouse bread with ham and a slice of cheese, butter on each")
// into items with amounts, then works each item out from UK reference data where it matches well.
// Items the data doesn't cover use an AI estimate for that item only (or a rough built-in estimate).

import { EMPTY_NUTRITION_TOTALS, fallbackRecipeEstimate, scoreMeal, type NutritionTotals, type RecipeEstimate } from "@/lib/nutrition/scoring";
import { completeNutrition } from "@/lib/nutrition/completeness";
import { referenceFoodByCode, referenceMicroDonor, referenceNutrientsFor, searchReferenceFoods } from "@/lib/nutrition/reference-foods";
import { looksBranded, parseQuantity, stripBrandWords } from "@/lib/nutrition/food-search";
import { portionsForReference } from "@/lib/nutrition/portions";
import { checkEnergy } from "@/lib/nutrition/energy-check";

export type ParsedFreehandItem = {
  name: string;
  /** Grams (solids) or ml (drinks), if stated or estimated. */
  amount?: number | null;
  unit?: "g" | "ml" | null;
  count?: number | null;
  brand?: string | null;
  /** Optional AI estimate of this item's nutrients at `amount`. */
  ai_nutrition?: Partial<NutritionTotals> | null;
  /** True when the amount was guessed rather than stated. */
  amount_estimated?: boolean;
};

export type FreehandBreakdownItem = {
  name: string;
  amount: number;
  unit: "g" | "ml";
  amountNote: string | null;
  source: "uk_reference" | "typical" | "ai" | "rough";
  matched: string | null;
  calories: number;
  notes: string[];
};

/* Typical values for common things the UK reference data doesn't list. Per 100g/ml. */
const TYPICAL: Array<{ test: RegExp; name: string; unit: "g" | "ml"; per100: Partial<NutritionTotals>; portion: number; portionLabel: string }> = [
  { test: /\bespresso\b|\bshots? of coffee\b/, name: "Espresso", unit: "ml", per100: { calories: 9, protein_g: 0.1, carbs_g: 1.7, fat_g: 0.2, potassium_mg: 115, magnesium_mg: 80 }, portion: 30, portionLabel: "1 shot (30ml)" },
  { test: /sugar[- ]free (syrup|sauce|toffee|caramel|vanilla|hazelnut)|(syrup|sauce).*sugar[- ]free|sucralose|zero (sugar|calorie) syrup/, name: "Sugar-free syrup", unit: "ml", per100: { calories: 5, carbs_g: 1 }, portion: 10, portionLabel: "1 pump (10ml)" },
  { test: /\b(coffee )?syrup\b|\bpump of\b/, name: "Coffee syrup", unit: "ml", per100: { calories: 270, carbs_g: 68, sugar_g: 68, added_sugar_g: 68 }, portion: 10, portionLabel: "1 pump (10ml)" },
  { test: /\bbrioche\b/, name: "Brioche bun", unit: "g", per100: { calories: 340, protein_g: 9, carbs_g: 52, fat_g: 10, saturated_fat_g: 5, fibre_g: 2.2, sugar_g: 10, added_sugar_g: 8, salt_g: 1, calcium_mg: 80, iron_mg: 1.6 }, portion: 60, portionLabel: "1 bun (60g)" },
  { test: /\b(sparkling )?water\b(?! ?melon| ?cress| ?chestnut)/, name: "Water", unit: "ml", per100: { calories: 0 }, portion: 250, portionLabel: "1 glass (250ml)" },
  { test: /\b(diet|zero|sugar[- ]free|max)\b.*\b(cola|coke|pepsi|lemonade|fizzy|pop|drink)\b|\b(diet coke|coke zero|pepsi max)\b/, name: "Diet soft drink", unit: "ml", per100: { calories: 0.4, sodium_mg: 10 }, portion: 330, portionLabel: "1 can (330ml)" },
  { test: /\b(whey|protein) (powder|shake|scoop)\b|\bscoop of protein\b/, name: "Whey protein powder", unit: "g", per100: { calories: 380, protein_g: 75, carbs_g: 8, fat_g: 6, sugar_g: 5, salt_g: 0.5, calcium_mg: 500 }, portion: 30, portionLabel: "1 scoop (30g)" },
  { test: /\bburger sauce\b/, name: "Burger sauce", unit: "g", per100: { calories: 330, protein_g: 1, carbs_g: 12, fat_g: 31, saturated_fat_g: 2.5, sugar_g: 10, added_sugar_g: 9, salt_g: 1.8 }, portion: 15, portionLabel: "1 tbsp (15g)" },
];

const UNIT_NOUNS: Array<[RegExp, (portions: Array<{ label: string; amount: number }>) => number | null]> = [
  [/\btbsp|tablespoons?\b/, () => 15],
  [/\btsp|teaspoons?\b/, () => 5],
  [/\bmugs?\b/, () => 260],
  [/\bcups?\b/, () => 240],
  [/\bglass(es)?\b/, () => 200],
  [/\bcans?\b/, () => 330],
  [/\bpints?\b/, () => 568],
  [/\bshots?\b/, () => 30],
  [/\bscoops?\b/, () => 30],
  [/\bhandfuls?\b/, () => 30],
  [/\bslices?\b/, (p) => p.find((x) => /slice/i.test(x.label))?.amount ?? 30],
  [/\brashers?\b/, (p) => p.find((x) => /rasher/i.test(x.label))?.amount ?? 25],
];

/** Rule-based split when no AI is available. */
export function splitFreehand(text: string): ParsedFreehandItem[] {
  const protectedText = String(text || "")
    .toLowerCase()
    .replace(/salt and vinegar|cheese and onion|sweet and sour|sour cream and chive|mac and cheese|macaroni and cheese|bread and butter pudding|fish and chips/g, (m) => m.replace(/ and /g, " & "));
  const pieces = protectedText
    .replace(/\b\d+(?:\.\d+)?%/g, " ")
    .split(/,|;|\+|\.\s|\bwith\b|\band\b|\bplus\b|\bon (?=toast|a |an |some )|\btopped with\b/)
    .map((piece) => piece.replace(/&/g, "and").replace(/\b(a|an|some|also|was|were|applied|added|on each slice|on each|each)\b/g, " ").replace(/\s+/g, " ").trim())
    .filter((piece) => piece.length > 1);
  const items = pieces.map((piece) => {
    const anywhere = piece.match(/(\d+(?:\.\d+)?)\s*(g|grams?|kg|ml|l|litres?)\b/);
    const hint = parseQuantity(piece.replace(/\(.*?\)/g, " "));
    let amount: number | null = null;
    let unit: "g" | "ml" | null = null;
    if (anywhere) {
      const value = Number(anywhere[1]);
      const u = anywhere[2];
      amount = /^kg/.test(u) || /^l|^litre/.test(u) ? value * 1000 : value;
      unit = /^m|^l/.test(u) ? "ml" : "g";
    } else if (hint.amount) {
      amount = hint.amount;
      unit = hint.unit;
    }
    const name = hint.text
      .replace(/\(?\d+(?:\.\d+)?\s*(g|grams?|kg|ml|l|litres?)\)?/g, " ")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b(from|by|at) [a-z0-9'& ]+$/, " ")
      .replace(/\bof\b/g, " ")
      .replace(/[.!?:]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { name: name || piece, amount, unit, count: hint.count };
  });
  // "Caramel latte with 2 shots, milk and syrup" / "burger with a bun, cheese and mince": the first piece names
  // the dish and the rest are its parts, so don't count the dish on top of its parts.
  if (items.length >= 3 && /\bwith\b/.test(protectedText) && !items[0].amount && CONTAINER_DISH.test(items[0].name)) {
    const parts = items.slice(1).map((item) => item.name).join(" ");
    if (/espresso|shot|milk|bun|bread|mince|patty|cheese|tortilla|wrap|lettuce|chicken|beef|syrup/.test(parts)) return items.slice(1);
  }
  return items;
}

const CONTAINER_DISH = /\b(latte|cappuccino|flat white|mocha|americano|burger|cheeseburger|sandwich|toastie|wrap|bagel|roll|bap|salad|bowl|smoothie|shake)\b/;
const UNIT_WORDS = /\b(slices?|rashers?|pieces?|tbsp|tablespoons?|tsp|teaspoons?|mugs?|cups?|glass(es)?|cans?|pints?|shots?|scoops?|handfuls?|spread|spreads|knob|dollop|splash|drizzle|portion|serving|bowl)\b/g;

function scaleTotals(per100: Partial<NutritionTotals>, amount: number) {
  const totals: NutritionTotals = { ...EMPTY_NUTRITION_TOTALS };
  for (const [key, value] of Object.entries(per100)) if (key in totals) (totals as any)[key] = Math.round(Number(value || 0) * amount) / 100;
  return totals;
}

function addInto(target: NutritionTotals, add: Partial<NutritionTotals>) {
  for (const key of Object.keys(target) as Array<keyof NutritionTotals>) {
    if (key === "energy_density_kcal_per_g" || key === "glycemic_impact_score") continue;
    target[key] = Math.round((Number(target[key] || 0) + Number(add[key] || 0)) * 100) / 100;
  }
}

const CHAIN_DISH = /\b(greggs|mcdonald|maccies|kfc|burger king|subway|nando|pret|costa|starbucks|caffe nero|domino|pizza hut|papa john|wagamama|five guys|leon|itsu|wasabi|tortilla|zizzi|pizza express|toby carvery|wetherspoon|harvester|frankie|bella italia|taco bell|popeyes|wingstop)\b/;

export function groundFreehand(description: string, items: ParsedFreehandItem[]) {
  const totals: NutritionTotals = { ...EMPTY_NUTRITION_TOTALS };
  const breakdown: FreehandBreakdownItem[] = [];
  const assumptions: string[] = [];
  let weightedConfidence = 0;
  let kcalWeight = 0;
  let totalGrams = 0;

  for (const item of items.slice(0, 20)) {
    const rawName = String(item.name || "").trim();
    if (!rawName) continue;
    const lower = rawName.toLowerCase();
    const brandText = `${item.brand || ""} ${rawName}`.trim();
    const isChainDish = CHAIN_DISH.test(brandText.toLowerCase()) || (looksBranded(brandText) && Boolean(item.ai_nutrition) && !/milk|bread|cheese|butter|ham|egg|banana|apple|yog/.test(lower));
    const typical = TYPICAL.find((entry) => entry.test.test(lower));
    const generic = stripBrandWords(rawName).replace(/\bgold top\b|\bjersey\b/g, "channel islands whole").trim() || rawName;
    const searchText = parseQuantity(generic).text.replace(UNIT_WORDS, " ").replace(/\s+/g, " ").trim() || generic;
    let [best] = typical || isChainDish ? [] : searchReferenceFoods(searchText, 1);
    let closest = false;
    if ((!best || best.score < 1.25) && !typical && !isChainDish && searchText.split(" ").length >= 2) {
      // Unknown variety ("maasdam cheese") → fall back to the food itself ("cheese").
      const words = searchText.split(" ");
      const [fallback] = searchReferenceFoods(words[words.length - 1], 1);
      if (fallback && fallback.score >= 1.25) { best = fallback; closest = true; }
    }
    const refFood = best && best.score >= 1.25 ? referenceFoodByCode(best.food.code) : null;
    const notes: string[] = [];
    let source: FreehandBreakdownItem["source"];
    let unit: "g" | "ml" = item.unit || (refFood?.unit ?? typical?.unit ?? "g");
    let amount = Number(item.amount || 0);
    let amountNote: string | null = item.amount_estimated ? "estimated amount" : null;
    let itemTotals: NutritionTotals;
    let matched: string | null = null;

    if (refFood) {
      const portions = portionsForReference(refFood.name, refFood.unit);
      unit = refFood.unit;
      if (!(amount > 0)) {
        const nounRule = UNIT_NOUNS.find(([pattern]) => pattern.test(lower));
        const per = nounRule ? nounRule[1](portions) : (portions.find((p) => p.kind === "everyday" && /^1 (medium|portion)|^1 /i.test(p.label)) || portions.find((p) => p.kind === "everyday"))?.amount ?? null;
        amount = Math.round((per ?? 100) * (item.count || 1) * 10) / 10;
        amountNote = per == null ? "assumed 100" + unit : `${item.count && item.count !== 1 ? `${item.count} × ` : ""}typical portion`;
      }
      const result = referenceNutrientsFor(refFood, amount);
      itemTotals = result.totals;
      notes.push(...result.filled);
      matched = closest ? `${refFood.name} (closest match)` : refFood.name;
      source = "uk_reference";
      weightedConfidence += 90 * Math.max(1, itemTotals.calories);
    } else if (typical) {
      unit = typical.unit;
      if (!(amount > 0)) {
        amount = typical.portion * (item.count || 1);
        amountNote = `${item.count && item.count !== 1 ? `${item.count} × ` : ""}${typical.portionLabel}`;
      }
      itemTotals = scaleTotals(typical.per100, amount);
      matched = `${typical.name} (typical values)`;
      source = "typical";
      weightedConfidence += 70 * Math.max(1, itemTotals.calories);
    } else if (item.ai_nutrition && Number(item.ai_nutrition.calories ?? -1) >= 0) {
      itemTotals = { ...EMPTY_NUTRITION_TOTALS, ...Object.fromEntries(Object.entries(item.ai_nutrition).map(([k, v]) => [k, Number(v || 0)])) } as NutritionTotals;
      if (!(amount > 0)) amount = 0;
      source = "ai";
      const energy = checkEnergy(itemTotals);
      if (!energy.ok && energy.expected > 0) {
        notes.push(`AI calories for this item didn't add up, so they were corrected to match its protein, carbs and fat (${energy.expected} kcal).`);
        itemTotals.calories = energy.expected;
      }
      weightedConfidence += 55 * Math.max(1, itemTotals.calories);
    } else {
      const rough = fallbackRecipeEstimate({ label: rawName, ingredients: rawName, servings: 1 });
      itemTotals = { ...EMPTY_NUTRITION_TOTALS };
      for (const key of Object.keys(itemTotals) as Array<keyof NutritionTotals>) itemTotals[key] = Number((rough as any)[key] || 0);
      source = "rough";
      notes.push("Rough built-in estimate — add an amount or pick a product for better accuracy.");
      weightedConfidence += 30 * Math.max(1, itemTotals.calories);
    }

    // Fill caffeine, free sugars and (for AI/rough items) vitamins from the nearest reference food.
    const completed = completeNutrition(itemTotals, { label: brandText, brand: item.brand, amount: amount > 0 ? amount : null, unit, group: null, source }, source === "uk_reference" ? undefined : referenceMicroDonor);
    itemTotals = completed.totals;
    notes.push(...completed.filled.filter((note) => !notes.includes(note)));

    kcalWeight += Math.max(1, itemTotals.calories);
    if (amount > 0 && unit === "g") totalGrams += amount;
    addInto(totals, itemTotals);
    breakdown.push({ name: rawName, amount: Math.round(amount * 10) / 10, unit, amountNote, source, matched, calories: Math.round(itemTotals.calories), notes });
  }

  const confidence = kcalWeight > 0 ? Math.round(weightedConfidence / kcalWeight) : 30;
  totals.energy_density_kcal_per_g = totalGrams > 0 ? Math.round((totals.calories / totalGrams) * 100) / 100 : 0;
  const counts = breakdown.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.source]: (acc[item.source] || 0) + 1 }), {});
  const parts = [
    counts.uk_reference ? `${counts.uk_reference} from UK reference data` : null,
    counts.typical ? `${counts.typical} from typical values` : null,
    counts.ai ? `${counts.ai} AI estimate${counts.ai === 1 ? "" : "s"}` : null,
    counts.rough ? `${counts.rough} rough estimate${counts.rough === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  for (const item of breakdown) {
    const amountText = item.amount > 0 ? `${item.amount}${item.unit}${item.amountNote ? ` (${item.amountNote})` : ""}` : "amount not stated";
    assumptions.push(`${item.name}: ${amountText} — ${item.source === "uk_reference" ? `UK data "${item.matched}"` : item.source === "typical" ? "typical values" : item.source === "ai" ? "AI estimate" : "rough estimate"}, ${item.calories} kcal.`);
  }
  const processing_level: RecipeEstimate["processing_level"] = breakdown.some((item) => item.source === "ai" && CHAIN_DISH.test(item.name.toLowerCase())) ? "high" : "unknown";

  const estimate: RecipeEstimate = {
    ...totals,
    label: description.slice(0, 160),
    servings: 1,
    confidence,
    health_score: scoreMeal({ ...totals, processing_level } as any),
    image_prompt: `A realistic photo of ${description.slice(0, 120)}`,
    ingredients_json: breakdown.map((item) => ({ name: item.name, quantity: item.amount > 0 ? `${item.amount}${item.unit}` : "", notes: item.matched || item.source })),
    ingredient_ratio_json: totalGrams > 0 ? breakdown.filter((item) => item.unit === "g" && item.amount > 0).map((item) => ({ name: item.name, estimated_weight_g: item.amount, percentage: Math.round((item.amount / totalGrams) * 100), role: item.source, confidence: item.source === "uk_reference" ? 90 : 60 })) : [],
    allergen_flags: [],
    dietary_flags: totals.caffeine_mg > 0 ? ["caffeine"] : [],
    manufacturing_notes: [],
    micronutrient_notes: ["Vitamins and minerals come from UK reference data for each item where it matched; others are estimated."],
    assumptions,
    confidence_reason: `Worked out item by item: ${parts.join(", ") || "estimated"}.`,
    processing_level,
  };
  return { estimate, breakdown };
}
