// Fills in nutrients that a source left blank, so day totals and patterns aren't under-counted.
// Every fill is conservative, only applies where the source gave nothing, and is described in `filled`.

import type { NutritionTotals } from "@/lib/nutrition/scoring";

export type CompletenessContext = {
  label: string;
  brand?: string | null;
  ingredients?: string | null;
  /** Grams or ml the totals describe (if known). */
  amount?: number | null;
  unit?: "g" | "ml" | null;
  /** Reference food group (CoFID) when known. */
  group?: string | null;
  source?: string | null;
};

export type CompletenessResult = { totals: NutritionTotals; filled: string[] };

const MICRO_KEYS: Array<keyof NutritionTotals> = ["potassium_mg", "calcium_mg", "iron_mg", "magnesium_mg", "zinc_mg", "folate_ug", "niacin_mg", "thiamin_mg", "vitamin_c_mg", "vitamin_d_ug", "vitamin_b12_ug"];

/* ------------------------------------------------------------------ */
/* Caffeine                                                            */
/* Typical UK amounts: FSA (mug instant coffee 100mg, filter 140mg,    */
/* mug of tea 75mg, can of cola 40mg, 250ml energy drink 80mg) and     */
/* EFSA (espresso 80mg, 50g plain chocolate 25mg, milk chocolate 10mg).*/
/* ------------------------------------------------------------------ */

function countShots(text: string) {
  const explicit = text.match(/(\d+|one|two|three|four|single|double|triple)\s*(?:x\s*)?(?:shots?|espresso)/);
  const words: Record<string, number> = { one: 1, single: 1, two: 2, double: 2, three: 3, triple: 3, four: 4 };
  if (explicit) return Number(explicit[1]) || words[explicit[1]] || 1;
  if (/\bdouble\b|\bdoppio\b/.test(text)) return 2;
  if (/\btriple\b/.test(text)) return 3;
  if (/\b(large|venti|grande|medium|regular|tall)\b/.test(text)) return 2;
  return 1;
}

/** Estimated caffeine in mg for this food at this amount, or null when it isn't a caffeine source. */
const CHOCOLATE_BRANDS = /dairy milk|galaxy|bournville|lindt|toblerone|kit ?kat|twix|mars bar|snickers|buttons|maltesers|aero|wispa|twirl|crunchie|freddo|green & blacks|green and blacks|milky way|ferrero|celebrations|heroes|quality street|roses/;

function withChocolateWord(text: string) {
  return CHOCOLATE_BRANDS.test(text) && !/\bchocolate\b/.test(text) ? `${text} milk chocolate` : text;
}

