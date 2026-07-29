// ==========================================
// 1. CORE TYPES & INTERFACES
// ==========================================

export type NutritionTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  soluble_fibre_g: number;
  insoluble_fibre_g: number;
  sugar_g: number;
  added_sugar_g: number;
  natural_sugar_g: number;
  salt_g: number;
  saturated_fat_g: number;
  trans_fat_g: number;
  monounsaturated_fat_g: number;
  polyunsaturated_fat_g: number;
  sodium_mg: number;
  potassium_mg: number;
  calcium_mg: number;
  iron_mg: number;
  magnesium_mg: number;
  zinc_mg: number;
  folate_ug: number;
  niacin_mg: number;
  thiamin_mg: number;
  vitamin_c_mg: number;
  vitamin_d_ug: number;
  vitamin_b12_ug: number;
  omega_3_g: number;
  caffeine_mg: number;
  energy_density_kcal_per_g: number;
  glycemic_impact_score: number;
};

// Consolidated interface for anything that can be scored (meals, products, etc.)
export interface ScorableItem extends Partial<NutritionTotals> {
  label?: string;
  name?: string;
  dietary_flags?: string[] | null;
  manufacturing_notes?: string[] | null;
  processing_level?: "low" | "medium" | "high" | "unknown" | string;
}

export type IngredientRatio = {
  name: string;
  estimated_weight_g?: number;
  percentage?: number;
  role?: string;
  confidence?: number;
};

export type NutritionScore = {
  score: number;
  label: string;
  tone: "low" | "ok" | "good" | "great";
  highlights: string[];
  nudges: string[];
  snippet: string;
};

export type RecipeEstimate = NutritionTotals & {
  label?: string;
  servings: number;
  confidence: number;
  health_score: number;
  image_prompt: string;
  ingredients_json: Array<{ name: string; quantity?: string; notes?: string }>;
  ingredient_ratio_json: IngredientRatio[];
  allergen_flags: string[];
  dietary_flags: string[];
  manufacturing_notes: string[];
  micronutrient_notes: string[];
  assumptions: string[];
  confidence_reason: string;
  processing_level: "low" | "medium" | "high" | "unknown";
};

export type DerivedHealthScore = {
  score: number;
  label: string;
  tone: "low" | "ok" | "good" | "great";
  reason: string;
  nudges: string[];
};

export interface DailyTargets {
  protein_g: number;
  fibre_g: number;
  soluble_fibre_g: number;
  vitamin_c_mg: number;
  calcium_mg: number;
  iron_mg: number;
  potassium_mg: number;
  salt_g: number;
  added_sugar_g: number;
  sat_fat_g: number;
  caffeine_mg: number;
}

export interface UserProfile {
  targets?: Partial<DailyTargets>;
}

// ==========================================
// 2. CONSTANTS & BASELINES
// ==========================================

export const NUTRITION_TOTAL_KEYS: Array<keyof NutritionTotals> = [
  "calories", "protein_g", "carbs_g", "fat_g", "fibre_g", "soluble_fibre_g", 
  "insoluble_fibre_g", "sugar_g", "added_sugar_g", "natural_sugar_g", "salt_g", 
  "saturated_fat_g", "trans_fat_g", "monounsaturated_fat_g", "polyunsaturated_fat_g", 
  "sodium_mg", "potassium_mg", "calcium_mg", "iron_mg", "magnesium_mg", "zinc_mg", 
  "folate_ug", "niacin_mg", "thiamin_mg", "vitamin_c_mg", "vitamin_d_ug", 
  "vitamin_b12_ug", "omega_3_g", "caffeine_mg", "energy_density_kcal_per_g", 
  "glycemic_impact_score",
];

const ZERO_TOTALS: NutritionTotals = {
  calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0, soluble_fibre_g: 0, 
  insoluble_fibre_g: 0, sugar_g: 0, added_sugar_g: 0, natural_sugar_g: 0, salt_g: 0, 
  saturated_fat_g: 0, trans_fat_g: 0, monounsaturated_fat_g: 0, polyunsaturated_fat_g: 0, 
  sodium_mg: 0, potassium_mg: 0, calcium_mg: 0, iron_mg: 0, magnesium_mg: 0, zinc_mg: 0, 
  folate_ug: 0, niacin_mg: 0, thiamin_mg: 0, vitamin_c_mg: 0, vitamin_d_ug: 0, 
  vitamin_b12_ug: 0, omega_3_g: 0, caffeine_mg: 0, energy_density_kcal_per_g: 0, 
  glycemic_impact_score: 0,
};

export const EMPTY_NUTRITION_TOTALS = { ...ZERO_TOTALS };

// Default Adult RDI Guidelines
const DEFAULT_DAILY_TARGETS: DailyTargets = {
  protein_g: 60,
  fibre_g: 30,
  soluble_fibre_g: 7,
  vitamin_c_mg: 80,
  calcium_mg: 700,
  iron_mg: 8,
  potassium_mg: 3500,
  salt_g: 6,
  added_sugar_g: 30,
  sat_fat_g: 20,
  caffeine_mg: 400,
};

// Robust Arrays for Matrix Disruption (AI/NLP friendly)
const EMULSIFIERS = ["emulsifier", "polysorbate", "carboxymethylcellulose", "datem", "carrageenan", "e432", "e466", "e471"];
const ARTIFICIAL_SWEETENERS = ["sucralose", "acesulfame", "aspartame", "saccharin", "neotame", "e955", "e950", "e951", "e954"];
const UPF_THICKENERS = ["maltodextrin", "modified starch", "dextrose", "glucose syrup"];
const PREBIOTIC_FOODS = ["beans", "lentils", "chickpea", "seed", "nuts", "oats", "flaxseed"];
const POLYPHENOL_FOODS = ["berries", "pomegranate", "dark chocolate", "kale", "spinach", "cacao"];
const FERMENTED_FOODS = ["yoghurt", "yogurt", "fermented", "kefir", "sauerkraut", "kimchi", "kombucha"];

// ==========================================
// 3. UTILITY FUNCTIONS
// ==========================================

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function round(value: number, places = 1) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}

function roundNutritionKey(key: keyof NutritionTotals, value: number) {
  if (key.endsWith("_mg") || key.endsWith("_ug") || key === "glycemic_impact_score") return round(value, 0);
  if (key === "energy_density_kcal_per_g") return round(value, 2);
  return round(value, 2);
}

