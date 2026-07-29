import type { AllergenFact, AllergenPresence } from "./types";

const TERMS: Record<string, string[]> = {
  peanuts: ["peanut", "peanuts", "groundnut", "groundnuts"],
  tree_nuts: ["nuts", "tree nuts", "almond", "hazelnut", "walnut", "cashew", "pecan", "brazil nut", "pistachio", "macadamia"],
  milk: ["milk", "whey", "casein", "lactose"],
  soya: ["soya", "soy", "soybean", "soy protein", "soya protein", "soya protein isolate"],
  gluten: ["gluten", "wheat", "barley", "rye", "oats"],
  egg: ["egg", "eggs", "albumen"],
  sesame: ["sesame"],
  celery: ["celery"],
  mustard: ["mustard"],
  sulphites: ["sulphites", "sulfites", "sulphur dioxide", "sulfur dioxide"],
  lupin: ["lupin"],
  fish: ["fish"],
  crustaceans: ["crustacean", "crustaceans"],
  molluscs: ["mollusc", "molluscs"],
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
  fish: "Fish",
  crustaceans: "Crustaceans",
  molluscs: "Molluscs",
};

function normalise(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function termRegex(term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

function hasTerm(text: string, terms: string[]) {
  return terms.some((term) => termRegex(term).test(text));
}

function addFact(
  facts: Map<string, AllergenFact>,
  key: string,
  presence: AllergenPresence,
  evidenceText: string,
  confidence: number,
  sourceUrl?: string | null
) {
  facts.set(`${key}:${presence}`, {
    allergen_key: key,
    allergen_label: LABELS[key] || key,
    presence,
    evidence_text: evidenceText,
    confidence,
    source_url: sourceUrl || null,
  });
}

/**
 * Strict allergen splitter.
 *
 * "May contain traces of peanuts, nuts and milk"
 * -> may_contain only, not contains.
 *
 * Direct ingredient text:
 * "soya protein isolate"
 * -> contains soya.
 */
export function parseAllergenFacts(input: {
  ingredientsText?: string | null;
  allergensText?: string | null;
  sourceUrl?: string | null;
}): AllergenFact[] {
  const ingredients = normalise(input.ingredientsText || "");
  const allergens = normalise(input.allergensText || "");
  const facts = new Map<string, AllergenFact>();

  for (const [key, terms] of Object.entries(TERMS)) {
    if (hasTerm(ingredients, terms)) {
      addFact(facts, key, "contains", input.ingredientsText || "", 88, input.sourceUrl);
    }
  }

  const mayContain = /may contain|may also contain|may contain traces|traces of|made in a factory|not suitable for/i.test(allergens);

  if (mayContain) {
    for (const [key, terms] of Object.entries(TERMS)) {
      if (hasTerm(allergens, terms)) {
        addFact(facts, key, "may_contain", input.allergensText || "", 92, input.sourceUrl);
      }
    }
  } else if (/contains|allergens?:|allergy advice/i.test(allergens)) {
    for (const [key, terms] of Object.entries(TERMS)) {
      if (hasTerm(allergens, terms)) {
        addFact(facts, key, "contains", input.allergensText || "", 94, input.sourceUrl);
      }
    }
  }

  return [...facts.values()];
}

export function splitAllergens(facts: AllergenFact[]) {
  return {
    contains: facts.filter((fact) => fact.presence === "contains"),
    mayContain: facts.filter((fact) => fact.presence === "may_contain"),
    unknown: facts.filter((fact) => fact.presence === "unknown"),
  };
}
