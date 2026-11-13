import "server-only";
import data from "@/lib/nutrition/data/uk-reference-foods.json";
import { EMPTY_NUTRITION_TOTALS, scoreMeal, type NutritionTotals, type RecipeEstimate } from "@/lib/nutrition/scoring";
import { expandPlainFoodQuery, foodTokens, looksBranded, normaliseFoodText, parseQuantity, tokenCoverage } from "@/lib/nutrition/food-search";
import { portionsForReference, referenceUnit, type PortionUnit } from "@/lib/nutrition/portions";
import { checkEnergy } from "@/lib/nutrition/energy-check";
import type { ProductLookupCandidate } from "@/lib/nutrition/product-data";

// UK government reference data (CoFID 2021), per 100g edible portion (per 100ml for drinks, via specific gravity).
export const REFERENCE_SOURCE_NOTE = (data as any).source as string;

type RefRow = Array<string | number | null>;
type RefFood = {
  code: string;
  name: string;
  group: string;
  unit: PortionUnit;
  specificGravity: number | null;
  per100: Partial<NutritionTotals> & { alcohol_g?: number };
  tokens: string[];
  headTokens: string[];
  normName: string;
};

const COLUMNS: string[] = (data as any).columns;
const col = (name: string) => COLUMNS.indexOf(name);

let foods: RefFood[] | null = null;

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function loadFoods(): RefFood[] {
  if (foods) return foods;
  const rows = (data as any).rows as RefRow[];
  foods = rows.map((row) => {
    const get = (name: string) => row[col(name)];
    const name = String(get("name") || "");
    const group = String(get("group_name") || "");
    const sg = get("specific_gravity") == null ? null : num(get("specific_gravity"));
    const unit = referenceUnit(name, group, sg);
    // Values are per 100g. For drinks we present per 100ml, so convert with specific gravity (default ~1).
    const density = unit === "ml" ? (sg && sg > 0.5 ? sg : 1) : 1;
    const v = (key: string) => Math.round(num(get(key)) * density * 100) / 100;
    const sugar = v("sugar_g");
    const per100: RefFood["per100"] = {
      calories: Math.round(num(get("kcal")) * density),
      protein_g: v("protein_g"),
      carbs_g: v("carbs_g"),
      fat_g: v("fat_g"),
      fibre_g: v("fibre_g"),
      sugar_g: sugar,
      natural_sugar_g: sugar,
      salt_g: v("salt_g"),
      saturated_fat_g: v("saturated_fat_g"),
      trans_fat_g: v("trans_fat_g"),
      monounsaturated_fat_g: v("mono_fat_g"),
      polyunsaturated_fat_g: v("poly_fat_g"),
      omega_3_g: v("omega_3_g"),
      sodium_mg: v("sodium_mg"),
      potassium_mg: v("potassium_mg"),
      calcium_mg: v("calcium_mg"),
      magnesium_mg: v("magnesium_mg"),
      iron_mg: v("iron_mg"),
      zinc_mg: v("zinc_mg"),
      vitamin_d_ug: v("vitamin_d_ug"),
      vitamin_c_mg: v("vitamin_c_mg"),
      vitamin_b12_ug: v("vitamin_b12_ug"),
      folate_ug: v("folate_ug"),
      thiamin_mg: v("thiamin_mg"),
      niacin_mg: v("niacin_mg"),
      alcohol_g: v("alcohol_g"),
      energy_density_kcal_per_g: Math.round(num(get("kcal"))) / 100,
    };
    const head = name.split(",")[0];
    return {
      code: String(get("food_code")),
      name,
      group,
      unit,
      specificGravity: sg,
      per100,
      tokens: foodTokens(`${name} ${group}`),
      headTokens: foodTokens(head),
      normName: normaliseFoodText(name),
    };
  });
  return foods;
}