function containsTerm(text: string, terms: string[]): boolean {
  return terms.some(term => text.includes(term));
}

export function addNutritionTotals(items: Partial<NutritionTotals>[]) {
  const acc = { ...ZERO_TOTALS };
  items.forEach((item) => {
    NUTRITION_TOTAL_KEYS.forEach((key) => {
      if (key === "energy_density_kcal_per_g" || key === "glycemic_impact_score") return;
      acc[key] += Number(item[key] || 0);
    });
  });
  
  const totalWeightEstimate = items.reduce((sum, item) => {
    const density = Number(item.energy_density_kcal_per_g || 0);
    const calories = Number(item.calories || 0);
    return density > 0 ? sum + calories / density : sum;
  }, 0);
  
  acc.energy_density_kcal_per_g = totalWeightEstimate > 0 ? round(acc.calories / totalWeightEstimate, 2) : 0;
  
  const glycemicWeight = items.reduce((sum, item) => sum + Number(item.carbs_g || 0), 0);
  acc.glycemic_impact_score = glycemicWeight > 0
    ? Math.round(items.reduce((sum, item) => sum + Number(item.glycemic_impact_score || 0) * Number(item.carbs_g || 0), 0) / glycemicWeight)
    : 0;
  return acc;
}

export function scaleNutritionTotals(item: Partial<NutritionTotals>, multiplier: number) {
  const factor = Number(multiplier || 0);
  return NUTRITION_TOTAL_KEYS.reduce<NutritionTotals>((acc, key) => {
    if (key === "energy_density_kcal_per_g" || key === "glycemic_impact_score") {
      acc[key] = roundNutritionKey(key, Number(item[key] || 0));
    } else {
      acc[key] = roundNutritionKey(key, Number(item[key] || 0) * factor);
    }
    return acc;
  }, { ...ZERO_TOTALS });
}

// ==========================================
// 4. SCORING ENGINES
// ==========================================

export function scoreNutritionDay(totals: Partial<NutritionTotals>, streakDays = 0, userProfile?: UserProfile): NutritionScore {
  const targets = { ...DEFAULT_DAILY_TARGETS, ...(userProfile?.targets || {}) };

  const proteinScore = clamp(Number(totals.protein_g || 0) / targets.protein_g, 0, 1.2) * 30;
  const fibreScore = clamp(Number(totals.fibre_g || 0) / targets.fibre_g, 0, 1) * 35;
  const microScore = (
    clamp(Number(totals.vitamin_c_mg || 0) / targets.vitamin_c_mg, 0, 1) * 10 +
    clamp(Number(totals.calcium_mg || 0) / targets.calcium_mg, 0, 1) * 10 +
    clamp(Number(totals.iron_mg || 0) / targets.iron_mg, 0, 1) * 10 +
    clamp(Number(totals.potassium_mg || 0) / targets.potassium_mg, 0, 1) * 5
  ) * (35 / 40);

  let baseScore = proteinScore + fibreScore + microScore;
  baseScore += Math.min(5, streakDays);

  let penaltyMultiplier = 1.0;
  const addedSugar = Number(totals.added_sugar_g || 0);
  if (addedSugar > targets.added_sugar_g) {
    penaltyMultiplier *= Math.max(0.75, 1 - ((addedSugar - targets.added_sugar_g) / 50));
  }
  const salt = Number(totals.salt_g || 0);
  if (salt > targets.salt_g) {
    penaltyMultiplier *= Math.max(0.80, 1 - ((salt - targets.salt_g) / 6));
  }
  const satFat = Number(totals.saturated_fat_g || 0);
  if (satFat > targets.sat_fat_g) {
    penaltyMultiplier *= Math.max(0.85, 1 - ((satFat - targets.sat_fat_g) / 20));
  }
  const transFat = Number(totals.trans_fat_g || 0);
  if (transFat > 0.5) {
    penaltyMultiplier *= Math.max(0.80, 1 - (transFat / 3));
  }
  const caffeine = Number(totals.caffeine_mg || 0);
  if (caffeine > targets.caffeine_mg) {
    penaltyMultiplier *= Math.max(0.90, 1 - ((caffeine - targets.caffeine_mg) / 200));
  }

  const finalScore = Math.round(clamp(baseScore * penaltyMultiplier, 0, 100));
  const label = finalScore >= 80 ? "Great" : finalScore >= 60 ? "Good" : finalScore >= 40 ? "Okay" : "Needs a lift";
  const tone = finalScore >= 80 ? "great" : finalScore >= 60 ? "good" : finalScore >= 40 ? "ok" : "low";

  const highlights: string[] = [];
  const nudges: string[] = [];
  
  if (Number(totals.protein_g || 0) >= targets.protein_g) highlights.push("Protein is looking strong today.");
  if (Number(totals.fibre_g || 0) >= targets.fibre_g * 0.8) highlights.push("Fibre is in a great place.");
  if (salt > targets.salt_g) nudges.push("Watch the salt intake — it is above your daily guide.");
  if (addedSugar > targets.added_sugar_g) nudges.push("Added sugar is creeping up, balance the next meal with protein/fibre.");
  if (transFat > 1) nudges.push("Potential trans fats detected from processed foods. Check labels.");
  if (Number(totals.fibre_g || 0) < targets.fibre_g * 0.5) nudges.push("A fruit, veg, beans or wholegrain top-up would help fibre.");

  const snippet = nudges.length ? `You’re doing well. ${nudges[0]}` : highlights.length ? `You’re nailing today. ${highlights[0]}` : "A solid start — log one more meal to make the score more representative.";

  return { score: finalScore, label, tone, highlights, nudges, snippet };
}

