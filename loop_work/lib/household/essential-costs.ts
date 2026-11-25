// What it costs to run the household: the essential bills a normal household has to pay,
// grouped. Things that can simply be cancelled (streaming, lotteries, treats) and money being
// saved are left out. This total is the base for the household emergency fund.

export type PlanLine = { label: string; value: number; categoryLabel?: string | null; helper?: string | null };

export type HouseholdGroupKey = "home" | "phones" | "cars" | "children" | "pets" | "food" | "protection" | "other";

export const HOUSEHOLD_GROUPS: { key: HouseholdGroupKey; label: string; hint: string }[] = [
  { key: "home", label: "Home", hint: "Mortgage or rent, council tax, energy, water, broadband, home insurance" },
  { key: "cars", label: "Cars", hint: "Payments, insurance and tax, plus money put by for servicing, tyres and the MOT" },
  { key: "children", label: "Children", hint: "Childcare and school costs" },
  { key: "food", label: "Food & household shopping", hint: "" },
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

/** Where a line can be put by hand: a household group, Personal, or left out. */
export type HouseholdChoice = Exclude<HouseholdGroupKey, "phones"> | "personal" | "none";
export const HOUSEHOLD_CHOICES: { key: HouseholdChoice; label: string; icon: string }[] = [
  { key: "home", label: "Home", icon: "🏠" },
  { key: "cars", label: "Cars", icon: "🚗" },
  { key: "children", label: "Children", icon: "👶" },
  { key: "food", label: "Food & shopping", icon: "🛒" },
  { key: "protection", label: "Life & health cover", icon: "🛡️" },
  { key: "pets", label: "Pets", icon: "🐾" },
  { key: "other", label: "Other essential bill", icon: "📄" },
  { key: "personal", label: "Personal", icon: "👤" },
  { key: "none", label: "Not counted", icon: "—" },
];
export const choiceKey = (label: string) => lineName(label).replace(/\s*\(from [^)]+\)$/, "").trim().toLowerCase().slice(0, 120);

/** Which household group a line lands in — your own choice first, then Loop's guess. */
export function householdChoiceFor(line: PlanLine, petNames: string[] = [], overrides: Record<string, string> = {}): { key: HouseholdChoice; chosen: boolean } {
  const own = overrides[choiceKey(line.label)];
  if (own && HOUSEHOLD_CHOICES.some((c) => c.key === own)) return { key: own as HouseholdChoice, chosen: true };
  const guess = householdGroupFor(line, petNames);
  if (!guess) return { key: "none", chosen: false };
  if (guess === "phones") return { key: isPersonalPhone(lineName(line.label)) ? "personal" : "home", chosen: false };
  return { key: guess, chosen: false };
}

export type CostKind = "fixed" | "budget" | "setaside";
export const COST_KIND_LABEL: Record<CostKind, string> = { fixed: "Fixed", budget: "Budget", setaside: "Set aside" };

export type HouseholdLine = { name: string; value: number; kind: CostKind; note?: string; parts?: HouseholdLine[]; estimate?: boolean };
export type HouseholdGroup = { key: HouseholdGroupKey; label: string; hint: string; total: number; fixed: number; budget: number; setaside: number; lines: HouseholdLine[] };
export type PersonalLine = { name: string; value: number; kind: "fixed" | "planned"; note?: string };
export type MissingBill = { key: string; label: string; why: string };

export type CarForCosts = {
  name: string;
  ownership?: string | null;
  costs: {
    payment: number;
    insurance: number;
    insuranceSource: "you" | "group" | "none";
    tax: number;
    taxNote?: string;
    energy: number;
    energyLabel?: string;
    maintenance: number;
    maintenanceSource: "you" | "guide";
    maintenanceParts?: { service: number; tyres: number; wear: number; mot: number; tyrePrice: number; tyreLifeMiles: number; firstMot?: string | null; carAge?: number | null } | null;
    miles: number;
  };
};

const BROADBAND = /broadband|fibre|\bbt\b|virgin media|plusnet|talktalk|hyperoptic|community fibre|sky (broadband|tv)|now broadband|shell energy broadband|\bwifi\b|internet/i;
const COUNCIL_TAX = /council tax/i;
const r2 = (v: number) => Math.round(v * 100) / 100;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { month: "short" });

/** Phones are personal — one each — while broadband serves the home. */
export function isPersonalPhone(name: string) {
  return !BROADBAND.test(name) && /\bee\b|vodafone|\bo2\b|three\b|giffgaff|tesco mobile|sky mobile|voxi|smarty|lebara|iphone|samsung|pixel|phone|mobile|airtime|handset/i.test(name);
}

