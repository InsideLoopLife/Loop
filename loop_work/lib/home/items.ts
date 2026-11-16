// Things in the home (appliances, boiler, electronics): what they are, where they live,
// when the warranty runs out, and roughly when they'll need replacing.
//
// Lifespans and replacement costs are rough UK mid-range guides, not quotes. Every item
// can override both, and anything the person enters (price paid, their own lifespan)
// always wins.

export type HomeRoom = "kitchen" | "utility" | "living" | "dining" | "hallway" | "bedroom" | "bathroom" | "office" | "loft" | "garage" | "garden" | "other";

export const ROOM_LABELS: Record<HomeRoom, string> = {
  kitchen: "Kitchen",
  utility: "Utility",
  living: "Living room",
  dining: "Dining room",
  hallway: "Hallway",
  bedroom: "Bedrooms",
  bathroom: "Bathroom",
  office: "Office",
  loft: "Loft",
  garage: "Garage",
  garden: "Garden",
  other: "Elsewhere",
};

export type HomeItemKind = {
  key: string;
  label: string;
  icon: string;
  room: HomeRoom;
  /** Rough typical life in years. */
  lifeYears: number;
  /** Rough mid-range replacement cost in pounds, fitted where that's normal. */
  typicalCost: number;
  /** Words that point to this kind in a typed description. */
  words: string[];
};

export const HOME_ITEM_KINDS: HomeItemKind[] = [
  { key: "dishwasher", label: "Dishwasher", icon: "🍽️", room: "kitchen", lifeYears: 10, typicalCost: 400, words: ["dishwasher"] },
  { key: "fridge_freezer", label: "Fridge freezer", icon: "🧊", room: "kitchen", lifeYears: 12, typicalCost: 600, words: ["fridge freezer", "fridge-freezer", "fridge", "american fridge"] },
  { key: "freezer", label: "Freezer", icon: "❄️", room: "utility", lifeYears: 12, typicalCost: 350, words: ["chest freezer", "freezer"] },
  { key: "oven", label: "Oven", icon: "🔥", room: "kitchen", lifeYears: 15, typicalCost: 450, words: ["oven", "range cooker", "cooker"] },
  { key: "hob", label: "Hob", icon: "🍳", room: "kitchen", lifeYears: 15, typicalCost: 350, words: ["hob", "induction"] },
  { key: "cooker_hood", label: "Cooker hood", icon: "🌬️", room: "kitchen", lifeYears: 12, typicalCost: 200, words: ["cooker hood", "extractor"] },
  { key: "microwave", label: "Microwave", icon: "📦", room: "kitchen", lifeYears: 8, typicalCost: 120, words: ["microwave"] },
  { key: "coffee_machine", label: "Coffee machine", icon: "☕", room: "kitchen", lifeYears: 6, typicalCost: 300, words: ["coffee machine", "bean to cup", "espresso"] },
  { key: "air_fryer", label: "Air fryer", icon: "🍟", room: "kitchen", lifeYears: 4, typicalCost: 100, words: ["air fryer", "airfryer", "ninja"] },
  { key: "washing_machine", label: "Washing machine", icon: "🫧", room: "utility", lifeYears: 10, typicalCost: 450, words: ["washing machine", "washer dryer", "washer"] },
  { key: "tumble_dryer", label: "Tumble dryer", icon: "🌀", room: "utility", lifeYears: 11, typicalCost: 400, words: ["tumble dryer", "dryer", "heat pump dryer"] },
  { key: "boiler", label: "Boiler", icon: "♨️", room: "utility", lifeYears: 13, typicalCost: 3000, words: ["boiler", "combi"] },
  { key: "vacuum", label: "Vacuum cleaner", icon: "🧹", room: "hallway", lifeYears: 7, typicalCost: 250, words: ["vacuum", "hoover", "dyson"] },
  { key: "tv", label: "TV", icon: "📺", room: "living", lifeYears: 8, typicalCost: 600, words: ["tv", "television", "oled", "telly"] },
  { key: "sound", label: "Speakers / soundbar", icon: "🔊", room: "living", lifeYears: 8, typicalCost: 300, words: ["soundbar", "speaker", "sonos"] },
  { key: "games_console", label: "Games console", icon: "🎮", room: "living", lifeYears: 7, typicalCost: 450, words: ["console", "playstation", "ps5", "xbox", "switch"] },
  { key: "sofa", label: "Sofa", icon: "🛋️", room: "living", lifeYears: 10, typicalCost: 1200, words: ["sofa", "settee", "couch"] },
  { key: "mattress", label: "Mattress", icon: "🛏️", room: "bedroom", lifeYears: 8, typicalCost: 600, words: ["mattress"] },
  { key: "shower", label: "Electric shower", icon: "🚿", room: "bathroom", lifeYears: 10, typicalCost: 350, words: ["shower"] },
  { key: "laptop", label: "Laptop / computer", icon: "💻", room: "office", lifeYears: 5, typicalCost: 900, words: ["laptop", "macbook", "computer", "pc", "imac"] },
  { key: "printer", label: "Printer", icon: "🖨️", room: "office", lifeYears: 5, typicalCost: 150, words: ["printer"] },
  { key: "router", label: "Wi-Fi / mesh", icon: "📶", room: "office", lifeYears: 5, typicalCost: 200, words: ["router", "mesh", "wifi", "wi-fi"] },
  { key: "lawn_mower", label: "Lawn mower", icon: "🌱", room: "garden", lifeYears: 8, typicalCost: 300, words: ["mower", "lawnmower", "lawn mower"] },
  { key: "pressure_washer", label: "Pressure washer", icon: "💦", room: "garage", lifeYears: 7, typicalCost: 200, words: ["pressure washer", "jet wash"] },
  { key: "ev_charger", label: "EV charger", icon: "🔌", room: "garage", lifeYears: 10, typicalCost: 1000, words: ["ev charger", "car charger", "wallbox", "zappi"] },
  { key: "other", label: "Something else", icon: "📦", room: "other", lifeYears: 8, typicalCost: 0, words: [] },
];