export function scoreMeal(item: ScorableItem) {
  const calories = Math.max(Number(item.calories || 1), 1);
  
  const proteinDensity = Math.min((Number(item.protein_g || 0) / calories) * 100 / 3.0, 1);
  const fibreDensity = Math.min((Number(item.fibre_g || 0) / calories) * 100 / 1.5, 1);
  
  let baseScore = (proteinDensity * 50) + (fibreDensity * 50);
  if (calories > 250 && calories <= 800) baseScore = Math.min(100, baseScore + 10);
  
  let penaltyMultiplier = 1.0;
  const sugarDensity = (Number(item.added_sugar_g || 0) / calories) * 100;
  if (sugarDensity > 2.0) penaltyMultiplier *= Math.max(0.6, 1 - ((sugarDensity - 2.0) / 10));

  if (item.processing_level === "high") penaltyMultiplier *= 0.85;
  if (item.processing_level === "medium") penaltyMultiplier *= 0.95;

  const glycemic = Number(item.glycemic_impact_score || 0);
  if (glycemic > 65) penaltyMultiplier *= Math.max(0.8, 1 - ((glycemic - 65) / 100));

  if (Number(item.trans_fat_g || 0) > 0.5) penaltyMultiplier *= 0.8;
  if (Number(item.salt_g || 0) > 2.5) penaltyMultiplier *= 0.85;

  return Math.round(clamp(baseScore * penaltyMultiplier, 0, 100));
}

export function scoreProcessedFood(item: ScorableItem): DerivedHealthScore {
  const combinedText = `${Array.isArray(item.dietary_flags) ? item.dietary_flags.join(" ") : ""} ${Array.isArray(item.manufacturing_notes) ? item.manufacturing_notes.join(" ") : ""} ${String(item.label || item.name || "")} ${String(item.processing_level || "")}`.toLowerCase();

  const processing = String(item.processing_level || "").toLowerCase();
  const isDrink = processing === "drink" || /\b(drink|coffee|espresso|latte|cappuccino|americano|flat\s*white|tea|juice|smoothie|shake|milk)\b/i.test(combinedText);
  const isCoffeeOrTea = /\b(coffee|espresso|latte|cappuccino|americano|flat\s*white|tea)\b/i.test(combinedText);
  const hasEnergyPowderSignals = /g\s*fuel|gfuel|energy\s+powder|drink\s+powder|pre\s*workout|functional\s+blend|caffeine\s+powder/i.test(combinedText);
  const hasSmallDrinkFlavouring = /syrup|sucralose|sweetener|toffee|caramel|vanilla|flavou?r/i.test(combinedText);
  let baseUPFScore = processing === "high" ? 80 : processing === "medium" ? 40 : 10;
  if (/g\s*fuel|gfuel|energy\s+powder|drink\s+powder|pre\s*workout|functional\s+blend|blue\s*#?1|artificial\s+flavou?r|artificial\s+color|artificial\s+colour|maltodextrin|silicon\s+dioxide|acesulfame|sucralose|caffeine\s+powder/i.test(combinedText)) {
    baseUPFScore = Math.max(baseUPFScore, hasEnergyPowderSignals ? 78 : 52);
  }
  if (/zero\s+sugar|diet\s+drink|low\s+calorie\s+drink|sweetener|preservative|stabiliser|stabilizer/i.test(combinedText)) {
    baseUPFScore = Math.max(baseUPFScore, 55);
  }

  let additiveMultiplier = 1.0;
  if (containsTerm(combinedText, EMULSIFIERS)) additiveMultiplier += 0.20;
  if (containsTerm(combinedText, UPF_THICKENERS)) additiveMultiplier += 0.15;
  if (containsTerm(combinedText, ARTIFICIAL_SWEETENERS)) additiveMultiplier += 0.10;

  const fiberDensity = (Number(item.fibre_g || 0) / Math.max(Number(item.calories || 1), 1)) * 100;
  const proteinDensity = (Number(item.protein_g || 0) / Math.max(Number(item.calories || 1), 1)) * 100;
  const mitigation = Math.min(30, (fiberDensity * 5) + (proteinDensity * 2));
  
  let finalScore = Math.round(clamp((baseUPFScore * additiveMultiplier) - mitigation, 0, 100));

  if (Number(item.calories || 0) === 0 && !containsTerm(combinedText, ARTIFICIAL_SWEETENERS) && !combinedText.includes("flavouring")) {
    finalScore = 0;
  }

  // Coffee/tea itself should not be treated as ultra-processed just because a small syrup or sweetener was added.
  // Flag the additive, but cap the whole drink unless it is an energy powder / canned functional drink style product.
  if (isCoffeeOrTea && !hasEnergyPowderSignals) {
    finalScore = Math.min(finalScore, hasSmallDrinkFlavouring ? 42 : 18);
  } else if (isDrink && hasSmallDrinkFlavouring && !hasEnergyPowderSignals) {
    finalScore = Math.min(finalScore, 48);
  }

  const label = finalScore >= 75 ? "Ultra-Processed Load" : finalScore >= 45 ? "Moderate Processed Load" : finalScore >= 15 ? "Lightly Processed" : "Whole / Unprocessed Food";
  const tone = finalScore >= 75 ? "low" : finalScore >= 45 ? "ok" : finalScore >= 15 ? "good" : "great";

  const nudges: string[] = [];
  if (finalScore >= 75) nudges.push("This item contains structural modifiers (UPFs) that speed up digestion; balance it with whole foods.");
  if (containsTerm(combinedText, UPF_THICKENERS)) nudges.push("Contains rapid-digesting thickeners (like maltodextrin), which impact blood glucose faster than standard sugar.");
  if (isCoffeeOrTea && hasSmallDrinkFlavouring && !hasEnergyPowderSignals) nudges.push("Coffee/tea is scored separately from small syrup or sweetener add-ons; check caffeine and added sugar rather than treating the whole drink as ultra-processed.");

  const reason = isDrink
    ? `${label}: Drink scored with beverage context, so coffee/tea/milk are separated from sweeteners, syrups and functional drink additives.`
    : `${label}: Evaluated via structural matrix integrity, emulsifier presence, and macronutrient density.`;

  return { score: finalScore, label, tone, reason, nudges };
}

