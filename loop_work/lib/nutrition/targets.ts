// UK daily targets and limits by age (and optionally sex), so children aren't judged against adult numbers.
// Sources: SACN (free sugars, fibre, salt, energy), UK Reference Nutrient Intakes (COMA/SACN) for
// vitamins and minerals, EFSA for caffeine. Limits are "no more than"; targets are "aim for".

export type NutritionProfileInput = {
  birth_date?: string | null;
  relationship?: string | null;
  nutrition_reference_sex?: "male" | "female" | null;
  weight_kg?: number | null;
  caffeine_limit_mg?: number | null;
  daily_calorie_target?: number | null;
  height_cm?: number | null;
  activity_level?: "sedentary" | "light" | "moderate" | "active" | "very_active" | string | null;
  nutrition_goal?: "maintain" | "lose" | "gain" | "eat_better" | string | null;
};

const ACTIVITY_FACTOR: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };

/**
 * Adult calorie estimate: Mifflin–St Jeor resting energy × activity factor, adjusted for the goal.
 * Returns null unless weight, height, age and reference sex are all known.
 */
export function estimateAdultCalories(profile: NutritionProfileInput | null | undefined, age: number | null) {
  const weight = Number(profile?.weight_kg || 0);
  const height = Number(profile?.height_cm || 0);
  const sex = profile?.nutrition_reference_sex;
  if (!(weight > 30) || !(height > 120) || age == null || age < 19 || !sex) return null;
  const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === "male" ? 5 : -161);
  const factor = ACTIVITY_FACTOR[String(profile?.activity_level || "")] ?? 1.375;
  let kcal = bmr * factor;
  const goal = profile?.nutrition_goal;
  if (goal === "lose") kcal = Math.max(kcal - 500, bmr * 1.1, sex === "male" ? 1500 : 1200);
  if (goal === "gain") kcal += 300;
  return { kcal: Math.round(kcal / 10) * 10, bmr: Math.round(bmr), factor, goal: goal || null };
}

export type AgeBand = "toddler" | "child_4_6" | "child_7_10" | "teen_11_14" | "teen_15_18" | "adult" | "child_unknown";

export type PersonTargets = {
  band: AgeBand;
  bandLabel: string;
  ageYears: number | null;
  isChild: boolean;
  calories: number;
  /** How the calorie guide was set: a UK average, a personal estimate, or a number someone typed in. */
  caloriesBasis: "uk_average" | "personal_estimate" | "set";
  protein_g: number;
  fibre_g: number;
  /** Limits */
  salt_g: number;
  added_sugar_g: number | null; // free sugars; null = "avoid" (under 4s)
  saturated_fat_g: number;
  caffeine_mg: number | null; // null = not recommended / no safe figure without weight
  /** Vitamins & minerals (UK RNI) */
  calcium_mg: number;
  iron_mg: number;
  vitamin_c_mg: number;
  vitamin_d_ug: number;
  folate_ug: number;
  potassium_mg: number;
  magnesium_mg: number;
  zinc_mg: number;
  vitamin_b12_ug: number;
  thiamin_mg: number;
  niacin_mg: number;
  notes: string[];
};

export function ageInYears(birthDate: string | null | undefined, onDate: string) {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}/.test(birthDate)) return null;
  const [by, bm, bd] = birthDate.slice(0, 10).split("-").map(Number);
  const [y, m, d] = onDate.slice(0, 10).split("-").map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function bandFor(age: number | null, relationship?: string | null): AgeBand {
  if (age == null) return /child|son|daughter|baby|kid/i.test(relationship || "") ? "child_unknown" : "adult";
  if (age < 4) return "toddler";
  if (age <= 6) return "child_4_6";
  if (age <= 10) return "child_7_10";
  if (age <= 14) return "teen_11_14";
  if (age <= 18) return "teen_15_18";
  return "adult";
}

