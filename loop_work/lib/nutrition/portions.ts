// Everyday UK portion sizes, so people can pick "1 medium banana" instead of guessing grams.
// Amounts are typical UK adult portions (edible weight); people can always type their own grams/ml.

export type PortionUnit = "g" | "ml";
export type PortionOption = { label: string; amount: number; unit: PortionUnit; kind?: "everyday" | "serving" | "pack" | "per100" };

type PortionRule = { test: RegExp; not?: RegExp; portions: Array<[string, number]> };

const SOLID_RULES: PortionRule[] = [
  { test: /^bananas?\b/, not: /bread|split|cake|chips|dried|weighed/, portions: [["1 small banana", 80], ["1 medium banana", 100], ["1 large banana", 130]] },
  { test: /^apples?, eating/, not: /dried|juice|weighed/, portions: [["1 small apple", 90], ["1 medium apple", 112], ["1 large apple", 150]] },
  { test: /^oranges?\b/, not: /juice|weighed/, portions: [["1 medium orange", 160]] },
  { test: /^(satsumas|clementines|mandarin|tangerines?)/, portions: [["1 satsuma / clementine", 60], ["2 satsumas", 120]] },
  { test: /^pears?\b/, not: /canned|juice|dried|weighed/, portions: [["1 medium pear", 160]] },
  { test: /^grapes?\b/, portions: [["Small handful", 80], ["Small bowl", 150]] },
  { test: /^strawberr/, portions: [["Handful (7 strawberries)", 80], ["Small bowl", 150]] },
  { test: /^(blueberr|raspberr|blackberr)/, portions: [["Handful", 80], ["2 tbsp", 30]] },
  { test: /^kiwi/, portions: [["1 kiwi", 60]] },
  { test: /^avocado/, not: /weighed/, portions: [["Half an avocado", 75], ["1 whole avocado", 145]] },
  { test: /^(raisins|sultanas|currants)/, portions: [["1 tbsp", 30], ["Mini box", 14]] },
  { test: /^tomato(es)?, (raw|cherry)/, portions: [["1 medium tomato", 85], ["5 cherry tomatoes", 75]] },
  { test: /^eggs?, chicken/, portions: [["1 medium egg", 50], ["1 large egg", 58], ["2 medium eggs", 100], ["3 medium eggs", 150]] },
  { test: /^bread,|^bread\b/, not: /sauce|pudding|crumbs/, portions: [["1 medium slice", 36], ["1 thick slice", 44], ["2 medium slices", 72]] },
  { test: /^(rolls?|bread rolls?|bap)/, portions: [["1 roll", 60]] },
  { test: /^(bagels?)/, portions: [["1 bagel", 85]] },
  { test: /^(croissants?)/, portions: [["1 croissant", 60]] },
  { test: /^crumpets?/, portions: [["1 crumpet", 55]] },
  { test: /^(naan|nan) bread/, portions: [["Half a naan", 80], ["1 naan", 160]] },
  { test: /^(tortilla|wraps?)/, portions: [["1 wrap", 62]] },
  { test: /^rice\b.*(boiled|cooked)|^rice, .*boiled/, portions: [["Small portion", 140], ["Medium portion", 180], ["Large portion", 250]] },
  { test: /^rice\b.*raw/, portions: [["1 portion (dry)", 75]] },
  { test: /^(pasta|spaghetti|macaroni|noodles)\b.*(boiled|cooked)/, portions: [["Small portion", 150], ["Medium portion", 230], ["Large portion", 300]] },
  { test: /^(pasta|spaghetti|macaroni|noodles)\b.*(dried|raw)/, portions: [["1 portion (dry)", 75]] },
  { test: /^potatoes?\b.*(boiled|new)/, portions: [["2 egg-sized potatoes", 175], ["Small portion", 120]] },
  { test: /^potatoes?\b.*baked|jacket/, portions: [["1 medium jacket potato", 180], ["1 large jacket potato", 250]] },
  { test: /^potatoes?\b.*mashed/, portions: [["Small scoop", 60], ["Medium portion", 180]] },
  { test: /^potato chips/, portions: [["Small portion", 100], ["Medium portion", 165], ["Chip shop portion", 260]] },
  { test: /^potato crisps|^crisps/, portions: [["1 small bag", 25], ["1 sharing bag (quarter)", 37.5]] },
  { test: /^baked beans/, portions: [["Half a can", 200], ["Small portion", 135], ["Whole can", 415]] },
  { test: /^(peas|garden peas|petits pois)/, portions: [["3 heaped tbsp", 80]] },
  { test: /^(broccoli|cauliflower|carrots?|green beans|sweetcorn|cabbage|spinach|kale|brussels)/, portions: [["1 portion (80g)", 80], ["Side serving", 60]] },
  { test: /^(lettuce|salad, mixed|mixed leaves)/, portions: [["1 bowl", 80], ["A few leaves", 30]] },
  { test: /^(onions?)/, portions: [["Half an onion", 75], ["1 medium onion", 150]] },
  { test: /^(peppers?|capsicum)/, portions: [["Half a pepper", 80], ["1 pepper", 160]] },
  { test: /^(mushrooms?)/, portions: [["Handful (4 mushrooms)", 80]] },
  { test: /^(cucumber)/, portions: [["5cm piece", 60]] },
  { test: /^chicken\b.*breast/, portions: [["1 chicken breast", 130], ["Half a breast", 65]] },
  { test: /^chicken\b.*(thigh)/, portions: [["1 thigh (meat only)", 90]] },
  { test: /^chicken\b.*(leg|drumstick)/, portions: [["1 drumstick (meat only)", 50]] },
  { test: /^(beef|pork|lamb)\b.*mince/, portions: [["Portion in a meal", 100], ["Quarter of a 500g pack", 125]] },
  { test: /^(beef|pork|lamb)\b.*(steak|chop)/, portions: [["1 chop / small steak", 150], ["1 large steak", 225]] },
  { test: /^sausages?\b/, portions: [["1 sausage", 40], ["2 sausages", 80], ["3 sausages", 120]] },
  { test: /^bacon\b/, not: /fat only/, portions: [["1 rasher", 25], ["2 rashers", 50], ["3 rashers", 75]] },
  { test: /^ham\b/, portions: [["1 slice", 23], ["2 slices", 46]] },
  { test: /^(salmon|cod|haddock|mackerel|trout|pollock|basa)\b/, portions: [["1 fillet", 120], ["Small fillet", 100]] },
  { test: /^tuna\b.*canned/, portions: [["1 small can (drained)", 112], ["Half a can", 56], ["Sandwich filling", 45]] },
  { test: /^prawns?/, portions: [["Handful", 60], ["Portion in a meal", 100]] },
  { test: /^fish fingers?/, portions: [["1 fish finger", 28], ["3 fish fingers", 84], ["4 fish fingers", 112]] },
  { test: /^cheese,|^cheese\b/, not: /sauce|cake|straw/, portions: [["Matchbox-sized piece", 30], ["Grated on top (2 tbsp)", 20], ["1 slice", 20]] },
  { test: /^(butter|margarine|spreadable|fat spread|spread)/, portions: [["Thin spread on 1 slice", 7], ["Thick spread on 1 slice", 12], ["1 tsp", 5]] },
  { test: /^(peanut butter|nut butter|chocolate spread|jam|marmalade|honey|lemon curd|yeast extract|marmite)/, portions: [["1 tsp", 7], ["Spread on 1 slice", 15], ["1 tbsp", 20]] },
  { test: /^(sugar)/, portions: [["1 tsp", 4], ["1 tbsp", 12]] },
  { test: /oil\b/, not: /tuna|sardine|fried|canned/, portions: [["1 tsp", 5], ["1 tbsp", 14]] },
  { test: /^(ketchup|tomato ketchup|brown sauce|mayonnaise|salad cream|mustard|chutney|pickle)/, portions: [["1 tsp", 6], ["1 tbsp", 15]] },
  { test: /^(yogurt|yoghurt|fromage frais|skyr)/, portions: [["Kids pot", 60], ["Small pot", 125], ["Large dollop", 150]] },
  { test: /^(porridge oats|oats)/, not: /made|cooked/, portions: [["1 sachet / small bowl", 40], ["Large bowl", 60]] },
  { test: /^porridge\b.*made|cooked, made up/, portions: [["Small bowl", 160], ["Medium bowl", 250]] },
  { test: /^breakfast cereal|corn flakes|wholegrain wheat|bran flakes|muesli|granola/, not: /made up/, portions: [["Small bowl", 30], ["Medium bowl", 40], ["Large bowl", 60], ["2 wheat biscuits", 37.5]] },
  { test: /^(biscuits?|digestive|cookies?)/, portions: [["1 biscuit", 15], ["2 biscuits", 30]] },
  { test: /^(chocolate)/, not: /spread|cake|biscuit|drink/, portions: [["2 squares", 10], ["Standard bar", 45], ["Row of 4 squares", 20]] },
  { test: /^(cake|sponge|muffin|scone|flapjack|brownie)/, portions: [["1 slice / piece", 60], ["Small piece", 35]] },
  { test: /^(nuts|almonds|cashew|peanuts|walnuts|hazelnuts|pistachio|mixed nuts)/, portions: [["Small handful", 30], ["Snack bag", 50]] },
  { test: /^(hummus|houmous|dips?)/, portions: [["2 tbsp", 30], ["Quarter of a tub", 50]] },
  { test: /^(pizza)/, portions: [["1 slice", 80], ["Half a 12\" pizza", 300]] },
  { test: /^(soup)/, portions: [["1 bowl", 300], ["Half a carton", 300]] },
  { test: /^(sandwich)/, portions: [["1 sandwich", 180]] },
];