export function scoreGutHealth(item: ScorableItem): DerivedHealthScore {
  if (Number(item.calories || 0) === 0 && Number(item.fibre_g || 0) === 0) {
    return { score: 0, label: "No gut data", tone: "low", reason: "Log food to analyze gut impact.", nudges: [] };
  }

  const combinedText = `${Array.isArray(item.dietary_flags) ? item.dietary_flags.join(" ") : ""} ${Array.isArray(item.manufacturing_notes) ? item.manufacturing_notes.join(" ") : ""} ${String(item.label || item.name || "")}`.toLowerCase();

  let gutPoints = 0;
  gutPoints += clamp(Number(item.soluble_fibre_g || 0) / 4, 0, 1) * 25;
  gutPoints += clamp(Number(item.insoluble_fibre_g || 0) / 8, 0, 1) * 15;
  
  if (containsTerm(combinedText, PREBIOTIC_FOODS)) gutPoints += 10;
  if (containsTerm(combinedText, POLYPHENOL_FOODS)) gutPoints += 10;
  if (containsTerm(combinedText, FERMENTED_FOODS)) gutPoints += 10;

  let gutHealthMultiplier = 1.0;
  if (containsTerm(combinedText, ARTIFICIAL_SWEETENERS)) gutHealthMultiplier *= 0.85;
  if (/g\s*fuel|gfuel|energy\s+powder|drink\s+powder|pre\s*workout|artificial\s+flavou?r|artificial\s+color|artificial\s+colour|maltodextrin|blue\s*#?1|silicon\s+dioxide/i.test(combinedText)) gutHealthMultiplier *= 0.72;
  if (containsTerm(combinedText, EMULSIFIERS)) gutHealthMultiplier *= 0.80;
  if (Number(item.glycemic_impact_score || 0) > 75 && Number(item.saturated_fat_g || 0) > 10) gutHealthMultiplier *= 0.90;

  const finalScore = Math.round(clamp(gutPoints * gutHealthMultiplier, 0, 100));
  const label = finalScore >= 85 ? "High Diversity Microbiome Fuel" : finalScore >= 60 ? "Good Microbiome Support" : finalScore >= 35 ? "Mild Gut Disruption Risk" : "Poor Microbiome Environment";
  const tone = finalScore >= 85 ? "great" : finalScore >= 60 ? "good" : finalScore >= 35 ? "ok" : "low";

  const nudges: string[] = [];
  if (Number(item.soluble_fibre_g || 0) < 2 && Number(item.fibre_g || 0) < 5) nudges.push("Aim for more prebiotic fuel today—try adding oats, flaxseeds, or a handful of berries.");
  if (containsTerm(combinedText, EMULSIFIERS)) nudges.push("This contains emulsifiers which can irritate sensitive gut linings; balance with raw leafy greens.");
  if (/g\s*fuel|gfuel|energy\s+powder|drink\s+powder|pre\s*workout|artificial\s+flavou?r|maltodextrin|sucralose|acesulfame/i.test(combinedText)) nudges.push("Energy powders and sweetened/flavoured drinks can fit occasionally, but they do not add much microbiome fuel; balance with fibre-rich whole foods and hydration.");

  return { score: finalScore, label, tone, reason: `${label}: Based on prebiotic fiber sub-types, polyphenol scoring, and absence of mucosal-stripping additives.`, nudges };
}

export function nutritionBalanceRecommendations(totals: Partial<NutritionTotals>, userProfile?: UserProfile, extraNudges: string[] = []) {
  const targets = { ...DEFAULT_DAILY_TARGETS, ...(userProfile?.targets || {}) };
  const processed = scoreProcessedFood(totals as ScorableItem);
  const gut = scoreGutHealth(totals as ScorableItem);
  const recommendations = new Set<string>();
  
  if (processed.score >= 75) recommendations.add("Processed load is high today — make the next meal simple: lean protein, veg/beans and a slower carb.");
  if (gut.score < 50) recommendations.add("Gut-health support is light — add a fibre anchor such as oats, beans, lentils, fruit, veg or wholegrain bread.");
  if (Number(totals.salt_g || 0) > targets.salt_g) recommendations.add("Salt is already above your daily guide, so go easier on salty sauces, cured meats, crisps or takeaway sides.");
  if (Number(totals.added_sugar_g || 0) > targets.added_sugar_g) recommendations.add("Added sugar is high; balance with protein/fibre and keep drinks lower sugar from here.");
  if (Number(totals.caffeine_mg || 0) > targets.caffeine_mg) recommendations.add("Caffeine is stacking up — prioritise water and avoid late stimulants.");
  
  extraNudges.forEach((item) => recommendations.add(item));
  return { processed, gut, recommendations: Array.from(recommendations).slice(0, 6) };
}

// ==========================================
// 5. RECIPE PARSING & FALLBACKS
// ==========================================

type IngredientProfile = {
  match: RegExp;
  per100g: Partial<NutritionTotals>;
  role?: string;
  allergens?: string[];
  processing?: RecipeEstimate["processing_level"];
  notes?: string;
  manufacturingNotes?: string[];
  confidence?: number;
};

const ingredientProfiles: IngredientProfile[] = [
  { match: /wheat flour|plain flour|strong flour|bread flour|white flour|flour/i, role: "refined / fortified grain", allergens: ["gluten"], processing: "medium", confidence: 72, per100g: { calories: 364, protein_g: 10, carbs_g: 76, fat_g: 1, fibre_g: 2.7, insoluble_fibre_g: 2.3, soluble_fibre_g: 0.4, sugar_g: 0.3, natural_sugar_g: 0.3, calcium_mg: 235, iron_mg: 1.7, niacin_mg: 1.6, thiamin_mg: 0.24, folate_ug: 35, glycemic_impact_score: 78, energy_density_kcal_per_g: 3.64 }, manufacturingNotes: ["UK-style wheat flour fortification estimate included for calcium, iron, niacin and thiamin."] },
  { match: /wholemeal|whole grain|wholegrain|oats|porridge/i, role: "wholegrain", allergens: ["gluten"], processing: "low", confidence: 78, per100g: { calories: 370, protein_g: 12, carbs_g: 64, fat_g: 7, fibre_g: 8, soluble_fibre_g: 3, insoluble_fibre_g: 5, sugar_g: 1, natural_sugar_g: 1, magnesium_mg: 130, iron_mg: 4, niacin_mg: 1.1, thiamin_mg: 0.45, glycemic_impact_score: 48, energy_density_kcal_per_g: 3.7 } },
  { match: /butter/i, role: "butter / dairy fat", allergens: ["dairy"], processing: "medium", confidence: 86, per100g: { calories: 717, fat_g: 81, saturated_fat_g: 51, monounsaturated_fat_g: 21, polyunsaturated_fat_g: 3, trans_fat_g: 2.5, vitamin_d_ug: 1.5, energy_density_kcal_per_g: 7.17, glycemic_impact_score: 5 } },
  { match: /margarine|shortening|partially hydrogenated|vegetable fat/i, role: "manufactured fat", allergens: ["possible soy"], processing: "high", confidence: 58, per100g: { calories: 720, fat_g: 80, saturated_fat_g: 22, monounsaturated_fat_g: 28, polyunsaturated_fat_g: 26, trans_fat_g: 0.8, energy_density_kcal_per_g: 7.2, glycemic_impact_score: 5 }, manufacturingNotes: ["Processed fat estimate. Trans fat depends heavily on the exact product label."] },
  { match: /sugar|sucrose|caster sugar|icing sugar|syrup|honey|jam/i, role: "added sugar", processing: "medium", confidence: 76, per100g: { calories: 390, carbs_g: 100, sugar_g: 100, added_sugar_g: 100, energy_density_kcal_per_g: 3.9, glycemic_impact_score: 92 } },
  { match: /salt|sodium chloride/i, role: "salt", processing: "low", confidence: 90, per100g: { salt_g: 100, sodium_mg: 39300 } },
  { match: /chicken|turkey|lean mince/i, role: "lean protein", processing: "low", confidence: 82, per100g: { calories: 165, protein_g: 31, fat_g: 4, saturated_fat_g: 1, monounsaturated_fat_g: 1.5, polyunsaturated_fat_g: 0.8, sodium_mg: 74, energy_density_kcal_per_g: 1.65, glycemic_impact_score: 0 } },
  { match: /beef|mince|steak/i, role: "red meat", processing: "low", confidence: 78, per100g: { calories: 250, protein_g: 26, fat_g: 15, saturated_fat_g: 6, monounsaturated_fat_g: 6.5, polyunsaturated_fat_g: 0.6, iron_mg: 2.6, zinc_mg: 5, energy_density_kcal_per_g: 2.5, glycemic_impact_score: 0 } },
  { match: /pancetta|guanciale|bacon|lardon|prosciutto/i, role: "cured pork / salty protein", processing: "high", confidence: 72, per100g: { calories: 420, protein_g: 20, fat_g: 37, saturated_fat_g: 13, monounsaturated_fat_g: 17, polyunsaturated_fat_g: 4, salt_g: 3.2, sodium_mg: 1260, iron_mg: 1, zinc_mg: 2.2, energy_density_kcal_per_g: 4.2, glycemic_impact_score: 0 }, manufacturingNotes: ["Cured pork estimate: salt and saturated fat vary widely by brand and portion."] },
  { match: /parmesan|pecorino|grana padano|hard cheese/i, role: "hard cheese / dairy", allergens: ["dairy"], processing: "medium", confidence: 78, per100g: { calories: 392, protein_g: 35, fat_g: 26, saturated_fat_g: 17, monounsaturated_fat_g: 7, polyunsaturated_fat_g: 0.8, salt_g: 1.6, sodium_mg: 640, calcium_mg: 1180, vitamin_b12_ug: 1.4, energy_density_kcal_per_g: 3.92, glycemic_impact_score: 10 } },
  { match: /salmon|mackerel|sardine/i, role: "oily fish", allergens: ["fish"], processing: "low", confidence: 82, per100g: { calories: 208, protein_g: 20, fat_g: 13, saturated_fat_g: 3, monounsaturated_fat_g: 4, polyunsaturated_fat_g: 4, omega_3_g: 2.2, vitamin_d_ug: 10, vitamin_b12_ug: 3, energy_density_kcal_per_g: 2.08, glycemic_impact_score: 0 } },
  { match: /egg/i, role: "protein", allergens: ["egg"], processing: "low", confidence: 86, per100g: { calories: 143, protein_g: 13, fat_g: 10, saturated_fat_g: 3.1, monounsaturated_fat_g: 4, polyunsaturated_fat_g: 1.4, vitamin_b12_ug: 1.1, vitamin_d_ug: 2, energy_density_kcal_per_g: 1.43, glycemic_impact_score: 0 } },
  { match: /spaghetti|dried pasta|dry pasta|uncooked pasta|dried noodle|dry noodle/i, role: "dry pasta / recipe starch", allergens: ["possible gluten"], processing: "medium", confidence: 70, per100g: { calories: 355, protein_g: 12.5, carbs_g: 72, fat_g: 1.5, fibre_g: 3, insoluble_fibre_g: 2.4, soluble_fibre_g: 0.6, glycemic_impact_score: 68, energy_density_kcal_per_g: 3.55 } },
  { match: /cooked pasta|cooked rice|rice|pasta|noodle/i, role: "cooked starch", allergens: ["possible gluten"], processing: "medium", confidence: 62, per100g: { calories: 150, protein_g: 5, carbs_g: 30, fibre_g: 1.8, insoluble_fibre_g: 1.5, soluble_fibre_g: 0.3, glycemic_impact_score: 66, energy_density_kcal_per_g: 1.5 } },
  { match: /potato|sweet potato/i, role: "starchy veg", processing: "low", confidence: 78, per100g: { calories: 86, protein_g: 2, carbs_g: 20, fibre_g: 3, soluble_fibre_g: 0.8, insoluble_fibre_g: 2.2, potassium_mg: 420, vitamin_c_mg: 20, glycemic_impact_score: 62, energy_density_kcal_per_g: 0.86 } },
  { match: /bread|wrap|tortilla|croissant|pastry/i, role: "processed grain / bakery", allergens: ["gluten", "possible dairy"], processing: "high", confidence: 55, per100g: { calories: 315, protein_g: 8, carbs_g: 43, fat_g: 13, saturated_fat_g: 6, trans_fat_g: 0.2, fibre_g: 2.4, soluble_fibre_g: 0.4, insoluble_fibre_g: 2, sugar_g: 5, added_sugar_g: 4, natural_sugar_g: 1, salt_g: 1.1, sodium_mg: 430, calcium_mg: 130, iron_mg: 1.4, niacin_mg: 1.4, thiamin_mg: 0.2, glycemic_impact_score: 72, energy_density_kcal_per_g: 3.15 }, manufacturingNotes: ["Commercial bakery estimate: sodium, added sugar and fat vary widely by supplier."] },
  { match: /bean|lentil|chickpea/i, role: "legume", processing: "low", confidence: 76, per100g: { calories: 120, protein_g: 8, carbs_g: 20, fibre_g: 7, soluble_fibre_g: 2.5, insoluble_fibre_g: 4.5, iron_mg: 2.3, magnesium_mg: 35, folate_ug: 110, glycemic_impact_score: 35, energy_density_kcal_per_g: 1.2 } },
  { match: /broccoli|spinach|kale|pepper|tomato|salad|veg|vegetable|carrot|peas/i, role: "vegetable", processing: "low", confidence: 76, per100g: { calories: 45, protein_g: 2, carbs_g: 8, fibre_g: 3, soluble_fibre_g: 1, insoluble_fibre_g: 2, vitamin_c_mg: 40, potassium_mg: 260, iron_mg: 1.2, folate_ug: 55, glycemic_impact_score: 22, energy_density_kcal_per_g: 0.45 } },
  { match: /apple|banana|berry|berries|orange|fruit|grape/i, role: "fruit", processing: "low", confidence: 76, per100g: { calories: 60, carbs_g: 14, fibre_g: 2.5, soluble_fibre_g: 1, insoluble_fibre_g: 1.5, sugar_g: 10, natural_sugar_g: 10, vitamin_c_mg: 20, potassium_mg: 180, glycemic_impact_score: 45, energy_density_kcal_per_g: 0.6 } },
  { match: /milk|yoghurt|yogurt|cheese/i, role: "dairy", allergens: ["dairy"], processing: "medium", confidence: 72, per100g: { calories: 95, protein_g: 6, carbs_g: 6, fat_g: 5, saturated_fat_g: 3, monounsaturated_fat_g: 1.2, polyunsaturated_fat_g: 0.2, sugar_g: 5, natural_sugar_g: 5, calcium_mg: 160, vitamin_b12_ug: 0.5, glycemic_impact_score: 28, energy_density_kcal_per_g: 0.95 } },
  { match: /oil|olive oil|rapeseed oil|sunflower oil|ghee/i, role: "added fat", processing: "medium", confidence: 76, per100g: { calories: 884, fat_g: 100, saturated_fat_g: 12, monounsaturated_fat_g: 66, polyunsaturated_fat_g: 16, energy_density_kcal_per_g: 8.84, glycemic_impact_score: 0 } },
  { match: /sauce|stock|soy|gravy|ketchup/i, role: "sauce / condiment", allergens: ["possible gluten", "possible soy"], processing: "high", confidence: 55, per100g: { calories: 90, carbs_g: 15, sugar_g: 8, added_sugar_g: 6, natural_sugar_g: 2, salt_g: 4, sodium_mg: 1600, glycemic_impact_score: 55, energy_density_kcal_per_g: 0.9 }, manufacturingNotes: ["Sodium can swing heavily depending on the sauce/stock brand."] },
  { match: /gfuel|g fuel|energy drink|monster|red bull|caffeine/i, role: "caffeinated drink", processing: "high", confidence: 65, per100g: { calories: 15, carbs_g: 3, sugar_g: 0, added_sugar_g: 0, caffeine_mg: 150, sodium_mg: 120, glycemic_impact_score: 15, energy_density_kcal_per_g: 0.15 }, notes: "Energy drink/caffeine estimate. Check label for exact caffeine, sweeteners and serving size." },
];

function parseAmount(line: string) {
  const lower = line.toLowerCase();
  const numberMatch = lower.match(/(\d+(?:\.\d+)?)/);
  const value = numberMatch ? Number(numberMatch[1]) : 0;
  if (/kg|kilogram/.test(lower)) return value * 1000;
  if (/g|gram/.test(lower)) return value;
  if (/ml|millilitre/.test(lower)) return value;
  if (/l\b|litre/.test(lower)) return value * 1000;
  if (/tbsp|tablespoon/.test(lower)) return value * 15;
  if (/tsp|teaspoon/.test(lower)) return value * 5;
  if (/egg/.test(lower) && value) return value * 55;
  if (/croissant|pastry/.test(lower) && !value) return 70;
  if (value) return value * 100;
  return 100;
}


function applyCookingAdjustment(line: string, recipeText: string, profile: IngredientProfile | undefined, factor: number, totals: NutritionTotals, notes: string[]) {
  const text = `${line} ${recipeText}`.toLowerCase();
  if (!profile) return;

  // Cooking usually changes water weight and a few heat-sensitive micronutrients more than it changes calories/macros.
  // We keep ingredient-weight calories stable, then adjust predictable losses/additions where the method implies them.
  if (/egg/.test(line.toLowerCase()) && /cook|cooked|boil|boiled|scrambl|fried|omelette|carbonara|bake|baked/.test(text)) {
    totals.vitamin_b12_ug = Math.max(0, totals.vitamin_b12_ug - Number(profile.per100g.vitamin_b12_ug || 0) * factor * 0.08);
    totals.vitamin_d_ug = Math.max(0, totals.vitamin_d_ug - Number(profile.per100g.vitamin_d_ug || 0) * factor * 0.05);
    notes.push("Eggs are treated as cooked in this recipe: calories/protein are broadly retained, with a small allowance for heat-sensitive B12/vitamin D changes.");
  }

  if (/broccoli|spinach|kale|pepper|tomato|carrot|peas|veg|vegetable/.test(line.toLowerCase()) && /boil|boiled|cook|cooked|roast|fried|bake|baked/.test(text)) {
    totals.vitamin_c_mg = Math.max(0, totals.vitamin_c_mg - Number(profile.per100g.vitamin_c_mg || 0) * factor * 0.25);
    notes.push("Cooked vegetables include an estimated vitamin C reduction versus raw values; minerals and fibre are mostly retained.");
  }

  const explicitAddedFat = /oil|butter|ghee|dripping|lard/.test(recipeText.toLowerCase());
  if (!explicitAddedFat && /fried|pan fried|sauté|saute|scrambled/.test(text) && /egg|chicken|turkey|beef|mince|steak|veg|vegetable/.test(line.toLowerCase())) {
    totals.calories += 40;
    totals.fat_g += 4.5;
    totals.saturated_fat_g += 0.6;
    totals.monounsaturated_fat_g += 2.6;
    totals.polyunsaturated_fat_g += 0.9;
    notes.push("Cooking method suggests absorbed pan fat; a small default oil allowance was added because no explicit oil/butter line was present.");
  }
}

function cleanIngredient(line: string) {
  return line.replace(/^[-*•\s]+/u, "").trim();
}

export function parseIngredients(text: string) {
  return String(text || "")
    .split(/\r?\n|;/)
    .map(cleanIngredient)
    .filter(Boolean);
}

function typicalIngredientLines(label: string, servings: number) {
  const text = label.toLowerCase();
  if (/croissant|pastry/.test(text)) {
    const servingG = 70 * servings;
    return [
      `${round(servingG * 0.45, 0)}g fortified wheat flour`,
      `${round(servingG * 0.25, 0)}g butter`,
      `${round(servingG * 0.15, 0)}g water`,
      `${round(servingG * 0.06, 0)}g sugar`,
      `${round(servingG * 0.02, 0)}g salt`,
      `${round(servingG * 0.07, 0)}g yeast and bakery improvers`,
    ];
  }
  if (/carbonara/.test(text)) {
    const base = servings;
    return [
      `${round(85 * base, 0)}g dried spaghetti`,
      `${round(35 * base, 0)}g pancetta or guanciale`,
      `${round(55 * base, 0)}g egg`,
      `${round(20 * base, 0)}g parmesan or pecorino`,
      `black pepper`,
      `optional reserved pasta water`,
    ];
  }
  if (/bolognese|ragu|ragù/.test(text)) {
    const base = servings;
    return [
      `${round(80 * base, 0)}g dried pasta`,
      `${round(90 * base, 0)}g beef mince`,
      `${round(90 * base, 0)}g tomato sauce`,
      `${round(30 * base, 0)}g onion carrot celery mix`,
      `${round(8 * base, 0)}g olive oil`,
      `${round(10 * base, 0)}g parmesan`,
    ];
  }
  if (/white bread|baguette|roll|bun/.test(text)) {
    const servingG = 90 * servings;
    return [
      `${round(servingG * 0.68, 0)}g fortified wheat flour`,
      `${round(servingG * 0.24, 0)}g water`,
      `${round(servingG * 0.03, 0)}g sugar`,
      `${round(servingG * 0.02, 0)}g salt`,
      `${round(servingG * 0.03, 0)}g yeast and bakery improvers`,
    ];
  }
  if (/energy drink|gfuel|g fuel|monster|red bull/.test(text)) return [`500ml ${label}`];
  return [];
}

function estimateEnergyDensity(totals: Partial<NutritionTotals>, weightG: number) {
  return weightG > 0 ? round(Number(totals.calories || 0) / weightG, 2) : Number(totals.energy_density_kcal_per_g || 0);
}

function estimateGlycemicImpact(totals: Partial<NutritionTotals>) {
  const carbs = Number(totals.carbs_g || 0);
  if (carbs <= 0) return 0;
  let impact = 72;
  impact += clamp(Number(totals.added_sugar_g || 0) / Math.max(1, carbs), 0, 1) * 18;
  impact -= clamp(Number(totals.fibre_g || 0) / Math.max(1, carbs), 0, 0.45) * 55;
  impact -= clamp(Number(totals.fat_g || 0) / 25, 0, 1) * 8;
  impact -= clamp(Number(totals.protein_g || 0) / 25, 0, 1) * 8;
  return Math.round(clamp(impact, 0, 100));
}

function uniqueStrings(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

export function fallbackRecipeEstimate(input: { label: string; servings?: number; ingredients: string; notes?: string }): RecipeEstimate {
  const servings = Math.max(1, Number(input.servings || 1));
  const providedLines = parseIngredients(input.ingredients);
  const inferredLines = providedLines.length ? [] : typicalIngredientLines(`${input.label} ${input.notes || ""}`, servings);
  const lines = providedLines.length ? providedLines : inferredLines;
  const totals = { ...ZERO_TOTALS };
  const notes: string[] = [];
  const manufacturingNotes: string[] = [];
  const allergens: string[] = [];
  const dietaryFlags: string[] = [];
  let totalWeightG = 0;
  let totalConfidence = 0;
  let matchedCount = 0;
  let processingScore = 0;

  const ingredients_json = lines.map((line) => ({ name: line, quantity: line.match(/\d/) ? line : undefined }));
  const ingredientAmounts: Array<{ line: string; amount: number; profile?: IngredientProfile }> = [];

  lines.forEach((line) => {
    const amount = parseAmount(line);
    totalWeightG += amount;
    const profile = ingredientProfiles.find((item) => item.match.test(line));
    ingredientAmounts.push({ line, amount, profile });
    if (!profile) {
      totals.calories += 85;
      totals.carbs_g += 12;
      totals.protein_g += 2;
      totals.fibre_g += 1;
      totals.insoluble_fibre_g += 0.8;
      totals.soluble_fibre_g += 0.2;
      totals.glycemic_impact_score += 55;
      totalConfidence += 28;
      return;
    }
    matchedCount += 1;
    totalConfidence += profile.confidence || 55;
    if (profile.notes) notes.push(profile.notes);
    if (profile.manufacturingNotes?.length) manufacturingNotes.push(...profile.manufacturingNotes);
    if (profile.allergens?.length) allergens.push(...profile.allergens);
    if (profile.processing === "high") processingScore += 3;
    if (profile.processing === "medium") processingScore += 1.5;
    const factor = amount / 100;
    NUTRITION_TOTAL_KEYS.forEach((key) => {
      if (key === "energy_density_kcal_per_g" || key === "glycemic_impact_score") return;
      totals[key] += Number(profile.per100g[key] || 0) * factor;
    });
    applyCookingAdjustment(line, `${input.label} ${input.notes || ""} ${input.ingredients || ""}`, profile, factor, totals, notes);
  });

  if (!lines.length) {
    totals.calories = 300 * servings;
    totals.carbs_g = 35 * servings;
    totals.protein_g = 12 * servings;
    totals.fat_g = 10 * servings;
    totals.fibre_g = 3 * servings;
    totalWeightG = 350 * servings;
  }

  totals.energy_density_kcal_per_g = estimateEnergyDensity(totals, totalWeightG);
  totals.glycemic_impact_score = estimateGlycemicImpact(totals);
  const perServing = scaleNutritionTotals(totals, 1 / servings);
  perServing.energy_density_kcal_per_g = totals.energy_density_kcal_per_g;
  perServing.glycemic_impact_score = totals.glycemic_impact_score;

  if (perServing.added_sugar_g > 8) dietaryFlags.push("added sugar");
  if (perServing.saturated_fat_g > 7) dietaryFlags.push("high saturated fat");
  if (perServing.salt_g > 1.5) dietaryFlags.push("high salt");
  if (perServing.energy_density_kcal_per_g > 3.5) dietaryFlags.push("energy dense");
  if (perServing.glycemic_impact_score > 70) dietaryFlags.push("higher glycemic impact");
  if (perServing.caffeine_mg > 0) dietaryFlags.push("caffeine");

  const ingredient_ratio_json = ingredientAmounts.map(({ line, amount, profile }) => ({
    name: line.replace(/^\d+(?:\.\d+)?\s*(?:g|kg|ml|l|tbsp|tsp)?\s*/i, "").trim() || line,
    estimated_weight_g: round(amount, 0),
    percentage: totalWeightG > 0 ? round((amount / totalWeightG) * 100, 1) : 0,
    role: profile?.role || "estimated ingredient",
    confidence: profile?.confidence || 35,
  }));

  const confidenceBase = lines.length
    ? Math.round(totalConfidence / Math.max(1, lines.length))
    : 20;
  const confidence = providedLines.length
    ? clamp(confidenceBase, 25, 82)
    : inferredLines.length
      ? clamp(confidenceBase - 8, 28, 68)
      : 20;
  const processing_level: RecipeEstimate["processing_level"] = processingScore >= 4 ? "high" : processingScore >= 1.5 ? "medium" : lines.length ? "low" : "unknown";
  
  // Cast perServing to ScorableItem to fulfill the new interface parameters
  const health_score = scoreMeal({ ...perServing, processing_level } as ScorableItem);
  
  const image_prompt = `Overhead natural-light meal photo of ${input.label || "home cooked recipe"}, simple plate, realistic, appetising.`;
  const confidence_reason = providedLines.length
    ? `Matched ${matchedCount} of ${lines.length} ingredient line(s) to built-in food profiles.`
    : inferredLines.length
      ? "Estimated from a typical commercial recipe ratio because no ingredient list was supplied."
      : "Very low confidence because no usable ingredients were supplied.";

  return {
    ...perServing,
    label: input.label,
    servings,
    confidence: Math.round(confidence),
    health_score,
    image_prompt,
    ingredients_json,
    ingredient_ratio_json,
    allergen_flags: uniqueStrings(allergens),
    dietary_flags: uniqueStrings(dietaryFlags),
    manufacturing_notes: uniqueStrings(manufacturingNotes),
    micronutrient_notes: notes.length ? uniqueStrings(notes) : ["Fallback estimate only. Review macros, fortification and sodium against labels for precision."],
    assumptions: [
      providedLines.length ? "Calculated from common ingredient averages because no nutrition database or AI result was available." : "Inferred likely ingredients/ratios from the meal name because no ingredient list was supplied.",
      "Stored values are per serving, so adult/child portions can scale from the same recipe card.",
      "Added sugar, soluble/insoluble fibre, fat profile and glycemic impact are estimates, not lab results.",
      "Cooking-aware adjustments are applied where the ingredient/method clearly implies cooked eggs, cooked vegetables or absorbed pan fat.",
    ],
    confidence_reason,
    processing_level,
  };
}

export function normaliseRecipeEstimate(input: any, fallback: RecipeEstimate): RecipeEstimate {
  const perServing = input?.per_serving || input?.perServing || input || {};
  const output: RecipeEstimate = {
    ...fallback,
    servings: Number(input?.servings || fallback.servings || 1),
    confidence: Math.round(clamp(Number(input?.confidence ?? fallback.confidence), 0, 100)),
    health_score: Math.round(clamp(Number(input?.health_score ?? input?.score ?? fallback.health_score), 0, 100)),
    image_prompt: String(input?.image_prompt || input?.imagePrompt || fallback.image_prompt || "").slice(0, 500),
    ingredients_json: Array.isArray(input?.ingredients_json) ? input.ingredients_json : Array.isArray(input?.ingredients) ? input.ingredients : fallback.ingredients_json,
    ingredient_ratio_json: Array.isArray(input?.ingredient_ratio_json) ? input.ingredient_ratio_json : Array.isArray(input?.ingredient_ratios) ? input.ingredient_ratios : fallback.ingredient_ratio_json,
    allergen_flags: Array.isArray(input?.allergen_flags) ? input.allergen_flags.map(String).slice(0, 12) : fallback.allergen_flags,
    dietary_flags: Array.isArray(input?.dietary_flags) ? input.dietary_flags.map(String).slice(0, 12) : Array.isArray(input?.behavioural_flags) ? input.behavioural_flags.map(String).slice(0, 12) : fallback.dietary_flags,
    manufacturing_notes: Array.isArray(input?.manufacturing_notes) ? input.manufacturing_notes.map(String).slice(0, 8) : fallback.manufacturing_notes,
    micronutrient_notes: Array.isArray(input?.micronutrient_notes) ? input.micronutrient_notes.map(String).slice(0, 8) : fallback.micronutrient_notes,
    assumptions: Array.isArray(input?.assumptions) ? input.assumptions.map(String).slice(0, 8) : fallback.assumptions,
    confidence_reason: String(input?.confidence_reason || fallback.confidence_reason || "").slice(0, 400),
    processing_level: ["low", "medium", "high", "unknown"].includes(input?.processing_level) ? input.processing_level : fallback.processing_level,
  };

  NUTRITION_TOTAL_KEYS.forEach((key) => {
    output[key] = roundNutritionKey(key, Number(perServing[key] ?? input?.[key] ?? fallback[key] ?? 0));
  });

  if (!output.glycemic_impact_score) output.glycemic_impact_score = estimateGlycemicImpact(output);
  if (!output.health_score) output.health_score = scoreMeal(output as ScorableItem);

  return output;
}

export function mealImageEmoji(label: string) {
  const text = label.toLowerCase();
  if (/smoothie|shake|drink|coffee|tea|energy/.test(text)) return "🥤";
  if (/croissant|pastry|bread|toast|bakery/.test(text)) return "🥐";
  if (/breakfast|egg|porridge|cereal/.test(text)) return "🍳";
  if (/pasta|spaghetti|noodle/.test(text)) return "🍝";
  if (/chicken|turkey|beef|steak/.test(text)) return "🍽️";
  if (/salad|veg|vegetable/.test(text)) return "🥗";
  if (/curry|chilli|rice/.test(text)) return "🍛";
  if (/fruit|berry|apple|banana/.test(text)) return "🍓";
  return "🍽️";
}