export const KIND_BY_KEY = new Map(HOME_ITEM_KINDS.map((kind) => [kind.key, kind]));

export type HomeItem = {
  id: string;
  user_id?: string | null;
  home_id: string | null;
  room: HomeRoom;
  kind: string;
  label: string;
  brand: string | null;
  model: string | null;
  purchased_on: string | null;
  price: number | null;
  retailer: string | null;
  warranty_months: number | null;
  extended_warranty_ends_on: string | null;
  warranty_provider: string | null;
  expected_life_years: number | null;
  replacement_cost: number | null;
  notes: string | null;
  status: "active" | "replaced" | "gone";
};

function addMonths(iso: string, months: number) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

export type HomeItemStatus = "in_warranty" | "warranty_ending" | "out_of_warranty" | "nearing_end" | "past_life" | "unknown";

export type HomeItemPlan = {
  warrantyEnds: string | null;
  lifeEnds: string | null;
  ageYears: number | null;
  lifeYears: number;
  replacementCost: number;
  costIsGuess: boolean;
  status: HomeItemStatus;
  /** Monthly amount to put aside so the replacement is covered by the time it's likely due.
   *  Zero once it's within a year of its usual life: that cost is "could need replacing" instead. */
  monthlySetAside: number;
  daysToWarrantyEnd: number | null;
};

export function planHomeItem(item: HomeItem, today: string): HomeItemPlan {
  const kind = KIND_BY_KEY.get(item.kind) || KIND_BY_KEY.get("other")!;
  const lifeYears = Number(item.expected_life_years || 0) > 0 ? Number(item.expected_life_years) : kind.lifeYears;
  const ownCost = Number(item.replacement_cost || 0) > 0 ? Number(item.replacement_cost) : Number(item.price || 0) > 0 ? Number(item.price) : 0;
  const replacementCost = ownCost || kind.typicalCost;
  const standardEnd = item.purchased_on && item.warranty_months != null ? addMonths(item.purchased_on, item.warranty_months) : null;
  const warrantyEnds = [standardEnd, item.extended_warranty_ends_on].filter(Boolean).sort().reverse()[0] || null;
  const lifeEnds = item.purchased_on ? addMonths(item.purchased_on, Math.round(lifeYears * 12)) : null;
  const ageYears = item.purchased_on ? Math.max(0, daysBetween(item.purchased_on, today) / 365.25) : null;
  const daysToWarrantyEnd = warrantyEnds ? daysBetween(today, warrantyEnds) : null;
  const daysToLifeEnd = lifeEnds ? daysBetween(today, lifeEnds) : null;

  let status: HomeItemStatus = "unknown";
  if (daysToWarrantyEnd != null && daysToWarrantyEnd > 90) status = "in_warranty";
  else if (daysToWarrantyEnd != null && daysToWarrantyEnd >= 0) status = "warranty_ending";
  else if (daysToLifeEnd != null && daysToLifeEnd <= 0) status = "past_life";
  else if (daysToLifeEnd != null && daysToLifeEnd <= 365) status = "nearing_end";
  else if (item.purchased_on) status = "out_of_warranty";

  const monthsLeft = daysToLifeEnd != null ? daysToLifeEnd / 30.44 : null;
  const monthlySetAside = item.status !== "active" || replacementCost <= 0 || monthsLeft == null || monthsLeft <= 12 ? 0 : Math.round((replacementCost / Math.max(1, monthsLeft)) * 100) / 100;

  return { warrantyEnds, lifeEnds, ageYears, lifeYears, replacementCost, costIsGuess: !ownCost, status, monthlySetAside, daysToWarrantyEnd };
}