// When someone types a bare everyday food, the version most people mean.
const EVERYDAY_DEFAULTS: Array<[RegExp, string]> = [
  [/^rice$/, "rice, white, long grain, boiled in unsalted water"],
  [/^(white )?rice$/, "rice, white, long grain, boiled in unsalted water"],
  [/^pasta$/, "pasta, white, dried, boiled in unsalted water"],
  [/^spaghetti$/, "pasta, white, spaghetti, dried, boiled in unsalted water"],
  [/^eggs?$/, "eggs, chicken, whole, boiled"],
  [/^(boiled )?eggs?( boiled)?$/, "eggs, chicken, whole, boiled"],
  [/^(fried )?eggs?( fried)?$/, "eggs, chicken, whole, fried in sunflower oil"],
  [/^(scrambled )?eggs?( scrambled)?$/, "eggs, chicken, whole, scrambled, without milk"],
  [/^(poached )?eggs?( poached)?$/, "eggs, chicken, whole, poached"],
  [/^chicken breast$/, "chicken, breast, grilled without skin, meat only"],
  [/^chicken$/, "chicken, breast, grilled without skin, meat only"],
  [/^potato chips$/, "potato chips, oven ready, no batter, baked"],
  [/^oven potato chips$/, "potato chips, oven ready, no batter, baked"],
  [/^bacon$/, "bacon rashers, back, grilled"],
  [/^sausages?$/, "sausages, pork, chilled, grilled"],
  [/^salmon$/, "salmon, farmed, flesh only, grilled"],
  [/^apples?$/, "apples, eating, raw, flesh and skin"],
  [/^yogh?urt$/, "yogurt, whole milk, plain"],
  [/^greek yogh?urt$/, "yogurt, greek style, plain"],
  [/^bread$/, "bread, white, sliced"],
  [/^bread toasted$/, "bread, white, toasted"],
  [/^milk$/, "milk, semi-skimmed, pasteurised, average"],
  [/^semi-skimmed( milk)?$|^semi skimmed( milk)?$/, "milk, semi-skimmed, pasteurised, average"],
  [/^whole milk$/, "milk, whole, pasteurised, average"],
  [/^skimmed milk$/, "milk, skimmed, pasteurised, average"],
  [/^beef mince$/, "beef, mince, stewed"],
  [/^cheese$/, "cheese, cheddar, english"],
  [/^potato(es)?$/, "potatoes, old, boiled in unsalted water, flesh only"],
  [/^new potato(es)?$/, "potatoes, new and salad, boiled in unsalted water, flesh and skin"],
  [/^tea$/, "tea, infusion, average, with semi-skimmed milk"],
  [/^coffee$/, "coffee, infusion, average, with semi-skimmed milk"],
  [/^butter$/, "butter, salted"],
  [/^avocado$/, "avocado, hass, flesh only"],
  [/^tuna$/, "tuna, canned in brine, drained"],
  [/^oats$|^porridge oats$/, "porridge oats, unfortified"],
];

// Less usual versions that shouldn't win over the everyday one.
const UNUSUAL = /\b(duck|quail|goose|ostrich|gull|turkey eggs|wild|fuerte|purple sprouting|infant|twin pot|summer and autumn|winter and spring|dried, raw|dripping)\b/;
const EGG_PART = /^eggs, .*\b(yolk|white)\b/;

const COOKING_WORDS = new Set(["raw", "boiled", "fried", "grilled", "roast", "roasted", "baked", "steamed", "microwaved", "poached", "scrambled", "toasted", "canned", "dried", "cooked", "stewed", "mashed", "casseroled", "braised", "stir", "frozen"]);

export type ReferenceMatch = { food: RefFood; score: number };

/** Ranks UK reference foods for a plain-food query: any word order, plurals and small typos allowed. */
export function searchReferenceFoods(query: string, limit = 6): ReferenceMatch[] {
  const expanded = expandPlainFoodQuery(query);
  const queryTokens = foodTokens(expanded);
  if (!queryTokens.length) return [];
  const normQuery = normaliseFoodText(expanded);
  const queryHasCooking = queryTokens.some((token) => COOKING_WORDS.has(token));
  const preferred = EVERYDAY_DEFAULTS.filter(([pattern]) => pattern.test(normQuery)).map(([, name]) => normaliseFoodText(name));
  const results: ReferenceMatch[] = [];

  for (const food of loadFoods()) {
    const { coverage, matched } = tokenCoverage(queryTokens, food.tokens);
    const missing = queryTokens.length - matched;
    if (missing > (queryTokens.length >= 3 ? 1 : 0)) continue;
    if (coverage < 0.6) continue;
    let score = coverage;
    // The food's own name (before the first comma) is what the query is about.
    const head = tokenCoverage(food.headTokens, queryTokens);
    if (food.headTokens.length && head.matched === food.headTokens.length) score += 0.45;
    else if (head.matched > 0) score += 0.12;
    if (food.normName.startsWith(normQuery)) score += 0.2;
    else if (food.normName.includes(normQuery)) score += 0.1;
    // Prefer plain, everyday versions over specific preparations.
    const extra = Math.max(0, food.tokens.length - queryTokens.length - 2);
    score -= Math.min(0.35, extra * 0.025);
    if (/weighed with|weighed as/.test(food.normName)) score -= 0.5;
    if (/\baverage\b/.test(food.normName)) score += 0.08;
    if (/homemade/.test(food.normName) && !/homemade/.test(normQuery)) score -= 0.05;
    if (!queryHasCooking && /\braw\b/.test(food.normName) && /^(Fruit|Vegetables|Nuts and seeds)$/.test(food.group)) score += 0.04;
    if (!queryHasCooking && /\braw\b/.test(food.normName) && /^(Meat|Fish|Cereals)/.test(food.group)) score -= 0.08;
    if (/concentrate|undiluted|dried, raw|powder/.test(food.normName) && !/concentrate|powder|dried/.test(normQuery)) score -= 0.15;
    if (UNUSUAL.test(food.normName) && !UNUSUAL.test(normQuery)) score -= 0.12;
    if (EGG_PART.test(food.normName) && !/yolk|white/.test(normQuery)) score -= 0.15;
    if (preferred.includes(food.normName)) score += 0.4;
    results.push({ food, score: Math.round(score * 1000) / 1000 });
  }

  return results.sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length).slice(0, limit);
}