const BAND_LABEL: Record<AgeBand, string> = {
  toddler: "Age 1–3",
  child_4_6: "Age 4–6",
  child_7_10: "Age 7–10",
  teen_11_14: "Age 11–14",
  teen_15_18: "Age 15–18",
  adult: "Adult",
  child_unknown: "Child (add a date of birth for age-specific targets)",
};

export function targetsForPerson(profile: NutritionProfileInput | null | undefined, onDate: string): PersonTargets {
  const age = ageInYears(profile?.birth_date, onDate);
  const band = bandFor(age, profile?.relationship);
  const sex = profile?.nutrition_reference_sex || null;
  const female = sex === "female";
  const male = sex === "male";
  const weight = Number(profile?.weight_kg || 0) > 0 ? Number(profile?.weight_kg) : null;
  const notes: string[] = [];
  let t: Omit<PersonTargets, "band" | "bandLabel" | "ageYears" | "isChild" | "notes" | "caloriesBasis">;

  switch (band) {
    case "toddler":
      t = { calories: 1100, protein_g: 14.5, fibre_g: 15, salt_g: 2, added_sugar_g: null, saturated_fat_g: 13, caffeine_mg: null, calcium_mg: 350, iron_mg: 6.9, vitamin_c_mg: 30, vitamin_d_ug: 10, folate_ug: 70, potassium_mg: 800, magnesium_mg: 85, zinc_mg: 5, vitamin_b12_ug: 0.5, thiamin_mg: 0.5, niacin_mg: 8 };
      notes.push("Under 4s: no free-sugar figure — UK advice is to avoid sugary foods and drinks.");
      break;
    case "child_4_6":
    case "child_unknown":
      t = { calories: 1450, protein_g: 19.7, fibre_g: age != null && age < 5 ? 15 : 20, salt_g: 3, added_sugar_g: 19, saturated_fat_g: 18, caffeine_mg: null, calcium_mg: 450, iron_mg: 6.1, vitamin_c_mg: 30, vitamin_d_ug: 10, folate_ug: 100, potassium_mg: 1100, magnesium_mg: 120, zinc_mg: 6.5, vitamin_b12_ug: 0.8, thiamin_mg: 0.7, niacin_mg: 11 };
      break;
    case "child_7_10":
      t = { calories: 1800, protein_g: 28.3, fibre_g: 20, salt_g: 5, added_sugar_g: 24, saturated_fat_g: 22, caffeine_mg: null, calcium_mg: 550, iron_mg: 8.7, vitamin_c_mg: 30, vitamin_d_ug: 10, folate_ug: 150, potassium_mg: 2000, magnesium_mg: 200, zinc_mg: 7, vitamin_b12_ug: 1, thiamin_mg: 0.7, niacin_mg: 12 };
      break;
    case "teen_11_14":
      t = { calories: female ? 2000 : 2200, protein_g: female ? 41.2 : 42.1, fibre_g: 25, salt_g: 6, added_sugar_g: 30, saturated_fat_g: 25, caffeine_mg: null, calcium_mg: female ? 800 : 1000, iron_mg: female ? 14.8 : 11.3, vitamin_c_mg: 35, vitamin_d_ug: 10, folate_ug: 200, potassium_mg: 3100, magnesium_mg: female ? 280 : 280, zinc_mg: 9, vitamin_b12_ug: 1.2, thiamin_mg: female ? 0.7 : 0.9, niacin_mg: female ? 12 : 15 };
      break;
    case "teen_15_18":
      t = { calories: female ? 2100 : 2700, protein_g: female ? 45 : 55.2, fibre_g: age != null && age >= 16 ? 30 : 25, salt_g: 6, added_sugar_g: 30, saturated_fat_g: female ? 22 : 30, caffeine_mg: null, calcium_mg: female ? 800 : 1000, iron_mg: female ? 14.8 : 11.3, vitamin_c_mg: 40, vitamin_d_ug: 10, folate_ug: 200, potassium_mg: 3500, magnesium_mg: 300, zinc_mg: female ? 7 : 9.5, vitamin_b12_ug: 1.5, thiamin_mg: female ? 0.8 : 1.1, niacin_mg: female ? 14 : 18 };
      break;
    default: {
      const older = age != null && age >= 50;
      t = {
        calories: female ? 2000 : male ? 2500 : 2200,
        protein_g: weight ? Math.round(weight * 0.75 * 10) / 10 : female ? 45 : male ? 55.5 : 50,
        fibre_g: 30,
        salt_g: 6,
        added_sugar_g: 30,
        saturated_fat_g: female ? 20 : male ? 30 : 20,
        caffeine_mg: 400,
        calcium_mg: 700,
        iron_mg: female && !older ? 14.8 : 8.7,
        vitamin_c_mg: 40,
        vitamin_d_ug: 10,
        folate_ug: 200,
        potassium_mg: 3500,
        magnesium_mg: female ? 270 : 300,
        zinc_mg: female ? 7 : 9.5,
        vitamin_b12_ug: 1.5,
        thiamin_mg: female ? 0.8 : 1,
        niacin_mg: female ? 13 : 17,
      };
      if (!sex) notes.push("Add which reference values to use (men's or women's) for more accurate iron, protein and calorie guides.");
    }
  }

  const isChild = band !== "adult";
  if (isChild) {
    // EFSA: up to 3mg per kg body weight a day is considered safe for children and adolescents.
    t.caffeine_mg = weight ? Math.round(weight * 3) : null;
    if (!weight) notes.push("Add a weight to get a caffeine guide (3mg per kg). Until then any caffeine is flagged.");
  }
  if (profile?.caffeine_limit_mg != null && profile.caffeine_limit_mg >= 0) t.caffeine_mg = profile.caffeine_limit_mg;
  let caloriesBasis: PersonTargets["caloriesBasis"] = "uk_average";
  if (!isChild) {
    const estimate = estimateAdultCalories(profile, age);
    if (estimate) {
      t.calories = estimate.kcal;
      caloriesBasis = "personal_estimate";
    } else if (band === "adult" && sex) {
      notes.push("Add height and activity level for a personal calorie guide.");
    }
    // Protein: 0.75g per kg (UK reference), a little more when trying to lose weight.
    if (weight && profile?.nutrition_goal === "lose") t.protein_g = Math.round(weight * 1.0);
  }
  if (Number(profile?.daily_calorie_target || 0) > 0) {
    t.calories = Number(profile?.daily_calorie_target);
    caloriesBasis = "set";
  }

  return { band, bandLabel: BAND_LABEL[band], ageYears: age, isChild, notes, ...t, caloriesBasis };
}