/** A car broken into what you must pay (payment, insurance, tax) and what to put by (servicing, tyres, wear, MOT). Fuel is personal. */
export function carLine(car: CarForCosts): { line: HouseholdLine; fuel: number } {
  const c = car.costs;
  const parts: HouseholdLine[] = [];
  const paymentName = car.ownership === "lease" ? "Lease payment" : car.ownership === "pcp" ? "PCP payment" : car.ownership === "owned" ? "" : "Finance payment";
  if (c.payment > 0 && paymentName) parts.push({ name: paymentName, value: r2(c.payment), kind: "fixed" });
  if (c.insurance > 0) parts.push({ name: "Insurance", value: r2(c.insurance), kind: "fixed", estimate: c.insuranceSource !== "you", note: c.insuranceSource !== "you" ? "Loop's estimate — add your premium" : undefined });
  if (c.tax > 0) parts.push({ name: "Road tax", value: r2(c.tax), kind: "fixed" });
  else if (c.taxNote) parts.push({ name: "Road tax", value: 0, kind: "fixed", note: c.taxNote });
  const mp = c.maintenanceParts;
  if (c.maintenanceSource === "you") parts.push({ name: "Servicing & upkeep", value: r2(c.maintenance), kind: "setaside", note: "Your figure" });
  else if (mp) {
    const perMile = c.miles > 0 ? `${c.miles.toLocaleString("en-GB")} miles a year` : "";
    if (mp.service > 0) parts.push({ name: "Servicing", value: r2(mp.service / 12), kind: "setaside", note: `About £${mp.service} a year` });
    else parts.push({ name: "Servicing", value: 0, kind: "setaside", note: "Included in the lease" });
    if (mp.tyres > 0) parts.push({ name: "Tyres", value: r2(mp.tyres / 12), kind: "setaside", note: `4 × about £${mp.tyrePrice}, lasting ~${mp.tyreLifeMiles.toLocaleString("en-GB")} miles${perMile ? ` · ${perMile}` : ""}` });
    if (mp.wear > 0) parts.push({ name: "Brakes, wipers & wear", value: r2(mp.wear / 12), kind: "setaside" });
    if (mp.mot > 0) parts.push({ name: "MOT", value: r2(mp.mot / 12), kind: "setaside", note: `£${mp.mot} once a year${mp.carAge !== null && mp.carAge !== undefined ? ` · car is ${mp.carAge} year${mp.carAge === 1 ? "" : "s"} old` : ""}` });
    else if (mp.firstMot) parts.push({ name: "MOT", value: 0, kind: "setaside", note: `Not needed yet — first one due ${/^\d{4}$/.test(mp.firstMot) ? mp.firstMot : new Date(`${mp.firstMot}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}, when the car turns 3` });
  }
  const value = r2(parts.reduce((sum, p) => sum + p.value, 0));
  return { line: { name: car.name, value, kind: "fixed", parts }, fuel: r2(c.energy) };
}

const EXPECTED: { key: string; label: string; why: string; test: RegExp; unless?: (names: string[]) => boolean }[] = [
  { key: "home_insurance", label: "Home insurance", why: "Buildings cover is usually a mortgage condition; contents covers what's inside", test: /home insurance|buildings|contents|home ?cover|house insurance/i },
  { key: "energy", label: "Gas & electricity", why: "", test: /energy|electric|\bgas\b|edf|octopus|british gas|\bovo\b|e\.?on|scottish power|sse\b|utilita|so energy|outfox/i },
  { key: "water", label: "Water", why: "", test: /water|united utilities|severn trent|anglian|yorkshire water|southern water|wessex|dwr cymru|welsh water|northumbrian|south west water|affinity/i },
  { key: "council_tax", label: "Council Tax", why: "", test: COUNCIL_TAX },
  { key: "broadband", label: "Broadband", why: "If it's bundled with a phone or TV bill, mark it not needed", test: BROADBAND },
  { key: "tv_licence", label: "TV licence", why: "Needed to watch live TV or BBC iPlayer", test: /tv licen[cs]e/i },
];

/**
 * Group the month's outgoings into household costs.
 * Each line is Fixed (a bill you must pay), Budget (food — varies but essential) or Set aside (money
 * to put by for things that come round, like servicing and tyres). Fuel and mobile phones are personal,
 * shown apart and left out of the household total.
 * The emergency fund covers the fixed bills, the food budget and phone contracts — not fuel or set-asides.
 */
export function householdCosts({
  lines,
  mortgageMonthly,
  cars = [],
  skipLabels = [],
  petNames = [],
  childAverages = {},
  councilTax = {},
  dismissedMissing = [],
  groupOverrides = {},
}: {
  lines: PlanLine[];
  mortgageMonthly?: number | null;
  cars?: CarForCosts[];
  skipLabels?: string[];
  petNames?: string[];
  childAverages?: Record<string, { thisMonth: number; average: number; low: number; high: number; activeMonths: number; schedule: string | null }>;
  councilTax?: Record<string, { payments: number }>;
  dismissedMissing?: string[];
  /** Your own groups for lines, by `choiceKey` — set from Spending's "Show groups". */
  groupOverrides?: Record<string, string>;
}) {
  const skip = new Set(skipLabels.map((l) => l.toLowerCase()));
  const byGroup = new Map<HouseholdGroupKey, HouseholdLine[]>();
  const add = (key: HouseholdGroupKey, line: HouseholdLine) => byGroup.set(key, [...(byGroup.get(key) || []), line]);
  const leftOut: { name: string; value: number }[] = [];
  const personal: PersonalLine[] = [];
  const seen: string[] = [];

  if (mortgageMonthly && mortgageMonthly > 0) { add("home", { name: "Mortgage", value: r2(mortgageMonthly), kind: "fixed" }); seen.push("mortgage"); }
  for (const car of cars) {
    const { line, fuel } = carLine(car);
    add("cars", line);
    if (fuel > 0) personal.push({ name: `${car.costs.energyLabel || "Fuel"} — ${car.name}`, value: fuel, kind: "planned", note: `${car.costs.miles.toLocaleString("en-GB")} miles a year` });
  }

  for (const line of lines) {
    if (!(line.value > 0)) continue;
    const name = lineName(line.label);
    const plain = name.replace(/\s*\(from [^)]+\)$/, "").trim().toLowerCase();
    seen.push(name);
    if (/mortgage/i.test(name) && mortgageMonthly) continue; // already counted from the mortgage itself
    if (skip.has(name.toLowerCase())) continue;
    const choice = householdChoiceFor(line, petNames, groupOverrides);
    const key = choice.key;
    if (key === "none") { leftOut.push({ name, value: r2(line.value) }); continue; }
    if (key === "personal") { personal.push({ name, value: r2(line.value), kind: "fixed", note: isPersonalPhone(name) ? "Phone contract — one each" : choice.chosen ? "You marked this personal" : undefined }); continue; }
    if (key === "children" && childAverages[plain]) {
      const c = childAverages[plain];
      const varies = c.high - c.low >= 5;
      add("children", { name, value: r2(c.average), kind: "fixed", note: varies ? `${c.schedule ? `${c.schedule[0].toUpperCase()}${c.schedule.slice(1)} · ` : ""}£${Math.round(c.low)}–£${Math.round(c.high)} a month, averaged over ${c.activeMonths === 12 ? "the year" : `the ${c.activeMonths} months it runs`} (this month £${Math.round(c.thisMonth)})` : undefined });
      continue;
    }
    if (COUNCIL_TAX.test(name)) {
      const payments = councilTax[plain]?.payments ?? 10;
      if (payments < 12) {
        add("home", { name, value: r2((line.value * payments) / 12), kind: "fixed", note: `£${line.value.toFixed(2)} a month over ${payments} payments (Apr–Jan), nothing in Feb and Mar — £${Math.round(line.value * payments).toLocaleString("en-GB")} a year, averaged here` });
        continue;
      }
    }
    add(key, { name, value: r2(line.value), kind: key === "food" ? "budget" : "fixed" });
  }

  const groups: HouseholdGroup[] = HOUSEHOLD_GROUPS.filter((g) => g.key !== "phones").map((group) => {
    const groupLines = (byGroup.get(group.key) || []).sort((a, b) => b.value - a.value);
    const sumKind = (kind: CostKind) => r2(groupLines.reduce((sum, l) => sum + (l.parts ? l.parts.filter((p) => p.kind === kind).reduce((s2, p) => s2 + p.value, 0) : l.kind === kind ? l.value : 0), 0));
    return { ...group, lines: groupLines, fixed: sumKind("fixed"), budget: sumKind("budget"), setaside: sumKind("setaside"), total: r2(groupLines.reduce((s2, l) => s2 + l.value, 0)) };
  }).filter((group) => group.lines.length);

  const fixed = r2(groups.reduce((s2, g) => s2 + g.fixed, 0));
  const budget = r2(groups.reduce((s2, g) => s2 + g.budget, 0));
  const setaside = r2(groups.reduce((s2, g) => s2 + g.setaside, 0));
  const personalFixed = r2(personal.filter((p) => p.kind === "fixed").reduce((s2, p) => s2 + p.value, 0));
  const personalPlanned = r2(personal.filter((p) => p.kind === "planned").reduce((s2, p) => s2 + p.value, 0));

  const names = seen.map((n) => n.toLowerCase());
  const missing: MissingBill[] = EXPECTED
    .filter((e) => !dismissedMissing.includes(e.key) && !names.some((n) => e.test.test(n)))
    .map(({ key, label, why }) => ({ key, label, why }));
  for (const car of cars) {
    if (car.costs.insuranceSource !== "you" && !dismissedMissing.includes(`car_insurance:${car.name}`)) missing.push({ key: `car_insurance:${car.name}`, label: `Insurance for ${car.name}`, why: "Using Loop's estimate — your premium makes it exact" });
  }

  return {
    groups,
    total: r2(fixed + budget + setaside),
    fixed,
    budget,
    setaside,
    personal: personal.sort((a, b) => b.value - a.value),
    personalFixed,
    personalPlanned,
    /** What the emergency fund covers each month. */
    fundMonthly: r2(fixed + budget + personalFixed),
    missing,
    leftOut: leftOut.sort((a, b) => b.value - a.value),
  };
}
