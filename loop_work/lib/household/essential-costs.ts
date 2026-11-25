// What it costs to run the household: the essential bills a normal household has to pay,
// grouped. Things that can simply be cancelled (streaming, lotteries, treats) and money being
// saved are left out. This total is the base for the household emergency fund.

export type PlanLine = { label: string; value: number; categoryLabel?: string | null; helper?: string | null };

export type HouseholdGroupKey = "home" | "phones" | "cars" | "children" | "pets" | "food" | "protection" | "other";

export const HOUSEHOLD_GROUPS: { key: HouseholdGroupKey; label: string; hint: string }[] = [
  { key: "home", label: "Home", hint: "Mortgage or rent, council tax, energy, water, home insurance" },
  { key: "cars", label: "Cars", hint: "Payments plus fuel, insurance, servicing and tax" },
  { key: "children", label: "Children", hint: "Childcare and school costs" },
  { key: "food", label: "Food & household shopping", hint: "" },
  { key: "phones", label: "Phones & broadband", hint: "" },
  { key: "protection", label: "Life & health cover", hint: "" },
  { key: "pets", label: "Pets", hint: "Food, insurance, vets" },
  { key: "other", label: "Other essential bills", hint: "" },
];

// Things you'd cancel first, and money that's being saved rather than spent.
const LEAVE_OUT = /netflix|spotify|disney|apple ?\+|apple tv|prime video|amazon prime|now tv|youtube|paramount|audible|xbox|playstation|nintendo|lottery|omaze|ecologi|charity|donation|sponsor|premium bonds|coffee|beanz|gym|magazine|patreon|twitch|savings? transfer|round ?up|plum\b|moneybox|chip\b|investment|isa\b/i;
const LEAVE_OUT_CATEGORY = /entertainment|streaming|subscriptions?|fun|eating out|savings|investments?|pension|holidays?|gifts?|personal care|shopping$/i;

const RULES: [HouseholdGroupKey, RegExp][] = [
  ["pets", /\bpet|vet\b|vets\b|tails|petfood|animal health|petplan|kennel|groom|dog|cat food|bella ?& ?duke|butternut/i],
  ["children", /childcare|nursery|childminder|school|after ?school|breakfast club|holiday club|camp\b|nanny|tuition|uniform|club\b/i],
  ["phones", /\bee\b|vodafone|\bo2\b|three\b|giffgaff|tesco mobile|sky mobile|voxi|smarty|lebara|iphone|samsung|pixel|phone|mobile|broadband|fibre|\bbt\b|virgin media|plusnet|talktalk|hyperoptic|community fibre|vodafone/i],
  ["protection", /life (cover|insurance)|vitality|income protection|critical illness|aviva|legal ?& ?general|royal london|zurich|liverpool victoria|\blv\b|health insurance|bupa|axa health|dental plan|denplan/i],
  ["food", /food|grocer|groceries|supermarket|tesco|asda|sainsbury|aldi|lidl|morrisons|ocado|waitrose|co-?op|iceland|household shopping|milk/i],
  ["cars", /\bcar\b|cars\b|motoring|vehicle|fuel|petrol|diesel|parking|breakdown|\baa\b|\brac\b|motoreasy|warranty|\bmot\b|lease|pcp/i],
  ["home", /mortgage|rent\b|council tax|edf|octopus|british gas|\bovo\b|e\.?on|scottish power|sse\b|eon next|energy|electric|\bgas\b|water|united utilities|severn trent|thames water|anglian|yorkshire water|home insurance|buildings|contents|tv licen[cs]e|service charge|ground rent|boiler|home ?care/i],
];

const CATEGORY_RULES: [HouseholdGroupKey, RegExp][] = [
  ["cars", /\bcar\b|cars|motoring|vehicle|transport/i],
  ["children", /child|kids|school|nursery/i],
  ["home", /house|home|bills|utilities|mortgage|rent/i],
  ["food", /food|grocer/i],
  ["pets", /pet/i],
];

/** Drop the "Person · " prefix the plan puts on line labels. */
export function lineName(label: string) {
  return label.replace(/^[^·]{1,40}·\s*/, "").replace(/\s*\(×\d+\)$/, "").trim();
}

export function householdGroupFor(line: PlanLine, petNames: string[] = []): HouseholdGroupKey | null {
  const name = lineName(line.label);
  const category = String(line.categoryLabel || line.helper || "");
  if (LEAVE_OUT.test(name)) return null;
  // Anything named after a pet (or in a pet's own category) belongs to Pets — e.g. "Hallie insurance".
  const pets = petNames.map((p) => p.trim().toLowerCase()).filter((p) => p.length >= 2);
  if (pets.some((pet) => name.toLowerCase().includes(pet) || category.toLowerCase() === pet)) return "pets";
  for (const [key, rule] of RULES) if (rule.test(name)) return key;
  if (/^activit/i.test(category)) return null; // clubs and classes are optional
  if (/childcare|child cost|nursery|childminder|after.?school|breakfast club|holiday (club|camp)|nanny/i.test(category)) return "children";
  if (LEAVE_OUT_CATEGORY.test(category)) return null;
  for (const [key, rule] of CATEGORY_RULES) if (rule.test(category)) return key;
  return null;
}

export type HouseholdLine = { name: string; value: number; note?: string };
export type HouseholdGroup = { key: HouseholdGroupKey; label: string; hint: string; total: number; lines: HouseholdLine[] };

/**
 * Group the month's outgoings into household costs.
 * `cars` replaces each car's payment line with its all-in monthly cost; `skipLabels` are those payment lines.
 */
export function householdCosts({
  lines,
  mortgageMonthly,
  cars = [],
  skipLabels = [],
  petNames = [],
}: {
  lines: PlanLine[];
  mortgageMonthly?: number | null;
  cars?: { name: string; monthly: number; note?: string }[];
  skipLabels?: string[];
  petNames?: string[];
}): { groups: HouseholdGroup[]; total: number; leftOut: HouseholdLine[] } {
  const skip = new Set(skipLabels.map((l) => l.toLowerCase()));
  const byGroup = new Map<HouseholdGroupKey, HouseholdLine[]>();
  const add = (key: HouseholdGroupKey, line: HouseholdLine) => byGroup.set(key, [...(byGroup.get(key) || []), line]);
  const leftOut: HouseholdLine[] = [];

  if (mortgageMonthly && mortgageMonthly > 0) add("home", { name: "Mortgage", value: Math.round(mortgageMonthly * 100) / 100 });
  for (const car of cars) add("cars", { name: car.name, value: Math.round(car.monthly * 100) / 100, note: car.note });

  for (const line of lines) {
    if (!(line.value > 0)) continue;
    const name = lineName(line.label);
    if (/mortgage/i.test(name) && mortgageMonthly) continue; // already counted from the mortgage itself
    if (skip.has(name.toLowerCase())) continue;
    const key = householdGroupFor(line, petNames);
    if (key) add(key, { name, value: Math.round(line.value * 100) / 100 });
    else leftOut.push({ name, value: Math.round(line.value * 100) / 100 });
  }

  const groups = HOUSEHOLD_GROUPS.map((group) => {
    const groupLines = (byGroup.get(group.key) || []).sort((a, b) => b.value - a.value);
    return { ...group, lines: groupLines, total: Math.round(groupLines.reduce((s, l) => s + l.value, 0) * 100) / 100 };
  }).filter((group) => group.lines.length);
  return { groups, total: Math.round(groups.reduce((s, g) => s + g.total, 0) * 100) / 100, leftOut: leftOut.sort((a, b) => b.value - a.value) };
}