/** Shape the existing day score understands. */
export function scoringTargets(targets: PersonTargets) {
  return {
    protein_g: targets.protein_g,
    fibre_g: targets.fibre_g,
    vitamin_c_mg: targets.vitamin_c_mg,
    calcium_mg: targets.calcium_mg,
    iron_mg: targets.iron_mg,
    potassium_mg: targets.potassium_mg,
    salt_g: targets.salt_g,
    added_sugar_g: targets.added_sugar_g ?? 10,
    sat_fat_g: targets.saturated_fat_g,
    caffeine_mg: targets.caffeine_mg ?? 0,
  };
}

// Only pages confirmed to exist.
export const TARGET_SOURCES = {
  caffeine: { label: "EFSA: caffeine", url: "https://www.efsa.europa.eu/en/topics/topic/caffeine" },
  caffeineUk: { label: "Food Standards Agency: caffeine", url: "https://www.food.gov.uk/safety-hygiene/food-supplements-containing-caffeine" },
  sugar: { label: "NHS: sugar — the facts", url: "https://www.nhs.uk/live-well/eat-well/food-types/how-does-sugar-in-our-diet-affect-our-health" },
  salt: { label: "British Dietetic Association: salt", url: "https://www.bda.uk.com/resource/salt.html" },
  fibre: { label: "NHS: how to get more fibre", url: "https://www.nhs.uk/live-well/eat-well/digestive-health/how-to-get-more-fibre-into-your-diet/" },
} as const;