const LIQUID_RULES: PortionRule[] = [
  { test: /^milk\b/, portions: [["Splash in tea / coffee", 30], ["On cereal", 125], ["1 glass", 200], ["1 mug", 300]] },
  { test: /cappuccino|latte|flat white|mocha/, portions: [["Small (8oz)", 240], ["Regular (12oz)", 350], ["Large (16oz)", 470]] },
  { test: /^(tea|coffee)\b/, portions: [["1 mug", 260], ["1 cup", 190]] },
  { test: /juice|smoothie/, portions: [["Small glass", 150], ["1 glass", 200], ["Carton (330ml)", 330]] },
  { test: /^(cola|lemonade|carbonated|fizzy|soft drink)/, portions: [["1 can", 330], ["Small bottle", 500], ["1 glass", 250]] },
  { test: /squash|cordial/, portions: [["1 glass (diluted)", 250]] },
  { test: /^(lager|beer|bitter|ale|stout|cider)/, portions: [["Half pint", 284], ["1 pint", 568], ["1 bottle / can", 440]] },
  { test: /^wine/, portions: [["Small glass", 125], ["Medium glass", 175], ["Large glass", 250]] },
  { test: /^(spirits|gin|vodka|whisky|whiskey|rum|brandy)/, portions: [["Single (25ml)", 25], ["Double (50ml)", 50]] },
  { test: /^(cream)/, portions: [["1 tbsp", 15], ["Small pour", 30]] },
  { test: /^(soup)/, portions: [["1 bowl", 300], ["Half a carton", 300]] },
  { test: /^(water)/, portions: [["1 glass", 250], ["Small bottle", 500], ["Large bottle", 1000]] },
];

