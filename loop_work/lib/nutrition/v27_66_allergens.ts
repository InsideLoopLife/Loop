export type AllergenPresence = "contains" | "may_contain" | "not_present" | "unknown";

export type ParsedAllergenFact = {
  key: string;
  label: string;
  presence: AllergenPresence;
  evidenceText: string;
  confidence: number;
};

const ALLERGEN_SYNONYMS: Record<string, string[]> = {
  peanuts: ["peanut", "peanuts", "groundnut", "groundnuts"],
  tree_nuts: ["nuts", "tree nuts", "almond", "hazelnut", "walnut", "cashew", "pecan", "brazil nut", "pistachio", "macadamia"],
  milk: ["milk", "whey", "casein", "lactose"],
  soya: ["soya", "soy", "soybean", "soy protein", "soya protein"],
  gluten: ["gluten", "wheat", "barley", "rye", "oats"],
  egg: ["egg", "eggs", "albumen"],
  sesame: ["sesame"],
  celery: ["celery"],
  mustard: ["mustard"],
  sulphites: ["sulphites", "sulfites", "sulphur dioxide", "sulfur dioxide"],
  lupin: ["lupin"],
  molluscs: ["mollusc", "molluscs"],
  crustaceans: ["crustacean", "crustaceans"],
  fish: ["fish"],
};

const LABELS: Record<string, string> = {
  peanuts: "Peanuts",
  tree_nuts: "Nuts",
  milk: "Milk",
  soya: "Soya",
  gluten: "Gluten",
  egg: "Egg",
  sesame: "Sesame",
  celery: "Celery",
  mustard: "Mustard",
  sulphites: "Sulphites",
  lupin: "Lupin",
  molluscs: "Molluscs",
  crustaceans: "Crustaceans",
  fish: "Fish",
};

function normaliseText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
}

/**
 * Splits allergen facts into "contains" vs "may_contain".
 *
 * Important:
 * - "May contain traces of peanuts, nuts and milk" is NOT a direct allergy flag.
 * - It becomes presence="may_contain", so UI can render it in a separate caution column.
 * - Direct ingredients such as "soya protein isolate" become presence="contains".
 */
export function parseAllergenFacts(input: {
  ingredientsText?: string | null;
  allergensText?: string | null;
}): ParsedAllergenFact[] {
  const ingredients = normaliseText(input.ingredientsText || "");
  const allergenText = normaliseText(input.allergensText || "");

  const facts = new Map<string, ParsedAllergenFact>();

  const mayContainPhrases = [
    /may contain(?: traces of)? ([^.]+)/i,
    /may also contain(?: traces of)? ([^.]+)/i,
    /not suitable for .*? allergy sufferers.*? due to .*? methods/i,
  ];

  for (const [key, terms] of Object.entries(ALLERGEN_SYNONYMS)) {
    if (hasAny(ingredients, terms)) {
      facts.set(`${key}:contains`, {
        key,
        label: LABELS[key] || key,
        presence: "contains",
        evidenceText: input.ingredientsText || "",
        confidence: 88,
      });
    }
  }

  for (const phrase of mayContainPhrases) {
    const match = allergenText.match(phrase);
    if (!match) continue;
    const mayText = normaliseText(match[1] || allergenText);
    for (const [key, terms] of Object.entries(ALLERGEN_SYNONYMS)) {
      if (hasAny(mayText, terms)) {
        facts.set(`${key}:may_contain`, {
          key,
          label: LABELS[key] || key,
          presence: "may_contain",
          evidenceText: input.allergensText || "",
          confidence: 92,
        });
      }
    }
  }

  // If the allergen text is simply "Contains: milk, soya", treat as direct.
  if (/^(contains|allergens?:)/i.test(allergenText) && !/may contain/i.test(allergenText)) {
    for (const [key, terms] of Object.entries(ALLERGEN_SYNONYMS)) {
      if (hasAny(allergenText, terms)) {
        facts.set(`${key}:contains`, {
          key,
          label: LABELS[key] || key,
          presence: "contains",
          evidenceText: input.allergensText || "",
          confidence: 94,
        });
      }
    }
  }

  return [...facts.values()];
}

export function splitAllergensForUi(facts: ParsedAllergenFact[]) {
  return {
    contains: facts.filter((fact) => fact.presence === "contains"),
    mayContain: facts.filter((fact) => fact.presence === "may_contain"),
    unknown: facts.filter((fact) => fact.presence === "unknown"),
  };
}