export function estimateCaffeine(ctx: CompletenessContext): { mg: number; basis: string } | null {
  const text = withChocolateWord(`${ctx.label} ${ctx.brand || ""} ${ctx.ingredients || ""}`.toLowerCase());
  if (/\b(caffeine[- ]free|decaf\w*|no caffeine|0mg caffeine)\b/.test(text)) {
    return /coffee|tea|latte|cappuccino|espresso/.test(text) ? { mg: 3, basis: "decaf (a few mg)" } : null;
  }
  if (/herbal|rooibos|redbush|camomile|chamomile|peppermint tea|fruit tea|infusion, (fruit|herbal)/.test(text)) return null;
  const ml = ctx.unit === "ml" && ctx.amount ? ctx.amount : null;
  const grams = ctx.unit !== "ml" && ctx.amount ? ctx.amount : null;

  // Energy drink powders / supplements (GFuel, Sneak etc.) — typically ~150mg per serving.
  if (/g\s?fuel|\bsneak\b|pre[- ]?workout|energy (formula|powder)|caffeine (anhydrous|powder)|gamer supps|x50|kong strong.*powder/.test(text)) {
    return { mg: 150, basis: "typical energy powder serving (~150mg) — check the tub" };
  }
  if (/energy drink|red bull|monster|relentless|rockstar|\bprime energy\b|boost energy|kong strong|reign|celsius|\bv energy\b|lucozade (energy|alert)|euphoria/.test(text)) {
    const volume = ml ?? (/500\s?ml|monster|relentless|rockstar|reign/.test(text) ? 500 : /473|16\s?oz/.test(text) ? 473 : 250);
    return { mg: Math.round(volume * 0.32), basis: "energy drinks ~32mg per 100ml (FSA: 80mg per 250ml can)" };
  }
  const explicitShots = /(\d+|one|two|three|four|single|double|triple)\s*(?:x\s*)?(?:shots?|espresso)|\bdouble\b|\bdoppio\b|\btriple\b/.test(text);
  if (/latte|cappuccino|flat white|americano|macchiato|mocha|cortado/.test(text)) {
    const shots = countShots(text);
    if (ml && !explicitShots) return { mg: Math.round((160 / 350) * ml), basis: "milky coffee ~160mg per 350ml (2 espresso shots at ~80mg, EFSA); coffee shop drinks vary a lot" };
    return { mg: shots * 80, basis: `${shots} espresso shot${shots === 1 ? "" : "s"} at ~80mg each (EFSA); coffee shop drinks vary a lot` };
  }
  if (/espresso/.test(text)) {
    if (ml && !explicitShots) return { mg: Math.round((ml / 30) * 80), basis: "espresso ~80mg per shot (EFSA), about 30ml a shot" };
    const shots = countShots(text);
    return { mg: shots * 80, basis: `${shots} espresso shot${shots === 1 ? "" : "s"} at ~80mg each (EFSA)` };
  }
  if (/\bcoffee\b/.test(text) && !/coffee (cake|walnut|flavour|creamer)|tiramisu/.test(text)) {
    const instant = /instant|granules/.test(text);
    if (/\bdry\b|granules|powder/.test(text) && grams) return { mg: Math.round(grams * 35), basis: "instant coffee granules ~35mg per gram" };
    const perMug = instant ? 100 : /filter|brewed|cafeti[eè]re|ground|pour over|drip|cold brew/.test(text) ? 140 : 100;
    const mg = ml ? Math.round((perMug / 260) * ml) : perMug;
    return { mg, basis: `${instant ? "instant" : perMug === 140 ? "filter" : "typical"} coffee ~${perMug}mg per mug (FSA)` };
  }
  if (/\b(tea|chai)\b/.test(text) && !/tea ?cake|teacake|iced tea mix|tea loaf/.test(text)) {
    const green = /green|matcha|white tea|oolong/.test(text);
    const perMug = /matcha/.test(text) ? 70 : green ? 40 : 75;
    const mg = ml ? Math.round((perMug / 260) * ml) : perMug;
    return { mg, basis: green ? "green tea ~40mg per mug" : "tea ~75mg per mug (FSA)" };
  }
  if (/\b(cola|coke|coca[- ]?cola|pepsi|dr ?pepper|irn[- ]?bru|mountain dew)\b/.test(text) && !/caffeine free/.test(text)) {
    const volume = ml ?? (/500\s?ml|bottle/.test(text) ? 500 : /1\.5\s?l|2\s?l/.test(text) ? 330 : 330);
    const per100 = /irn[- ]?bru/.test(text) ? 3.3 : /dr ?pepper/.test(text) ? 10 : /diet coke|coke zero|zero sugar|pepsi max/.test(text) ? 12.5 : 12;
    return { mg: Math.round(volume * per100 / 100), basis: "cola ~40mg per can (FSA)" };
  }
  if (/\bchocolate\b|\bcocoa\b/.test(text) && !/white chocolate/.test(text)) {
    if (/hot chocolate|cocoa drink|drinking chocolate/.test(text)) return { mg: 5, basis: "hot chocolate ~5mg per mug" };
    if (!grams) return null;
    const dark = /dark|plain|70%|85%|90%|bitter/.test(text);
    return { mg: Math.round(grams * (dark ? 0.5 : 0.2)), basis: dark ? "dark chocolate ~25mg per 50g (EFSA)" : "milk chocolate ~10mg per 50g (EFSA)" };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Free sugars (UK "free sugars" = added sugars + honey, syrups, juice)*/
/* ------------------------------------------------------------------ */

const ADDED_SUGAR_INGREDIENTS = /\b(sugar|cane sugar|brown sugar|glucose|glucose[- ]fructose|fructose|dextrose|sucrose|invert|syrup|honey|treacle|molasses|maltose|caramel|agave|concentrated? (fruit|apple|grape) juice|fruit juice concentrate)\b/;

/** Share of total sugar that is "free sugar" (0–1), from the food's name, group and ingredients. */
export function freeSugarShare(ctx: CompletenessContext): number {
  const text = withChocolateWord(`${ctx.label} ${ctx.brand || ""}`.toLowerCase());
  const group = (ctx.group || "").toLowerCase();
  const ingredients = (ctx.ingredients || "").toLowerCase();
  if (/juice|smoothie/.test(text)) return 1; // UK guidance counts juice sugars as free sugars
  if (/\bno added sugar|unsweetened|sugar[- ]free\b/.test(text) && !/juice/.test(text)) return /yog|milk|kefir/.test(text) ? 0 : 0.1;
  if (/honey|syrup|jam|marmalade|sugar|sweets?|candy|toffee|fudge|jelly|marshmallow|chocolate|cola|lemonade|fizzy|soft drink|squash|cordial|energy drink|ice cream|sorbet|custard|biscuit|cookie|cake|bun|pastry|doughnut|donut|muffin|brownie|flapjack|cereal bar|frosted|ketchup|brown sauce|bbq sauce|sweet chilli|pudding|dessert|trifle|cheesecake|crumble|pie, (apple|fruit)/.test(text)) {
    if (/ice cream|custard|milk chocolate|cheesecake|pudding|dessert/.test(text)) return 0.75; // some lactose
    return 0.95;
  }
  if (/^fruit$|^vegetables$|^nuts and seeds$|^meat|^fish|^eggs$|^herbs and spices$/.test(group)) return /canned in syrup|dried|candied|glac[eé]/.test(text) ? (/syrup|candied|glac/.test(text) ? 0.5 : 0) : 0;
  if (/\b(milk|plain yog|natural yog|greek yog|kefir|cheese|cream)\b/.test(text) && !/flavour|fruit|strawberry|vanilla|chocolate|toffee|caramel/.test(text)) return 0;
  if (/\b(yog|fromage|skyr|milkshake|flavoured milk)\b/.test(text)) return 0.55; // flavoured dairy: lactose + added
  if (/breakfast cereal|cereal|granola|muesli/.test(text)) return /muesli|porridge|oats|wheat biscuits|shredded/.test(text) ? 0.5 : 0.85;
  if (/bread|roll|bagel|wrap|tortilla|naan|crumpet/.test(text)) return 0.7;
  if (/apple|banana|orange|grape|berry|berries|pear|mango|melon|kiwi|plum|peach|fruit|salad|vegetable|veg|potato|tomato|carrot|onion|pepper|lettuce|broccoli|pea|bean|lentil/.test(text) && !ADDED_SUGAR_INGREDIENTS.test(ingredients)) return 0;
  if (ingredients) return ADDED_SUGAR_INGREDIENTS.test(ingredients) ? (/milk|yog|cream/.test(ingredients) ? 0.6 : 0.85) : 0;
  return 0.5;
}

/* ------------------------------------------------------------------ */
/* Main entry                                                          */
/* ------------------------------------------------------------------ */

export type MicroDonor = (label: string) => { per100: Partial<NutritionTotals>; name: string } | null;

export function completeNutrition(input: Partial<NutritionTotals>, ctx: CompletenessContext, microDonor?: MicroDonor): CompletenessResult {
  const totals = { ...input } as NutritionTotals;
  const filled: string[] = [];
  const num = (key: keyof NutritionTotals) => Number(totals[key] || 0);

  // Caffeine
  if (num("caffeine_mg") <= 0) {
    const caffeine = estimateCaffeine(ctx);
    if (caffeine && caffeine.mg > 0) {
      totals.caffeine_mg = caffeine.mg;
      filled.push(`Caffeine estimated at ${caffeine.mg}mg: ${caffeine.basis}.`);
    }
  }

  // Free sugars
  const sugar = num("sugar_g");
  if (sugar > 0.5 && num("added_sugar_g") <= 0) {
    const share = freeSugarShare(ctx);
    if (share > 0) {
      const added = Math.round(sugar * share * 10) / 10;
      totals.added_sugar_g = added;
      totals.natural_sugar_g = Math.round(Math.max(0, sugar - added) * 10) / 10;
      filled.push(`Free sugars estimated at ${added}g of the ${Math.round(sugar * 10) / 10}g total sugar.`);
    } else if (num("natural_sugar_g") <= 0) {
      totals.natural_sugar_g = sugar;
    }
  }

  // Salt ↔ sodium
  if (num("salt_g") > 0 && num("sodium_mg") <= 0) totals.sodium_mg = Math.round(num("salt_g") * 400);
  if (num("sodium_mg") > 0 && num("salt_g") <= 0) totals.salt_g = Math.round((num("sodium_mg") * 2.5) / 100) / 10;

  // Vitamins and minerals from the closest UK reference food, when the source gave none.
  const microsMissing = MICRO_KEYS.every((key) => num(key) <= 0);
  const grams = ctx.amount && ctx.amount > 0 ? ctx.amount : null;
  if (microsMissing && microDonor && grams && num("calories") > 0) {
    const donor = microDonor(ctx.label);
    if (donor) {
      const donorKcal = Number(donor.per100.calories || 0);
      // Only borrow when energy is roughly comparable, so a "light" product doesn't inherit a full-fat food's numbers.
      const kcalPer100 = (num("calories") / grams) * 100;
      if (donorKcal > 0 && Math.abs(donorKcal - kcalPer100) / Math.max(donorKcal, kcalPer100) <= 0.45) {
        for (const key of MICRO_KEYS) {
          const per100 = Number(donor.per100[key] || 0);
          if (per100 > 0) totals[key] = Math.round(per100 * grams) / 100;
        }
        filled.push(`Vitamins and minerals estimated from the UK reference food "${donor.name}".`);
      }
    }
  }

  return { totals, filled };
}
