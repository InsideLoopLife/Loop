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
  /** Typical use, for running costs. Rough guides; the person's own numbers replace them. */
  usage?: Usage;
};

export type Usage =
  | { mode: "per_use"; kwh: number; perWeek: number; fuel?: "electric" | "gas" }
  | { mode: "hours"; watts: number; hoursPerDay: number; fuel?: "electric" | "gas" }
  | { mode: "annual"; kwh: number; fuel?: "electric" | "gas" };

export const HOME_ITEM_KINDS: HomeItemKind[] = [
  { key: "dishwasher", label: "Dishwasher", icon: "🍽️", room: "kitchen", lifeYears: 10, typicalCost: 400, words: ["dishwasher"], usage: { mode: "per_use", kwh: 1.0, perWeek: 5 } },
  { key: "fridge_freezer", label: "Fridge freezer", icon: "🧊", room: "kitchen", lifeYears: 12, typicalCost: 600, words: ["fridge freezer", "fridge-freezer", "fridge", "american fridge"], usage: { mode: "annual", kwh: 250 } },
  { key: "freezer", label: "Freezer", icon: "❄️", room: "utility", lifeYears: 12, typicalCost: 350, words: ["chest freezer", "freezer"], usage: { mode: "annual", kwh: 200 } },
  { key: "oven", label: "Oven", icon: "🔥", room: "kitchen", lifeYears: 15, typicalCost: 450, words: ["oven", "range cooker", "cooker"], usage: { mode: "per_use", kwh: 1.0, perWeek: 4 } },
  { key: "hob", label: "Hob", icon: "🍳", room: "kitchen", lifeYears: 15, typicalCost: 350, words: ["hob", "induction"], usage: { mode: "per_use", kwh: 0.7, perWeek: 6 } },
  { key: "cooker_hood", label: "Cooker hood", icon: "🌬️", room: "kitchen", lifeYears: 12, typicalCost: 200, words: ["cooker hood", "extractor"], usage: { mode: "hours", watts: 100, hoursPerDay: 0.5 } },
  { key: "microwave", label: "Microwave", icon: "📦", room: "kitchen", lifeYears: 8, typicalCost: 120, words: ["microwave"], usage: { mode: "per_use", kwh: 0.1, perWeek: 7 } },
  { key: "coffee_machine", label: "Coffee machine", icon: "☕", room: "kitchen", lifeYears: 6, typicalCost: 300, words: ["coffee machine", "bean to cup", "espresso"], usage: { mode: "per_use", kwh: 0.05, perWeek: 14 } },
  { key: "air_fryer", label: "Air fryer", icon: "🍟", room: "kitchen", lifeYears: 4, typicalCost: 100, words: ["air fryer", "airfryer", "ninja"], usage: { mode: "per_use", kwh: 0.5, perWeek: 4 } },
  { key: "washing_machine", label: "Washing machine", icon: "🫧", room: "utility", lifeYears: 10, typicalCost: 450, words: ["washing machine", "washer dryer", "washer"], usage: { mode: "per_use", kwh: 0.7, perWeek: 5 } },
  { key: "tumble_dryer", label: "Tumble dryer", icon: "🌀", room: "utility", lifeYears: 11, typicalCost: 400, words: ["tumble dryer", "dryer", "heat pump dryer"], usage: { mode: "per_use", kwh: 2.5, perWeek: 3 } },
  { key: "boiler", label: "Boiler", icon: "♨️", room: "utility", lifeYears: 13, typicalCost: 3000, words: ["boiler", "combi"], usage: { mode: "annual", kwh: 9500, fuel: "gas" } },
  { key: "vacuum", label: "Vacuum cleaner", icon: "🧹", room: "hallway", lifeYears: 7, typicalCost: 250, words: ["vacuum", "hoover", "dyson"], usage: { mode: "per_use", kwh: 0.15, perWeek: 3 } },
  { key: "tv", label: "TV", icon: "📺", room: "living", lifeYears: 8, typicalCost: 600, words: ["tv", "television", "oled", "telly"], usage: { mode: "hours", watts: 100, hoursPerDay: 4 } },
  { key: "sound", label: "Speakers / soundbar", icon: "🔊", room: "living", lifeYears: 8, typicalCost: 300, words: ["soundbar", "speaker", "sonos"], usage: { mode: "hours", watts: 30, hoursPerDay: 3 } },
  { key: "games_console", label: "Games console", icon: "🎮", room: "living", lifeYears: 7, typicalCost: 450, words: ["console", "playstation", "ps5", "xbox", "switch"], usage: { mode: "hours", watts: 150, hoursPerDay: 1.5 } },
  { key: "sofa", label: "Sofa", icon: "🛋️", room: "living", lifeYears: 10, typicalCost: 1200, words: ["sofa", "settee", "couch"] },
  { key: "mattress", label: "Mattress", icon: "🛏️", room: "bedroom", lifeYears: 8, typicalCost: 600, words: ["mattress"] },
  { key: "shower", label: "Electric shower", icon: "🚿", room: "bathroom", lifeYears: 10, typicalCost: 350, words: ["shower"], usage: { mode: "per_use", kwh: 1.2, perWeek: 7 } },
  { key: "laptop", label: "Laptop / computer", icon: "💻", room: "office", lifeYears: 5, typicalCost: 900, words: ["laptop", "macbook", "computer", "pc", "imac"], usage: { mode: "hours", watts: 50, hoursPerDay: 4 } },
  { key: "printer", label: "Printer", icon: "🖨️", room: "office", lifeYears: 5, typicalCost: 150, words: ["printer"], usage: { mode: "per_use", kwh: 0.02, perWeek: 2 } },
  { key: "router", label: "Wi-Fi / mesh", icon: "📶", room: "office", lifeYears: 5, typicalCost: 200, words: ["router", "mesh", "wifi", "wi-fi"], usage: { mode: "hours", watts: 10, hoursPerDay: 24 } },
  { key: "lawn_mower", label: "Lawn mower", icon: "🌱", room: "garden", lifeYears: 8, typicalCost: 300, words: ["mower", "lawnmower", "lawn mower"], usage: { mode: "per_use", kwh: 0.6, perWeek: 0.5 } },
  { key: "pressure_washer", label: "Pressure washer", icon: "💦", room: "garage", lifeYears: 7, typicalCost: 200, words: ["pressure washer", "jet wash"], usage: { mode: "per_use", kwh: 0.3, perWeek: 0.25 } },
  { key: "ev_charger", label: "EV charger", icon: "🔌", room: "garage", lifeYears: 10, typicalCost: 1000, words: ["ev charger", "car charger", "wallbox", "zappi"], usage: { mode: "per_use", kwh: 20, perWeek: 2 } },
  { key: "other", label: "Something else", icon: "📦", room: "other", lifeYears: 8, typicalCost: 0, words: [] },
];