const LIQUID_NAME = /^(milk|tea|coffee|water|lager|beer|bitter|ale|stout|cider|wine|spirits|gin|vodka|whisky|whiskey|rum|brandy|cola|lemonade|squash|cordial|smoothie)\b|juice\b|\bdrink\b|soft drink|carbonated|^cream, (fresh|dairy)|^soup/;
const LIQUID_GROUPS = /^(Drinks|Alcoholic drinks)$/;

export function referenceUnit(name: string, group: string | null | undefined, specificGravity: number | null | undefined): PortionUnit {
  const lower = name.toLowerCase();
  if (/powder|granules|\bdried\b|concentrate, undiluted|\bbeans\b|\bleaves\b/.test(lower) && !/made up|diluted|infusion/.test(lower)) return "g";
  if (LIQUID_GROUPS.test(group || "") || LIQUID_NAME.test(lower)) return "ml";
  void specificGravity;
  return "g";
}

/** Everyday portions for a UK reference food, plus 100g/ml. */
export function portionsForReference(name: string, unit: PortionUnit): PortionOption[] {
  const lower = name.toLowerCase();
  const rules = unit === "ml" ? LIQUID_RULES : SOLID_RULES;
  const rule = rules.find((item) => item.test.test(lower) && !(item.not && item.not.test(lower)));
  const options: PortionOption[] = (rule?.portions || []).map(([label, amount]) => ({ label, amount, unit, kind: "everyday" as const }));
  options.push({ label: `100${unit}`, amount: 100, unit, kind: "per100" });
  return options;
}

/** Portions for a packaged product, from the label's own serving and pack size. */
export function portionsForProduct(input: { baseAmount: number | null; servingKnown: boolean; unit: PortionUnit; packageQuantity?: string | null; servingLabel?: string | null }): PortionOption[] {
  const options: PortionOption[] = [];
  const { baseAmount, servingKnown, unit } = input;
  if (servingKnown && baseAmount && baseAmount > 0) {
    options.push({ label: `1 serving (${round(baseAmount)}${unit})`, amount: baseAmount, unit, kind: "serving" });
    options.push({ label: `Half a serving`, amount: round(baseAmount / 2), unit, kind: "serving" });
    options.push({ label: `2 servings`, amount: round(baseAmount * 2), unit, kind: "serving" });
  }
  const pack = parsePackAmount(input.packageQuantity);
  if (pack && pack.amount > 0 && pack.amount <= 2000 && (!baseAmount || Math.abs(pack.amount - baseAmount) > 1)) {
    options.push({ label: `Whole pack (${round(pack.amount)}${pack.unit})`, amount: pack.amount, unit: pack.unit, kind: "pack" });
  }
  if (!options.some((option) => option.amount === 100)) options.push({ label: `100${unit}`, amount: 100, unit, kind: "per100" });
  return options;
}

export function parsePackAmount(value?: string | null): { amount: number; unit: PortionUnit } | null {
  const text = String(value || "").toLowerCase().replace(",", ".");
  const multi = text.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
  const single = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|cl|l)\b/);
  const match = multi ? [multi[0], multi[2], multi[3]] : single;
  if (!match) return null;
  let amount = Number(match[1]);
  const unitRaw = match[2];
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unitRaw === "kg") amount *= 1000;
  if (unitRaw === "l") amount *= 1000;
  if (unitRaw === "cl") amount *= 10;
  return { amount, unit: /ml|cl|l/.test(unitRaw) ? "ml" : "g" };
}

/** Reads "30g", "250 ml", "1 bar (45 g)" etc. from a serving label. */
export function parseServingAmount(value?: string | null): { amount: number; unit: PortionUnit } | null {
  const text = String(value || "").toLowerCase();
  if (/per 100\s?(g|ml)/.test(text)) return null;
  return parsePackAmount(text);
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