function referenceEstimate(food: RefFood): RecipeEstimate {
  const totals: NutritionTotals = { ...EMPTY_NUTRITION_TOTALS };
  for (const [key, value] of Object.entries(food.per100)) {
    if (key in totals) (totals as any)[key] = Number(value || 0);
  }
  const lowProcessing = /^(Fruit|Vegetables|Nuts and seeds|Eggs|Fish and seafood|Meat and meat products|Herbs and spices)$/.test(food.group) && !/canned|in sauce|homemade|fried|processed|pie|sausage|burger|bacon|ham|nugget/.test(food.normName);
  const processing_level: RecipeEstimate["processing_level"] = lowProcessing ? "low" : "unknown";
  return {
    ...totals,
    label: food.name,
    servings: 1,
    confidence: 92,
    health_score: scoreMeal({ ...totals, processing_level } as any),
    image_prompt: `A clear food photo of ${food.name}`,
    ingredients_json: [{ name: food.name }],
    ingredient_ratio_json: [],
    allergen_flags: [],
    dietary_flags: [],
    manufacturing_notes: [],
    micronutrient_notes: ["Vitamins and minerals come from UK government reference data (CoFID). Fortified or branded versions can differ."],
    assumptions: [
      `Values are per 100${food.unit} of the edible part. Pick a portion or type the ${food.unit === "ml" ? "millilitres" : "grams"} you had.`,
      "Allergen information is not part of the reference data — check packs if allergies matter.",
    ],
    confidence_reason: "UK government reference data (McCance and Widdowson's CoFID 2021) — lab-measured averages for this food.",
    processing_level,
  };
}

function suggestedAmount(food: RefFood, portions: ReturnType<typeof portionsForReference>, hint: { count: number | null; amount: number | null }) {
  if (hint.amount) return hint.amount;
  if (!hint.count) return null;
  const everyday = portions.filter((portion) => portion.kind === "everyday");
  const single = everyday.find((portion) => /^1 (medium|portion)|^1 /i.test(portion.label)) || everyday[0];
  if (!single) return null;
  void food;
  return Math.round(single.amount * hint.count * 10) / 10;
}

export function referenceFoodToCandidate(food: RefFood, hint: { count: number | null; amount: number | null } = { count: null, amount: null }): ProductLookupCandidate {
  const portions = portionsForReference(food.name, food.unit);
  const estimate = referenceEstimate(food);
  const energy = checkEnergy({ ...food.per100 });
  return {
    source: "uk_reference",
    source_label: "UK reference data",
    source_url: null,
    barcode: null,
    gtin: null,
    label: food.name,
    brand_name: null,
    image_url: null,
    ingredients_text: null,
    serving_label: `Per 100${food.unit}`,
    package_quantity: null,
    data_confidence: 92,
    confidence_reason: estimate.confidence_reason,
    raw: { reference_code: food.code, group: food.group },
    estimate,
    base_amount: 100,
    serving_known: false,
    unit: food.unit,
    portions,
    suggested_amount: suggestedAmount(food, portions, hint),
    result_group: "everyday",
    quality_flags: energy.ok ? [] : ["energy_mismatch"],
    quality_note: energy.ok ? null : energy.reason,
    reference_code: food.code,
    needs_amount: true,
  };
}

export function referenceCandidates(query: string, limit = 6) {
  const hint = parseQuantity(query);
  const matches = searchReferenceFoods(hint.text, limit);
  // Branded searches ("coke zero", "greggs sausage roll") only show reference foods on a strong match.
  const branded = looksBranded(hint.text);
  const best = matches[0]?.score ?? 0;
  if (branded && best < 1.4) return { best: 0, candidates: [] as ProductLookupCandidate[] };
  // Drop weak tail results so obviously unrelated foods don't show.
  return {
    best,
    candidates: matches.filter((match) => match.score >= Math.max(0.75, best - 0.6)).map((match) => ({ ...referenceFoodToCandidate(match.food, hint), match_score: match.score })),
  };
}