export const KIND_BY_KEY = new Map(HOME_ITEM_KINDS.map((kind) => [kind.key, kind]));

export type HomeItem = {
  id: string;
  user_id?: string | null;
  home_id: string | null;
  /** The drawn room on the floor plan, when it has one. */
  space_id?: string | null;
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
  product_url?: string | null;
  image_url?: string | null;
  fuel?: "electric" | "gas" | "none" | null;
  energy_per_use_kwh?: number | null;
  uses_per_week?: number | null;
  power_watts?: number | null;
  hours_per_day?: number | null;
  annual_kwh?: number | null;
  uses_off_peak?: boolean | null;
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

/**
 * A rough product name from a shop link, e.g.
 * currys.co.uk/products/bosch-series-4-sms4hvi33g-wi-fi-connected-standard-dishwasher-10241010.html
 * → "Bosch Series 4 Sms4hvi33g Wi Fi Connected Standard Dishwasher". Nothing is fetched.
 */
export function nameFromProductUrl(raw: string): { url: string; name: string | null; retailer: string | null } | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.replace(/^www\./, "");
  const retailers: Record<string, string> = { "currys.co.uk": "Currys", "argos.co.uk": "Argos", "ao.com": "AO", "johnlewis.com": "John Lewis", "amazon.co.uk": "Amazon", "appliancesdirect.co.uk": "Appliances Direct", "richersounds.com": "Richer Sounds", "very.co.uk": "Very", "dyson.co.uk": "Dyson", "apple.com": "Apple", "ikea.com": "IKEA", "screwfix.com": "Screwfix", "wickes.co.uk": "Wickes", "diy.com": "B&Q", "costco.co.uk": "Costco", "lakeland.co.uk": "Lakeland" };
  const retailer = Object.entries(retailers).find(([domain]) => host === domain || host.endsWith(`.${domain}`))?.[1] || null;
  const segments = url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  // Amazon puts the name before /dp/; most shops put it in the longest segment.
  const dp = segments.indexOf("dp");
  const candidate = dp > 0 ? segments[dp - 1] : [...segments].sort((a, b) => b.length - a.length)[0];
  if (!candidate) return { url: url.toString(), name: null, retailer };
  const UPPER = new Set(["tv", "led", "oled", "qled", "hdr", "uhd", "hd", "usb", "uk", "xl"]);
  const words = candidate
    .replace(/\.(html?|aspx|php)$/i, "")
    .split(/[-_+\s]+/)
    .filter((word) => word && !/^\d{5,}$/.test(word) && !/^p\d{5,}$/i.test(word));
  const pretty = words.slice(0, 10).map((word) => {
    const lower = word.toLowerCase();
    if (UPPER.has(lower)) return lower.toUpperCase();
    if (/\d/.test(word) && /[a-z]/i.test(word)) return word.toUpperCase(); // model codes
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
  const name = pretty.length >= 2 ? pretty.join(" ").replace(/\bWi Fi\b/g, "Wi-Fi") : null;
  return { url: url.toString(), name, retailer };
}

/** Ofgem price cap, 1 Oct–31 Dec 2026, Direct Debit averages (ofgem.gov.uk). Used until the household sets its own. */
export const PRICE_CAP_RATES = { electricity: 26.32, gas: 7.97, label: "Ofgem price cap, Oct–Dec 2026" };

export type EnergyRates = { electricity: number; gas: number; electricityNight?: number | null };

export type RunningCost = {
  fuel: "electric" | "gas";
  annualKwh: number;
  annualCost: number;
  /** Cost each time it's used, for things used in sessions. */
  perUse: number | null;
  perWeekUses: number | null;
  /** True when every number came from the typical guide rather than the person. */
  typical: boolean;
  basis: string;
};

const num = (value: unknown) => (value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));

/** What it costs to run, from the person's own usage where given, otherwise the typical guide. */
export function runningCost(item: Pick<HomeItem, "kind" | "fuel" | "energy_per_use_kwh" | "uses_per_week" | "power_watts" | "hours_per_day" | "annual_kwh" | "uses_off_peak">, rates: EnergyRates): RunningCost | null {
  const cost = baseRunningCost(item, rates);
  if (cost && cost.fuel === "electric" && item.uses_off_peak && rates.electricityNight != null) cost.basis += " · night rate";
  return cost;
}

function baseRunningCost(item: Pick<HomeItem, "kind" | "fuel" | "energy_per_use_kwh" | "uses_per_week" | "power_watts" | "hours_per_day" | "annual_kwh" | "uses_off_peak">, rates: EnergyRates): RunningCost | null {
  if (item.fuel === "none") return null;
  const usage = KIND_BY_KEY.get(item.kind)?.usage;
  const fuel: "electric" | "gas" = item.fuel === "gas" || item.fuel === "electric" ? item.fuel : usage?.fuel || "electric";
  // Things set to run overnight (timers, EV, storage heaters) use the night rate when the tariff has one.
  const electricRate = item.uses_off_peak && rates.electricityNight != null ? rates.electricityNight : rates.electricity;
  const rate = (fuel === "gas" ? rates.gas : electricRate) / 100;
  const own = { annual: num(item.annual_kwh), perUse: num(item.energy_per_use_kwh), perWeek: num(item.uses_per_week), watts: num(item.power_watts), hours: num(item.hours_per_day) };
  const round = (n: number) => Math.round(n * 100) / 100;

  if (own.annual != null) {
    return { fuel, annualKwh: own.annual, annualCost: round(own.annual * rate), perUse: null, perWeekUses: null, typical: false, basis: `${own.annual.toLocaleString("en-GB")} kWh a year (yours)` };
  }
  const hoursMode = own.watts != null || own.hours != null || usage?.mode === "hours";
  if (hoursMode) {
    const watts = own.watts ?? (usage?.mode === "hours" ? usage.watts : null);
    const hours = own.hours ?? (usage?.mode === "hours" ? usage.hoursPerDay : null);
    if (watts == null || hours == null) return null;
    const kwh = (watts / 1000) * hours * 365;
    return { fuel, annualKwh: Math.round(kwh), annualCost: round(kwh * rate), perUse: null, perWeekUses: null, typical: own.watts == null && own.hours == null, basis: `${watts}W for ${hours}h a day` };
  }
  if (usage?.mode === "annual" && own.perUse == null && own.perWeek == null) {
    return { fuel, annualKwh: usage.kwh, annualCost: round(usage.kwh * rate), perUse: null, perWeekUses: null, typical: true, basis: `about ${usage.kwh.toLocaleString("en-GB")} kWh a year` };
  }
  const perUseKwh = own.perUse ?? (usage?.mode === "per_use" ? usage.kwh : null);
  const perWeek = own.perWeek ?? (usage?.mode === "per_use" ? usage.perWeek : null);
  if (perUseKwh == null || perWeek == null) return null;
  const kwh = perUseKwh * perWeek * 52;
  return { fuel, annualKwh: Math.round(kwh), annualCost: round(kwh * rate), perUse: round(perUseKwh * rate), perWeekUses: perWeek, typical: own.perUse == null && own.perWeek == null, basis: `${perUseKwh} kWh a use, ${perWeek} times a week` };
}