export const STATUS_STYLE: Record<HomeItemStatus, { label: string; dot: string; chip: string }> = {
  in_warranty: { label: "Under warranty", dot: "#10b981", chip: "bg-emerald-50 text-emerald-800" },
  warranty_ending: { label: "Warranty ending soon", dot: "#f59e0b", chip: "bg-amber-50 text-amber-900" },
  out_of_warranty: { label: "Out of warranty", dot: "#64748b", chip: "bg-slate-100 text-slate-700" },
  nearing_end: { label: "Getting near the end", dot: "#f97316", chip: "bg-orange-50 text-orange-900" },
  past_life: { label: "Past its usual life", dot: "#e11d48", chip: "bg-rose-50 text-rose-800" },
  unknown: { label: "Add when it was bought", dot: "#cbd5e1", chip: "bg-slate-50 text-slate-500" },
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Reads a quick typed description, e.g. "Bosch dishwasher bought March 2023 £450, 5 year warranty".
 * Anything it can't find is left empty for the person to fill in.
 */
export function parseHomeItemText(text: string, today: string) {
  const lower = ` ${text.toLowerCase()} `;
  let kind: HomeItemKind | undefined;
  let matchLength = 0;
  for (const candidate of HOME_ITEM_KINDS) {
    for (const word of candidate.words) {
      if (lower.includes(word) && word.length > matchLength) { kind = candidate; matchLength = word.length; }
    }
  }
  const price = (() => { const m = lower.match(/£\s?(\d[\d,]*(?:\.\d{1,2})?)/) || lower.match(/(\d[\d,]*(?:\.\d{1,2})?)\s?(?:pounds|quid|gbp)/); return m ? Number(m[1].replace(/,/g, "")) : null; })();
  const warrantyMonths = (() => {
    if (/no warranty|without warranty/.test(lower)) return 0;
    const years = lower.match(/(\d{1,2})\s?(?:-\s?)?(?:year|yr)s?\s?(?:warranty|guarantee|cover)/);
    if (years) return Number(years[1]) * 12;
    const months = lower.match(/(\d{1,3})\s?(?:-\s?)?months?\s?(?:warranty|guarantee|cover)/);
    if (months) return Number(months[1]);
    if (/warranty|guarantee/.test(lower)) return 12;
    return null;
  })();
  const purchasedOn = (() => {
    const iso = lower.match(/(20\d{2})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const uk = lower.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|\d{2})\b/);
    if (uk) { const year = uk[3].length === 2 ? `20${uk[3]}` : uk[3]; return `${year}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`; }
    const monthYear = lower.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(20\d{2})\b/);
    if (monthYear) return `${monthYear[2]}-${String(MONTHS.indexOf(monthYear[1].slice(0, 3)) + 1).padStart(2, "0")}-01`;
    const yearsAgo = lower.match(/(\d{1,2})\s?years?\s?(?:ago|old)/);
    if (yearsAgo) return addMonths(today, -12 * Number(yearsAgo[1]));
    const yearOnly = lower.match(/\b(?:in|bought|from|since)\s+(20\d{2})\b/);
    if (yearOnly) return `${yearOnly[1]}-01-01`;
    if (/\b(today|this week|just bought)\b/.test(lower)) return today;
    return null;
  })();
  const brand = (() => {
    const known = ["bosch", "neff", "siemens", "miele", "beko", "hotpoint", "indesit", "samsung", "lg", "sony", "panasonic", "aeg", "zanussi", "whirlpool", "smeg", "hisense", "haier", "candy", "hoover", "dyson", "shark", "ninja", "delonghi", "de'longhi", "sage", "apple", "worcester", "vaillant", "ideal", "baxi", "viessmann", "philips", "russell hobbs", "kenwood", "kitchenaid", "sonos", "nintendo", "microsoft", "hp", "dell", "lenovo", "ring", "nest", "tesla"];
    const found = known.find((name) => lower.includes(` ${name} `) || lower.includes(` ${name},`));
    return found ? found.split(" ").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ").replace("Lg", "LG").replace("Hp", "HP") : null;
  })();
  return { kind: kind?.key ?? null, room: kind?.room ?? null, label: kind?.label ?? null, brand, price, purchasedOn, warrantyMonths };
}
